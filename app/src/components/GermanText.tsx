// German text with word popups: hover (mouse) or tap (touch) a word, or focus it and press
// Enter, to see its base form, part of speech, meaning, article and plural. Escape closes.
// Whether popups are allowed is decided by the nearest GlossScope (see glossary/gate.ts);
// German text outside any scope is a bug and throws, so a new screen cannot leak answers.
import { createContext, Fragment, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { markSentenceStarts, segments } from '../content/german.ts'
import { glossEnabled } from '../glossary/gate.ts'
import type { GlossSurface } from '../glossary/gate.ts'
import { ensureGlossary, useGlossary } from '../glossary/load.ts'
import { lookup, mergeSameGloss } from '../glossary/lookup.ts'
import type { GlossLine } from '../glossary/lookup.ts'
import { Speaker } from './Speaker.tsx'

const GateContext = createContext<boolean | null>(null)

export function GlossScope({ surface, children }: { surface: GlossSurface; children: ReactNode }) {
  return <GateContext.Provider value={glossEnabled(surface)}>{children}</GateContext.Provider>
}

/** German text with a speaker button next to it. */
export function De({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`de ${className ?? ''}`}>
      <span lang="de">
        <GermanText text={text} />
      </span>{' '}
      <Speaker text={text} />
    </span>
  )
}

export function GermanText({ text }: { text: string }) {
  const enabled = useContext(GateContext)
  if (enabled === null) {
    throw new Error(`German text "${text.slice(0, 40)}" is shown outside a GlossScope, so it is unclear whether word popups are allowed there`)
  }
  if (!enabled) return <>{text}</>
  return (
    <>
      {markSentenceStarts(segments(text)).map((s, i) =>
        s.word ? <GlossWord key={i} word={s.text} sentenceStart={s.sentenceStart} /> : <Fragment key={i}>{s.text}</Fragment>,
      )}
    </>
  )
}

// ---------- one open popup at a time ----------

let open: { id: string; pinned: boolean } | null = null
const openListeners = new Set<() => void>()
let timer: number | undefined

function setOpen(next: { id: string; pinned: boolean } | null): void {
  window.clearTimeout(timer)
  open = next
  openListeners.forEach((l) => l())
}

function later(fn: () => void, ms: number): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(fn, ms)
}

function useOpen(): { id: string; pinned: boolean } | null {
  return useSyncExternalStore(
    (l) => {
      openListeners.add(l)
      return () => openListeners.delete(l)
    },
    () => open,
    () => null,
  )
}

const HOVER_OPEN_MS = 300
const HOVER_CLOSE_MS = 250

function GlossWord({ word, sentenceStart }: { word: string; sentenceStart: boolean }) {
  const id = useId()
  const current = useOpen()
  const isOpen = current?.id === id
  const ref = useRef<HTMLSpanElement>(null)
  const glossary = useGlossary()

  useEffect(() => {
    ensureGlossary()
  }, [])

  if (glossary.status === 'ready' && glossary.glossary.ignore.has(word)) return <>{word}</>

  const closeSoon = () => later(() => open?.id === id && !open.pinned && setOpen(null), HOVER_CLOSE_MS)
  const toggle = () => setOpen(isOpen && current?.pinned ? null : { id, pinned: true })

  return (
    <>
      <span
        ref={ref}
        className={`gloss-word ${isOpen ? 'open' : ''}`}
        tabIndex={0}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onPointerEnter={(e) => {
          // No hover popups while a button is held, i.e. while selecting text.
          if (e.pointerType === 'mouse' && e.buttons === 0 && !open?.pinned) later(() => setOpen({ id, pinned: false }), HOVER_OPEN_MS)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') closeSoon()
        }}
        onClick={() => {
          // Finishing a text selection is not a request for a popup.
          if (window.getSelection()?.toString()) return
          toggle()
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          } else if (e.key === 'Escape' && isOpen) {
            e.preventDefault()
            setOpen(null)
          }
        }}
      >
        {word}
      </span>
      {isOpen && <GlossPopup anchor={ref} word={word} sentenceStart={sentenceStart} onKeepOpen={() => window.clearTimeout(timer)} onLeave={closeSoon} />}
    </>
  )
}

function GlossPopup(props: {
  anchor: RefObject<HTMLSpanElement | null>
  word: string
  sentenceStart: boolean
  onKeepOpen: () => void
  onLeave: () => void
}) {
  const { anchor, word, sentenceStart, onKeepOpen, onLeave } = props
  const glossary = useGlossary()
  const popRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Place below the word (above if there is no room), inside the viewport.
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect()
    const p = popRef.current?.getBoundingClientRect()
    if (!a || !p) return
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const left = Math.max(8, Math.min(a.left, vw - p.width - 8))
    let top = a.bottom + 6
    if (top + p.height > vh - 8 && a.top - p.height - 6 >= 8) top = a.top - p.height - 6
    setPos({ left, top })
  }, [anchor, glossary.status])

  // Close on a tap or click elsewhere, on Escape, and when the page scrolls or resizes.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && !anchor.current?.contains(t)) setOpen(null)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null)
        anchor.current?.focus()
      }
    }
    const close = () => setOpen(null)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [anchor])

  let body: ReactNode
  if (glossary.status === 'ready') {
    const found = lookup(glossary.glossary, word, sentenceStart)
    if (found.kind === 'found') body = mergeSameGloss(found.entries).map((line, i) => <EntryView key={i} word={word} line={line} />)
    else body = <span className="gloss-missing">No glossary entry for "{word}" yet.</span>
  } else if (glossary.status === 'error') {
    body = <span className="gloss-missing">The glossary could not be loaded: {glossary.message}</span>
  } else {
    body = <span className="muted">Loading...</span>
  }

  return (
    <span
      ref={popRef}
      className="gloss-pop"
      role="dialog"
      aria-label={`About "${word}"`}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onKeepOpen()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onLeave()}
    >
      <span className="gloss-head">
        <strong lang="de">{word}</strong>
        <Speaker text={word} />
      </span>
      {body}
    </span>
  )
}

function EntryView({ word, line }: { word: string; line: GlossLine }) {
  const e = line.entry
  const headword = e.article ? `${e.article} ${e.lemma}` : e.lemma
  const inflected = e.form !== undefined || e.lemma.toLowerCase() !== word.toLowerCase()
  return (
    <span className="gloss-entry">
      <span className="gloss-lemma">
        {inflected && <span className="muted">base form </span>}
        <span lang="de">{headword}</span>
        {e.plural && <span lang="de">, die {e.plural}</span>}
        <span className="gloss-pos">
          {' '}
          {line.pos.join(', ')}
          {e.level ? `, ${e.level}` : ''}
        </span>
      </span>
      {e.form && <span className="gloss-form">{e.form}</span>}
      <span className="gloss-senses">{e.gloss.join('; ')}</span>
      {line.notes.map((n) => (
        <span key={n} className="gloss-note">
          {n}
        </span>
      ))}
    </span>
  )
}
