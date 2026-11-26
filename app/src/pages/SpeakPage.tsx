// The Speak page (#/speak; Hayk, 2026-11-26: "I like the say the words exercise too much ... a separate tab ... a lot
// of customization"; DECISIONS.md #121). Setup at #/speak, the game at #/speak/play, and #/speak/map/<lesson ids>
// (map tiles) picks those lessons, then shows the setup. The choices are remembered on this device (Settings.speak).
import { useEffect, useState } from 'react'
import { SpeakWords } from '../components/SpeakGames.tsx'
import { content } from '../content/load.ts'
import { isThemeLesson } from '../content/lessons.ts'
import { ensureGlossary, useGlossary } from '../glossary/load.ts'
import { lookup } from '../glossary/lookup.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { localDay } from '../lib/dates.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { reachOf } from '../lib/goalView.ts'
import { lessonsOfPart, parseSourceKey, wordsForSource } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { updateSettings, useSettings } from '../lib/settings.ts'
import type { SpeakSetup } from '../lib/settings.ts'
import { SPEAK_KIND_LABEL, SPEAK_KINDS, SPEAK_ORDER_LABEL, SPEAK_ORDERS, SPEAK_SIZES, SPEAK_WHICH, SPEAK_WHICH_LABEL, speakSelection, wordKind } from '../lib/speak.ts'
import type { SpeakKind, SpeakWhich } from '../lib/speak.ts'
import type { ProgressView } from '../lib/storage.ts'
import { useProgress } from '../lib/storage.ts'
import { useVisibleContent } from '../lib/visibleContent.ts'
import { bankWords, homeGameWords, ownStudyWords } from './DailyPage.tsx'

function saveSpeak(setup: SpeakSetup, patch: Partial<SpeakSetup>): void {
  try {
    updateSettings({ speak: { ...setup, ...patch } })
  } catch (err) {
    reportError(`Could not save your Speak choices on this device: ${messageOf(err)}`)
  }
}

/** The words of the chosen sources, each once, in course order; [] means everything (Home's game words). Unknown keys are skipped and named. */
function sourceWords(from: readonly string[], progress: ProgressView): { words: StudyWord[]; problems: string[] } {
  if (from.length === 0) return { words: homeGameWords(progress), problems: [] }
  const state = progress.reviewState
  const bank = bankWords(state, progress.skipped)
  const custom = ownStudyWords(progress)
  const out = new Map<string, StudyWord>()
  const problems: string[] = []
  for (const key of from) {
    let list: StudyWord[]
    if (key.startsWith('set:')) {
      const set = content.sets.find((s) => s.id === key.slice(4))
      if (!set) {
        problems.push(`The word set "${key.slice(4)}" no longer exists.`)
        continue
      }
      const ids = new Set(set.words)
      list = bank.filter((w) => ids.has(w.id))
    } else {
      const { source, note } = parseSourceKey(key, content.allLessons)
      if (note) {
        problems.push(note)
        continue
      }
      list = wordsForSource(source, bank, custom, content.allLessons, progress.lessonProgress, state, reachOf(progress), content.sets)
    }
    for (const w of list) if (!out.has(w.id)) out.set(w.id, w)
  }
  return { words: [...out.values()], problems }
}

/** Part of speech from the glossary for the kind filter; null while it loads. */
function usePosOf(): (de: string) => ReadonlySet<string> | null {
  const glossary = useGlossary()
  useEffect(() => {
    ensureGlossary()
  }, [])
  if (glossary.status !== 'ready') return () => null
  const g = glossary.glossary
  return (de: string) => {
    const found = lookup(g, de.trim())
    return found.kind === 'found' ? new Set<string>(found.entries.map((e) => e.pos)) : new Set<string>()
  }
}

function useSelection(setup: SpeakSetup, which: SpeakWhich = setup.which, kinds: readonly SpeakKind[] = setup.kinds) {
  const progress = useProgress()
  const posOf = usePosOf()
  const now = new Date()
  const { words, problems } = sourceWords(setup.from, progress)
  const selected = speakSelection({ words, state: progress.reviewState, log: progress.reviewLog, now, today: localDay(now), choice: { which, kinds, order: setup.order }, posOf })
  return { words, selected, problems, posOf, progress }
}

