// The frame every practice game shares (design: _knowledge/2026-11-07_practice-games-design.md):
// the full-screen focus view with its bar (DECISIONS.md #85), the end screen, "too few words",
// the mic button, and saving an answer as practice (practice: true, the schedule unchanged, #25).
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ReviewMode, ReviewState } from '../content/schema.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { practiceEntry } from '../lib/reviewEntries.ts'
import { link } from '../lib/router.ts'
import { Rating } from '../lib/srs.ts'
import { recordPractice, requestFlush } from '../lib/storage.ts'
import type { Comparison } from '../lib/text.ts'
import { FocusBar } from './FocusBar.tsx'
import { MicIcon } from './SpeakLine.tsx'
import { UmlautBar, umlautKeys } from './UmlautBar.tsx'

/** Where a game was started from: Home (the Daily card) or lesson tiles on the Words map. */
export interface GameBack {
  href: string
  /** How many lessons' words the game plays on (tiles on the Words map); 0 for a game from Home. */
  lessons: number
}

export function GameFrame(props: { title: string; done: number; target: number; back: GameBack; sound: boolean; onSound: () => void; children: ReactNode }) {
  const { title, done, target, back, sound, onSound, children } = props
  return (
    <div className="focus-review game" role="dialog" aria-label={title}>
      <FocusBar
        onClose={() => {
          window.location.hash = back.href
        }}
        closeLabel="Close"
        done={done}
        target={target}
        label={title}
        sound={sound}
        onSound={onSound}
      />
      <div className="focus-body">{children}</div>
    </div>
  )
}

/**
 * Logs one game answer as practice: Good when right, Again when wrong. A failed save is reported
 * (the banner) and the game goes on. Only learned words reach a game, so practiceEntry never throws
 * for a word without a card.
 */
export function savePractice(input: { state: ReviewState; word: { id: string; de: string }; mode: ReviewMode; right: boolean; text: string; nearMiss?: Comparison['nearMiss']; timeMs: number }): void {
  try {
    recordPractice(
      practiceEntry({
        state: input.state,
        word: input.word,
        mode: input.mode,
        rating: input.right ? Rating.Good : Rating.Again,
        answer: { text: input.text, correct: input.right, nearMiss: input.nearMiss ?? null },
        timeMs: input.timeMs,
        at: new Date(),
      }),
    )
  } catch (err) {
    reportError(`Your answer to "${input.word.de}" was not saved as practice: ${messageOf(err)}`)
  }
}

export function GameEnd({ title, back, onAgain, children }: { title: string; back: GameBack; onAgain: () => void; children: ReactNode }) {
  // The game is over: send its practice answers.
  useEffect(() => {
    requestFlush()
  }, [])
  return (
    <div className="stack round-end">
      <h2>{title}</h2>
      {children}
      <p className="muted small">Practice: your review schedule is unchanged.</p>
      <div className="row actions">
        {back.lessons > 0 ? (
          <a className="btn" href={back.href}>
            Back to the map
          </a>
        ) : (
          <>
            <a className="btn" href={link('daily')}>
              Daily mix
            </a>
            <a className="btn" href={link()}>
              Home
            </a>
          </>
        )}
        <button type="button" className="btn primary" onClick={onAgain}>
          Play again
        </button>
      </div>
    </div>
  )
}

export function TooFewWords({ need, what, back }: { need: number; what: string; back: GameBack }) {
  return (
    <div className="card stack">
      <p>
        This game needs at least {need} {what} you have already learned (reviewed at least once)
        {back.lessons === 1 ? ' in this lesson' : back.lessons > 1 ? ` in these ${back.lessons} lessons` : ''}.
      </p>
      <p>
        <a href={link('words')}>Review words</a>
        {back.lessons > 0 ? (
          <>
            {' '}
            or go <a href={back.href}>back to the map</a>.
          </>
        ) : (
          ' or open the next lesson first.'
        )}
      </p>
    </div>
  )
}

/** A text box for a typed answer, with the umlaut buttons; Enter checks. */
export function TypeAnswer({ label, onCheck }: { label: string; onCheck: (text: string) => void }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim() !== '') onCheck(text.trim())
      }}
    >
      <input
        ref={ref}
        type="text"
        className="text"
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        lang="de"
        {...umlautKeys('answer')}
      />
      <UmlautBar keys="answer" />
      <button type="submit" className="btn primary" disabled={text.trim() === ''}>
        Check (Enter)
      </button>
    </form>
  )
}

/** Enter (outside a text box) moves on, once the answer is shown. */
export function useEnterKey(active: boolean, onEnter: () => void): void {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (e.key !== 'Enter' || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLButtonElement) return
      e.preventDefault()
      onEnter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}

export function MicButton({ listening, onStart, onStop, label = 'Say it' }: { listening: boolean; onStart: () => void; onStop: () => void; label?: string }) {
  return listening ? (
    <button type="button" className="btn speak-on mic-big" onClick={onStop}>
      Listening... (tap to stop)
    </button>
  ) : (
    <button type="button" className="btn primary mic-big" onClick={onStart}>
      <MicIcon /> {label}
    </button>
  )
}
