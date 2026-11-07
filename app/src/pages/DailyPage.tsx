// The light daily mode (design: _knowledge/2026-11-06_light-daily-mode-design.md, DECISIONS.md #77):
// "#/daily" runs the daily mix (a match-pairs warm-up, due word reviews, a few new words, listen
// and pick), "#/daily/match" and "#/daily/listen" run one game on its own. The games are practice
// and never change the review schedule; the reviews and new words inside the mix are normal reviews.
import { useEffect, useRef, useState } from 'react'
import { content } from '../content/load.ts'
import type { ReviewState, WordSet } from '../content/schema.ts'
import { ListenPick } from '../components/ListenPick.tsx'
import type { PickStats } from '../components/ListenPick.tsx'
import { MatchPairs } from '../components/MatchPairs.tsx'
import type { MatchStats } from '../components/MatchPairs.tsx'
import { MistakesSession } from '../components/MistakesSession.tsx'
import type { MistakeStats } from '../components/MistakesSession.tsx'
import { ReviewRun } from '../components/ReviewRun.tsx'
import type { RunStats } from '../components/ReviewRun.tsx'
import { practiceWord } from '../lib/customWords.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { dueNow, introduced, matchRounds, MIN_PAIRS, MIN_PICK_WORDS, MIX, MIX_STEP_LABEL, mixFinished, mixNewWords, mixSteps, pickItems } from '../lib/daily.ts'
import type { MixStep } from '../lib/daily.ts'
import { deriveMistakes, MISTAKE_SESSION_MAX } from '../lib/mistakes.ts'
import type { Mistake } from '../lib/mistakes.ts'
import { nextLesson, wordsForSource } from '../lib/plan.ts'
import type { ProgressView } from '../lib/storage.ts'
import { link } from '../lib/router.ts'
import { useSettings } from '../lib/settings.ts'
import { NO_VOICE_HELP, useSpeech } from '../lib/speech.ts'
import type { SpeechInfo } from '../lib/speech.ts'
import type { Settings } from '../lib/settings.ts'
import { counts } from '../lib/srs.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { reachOf } from '../lib/goalView.ts'
import { recordDailyMixDone, requestFlush, useProgress } from '../lib/storage.ts'

/** The word set the mix takes new words from, or null (the next lessons). An unknown saved id is an error to show. */
export function activeSet(settings: Settings): { set: WordSet | null; problem: string | null } {
  if (settings.activeSet === null) return { set: null, problem: null }
  const set = content.sets.find((s) => s.id === settings.activeSet) ?? null
  return set ? { set, problem: null } : { set: null, problem: `The word set "${settings.activeSet}" no longer exists, so new words come from the next lessons.` }
}

/** All words the reviews may use (new words follow the path), plus Hayk's own words. */
export function studyPool(progress: ProgressView): StudyWord[] {
  return wordsForSource(
    { kind: 'all' },
    content.words,
    progress.customWords.map(practiceWord),
    content.allLessons,
    progress.lessonProgress,
    progress.reviewState,
    reachOf(progress),
  )
}

/** Mistakes from tests and lesson exercises (DECISIONS.md #81): the due ones, and how many changed since. */
export function currentMistakes(progress: ProgressView, now: Date): { due: Mistake[]; active: number; changed: number } {
  const m = deriveMistakes(
    progress.results.map((r) => r.result),
    content.tests,
    content.allLessons,
    now,
  )
  return { due: m.due, active: m.active.length, changed: m.changed }
}

export interface MixPlan {
  steps: MixStep[]
  due: number
  mistakes: Mistake[]
  newWords: StudyWord[]
  newCount: number
  newFrom: string
  setProblem: string | null
}

/** True unless the browser has no speech or has listed its voices and none is German. */
export function canListen(speech: SpeechInfo): boolean {
  return speech.supported && !(speech.loaded && speech.voices.length === 0)
}

/** What the daily mix would do now. `listen` false: no German voice, so no listen and pick. */
export function mixPlan(progress: ProgressView, settings: Settings, now: Date, listen = true): MixPlan {
  const state = progress.reviewState
  const pool = studyPool(progress)
  const { set, problem } = activeSet(settings)
  const fresh = mixNewWords({ words: content.words, lessons: content.allLessons, progress: progress.lessonProgress, state, set, reach: reachOf(progress) })
  const newLeft = counts(fresh.words, state, now, settings.newPerDay).newLeft
  const newCount = Math.min(newLeft, fresh.words.length, MIX.maxNew)
  const due = Math.min(
    dueNow(
      pool.filter((w) => state.cards[w.id]),
      state,
      now,
    ),
    MIX.maxReviews,
  )
  const mistakes = currentMistakes(progress, now).due.slice(0, MIX.maxMistakes)
  return {
    steps: mixSteps({ introduced: introduced(pool, state).length, due, newAvailable: newCount, mistakes: mistakes.length, canListen: listen }),
    due,
    mistakes,
    newWords: fresh.words,
    newCount,
    newFrom: fresh.from,
    setProblem: problem,
  }
}

