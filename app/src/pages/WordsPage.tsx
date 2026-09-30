// The Words page: word review with spaced repetition (FSRS; three modes share one schedule per
// word) and the "All words" list, each a tab in the URL ("#/words", "#/words/all"). Hayk adds his
// own words here too (DECISIONS.md #58). When nothing is left to review, the "What next" menu
// offers more work instead of a dead end.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { content } from '../content/load.ts'
import type { Lesson, ReviewLogEntry, ReviewMode, ReviewState, StoredCard } from '../content/schema.ts'
import { AllWords } from '../components/AllWords.tsx'
import { WhatNext } from '../components/WhatNext.tsx'
import { nearMissText } from '../components/ResultView.tsx'
import { De, GlossScope } from '../components/GermanText.tsx'
import { PlayButtons } from '../components/Speaker.tsx'
import { Tabs } from '../components/Tabs.tsx'
import { UmlautBar } from '../components/UmlautBar.tsx'
import { WordForm } from '../components/WordForm.tsx'
import { asSentence, checkText, practiceWord } from '../lib/customWords.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { localDay } from '../lib/dates.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { lessonStatus, parseSourceKey, sourceKey, sourceLabel, sourceLessons, sourceThemes, wordsForSource } from '../lib/plan.ts'
import type { WordSource } from '../lib/plan.ts'
import { link, tabOf } from '../lib/router.ts'
import { updateSettings, useSettings } from '../lib/settings.ts'
import { speak } from '../lib/speech.ts'
import { counts, GRADES, LEARN_AHEAD_MS, nextCard, previewIntervals, Rating, review } from '../lib/srs.ts'
import type { Grade } from '../lib/srs.ts'
import { recordPractice, recordReview, requestFlush, useProgress } from '../lib/storage.ts'
import type { CustomWordView } from '../lib/storage.ts'
import { checkWord } from '../lib/text.ts'
import type { Comparison } from '../lib/text.ts'

const MODES: { mode: ReviewMode; title: string; desc: string }[] = [
  { mode: 'recognition', title: 'German to English', desc: 'See the German word, recall the meaning, grade yourself.' },
  { mode: 'production', title: 'English to German', desc: 'See the meaning, type the German word (nouns with der/die/das).' },
  { mode: 'listening', title: 'Listen and type', desc: 'Hear the German word, type it.' },
]

const GRADE_LABEL: Record<Grade, string> = {
  [Rating.Again]: 'Again',
  [Rating.Hard]: 'Hard',
  [Rating.Good]: 'Good',
  [Rating.Easy]: 'Easy',
}

export const WORDS_TABS = ['review', 'all'] as const
const TAB_LABEL = { review: 'Review', all: 'All words' } as const

/** `tab` is the part after "#/words/": none for Review, "all" for All words. */
export function WordsPage({ tab }: { tab?: string }) {
  const current = tabOf(tab, WORDS_TABS)
  if (current === null) {
    return (
      <div className="alert error">
        The Words page has no tab "{tab}". <a href={link('words')}>Words</a>
      </div>
    )
  }
  return <Words tab={current} />
}

