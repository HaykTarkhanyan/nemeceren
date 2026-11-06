// The Words page: word review with spaced repetition (FSRS; three modes share one schedule per
// word) and the "All words" list, each a tab in the URL ("#/words", "#/words/all"). Hayk adds his
// own words here too (DECISIONS.md #58). When nothing is left to review, the "What next" menu
// offers more work instead of a dead end.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { content } from '../content/load.ts'
import type { Lesson, ReviewLogEntry, ReviewMode, ReviewState, StoredCard } from '../content/schema.ts'
import { AllWords } from '../components/AllWords.tsx'
import { Card, MODES } from '../components/ReviewCard.tsx'
import { WhatNext } from '../components/WhatNext.tsx'
import { Tabs } from '../components/Tabs.tsx'
import { WordForm } from '../components/WordForm.tsx'
import { WordSetsTab } from '../components/WordSetsTab.tsx'
import type { PracticeHow } from '../components/WordSetsTab.tsx'
import { ListenGame, MatchGame } from './DailyPage.tsx'
import { practiceWord } from '../lib/customWords.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { lessonStatus, parseSourceKey, sourceKey, sourceLabel, sourceLessons, sourceThemes, wordsForSource } from '../lib/plan.ts'
import type { WordSource } from '../lib/plan.ts'
import { practiceEntry, scheduledEntry } from '../lib/reviewEntries.ts'
import type { Typed } from '../lib/reviewEntries.ts'
import { link, tabOf } from '../lib/router.ts'
import { updateSettings, useSettings } from '../lib/settings.ts'
import { counts, LEARN_AHEAD_MS, nextCard, previewIntervals, Rating } from '../lib/srs.ts'
import type { Grade } from '../lib/srs.ts'
import { recordPractice, recordReview, requestFlush, useProgress } from '../lib/storage.ts'
import type { CustomWordView } from '../lib/storage.ts'

export const WORDS_TABS = ['review', 'all', 'sets'] as const
const TAB_LABEL = { review: 'Review', all: 'All words', sets: 'Word sets' } as const

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
  // A game on a picked list of words (All words, Word sets); each start is a fresh run.
  const [game, setGame] = useState<{ how: 'match' | 'listen'; words: StudyWord[]; run: number } | null>(null)

  // Where the words come from (all, my words, a unit, a lesson). With "all", words of lessons
  // (course or theme) that are not open yet wait until their lesson is opened.
  const { source, note } = parseSourceKey(picked ?? settings.wordSource, content.allLessons)
  const custom = progress.customWords.map(practiceWord)
  const words = wordsForSource(source, content.words, custom, content.allLessons, progress.lessonProgress, state)
  // A picked unit, lesson or "my words" brings all its new words at once; only "all" keeps the daily
  // limit, so 200+ lesson words can't arrive in one day (Hayk, 2026-10-02; DECISIONS.md #66).
  const newLimit = source.kind === 'all' ? settings.newPerDay : Number.POSITIVE_INFINITY
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

  /** Practice a picked list (All words, Word sets): a game, or typing the German as practice. */
  function startPractice(ids: string[], how: PracticeHow) {
    const byId = new Map<string, StudyWord>([...content.words, ...custom].map((w) => [w.id, w]))
    const list = ids.map((id) => {
      const w = byId.get(id)
      if (!w) throw new Error(`No word "${id}" to practise`)
      return w
    })
    if (how === 'type') {
      setPractice(list)
      setPracticeRun((r) => r + 1)
      setMode('production')
    } else setGame({ how, words: list, run: (game?.run ?? 0) + 1 })
    window.scrollTo(0, 0)
  }

  if (game) {
    const again = () => setGame({ ...game, run: game.run + 1 })
    return (
      <div className="stack">
        <div>
          <button type="button" className="btn small" onClick={() => setGame(null)}>
            Back to the words
          </button>
        </div>
        {game.how === 'match' ? (
          <MatchGame key={game.run} pool={game.words} state={state} onAgain={again} rounds={Math.max(1, Math.ceil(game.words.length / 5))} />
        ) : (
          <ListenGame key={game.run} pool={game.words} state={state} onAgain={again} n={Math.min(10, game.words.length)} />
        )}
      </div>
    )
  }

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
        newLimit={newLimit}
        whatNext={whatNext}
      />
    )
  }

  function openForm(editing: CustomWordView | null) {
    setNotice(null)
    setForm({ editing })
    window.scrollTo(0, 0)
  }

  const c = counts(words, state, new Date(), newLimit)
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
      {tab === 'sets' ? (
        <WordSetsTab onPractice={startPractice} />
      ) : tab === 'all' ? (
        <AllWords onEdit={openForm} onNotice={setNotice} onPractice={startPractice} />
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
              <div className="muted">{source.kind === 'all' ? `new today (limit ${settings.newPerDay})` : 'new in this pick (no daily limit)'}</div>
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

  function grade(word: StudyWord, isNew: boolean, rating: Grade, typed: Typed | null, timeMs: number) {
    const { entry, card } = scheduledEntry({ state, word, isNew, mode, rating, typed, timeMs, at: new Date() })
    persist(entry, card)
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

  function grade(word: StudyWord, rating: Grade, typed: Typed | null, timeMs: number) {
    const answer = typed ? { text: typed.answer, correct: typed.check.correct, nearMiss: typed.check.nearMiss } : null
    persist(practiceEntry({ state, word, mode, rating, answer, timeMs, at: new Date() }))
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