/** "about 12 minutes: a warm-up, 8 reviews, 5 new words, listen and pick". */
export function mixSummary(plan: MixPlan): string {
  const parts = plan.steps.map((s) =>
    s === 'warmup'
      ? 'a match-pairs warm-up'
      : s === 'reviews'
        ? `${plan.due} review${plan.due === 1 ? '' : 's'}`
        : s === 'new'
          ? `${plan.newCount} new word${plan.newCount === 1 ? '' : 's'}`
          : s === 'listen'
            ? 'listen and pick'
            : `${plan.mistakes.length} of your mistake${plan.mistakes.length === 1 ? '' : 's'}`,
  )
  const minutes = 2 * (plan.steps.includes('warmup') ? 1 : 0) + Math.ceil(plan.due * 0.3) + plan.newCount + (plan.steps.includes('listen') ? 2 : 0) + plan.mistakes.length
  return `About ${Math.max(2, minutes)} minutes: ${parts.join(', ')}.`
}

export function DailyPage({ sub }: { sub?: string }) {
  if (sub === undefined) return <Mix />
  if (sub === 'match') return <MatchOnly />
  if (sub === 'listen') return <ListenOnly />
  if (sub === 'mistakes') return <MistakesOnly />
  return (
    <div className="alert error">
      The daily page has no part "{sub}". <a href={link('daily')}>Daily mix</a>
    </div>
  )
}

interface Done {
  warmup?: MatchStats
  reviews?: RunStats
  fresh?: RunStats
  listen?: PickStats
  mistakes?: MistakeStats
}

function Mix() {
  const progress = useProgress()
  const settings = useSettings()
  const speech = useSpeech()
  const state = progress.reviewState
  const [plan] = useState(() => mixPlan(progress, settings, new Date(), canListen(speech)))
  const [startedAt] = useState(() => Date.now())
  const [step, setStep] = useState(0)
  const [done, setDone] = useState<Done>({})
  const [stopped, setStopped] = useState(false)
  const current = stopped ? undefined : plan.steps[step]
  const pool = studyPool(progress)
  const recorded = useRef(false)

  useEffect(() => {
    if (current !== undefined) return
    // A mix run to its end counts for the daily goal; Stop does not (DECISIONS.md #83).
    if (mixFinished(stopped, step, plan.steps.length) && !recorded.current) {
      recorded.current = true
      try {
        recordDailyMixDone()
      } catch (err) {
        reportError(`Could not save the finished daily mix for your daily goal: ${messageOf(err)}`)
      }
    }
    requestFlush()
  }, [current, stopped, step, plan.steps.length])

  function finish(patch: Done) {
    setDone((d) => ({ ...d, ...patch }))
    setStep((s) => s + 1)
  }

  if (current === undefined) return <MixEnd done={done} startedAt={startedAt} nothing={plan.steps.length === 0} />

  return (
    <div className="stack">
      <div className="row between">
        <strong>
          Daily mix, step {step + 1} of {plan.steps.length}: {MIX_STEP_LABEL[current]}
        </strong>
        <button type="button" className="btn small" onClick={() => setStopped(true)}>
          Stop
        </button>
      </div>
      {plan.setProblem && <div className="alert warn">{plan.setProblem}</div>}
      {current === 'warmup' && <Warmup pool={pool} state={state} onDone={(s) => finish({ warmup: s })} />}
      {current === 'reviews' && (
        <ReviewRun
          words={pool.filter((w) => state.cards[w.id])}
          mode={settings.dailyMode}
          state={state}
          newLimit={settings.newPerDay}
          maxCards={MIX.maxReviews}
          maxNew={Number.POSITIVE_INFINITY}
          onDone={(s) => finish({ reviews: s })}
        />
      )}
      {current === 'new' && (
        <>
          <p className="muted small">New words from {plan.newFrom}. Flip each card, then grade how well you knew it.</p>
          <ReviewRun
            words={plan.newWords}
            mode="recognition"
            state={state}
            newLimit={settings.newPerDay}
            maxCards={MIX.maxNewCards}
            maxNew={MIX.maxNew}
            onDone={(s) => finish({ fresh: s })}
          />
        </>
      )}
      {current === 'listen' && <Listen pool={pool} state={state} n={MIX.listenItems} onDone={(s) => finish({ listen: s })} />}
      {current === 'mistakes' && <MistakesSession mistakes={plan.mistakes} onDone={(s) => finish({ mistakes: s })} />}
    </div>
  )
}