export function SpeakPage({ sub, arg }: { sub?: string; arg?: string }) {
  if (sub === 'play') return <SpeakPlay />
  if (sub === 'map') return <FromMap lessons={arg} />
  if (sub !== undefined) {
    return (
      <div className="alert error">
        The Speak page has no part "{sub}". <a href={link('speak')}>Speak</a>
      </div>
    )
  }
  return <SpeakSetupPage />
}

/** #/speak/map/<ids>: the map tiles' lessons become the source, then the setup shows. */
function FromMap({ lessons }: { lessons?: string }) {
  const settings = useSettings()
  const named = lessons ? lessonsOfPart(lessons, content.allLessons) : { problem: 'No lessons were given.' }
  useEffect(() => {
    if ('problem' in named) return
    saveSpeak(settings.speak, { from: [`lessons:${named.lessons.map((l) => l.id).join(',')}`] })
    window.location.replace(link('speak'))
  }, [])
  if ('problem' in named) {
    return (
      <div className="alert error">
        {named.problem} <a href={link('speak')}>Speak</a>
      </div>
    )
  }
  return <p className="muted">Opening Speak with those lessons...</p>
}

function SpeakPlay() {
  const settings = useSettings()
  const setup = settings.speak
  const [run, setRun] = useState(0)
  const { selected, progress } = useSelection(setup)
  // The round's words are fixed when it starts (and on Play again); answers change the progress meanwhile.
  const [words, setWords] = useState(selected)
  if (words.length === 0) {
    return (
      <div className="card stack">
        <p>No words match your choices.</p>
        <a className="btn primary" href={link('speak')}>
          Change the choices
        </a>
      </div>
    )
  }
  return (
    <SpeakWords
      key={run}
      words={words}
      state={progress.reviewState}
      pick="as-given"
      size={setup.size === 0 ? words.length : setup.size}
      withArticle={setup.article}
      back={{ href: link('speak'), lessons: 0, label: 'Back to Speak' }}
      onAgain={() => {
        setWords(selected)
        setRun(run + 1)
      }}
    />
  )
}

