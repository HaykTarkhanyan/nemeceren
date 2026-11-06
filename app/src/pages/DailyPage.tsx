// The light daily mode (design: _knowledge/2026-11-06_light-daily-mode-design.md, DECISIONS.md #77):
// "#/daily" runs the daily mix (a match-pairs warm-up, due word reviews, a few new words, listen
// and pick), "#/daily/match" and "#/daily/listen" run one game on its own. The games are practice
// and never change the review schedule; the reviews and new words inside the mix are normal reviews.
import { useEffect, useState } from 'react'
import { content } from '../content/load.ts'
import type { ReviewState, WordSet } from '../content/schema.ts'
import { ListenPick } from '../components/ListenPick.tsx'
import type { PickStats } from '../components/ListenPick.tsx'
import { MatchPairs } from '../components/MatchPairs.tsx'
import type { MatchStats } from '../components/MatchPairs.tsx'
import { ReviewRun } from '../components/ReviewRun.tsx'
import type { RunStats } from '../components/ReviewRun.tsx'
import { practiceWord } from '../lib/customWords.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { dueNow, introduced, matchRounds, MIN_PAIRS, MIN_PICK_WORDS, MIX, MIX_STEP_LABEL, mixNewWords, mixSteps, pickItems } from '../lib/daily.ts'
import type { MixStep } from '../lib/daily.ts'
import { nextLesson, wordsForSource } from '../lib/plan.ts'
import type { ProgressView } from '../lib/storage.ts'
import { link } from '../lib/router.ts'
import { useSettings } from '../lib/settings.ts'
import type { Settings } from '../lib/settings.ts'
import { counts } from '../lib/srs.ts'
import { requestFlush, useProgress } from '../lib/storage.ts'

/** The word set the mix takes new words from, or null (the next lessons). An unknown saved id is an error to show. */
export function activeSet(settings: Settings): { set: WordSet | null; problem: string | null } {
  if (settings.activeSet === null) return { set: null, problem: null }
  const set = content.sets.find((s) => s.id === settings.activeSet) ?? null
  return set ? { set, problem: null } : { set: null, problem: `The word set "${settings.activeSet}" no longer exists, so new words come from the next lessons.` }
}

/** All words the reviews may use (lessons unlock their words when opened), plus Hayk's own words. */
export function studyPool(progress: ProgressView): StudyWord[] {
  return wordsForSource({ kind: 'all' }, content.words, progress.customWords.map(practiceWord), content.allLessons, progress.lessonProgress, progress.reviewState)
}

export interface MixPlan {
  steps: MixStep[]
  due: number
  newWords: StudyWord[]
  newCount: number
  newFrom: string
  setProblem: string | null
}

/** What the daily mix would do now. */
export function mixPlan(progress: ProgressView, settings: Settings, now: Date): MixPlan {
  const state = progress.reviewState
  const pool = studyPool(progress)
  const { set, problem } = activeSet(settings)
  const fresh = mixNewWords({ words: content.words, lessons: content.lessons, progress: progress.lessonProgress, state, set })
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
  return {
    steps: mixSteps({ introduced: introduced(pool, state).length, due, newAvailable: newCount }),
    due,
    newWords: fresh.words,
    newCount,
    newFrom: fresh.from,
    setProblem: problem,
  }
}

/** "about 12 minutes: a warm-up, 8 reviews, 5 new words, listen and pick". */
export function mixSummary(plan: MixPlan): string {
  const parts = plan.steps.map((s) =>
    s === 'warmup' ? 'a match-pairs warm-up' : s === 'reviews' ? `${plan.due} review${plan.due === 1 ? '' : 's'}` : s === 'new' ? `${plan.newCount} new word${plan.newCount === 1 ? '' : 's'}` : 'listen and pick',
  )
  const minutes = 2 * (plan.steps.includes('warmup') ? 1 : 0) + Math.ceil(plan.due * 0.3) + plan.newCount + (plan.steps.includes('listen') ? 2 : 0)
  return `About ${Math.max(2, minutes)} minutes: ${parts.join(', ')}.`
}

export function DailyPage({ sub }: { sub?: string }) {
  if (sub === undefined) return <Mix />
  if (sub === 'match') return <MatchOnly />
  if (sub === 'listen') return <ListenOnly />
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
}

function Mix() {
  const progress = useProgress()
  const settings = useSettings()
  const state = progress.reviewState
  const [plan] = useState(() => mixPlan(progress, settings, new Date()))
  const [startedAt] = useState(() => Date.now())
  const [step, setStep] = useState(0)
  const [done, setDone] = useState<Done>({})
  const [stopped, setStopped] = useState(false)
  const current = stopped ? undefined : plan.steps[step]
  const pool = studyPool(progress)

  useEffect(() => {
    if (current === undefined) requestFlush()
  }, [current])

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
    </div>
  )
}

function Warmup({ pool, state, onDone }: { pool: StudyWord[]; state: ReviewState; onDone: (s: MatchStats) => void }) {
  const [rounds] = useState(() => matchRounds(pool, state, MIX.warmupRounds, MIX.pairsPerRound))
  useEffect(() => {
    if (rounds.length === 0) onDone({ pairs: 0, firstTry: 0, ms: 0 })
    // Skips the warm-up once when there are too few words.
  }, [])
  if (rounds.length === 0) return null
  return <MatchPairs rounds={rounds} state={state} onDone={onDone} />
}

function Listen({ pool, state, n, onDone }: { pool: StudyWord[]; state: ReviewState; n: number; onDone: (s: PickStats) => void }) {
  const [items] = useState(() => pickItems(pool, state, n))
  useEffect(() => {
    if (items.length === 0) onDone({ right: 0, total: 0 })
    // Skips listen and pick once when there are too few words.
  }, [])
  if (items.length === 0) return null
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
  useEffect(() => {
    if (stats) requestFlush()
  }, [stats])
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
