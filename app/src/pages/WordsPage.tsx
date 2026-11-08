// The Words page: word review with spaced repetition (FSRS; three modes share one schedule per
// word), the "All words" list, the word sets and the map of lessons, each a tab in the URL
// ("#/words", "#/words/all", "#/words/sets", "#/words/map"). Hayk adds his
// own words here too (DECISIONS.md #58). When nothing is left to review, the "What next" menu
// offers more work instead of a dead end.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { content } from '../content/load.ts'
import type { Lesson, ReviewLogEntry, ReviewState, StoredCard } from '../content/schema.ts'
import { AllWords } from '../components/AllWords.tsx'
import { FocusBar, useReviewSound } from '../components/FocusBar.tsx'
import { GlossScope } from '../components/GermanText.tsx'
import { Card, MODES, WordDe } from '../components/ReviewCard.tsx'
import { WhatNext } from '../components/WhatNext.tsx'
import { Tabs } from '../components/Tabs.tsx'
import { VocabMap } from '../components/VocabMap.tsx'
import { WordForm } from '../components/WordForm.tsx'
import { WordSetsTab } from '../components/WordSetsTab.tsx'
import type { PracticeHow } from '../components/WordSetsTab.tsx'
import { canListen, ListenGame, MatchGame } from './DailyPage.tsx'
import { practiceWord } from '../lib/customWords.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { addDays, localDay } from '../lib/dates.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { reachOf } from '../lib/goalView.ts'
import { pickWordSource } from '../lib/wordReview.ts'
import { lessonStatus, parseSourceKey, sourceKey, sourceLabel, sourceLessons, sourceThemes, wordsForSource } from '../lib/plan.ts'
import type { WordSource } from '../lib/plan.ts'
import { dueOnDay, GOAL_ROUND_MIN, pickMode, ROUND_SIZE, roundSummary } from '../lib/review.ts'
import type { SessionMode } from '../lib/review.ts'
import { practiceEntry, scheduledEntry } from '../lib/reviewEntries.ts'
import type { Typed } from '../lib/reviewEntries.ts'
import { link, tabOf } from '../lib/router.ts'
import { updateSettings, useSettings } from '../lib/settings.ts'
import { counts, LEARN_AHEAD_MS, nextCard, previewIntervals, Rating } from '../lib/srs.ts'
import type { Grade } from '../lib/srs.ts'
import { useSpeech } from '../lib/speech.ts'
import { recordPractice, recordReview, recordReviewRoundDone, requestFlush, useProgress } from '../lib/storage.ts'
import type { CustomWordView } from '../lib/storage.ts'
import { useVisibleContent } from '../lib/visibleContent.ts'