function Warmup({ pool, state, onDone }: { pool: StudyWord[]; state: ReviewState; onDone: (s: MatchStats) => void }) {
  const [rounds] = useState(() => matchRounds(pool, state, MIX.warmupRounds, MIX.pairsPerRound))
  // Skips the warm-up once when there are too few words (also when StrictMode runs effects twice).
  const skipped = useRef(false)
  useEffect(() => {
    if (rounds.length > 0 || skipped.current) return
    skipped.current = true
    onDone({ pairs: 0, firstTry: 0, ms: 0 })
  }, [])
  if (rounds.length === 0) return null
  return <MatchPairs rounds={rounds} state={state} onDone={onDone} />
}

function Listen({ pool, state, n, onDone }: { pool: StudyWord[]; state: ReviewState; n: number; onDone: (s: PickStats) => void }) {
  const [items] = useState(() => pickItems(pool, state, n))
  const listen = canListen(useSpeech())
  // Skips listen and pick once when there are too few words or no German voice (also when StrictMode runs effects twice).
  const skipped = useRef(false)
  const skip = items.length === 0 || !listen
  useEffect(() => {
    if (!skip || skipped.current) return
    skipped.current = true
    onDone({ right: 0, total: 0 })
  }, [skip])
  if (skip) return null
  return <ListenPick items={items} state={state} onDone={onDone} />
}