function Words({ tab }: { tab: (typeof WORDS_TABS)[number] }) {
  const progress = useProgress()
  const state = progress.reviewState
  const settings = useSettings()
  const [mode, setMode] = useState<ReviewMode | null>(null)
  const [practice, setPractice] = useState<StudyWord[] | null>(null)
  // Each practice start gets a fresh session, even from the "practice done" screen.
  const [practiceRun, setPracticeRun] = useState(0)
  // The pick applies at once, even if this device cannot save it (that error is shown).
  const [picked, setPicked] = useState<string | null>(null)
  // The add/edit form for Hayk's own words, and what it last did.
  const [form, setForm] = useState<{ editing: CustomWordView | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Where the words come from (all, my words, a unit, a lesson). With "all", words of lessons
  // (course or theme) that are not open yet wait until their lesson is opened.
  const { source, note } = parseSourceKey(picked ?? settings.wordSource, content.allLessons)
  const custom = progress.customWords.map(practiceWord)
  const words = wordsForSource(source, content.words, custom, content.allLessons, progress.lessonProgress, state)
  function pick(key: string) {
    setPicked(key)
    try {
      updateSettings({ wordSource: key })
    } catch (err) {
      reportError(`Could not remember the word pick on this device: ${messageOf(err)}`)
    }
  }
  const whatNext = (
    <WhatNext
      words={words}
      allWords={source.kind === 'all'}
      onMoreNew={() => {
        // More new words: back to normal reviews, also from the "practice done" screen.
        setPractice(null)
      }}
      onPractice={(list) => {
        setPractice(list)
        setPracticeRun((r) => r + 1)
        // Practice from the start page uses English to German: recalling the German word.
        setMode((m) => m ?? 'production')
      }}
    />
  )

  if (mode && practice) {
    return (
      <PracticeSession
        key={practiceRun}
        mode={mode}
        words={practice}
        state={state}
        onExit={() => {
          setPractice(null)
          requestFlush()
        }}
        whatNext={whatNext}
      />
    )
  }
  if (mode) {
    return (
      <Session
        mode={mode}
        words={words}
        sourceName={source.kind === 'all' ? null : sourceLabel(source, content.allLessons)}
        state={state}
        onExit={() => {
          setMode(null)
          requestFlush()
        }}
        newLimit={settings.newPerDay}
        whatNext={whatNext}
      />
    )
  }

  function openForm(editing: CustomWordView | null) {
    setNotice(null)
    setForm({ editing })
    window.scrollTo(0, 0)
  }

  const c = counts(words, state, new Date(), settings.newPerDay)
  return (
    <div className="stack">
      <h1>Words</h1>
      <Tabs page="words" tabs={WORDS_TABS} labels={TAB_LABEL} current={tab} />
      {notice && (
        <div className="alert ok" role="status">
          <span>{notice}</span>
          <button type="button" className="btn small" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}
      {form ? (
        <WordForm
          key={form.editing?.id ?? 'new'}
          editing={form.editing}
          onDone={(message) => {
            setForm(null)
            setNotice(message)
          }}
          onCancel={() => setForm(null)}
        />
      ) : (
        <div>
          <button type="button" className="btn" onClick={() => openForm(null)}>
            Add a word
          </button>
        </div>
      )}
      {tab === 'all' ? (
        <AllWords onEdit={openForm} onNotice={setNotice} />
      ) : (
        // The Review tab: where the words come from, today's counts, the modes, and What next.
        <>
          <SourcePicker source={source} onPick={pick} />
          {note && <div className="alert warn">{note}</div>}
          <div className="stats">
            <div className="stat">
              <div className="stat-num">{c.due}</div>
              <div className="muted">due today</div>
            </div>
            <div className="stat">
              <div className="stat-num">{c.newLeft}</div>
              <div className="muted">new today (limit {settings.newPerDay})</div>
            </div>
            <div className="stat">
              <div className="stat-num">{words.length}</div>
              <div className="muted">{source.kind === 'all' ? 'in the word bank' : 'in this pick'}</div>
            </div>
          </div>
          {c.due === 0 && c.newLeft === 0 && source.kind !== 'all' && (
            <div className="alert warn">
              <span>Nothing due in {sourceLabel(source, content.allLessons)} and no new words from it today.</span>
              <button type="button" className="btn small" onClick={() => pick('all')}>
                Switch to all words
              </button>
            </div>
          )}
          <h2>Choose a mode</h2>
          {MODES.map((m) => (
            <button key={m.mode} type="button" className="card mode-card" onClick={() => setMode(m.mode)}>
              <strong>{m.title}</strong>
              <span className="muted">{m.desc}</span>
            </button>
          ))}
          <p className="muted small">Keys on desktop: Space shows the answer, Enter checks a typed answer, 1-4 grade.</p>
          {source.kind === 'mine' && words.length === 0 && <p className="muted">You have not added any words yet. Use "Add a word" above.</p>}
          {c.due === 0 && c.newLeft === 0 && (
            <>
              {source.kind === 'all' && <p>Nothing due and no new words left for today.</p>}
              {whatNext}
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Where the words come from: all, my words, one unit, or one lesson (grouped by unit, in course order), or a theme lesson. */
function SourcePicker({ source, onPick }: { source: WordSource; onPick: (key: string) => void }) {
  const view = useProgress()
  const progress = view.lessonProgress
  const lessons = sourceLessons(content.lessons)
  const themes = sourceThemes(content.themes)
  const units = [...new Set(lessons.map((l) => l.unit))]
  const unopened = (l: Lesson) => lessonStatus(progress, l.id) === 'not-started'
  const pickedLessons = [...lessons, ...themes].filter((l) =>
    source.kind === 'unit' ? l.unit === source.unit : source.kind === 'lesson' && l.id === source.lessonId,
  )
  const closed = pickedLessons.filter(unopened).length
  return (
    <label className="field">
      <span className="label">Words from</span>
      <select value={sourceKey(source)} onChange={(e) => onPick(e.target.value)}>
        <option value="all">All words (lessons unlock their words when opened)</option>
        <option value="mine">{`My words (${view.customWords.length})`}</option>
        {units.map((u) => (
          <optgroup key={u} label={`Unit ${u}`}>
            <option value={sourceKey({ kind: 'unit', unit: u })}>{`All of Unit ${u}`}</option>
            {lessons
              .filter((l) => l.unit === u)
              .map((l) => (
                <option key={l.id} value={sourceKey({ kind: 'lesson', lessonId: l.id })}>
                  {`${l.unit}.${l.order} ${l.title}${unopened(l) ? ' (not opened yet)' : ''}`}
                </option>
              ))}
          </optgroup>
        ))}
        {themes.length > 0 && (
          <optgroup label="Themes">
            {themes.map((l) => (
              <option key={l.id} value={sourceKey({ kind: 'lesson', lessonId: l.id })}>
                {`${l.theme.title}${unopened(l) ? ' (not opened yet)' : ''}`}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {closed > 0 && (
        <span className="small warn-text">
          {source.kind === 'lesson'
            ? 'This lesson is not opened yet: its words will be new words here.'
            : `${closed} of its lessons ${closed === 1 ? 'is' : 'are'} not opened yet: their words will be new words here.`}
        </span>
      )}
    </label>
  )
}

interface Failed {
  entry: ReviewLogEntry
  card: StoredCard
  message: string
}

function Session(props: {
  mode: ReviewMode
  words: StudyWord[]
  /** The unit or lesson the words come from; null for all words. */
  sourceName: string | null
  state: ReviewState
  onExit: () => void
  newLimit: number
  whatNext: ReactNode
}) {
  const { mode, words, sourceName, state, onExit, newLimit, whatNext } = props
  const [now, setNow] = useState(() => new Date())
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<Failed | null>(null)
  const [stats, setStats] = useState({ reviewed: 0, again: 0 })
  const next = nextCard(words, state, now, newLimit)

  // When the only cards left are due later today, check again once the first one comes into range.
  const waitUntil = next.kind === 'wait' ? next.due.getTime() : null
  useEffect(() => {
    if (waitUntil === null) return
    const ms = Math.max(1000, waitUntil - LEARN_AHEAD_MS - Date.now())
    const t = window.setTimeout(() => setNow(new Date()), ms)
    return () => window.clearTimeout(t)
  }, [waitUntil])

  // A review round is over (nothing due now): send it.
  const roundOver = next.kind !== 'card' && stats.reviewed > 0
  useEffect(() => {
    if (roundOver) requestFlush()
  }, [roundOver])

  /** Saves on this device (the outbox); the store then shows the new state everywhere. */
  function persist(entry: ReviewLogEntry, card: StoredCard) {
    setSaving(true)
    try {
      recordReview(entry, card)
      setFailed(null)
      setStats((s) => ({ reviewed: s.reviewed + 1, again: s.again + (entry.rating === Rating.Again ? 1 : 0) }))
      setNow(new Date())
    } catch (err) {
      setFailed({ entry, card, message: messageOf(err) })
    } finally {
      setSaving(false)
    }
  }

  function grade(word: StudyWord, isNew: boolean, rating: Grade, typed: { answer: string; check: Comparison } | null, timeMs: number) {
    const at = new Date()
    const out = review(state, word.id, rating, at)
    const entry: ReviewLogEntry = {
      ts: at.toISOString(),
      localDay: localDay(at),
      timeMs,
      wordId: word.id,
      de: word.de,
      mode,
      rating,
      answer: typed ? typed.answer : null,
      correct: typed ? typed.check.correct : null,
      nearMiss: typed ? typed.check.nearMiss : null,
      isNew,
      stateBefore: out.before ? out.before.state : 0,
      stateAfter: out.after.state,
      due: out.after.due,
    }
    persist(entry, out.after)
  }

  const header = (
    <div className="row between">
      <button type="button" className="btn small" onClick={onExit}>
        Back to modes
      </button>
      <span className="muted small">
        {MODES.find((m) => m.mode === mode)?.title}
        {sourceName ? ` (${sourceName})` : ''} - reviewed {stats.reviewed}
      </span>
    </div>
  )

  if (failed) {
    return (
      <div className="stack">
        {header}
        <div className="alert error" role="alert">
          <span>Your last grade was NOT saved: {failed.message}</span>
          <button type="button" className="btn small" disabled={saving} onClick={() => persist(failed.entry, failed.card)}>
            Retry saving
          </button>
        </div>
      </div>
    )
  }

  if (next.kind !== 'card') {
    return (
      <div className="stack">
        {header}
        <div className="card center">
          {next.kind === 'wait' ? (
            <p>
              Reviews done for now. The next card is due at {next.due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}; this page will
              pick it up.
            </p>
          ) : (
            <p>Today's reviews are done.</p>
          )}
          <p className="muted">
            This session: {stats.reviewed} reviewed, {stats.again} marked Again.
          </p>
        </div>
        {whatNext}
      </div>
    )
  }

  return (
    <div className="stack">
      {header}
      <Card
        key={`${next.word.id}-${stats.reviewed}`}
        word={next.word}
        isNew={next.isNew}
        mode={mode}
        intervals={previewIntervals(state, next.word.id, now)}
        disabled={saving}
        onGrade={(rating, typed, timeMs) => grade(next.word, next.isNew, rating, typed, timeMs)}
      />
    </div>
  )
}

/**
 * Extra practice of weak words. It does NOT change the FSRS schedule: each answer is only logged,
 * with practice: true, so the statistics and Claude can see it (DECISIONS.md #25).
 */
function PracticeSession(props: { mode: ReviewMode; words: StudyWord[]; state: ReviewState; onExit: () => void; whatNext: ReactNode }) {
  const { mode, words, state, onExit, whatNext } = props
  const [index, setIndex] = useState(0)
  const [again, setAgain] = useState(0)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<{ entry: ReviewLogEntry; message: string } | null>(null)
  // The practice round is over: send it.
  const practiceOver = index >= words.length && index > 0
  useEffect(() => {
    if (practiceOver) requestFlush()
  }, [practiceOver])

  function persist(entry: ReviewLogEntry) {
    setSaving(true)
    try {
      recordPractice(entry)
      setFailed(null)
      setAgain((a) => a + (entry.rating === Rating.Again ? 1 : 0))
      setIndex((i) => i + 1)
    } catch (err) {
      setFailed({ entry, message: messageOf(err) })
    } finally {
      setSaving(false)
    }
  }

  function grade(word: StudyWord, rating: Grade, typed: { answer: string; check: Comparison } | null, timeMs: number) {
    const card = state.cards[word.id]
    if (!card) throw new Error(`Practice word "${word.id}" has never been reviewed`)
    const at = new Date()
    persist({
      ts: at.toISOString(),
      localDay: localDay(at),
      timeMs,
      wordId: word.id,
      de: word.de,
      mode,
      rating,
      answer: typed ? typed.answer : null,
      correct: typed ? typed.check.correct : null,
      nearMiss: typed ? typed.check.nearMiss : null,
      isNew: false,
      stateBefore: card.state,
      stateAfter: card.state,
      due: card.due,
      practice: true,
    })
  }

  const header = (
    <div className="row between">
      <button type="button" className="btn small" onClick={onExit}>
        Stop practice
      </button>
      <span className="muted small">
        Practice ({MODES.find((m) => m.mode === mode)?.title}) - {Math.min(index, words.length)}/{words.length}, schedule unchanged
      </span>
    </div>
  )

  if (failed) {
    return (
      <div className="stack">
        {header}
        <div className="alert error" role="alert">
          <span>Your last answer was NOT saved: {failed.message}</span>
          <button type="button" className="btn small" disabled={saving} onClick={() => persist(failed.entry)}>
            Retry saving
          </button>
        </div>
      </div>
    )
  }

  if (index >= words.length) {
    return (
      <div className="stack">
        {header}
        <div className="card center">
          <p>
            Practice done: {words.length} word{words.length === 1 ? '' : 's'}, {again} marked Again.
          </p>
          <p className="muted small">Your review schedule is unchanged; the answers were logged as practice.</p>
        </div>
        {whatNext}
      </div>
    )
  }

  const word = words[index]
  return (
    <div className="stack">
      {header}
      <Card
        key={`${word.id}-${index}`}
        word={word}
        isNew={false}
        mode={mode}
        intervals={null}
        disabled={saving}
        onGrade={(r, typed, ms) => grade(word, r, typed, ms)}
      />
    </div>
  )
}

function isTyping(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement && !target.readOnly) ||
    (target instanceof HTMLTextAreaElement && !target.readOnly)
  )
}

function Card(props: {
  word: StudyWord
  isNew: boolean
  mode: ReviewMode
  /** Next interval per grade; null in practice, where grades do not reschedule. */
  intervals: Record<Grade, string> | null
  disabled: boolean
  onGrade: (rating: Grade, typed: { answer: string; check: Comparison } | null, timeMs: number) => void
}) {
  const { word, isNew, mode, intervals, disabled, onGrade } = props
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<Comparison | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Time from showing the card to grading it, for the minutes statistics.
  const [shownAt] = useState(() => performance.now())
  const typingMode = mode !== 'recognition'
  const done = typingMode ? check !== null : revealed

  // Listening mode: play the word as soon as the card appears.
  useEffect(() => {
    if (mode === 'listening') speak(word.de)
  }, [mode, word.de])

  useEffect(() => {
    if (typingMode) inputRef.current?.focus()
  }, [typingMode])

  const submitGrade = (g: Grade) => {
    if (disabled) return
    onGrade(g, typingMode && check ? { answer: typed.trim(), check } : null, Math.round(performance.now() - shownAt))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === ' ' && !typingMode && !revealed) {
        e.preventDefault()
        setRevealed(true)
      } else if (done && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        submitGrade(Number(e.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function onCheck(e: FormEvent) {
    e.preventDefault()
    if (typed.trim() === '') return
    setCheck(checkWord(typed, word.de))
    inputRef.current?.blur()
  }

  const suggested: Grade | null = check ? (check.correct ? Rating.Good : Rating.Again) : null
  const near = nearMissText(check?.nearMiss)

  const claude = checkText(word.custom?.check)
  const typedByHayk = word.custom?.typed
  return (
    // Word popups only once the answer is shown (Hayk, 2026-09-29); never on his own words (glossary/gate.ts).
    <GlossScope surface={word.custom ? { kind: 'custom-word' } : { kind: 'review-card', revealed: done }}>
    <section className="card word-card">
      {(isNew || word.custom) && (
        <span className="row">
          {isNew && <span className="badge pending">new word</span>}
          {word.custom && <span className="badge">my word</span>}
        </span>
      )}

      {mode === 'recognition' && (
        <p className="word-big">
          <De text={word.de} />
        </p>
      )}
      {mode === 'production' && (
        <>
          <p className="word-big">{word.en}</p>
          <p className="muted small">Type the German word. Nouns: include der/die/das.</p>
        </>
      )}
      {mode === 'listening' && <PlayButtons text={word.de} />}

      {typingMode && (
        <form onSubmit={onCheck} className="stack">
          <input
            ref={inputRef}
            type="text"
            className="text"
            aria-label="German word"
            value={typed}
            readOnly={check !== null}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            lang="de"
          />
          {check === null && (
            <>
              <UmlautBar />
              <button type="submit" className="btn primary" disabled={typed.trim() === ''}>
                Check (Enter)
              </button>
            </>
          )}
        </form>
      )}

      {check && (
        <div className={`alert ${check.correct ? 'ok' : 'error'}`}>
          {check.correct ? 'Correct!' : `Not quite${near ? ` (${near})` : ''}.`}
        </div>
      )}

      {!typingMode && !revealed && (
        <button type="button" className="btn primary" onClick={() => setRevealed(true)}>
          Show answer (Space)
        </button>
      )}

      {done && (
        <div className="answer-block">
          {mode === 'recognition' ? <p className="word-meaning">{word.en}</p> : <p className="word-big"><De text={word.de} /></p>}
          {mode === 'listening' && <p className="word-meaning">{word.en}</p>}
          {word.plural && (
            <p>
              <span className="label">Plural</span> <span lang="de">{word.plural}</span>
            </p>
          )}
          {word.example && (
            <div className="example">
              <De text={word.example.de} />
              {word.example.en && <div className="muted">{word.example.en}</div>}
            </div>
          )}
          {word.custom?.note && <p className="small muted">Your note: {word.custom.note}</p>}
          {claude && (
            <p className={`small ${word.custom?.check?.ok ? 'muted' : 'warn-text'}`}>
              {asSentence(claude)}
              {!word.custom?.check?.ok && typedByHayk && (
                <>
                  {' '}
                  You wrote: <span lang="de">{typedByHayk.de}</span>
                  {typedByHayk.plural ? `, plural ${typedByHayk.plural}` : ''} = {typedByHayk.en}
                </>
              )}
            </p>
          )}
          <div className="grades">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                className={`btn grade g${g} ${suggested === g ? 'suggested' : ''}`}
                disabled={disabled}
                onClick={() => submitGrade(g)}
              >
                <span>
                  {g} {GRADE_LABEL[g]}
                </span>
                {intervals && <span className="small muted">{intervals[g]}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
    </GlossScope>
  )
}