export const WORDS_TABS = ['review', 'all', 'sets', 'map'] as const
const TAB_LABEL = { review: 'Review', all: 'All words', sets: 'Word sets', map: 'Map' } as const

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
  const [mode, setMode] = useState<SessionMode | null>(null)
  const [practice, setPractice] = useState<StudyWord[] | null>(null)
  // Each practice start gets a fresh session, even from the "practice done" screen.
  const [practiceRun, setPracticeRun] = useState(0)
  // Practice started from the words list (All words, Word sets) goes back to the list when stopped,
  // not into a scheduled review that would move the schedule and use up new words.
  const [practiceFromList, setPracticeFromList] = useState(false)
  // A pick this device could not save (that error is shown) still applies on this page; a saved pick lives in the settings.
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
  // With "all", new words follow the path (lib/plan.ts pathNewWords), the same rule as the daily mix.
  const words = wordsForSource(source, content.words, custom, content.allLessons, progress.lessonProgress, state, reachOf(progress))
  // A picked unit, lesson or "my words" brings all its new words at once; only "all" keeps the daily
  // limit, so 200+ lesson words can't arrive in one day (Hayk, 2026-10-02; DECISIONS.md #66).
  const newLimit = source.kind === 'all' ? settings.newPerDay : Number.POSITIVE_INFINITY
  function pick(key: string) {
    // The page keeps its own pick only when this device could not save it (lib/wordReview.ts).
    const out = pickWordSource(key, (k) => updateSettings({ wordSource: k }))
    setPicked(out.picked)
    if (out.problem) reportError(out.problem)
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
        setPracticeFromList(false)
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
      setPracticeFromList(true)
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
          if (practiceFromList) setMode(null)
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
        onPractice={(list) => {
          setPractice(list)
          setPracticeFromList(false)
          setPracticeRun((r) => r + 1)
        }}
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
      {tab === 'map' ? (
        <VocabMap />
      ) : tab === 'sets' ? (
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
          {[...MODES, MIXED_MODE].map((m) => (
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
  const themes = sourceThemes(useVisibleContent().themes)
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
        <option value="all">All words (new words follow the path)</option>
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

const MIXED_MODE = { mode: 'mixed' as const, title: 'Mixed', desc: 'Each card picks a direction: flip, type the German, or listen and type.' }

function modeTitle(mode: SessionMode): string {
  return mode === 'mixed' ? MIXED_MODE.title : (MODES.find((m) => m.mode === mode)?.title ?? mode)
}

/** After a round: how it went, the hard words to practise, and what is due tomorrow (DECISIONS.md #85). */
function RoundEnd(props: {
  entries: ReviewLogEntry[]
  words: StudyWord[]
  state: ReviewState
  counted: boolean
  canContinue: boolean
  onNext: () => void
  onExit: () => void
  onPractice: (list: StudyWord[]) => void
}) {
  const { entries, words, state, counted, canContinue, onNext, onExit, onPractice } = props
  const s = roundSummary(entries)
  const byId = new Map(words.map((w) => [w.id, w]))
  const hard = s.hardIds.map((id) => byId.get(id)).filter((w): w is StudyWord => w !== undefined)
  const tomorrow = dueOnDay(state, new Set(words.map((w) => w.id)), addDays(localDay(new Date()), 1))
  return (
    <div className="stack round-end">
      <h2>Round done</h2>
      <div className="stats">
        <div className="stat">
          <div className="stat-num">{s.cards}</div>
          <div className="muted">cards</div>
        </div>
        <div className="stat">
          <div className="stat-num">{s.percent}%</div>
          <div className="muted">Good or Easy</div>
        </div>
        <div className="stat">
          <div className="stat-num">{s.minutes}</div>
          <div className="muted">minutes</div>
        </div>
        <div className="stat">
          <div className="stat-num">{s.fresh}</div>
          <div className="muted">new words</div>
        </div>
      </div>
      {counted ? (
        <p className="ok-text">This round counts for today's goal.</p>
      ) : (
        <p className="muted small">A round of {GOAL_ROUND_MIN} or more cards counts for the daily goal.</p>
      )}
      {hard.length > 0 && (
        <section className="card stack">
          <h3>Hard this round</h3>
          {/* The answers were all shown in the round, so word popups are allowed (glossary/gate.ts). */}
          <GlossScope surface={{ kind: 'review-card', revealed: true }}>
            <ul className="hard-words">
              {hard.map((w) => (
                <li key={w.id}>
                  <WordDe de={w.de} /> <span className="muted">{w.en}</span>
                </li>
              ))}
            </ul>
          </GlossScope>
          <div>
            <button type="button" className="btn" onClick={() => onPractice(hard)}>
              Practise these ({hard.length}), schedule unchanged
            </button>
          </div>
        </section>
      )}
      <p className="muted small">
        {tomorrow} word{tomorrow === 1 ? '' : 's'} due tomorrow.
      </p>
      <div className="row">
        {canContinue && (
          <button type="button" className="btn primary" onClick={onNext}>
            Next round
          </button>
        )}
        <button type="button" className={`btn${canContinue ? '' : ' primary'}`} onClick={onExit}>
          Done
        </button>
      </div>
    </div>
  )
}

/**
 * Scheduled reviews in the full-screen focus view (DECISIONS.md #85): rounds of up to ROUND_SIZE
 * cards, each with an end screen. A round that ends with GOAL_ROUND_MIN or more cards counts for the
 * daily goal (a review-round path event, #86).
 */
function Session(props: {
  mode: SessionMode
  words: StudyWord[]
  /** The unit or lesson the words come from; null for all words. */
  sourceName: string | null
  state: ReviewState
  onExit: () => void
  newLimit: number
  whatNext: ReactNode
  onPractice: (list: StudyWord[]) => void
}) {
  const { mode, words, sourceName, state, onExit, newLimit, whatNext, onPractice } = props
  const listen = canListen(useSpeech())
  const [sound, toggleSound] = useReviewSound()
  const [now, setNow] = useState(() => new Date())
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<Failed | null>(null)
  const [round, setRound] = useState<ReviewLogEntry[]>([])
  const [graded, setGraded] = useState(0)
  const startCounts = () => {
    const c = counts(words, state, new Date(), newLimit)
    return Math.min(ROUND_SIZE, c.due + c.newLeft)
  }
  const [available, setAvailable] = useState(startCounts)
  const recorded = useRef(false)
  const next = nextCard(words, state, now, newLimit)
  const roundOver = round.length > 0 && (round.length >= ROUND_SIZE || next.kind !== 'card')
  const target = Math.min(ROUND_SIZE, Math.max(available, round.length + (next.kind === 'card' && !roundOver ? 1 : 0)))
  // One direction per card, kept while the card is on screen.
  const cardKey = next.kind === 'card' ? `${next.word.id}-${graded}` : ''
  const cardIsNew = next.kind === 'card' && next.isNew
  const cardMode = useMemo(() => pickMode(mode, listen, Math.random, cardIsNew), [cardKey, mode, listen, cardIsNew])

  // When the only cards left are due later today, check again once the first one comes into range.
  const waitUntil = next.kind === 'wait' ? next.due.getTime() : null
  useEffect(() => {
    if (waitUntil === null) return
    const ms = Math.max(1000, waitUntil - LEARN_AHEAD_MS - Date.now())
    const t = window.setTimeout(() => setNow(new Date()), ms)
    return () => window.clearTimeout(t)
  }, [waitUntil])

  // A round is over: it counts for the daily goal with GOAL_ROUND_MIN+ cards; send it.
  useEffect(() => {
    if (!roundOver) return
    if (round.length >= GOAL_ROUND_MIN && !recorded.current) {
      recorded.current = true
      try {
        recordReviewRoundDone()
      } catch (err) {
        reportError(`Could not save the finished review round for your daily goal: ${messageOf(err)}`)
      }
    }
    requestFlush()
  }, [roundOver])

  /** Saves on this device (the outbox); the store then shows the new state everywhere. */
  function persist(entry: ReviewLogEntry, card: StoredCard) {
    setSaving(true)
    try {
      recordReview(entry, card)
      setFailed(null)
      setRound((r) => [...r, entry])
      setGraded((g) => g + 1)
      setNow(new Date())
    } catch (err) {
      setFailed({ entry, card, message: messageOf(err) })
    } finally {
      setSaving(false)
    }
  }

  function grade(word: StudyWord, isNew: boolean, rating: Grade, typed: Typed | null, timeMs: number) {
    const { entry, card } = scheduledEntry({ state, word, isNew, mode: cardMode, rating, typed, timeMs, at: new Date() })
    persist(entry, card)
  }

  function nextRound() {
    recorded.current = false
    setRound([])
    setAvailable(startCounts())
    setNow(new Date())
    window.scrollTo(0, 0)
  }

  const bar = (
    <FocusBar
      onClose={onExit}
      closeLabel="Close"
      done={round.length}
      target={target}
      label={`${modeTitle(mode)}${sourceName ? ` (${sourceName})` : ''}`}
      sound={sound}
      onSound={toggleSound}
    />
  )

  let body: ReactNode
  if (failed) {
    body = (
      <div className="alert error" role="alert">
        <span>Your last grade was NOT saved: {failed.message}</span>
        <button type="button" className="btn small" disabled={saving} onClick={() => persist(failed.entry, failed.card)}>
          Retry saving
        </button>
      </div>
    )
  } else if (roundOver) {
    body = (
      <RoundEnd
        entries={round}
        words={words}
        state={state}
        counted={round.length >= GOAL_ROUND_MIN}
        canContinue={next.kind === 'card'}
        onNext={nextRound}
        onExit={onExit}
        onPractice={onPractice}
      />
    )
  } else if (next.kind !== 'card') {
    body = (
      <>
        <div className="card center">
          {next.kind === 'wait' ? (
            <p>
              Reviews done for now. The next card is due at {next.due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}; this page will
              pick it up.
            </p>
          ) : (
            <p>Today's reviews are done.</p>
          )}
        </div>
        {whatNext}
      </>
    )
  } else {
    body = (
      <Card
        key={cardKey}
        word={next.word}
        isNew={next.isNew}
        mode={cardMode}
        intervals={previewIntervals(state, next.word.id, now)}
        disabled={saving}
        autoSpeak={sound}
        onGrade={(rating, typed, timeMs) => grade(next.word, next.isNew, rating, typed, timeMs)}
      />
    )
  }

  return (
    <div className="focus-review" role="dialog" aria-label="Word review">
      {bar}
      <div className="focus-body">{body}</div>
    </div>
  )
}

/**
 * Extra practice of weak words. It does NOT change the FSRS schedule: each answer is only logged,
 * with practice: true, so the statistics and Claude can see it (DECISIONS.md #25).
 */
function PracticeSession(props: { mode: SessionMode; words: StudyWord[]; state: ReviewState; onExit: () => void; whatNext: ReactNode }) {
  const { mode, words, state, onExit, whatNext } = props
  const listen = canListen(useSpeech())
  const [sound, toggleSound] = useReviewSound()
  const [index, setIndex] = useState(0)
  const [again, setAgain] = useState(0)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<{ entry: ReviewLogEntry; message: string } | null>(null)
  const cardMode = useMemo(() => pickMode(mode, listen), [index, mode, listen])
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
    persist(practiceEntry({ state, word, mode: cardMode, rating, answer, timeMs, at: new Date() }))
  }

  let body: ReactNode
  if (failed) {
    body = (
      <div className="alert error" role="alert">
        <span>Your last answer was NOT saved: {failed.message}</span>
        <button type="button" className="btn small" disabled={saving} onClick={() => persist(failed.entry)}>
          Retry saving
        </button>
      </div>
    )
  } else if (index >= words.length) {
    body = (
      <>
        <div className="card center">
          <p>
            Practice done: {words.length} word{words.length === 1 ? '' : 's'}, {again} marked Again.
          </p>
          <p className="muted small">Your review schedule is unchanged; the answers were logged as practice.</p>
        </div>
        {whatNext}
      </>
    )
  } else {
    const word = words[index]
    body = (
      <Card
        key={`${word.id}-${index}`}
        word={word}
        isNew={false}
        mode={cardMode}
        intervals={null}
        disabled={saving}
        autoSpeak={sound}
        onGrade={(r, typed, ms) => grade(word, r, typed, ms)}
      />
    )
  }

  return (
    <div className="focus-review" role="dialog" aria-label="Word practice">
      <FocusBar
        onClose={onExit}
        closeLabel="Stop"
        done={Math.min(index, words.length)}
        target={words.length}
        label={`Practice, ${modeTitle(mode)}, schedule unchanged`}
        sound={sound}
        onSound={toggleSound}
      />
      <div className="focus-body">{body}</div>
    </div>
  )
}