function SpeakSetupPage() {
  const settings = useSettings()
  const setup = settings.speak
  const visible = useVisibleContent()
  const { words, selected, problems, posOf, progress } = useSelection(setup)
  const round = setup.size === 0 ? selected.length : Math.min(setup.size, selected.length)
  const units = [...new Set(content.lessons.map((l) => l.unit))].sort((a, b) => a - b)
  const now = new Date()
  const today = localDay(now)
  const countWhich = (which: SpeakWhich) =>
    speakSelection({ words, state: progress.reviewState, log: progress.reviewLog, now, today, choice: { which, kinds: setup.kinds, order: 'course' }, posOf }).length
  const kindCounts = new Map<SpeakKind, number>()
  for (const w of speakSelection({ words, state: progress.reviewState, log: progress.reviewLog, now, today, choice: { which: setup.which, kinds: SPEAK_KINDS, order: 'course' }, posOf })) {
    const k = wordKind(w, posOf(w.de))
    kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1)
  }
  const mapKey = setup.from.find((k) => k.startsWith('lessons:'))

  function toggleFrom(key: string) {
    const has = setup.from.includes(key)
    saveSpeak(setup, { from: has ? setup.from.filter((k) => k !== key) : [...setup.from, key] })
  }
  function toggleKind(kind: SpeakKind) {
    const has = setup.kinds.includes(kind)
    const next = has ? setup.kinds.filter((k) => k !== kind) : [...setup.kinds, kind]
    if (next.length > 0) saveSpeak(setup, { kinds: SPEAK_KINDS.filter((k) => next.includes(k)) })
  }
  const chip = (key: string, label: string) => (
    <button key={key} type="button" className={`chip ${setup.from.includes(key) ? 'active' : ''}`} aria-pressed={setup.from.includes(key)} onClick={() => toggleFrom(key)}>
      {label}
    </button>
  )

  return (
    <div className="stack speak-page">
      <h1>Speak</h1>
      <p className="muted">See the English, say the German. Your choices below are remembered on this device.</p>

      <section className="card stack speak-start">
        <p>
          <strong>
            {selected.length} word{selected.length === 1 ? '' : 's'} match
          </strong>
          {selected.length > 0 && <span className="muted">{setup.size === 0 ? ', all of them in one go' : `, ${round} per round`}</span>}
        </p>
        {selected.length > 0 ? (
          <a className="btn primary speak-go" href={link('speak', 'play')}>
            Start
          </a>
        ) : (
          <p className="small warn-text">No words match: widen the choices below.</p>
        )}
        {problems.map((p) => (
          <p key={p} className="small warn-text">
            {p}
          </p>
        ))}
      </section>

      <details className="card stack" open>
        <summary>
          <strong>Words from</strong> <span className="muted small">{setup.from.length === 0 ? 'everything' : `${setup.from.length} chosen`}</span>
        </summary>
        <div className="chips">
          <button type="button" className={`chip ${setup.from.length === 0 ? 'active' : ''}`} aria-pressed={setup.from.length === 0} onClick={() => saveSpeak(setup, { from: [] })}>
            Everything
          </button>
          {chip('mine', 'My own words')}
          {mapKey && chip(mapKey, 'Map tiles')}
        </div>
        <p className="small muted">Units</p>
        <div className="chips">{units.map((u) => chip(`unit:${u}`, `Unit ${u}`))}</div>
        {visible.themes.length > 0 && (
          <>
            <p className="small muted">Themes</p>
            <div className="chips">{visible.themes.filter((t) => isThemeLesson(t)).map((t) => chip(`lesson:${t.id}`, t.theme.title))}</div>
          </>
        )}
        {content.sets.length > 0 && (
          <>
            <p className="small muted">Word sets</p>
            <div className="chips">{content.sets.map((s) => chip(`set:${s.id}`, s.title))}</div>
          </>
        )}
        <p className="small muted">
          For single lessons, tick tiles on the <a href={link('words', 'map')}>Words map</a> and press Say the words there.
        </p>
      </details>

      <details className="card stack" open>
        <summary>
          <strong>Which words</strong> <span className="muted small">{SPEAK_WHICH_LABEL[setup.which]}</span>
        </summary>
        <div className="stack">
          {SPEAK_WHICH.map((w) => (
            <label key={w} className="radio">
              <input type="radio" name="speak-which" checked={setup.which === w} onChange={() => saveSpeak(setup, { which: w })} /> {SPEAK_WHICH_LABEL[w]}{' '}
              <span className="muted small">({countWhich(w)})</span>
            </label>
          ))}
        </div>
      </details>

      <details className="card stack" open>
        <summary>
          <strong>Kinds of words</strong>{' '}
          <span className="muted small">{setup.kinds.length === SPEAK_KINDS.length ? 'all' : setup.kinds.map((k) => SPEAK_KIND_LABEL[k].toLowerCase()).join(', ')}</span>
        </summary>
        <div className="chips">
          {SPEAK_KINDS.map((k) => (
            <button key={k} type="button" className={`chip ${setup.kinds.includes(k) ? 'active' : ''}`} aria-pressed={setup.kinds.includes(k)} onClick={() => toggleKind(k)}>
              {SPEAK_KIND_LABEL[k]} <span className="chip-count">{kindCounts.get(k) ?? 0}</span>
            </button>
          ))}
        </div>
        <p className="small muted">At least one kind stays on.</p>
      </details>

      <details className="card stack" open>
        <summary>
          <strong>Round</strong>{' '}
          <span className="muted small">
            {setup.size === 0 ? 'keep going' : `${setup.size} words`}, {SPEAK_ORDER_LABEL[setup.order].toLowerCase()}
            {setup.article ? ', with der/die/das' : ''}
          </span>
        </summary>
        <div className="field">
          <span className="label">Words per round</span>
          <div className="row">
            {SPEAK_SIZES.map((n) => (
              <label key={n} className="radio">
                <input type="radio" name="speak-size" checked={setup.size === n} onChange={() => saveSpeak(setup, { size: n })} /> {n === 0 ? 'Keep going' : n}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Order</span>
          <div className="row">
            {SPEAK_ORDERS.map((o) => (
              <label key={o} className="radio">
                <input type="radio" name="speak-order" checked={setup.order === o} onChange={() => saveSpeak(setup, { order: o })} /> {SPEAK_ORDER_LABEL[o]}
              </label>
            ))}
          </div>
        </div>
        <label className="radio">
          <input type="checkbox" checked={setup.article} onChange={() => saveSpeak(setup, { article: !setup.article })} /> Say nouns with der, die or das: a spoken
          noun counts only with the right article (typed answers always need it)
        </label>
      </details>
    </div>
  )
}