function MixEnd({ done, startedAt, nothing }: { done: Done; startedAt: number; nothing: boolean }) {
  const progress = useProgress()
  const lesson = nextLesson(content.lessons, progress.lessonProgress)
  const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000))
  const lines: string[] = []
  if (done.warmup && done.warmup.pairs > 0) lines.push(`Matched ${done.warmup.pairs} pairs, ${done.warmup.firstTry} on the first try.`)
  if (done.reviews && done.reviews.cards > 0) lines.push(`Reviewed ${done.reviews.cards} word${done.reviews.cards === 1 ? '' : 's'} (${done.reviews.again} marked Again).`)
  if (done.fresh && done.fresh.fresh > 0) lines.push(`Learned ${done.fresh.fresh} new word${done.fresh.fresh === 1 ? '' : 's'}.`)
  if (done.listen && done.listen.total > 0) lines.push(`Listen and pick: ${done.listen.right} of ${done.listen.total} right.`)
  if (done.mistakes) lines.push(mistakesLine(done.mistakes))
  return (
    <div className="stack">
      <h1>Daily mix</h1>
      {nothing ? (
        <div className="card">
          <p>
            Nothing for the mix yet: it needs at least {MIN_PAIRS} words you have learned, or new words from a lesson. Open the next lesson or do a word review
            first.
          </p>
        </div>
      ) : (
        <div className="card stack">
          <p>
            <strong>{lines.length > 0 ? `Done in about ${minutes} minute${minutes === 1 ? '' : 's'}.` : 'Stopped before anything was done.'}</strong>
          </p>
          {lines.length > 0 && (
            <ul>
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="row">
        {lesson && (
          <a className="btn primary" href={link('lesson', lesson.lesson.id)}>
            {lesson.status === 'in-progress' ? 'Continue' : 'Next'} lesson: {lesson.lesson.unit}.{lesson.lesson.order} {lesson.lesson.title}
          </a>
        )}
        <a className="btn" href={link()}>
          Home
        </a>
      </div>
    </div>
  )
}

function MatchOnly() {
  const progress = useProgress()
  const [run, setRun] = useState(0)
  return <MatchGame key={run} pool={studyPool(progress)} state={progress.reviewState} onAgain={() => setRun((r) => r + 1)} />
}

/** Match pairs on its own: 3 rounds. Also used by the Words page for a picked list of words. */
export function MatchGame({ pool, state, onAgain, rounds = 3 }: { pool: StudyWord[]; state: ReviewState; onAgain: () => void; rounds?: number }) {
  const [plan] = useState(() => matchRounds(pool, state, rounds, MIX.pairsPerRound))
  const [stats, setStats] = useState<MatchStats | null>(null)
  useEffect(() => {
    if (stats) requestFlush()
  }, [stats])
  if (plan.length === 0) return <TooFew need={MIN_PAIRS} />
  if (stats) {
    return (
      <div className="stack">
        <div className="card">
          <p>
            Matched {stats.pairs} pairs, {stats.firstTry} on the first try, in {Math.round(stats.ms / 1000)} seconds.
          </p>
          <p className="muted small">Practice: your review schedule is unchanged.</p>
        </div>
        <GameEndButtons onAgain={onAgain} />
      </div>
    )
  }
  return (
    <div className="stack">
      <h1>Match pairs</h1>
      <MatchPairs rounds={plan} state={state} onDone={setStats} />
    </div>
  )
}

function ListenOnly() {
  const progress = useProgress()
  const [run, setRun] = useState(0)
  return <ListenGame key={run} pool={studyPool(progress)} state={progress.reviewState} onAgain={() => setRun((r) => r + 1)} />
}

/** Listen and pick on its own: 10 items. Also used by the Words page for a picked list of words. */
export function ListenGame({ pool, state, onAgain, n = 10 }: { pool: StudyWord[]; state: ReviewState; onAgain: () => void; n?: number }) {
  const [items] = useState(() => pickItems(pool, state, n))
  const [stats, setStats] = useState<PickStats | null>(null)
  const listen = canListen(useSpeech())
  useEffect(() => {
    if (stats) requestFlush()
  }, [stats])
  if (!listen) return <div className="alert warn">Listen and pick needs a German voice. {NO_VOICE_HELP}</div>
  if (items.length === 0) return <TooFew need={MIN_PICK_WORDS} />
  if (stats) {
    return (
      <div className="stack">
        <div className="card">
          <p>
            {stats.right} of {stats.total} right.
          </p>
          <p className="muted small">Practice: your review schedule is unchanged.</p>
        </div>
        <GameEndButtons onAgain={onAgain} />
      </div>
    )
  }
  return (
    <div className="stack">
      <h1>Listen and pick</h1>
      <ListenPick items={items} state={state} onDone={setStats} />
    </div>
  )
}

function TooFew({ need }: { need: number }) {
  return (
    <div className="card stack">
      <p>This game needs at least {need} words you have already learned (reviewed at least once).</p>
      <p>
        <a href={link('words')}>Review words</a> or open the next lesson first.
      </p>
    </div>
  )
}

function GameEndButtons({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="row">
      <button type="button" className="btn primary" onClick={onAgain}>
        Play again
      </button>
      <a className="btn" href={link('daily')}>
        Daily mix
      </a>
      <a className="btn" href={link()}>
        Home
      </a>
    </div>
  )
}

function mistakesLine(s: MistakeStats): string {
  const total = s.right + s.wrong + s.pending
  return `Your mistakes: ${s.right} of ${total} right${s.pending ? `, ${s.pending} waiting for Claude` : ''}. Each one comes back until you get it right on two different days.`
}

function MistakesOnly() {
  const progress = useProgress()
  const [now] = useState(() => new Date())
  const [mistakes] = useState(() => currentMistakes(progress, now))
  const [stats, setStats] = useState<MistakeStats | null>(null)
  const due = mistakes.due.slice(0, MISTAKE_SESSION_MAX)
  return (
    <div className="stack">
      <h1>Your mistakes</h1>
      {mistakes.changed > 0 && (
        <div className="alert warn">
          {mistakes.changed} earlier mistake{mistakes.changed === 1 ? ' is' : 's are'} left out: the item was changed or removed since, so it cannot come back as it was
          asked.
        </div>
      )}
      {stats ? (
        <>
          <div className="card">
            <p>{mistakesLine(stats)}</p>
          </div>
          <div className="row">
            <a className="btn" href={link('daily')}>
              Daily mix
            </a>
            <a className="btn" href={link()}>
              Home
            </a>
          </div>
        </>
      ) : due.length > 0 ? (
        <>
          <p className="muted small">
            Items you got wrong in tests and lesson exercises come back the next day, until you get each one right on two different days.{' '}
            {mistakes.due.length > due.length ? `${mistakes.due.length - due.length} more are due after these.` : ''}
          </p>
          <MistakesSession mistakes={due} onDone={setStats} />
        </>
      ) : (
        <div className="card">
          <p>
            No mistakes due today.{' '}
            {mistakes.active > 0 ? `${mistakes.active} come back on a later day.` : 'Items you get wrong in tests and lesson exercises will show up here the next day.'}
          </p>
        </div>
      )}
    </div>
  )
}
