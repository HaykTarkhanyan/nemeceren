// The light daily mode (design: _knowledge/2026-11-06_light-daily-mode-design.md, DECISIONS.md #77):
// "#/daily" runs the daily mix (a match-pairs warm-up, due word reviews, a few new words, your
// mistakes), "#/daily/<game>" runs one game on its own: match, and the practice games of
// _knowledge/2026-11-07_practice-games-design.md (speak, sentences, articles, gaps, build) and
// opposites and synonyms (pairs, content/pairs.json), each
// also on the words of one lesson or several ("#/daily/<game>/<lesson id>[,<lesson id>...]", from
// the Words map). From Home a game takes learned words first and fills up with the next words on
// the path; from the map it takes any word of the lessons (lib/daily.ts RoundPick). The recall
// games (speak, sentences, pairs, build) record normal reviews (DECISIONS.md #109); match, articles
// and gaps are practice and never change the schedule. The reviews and new words inside the mix are
// normal reviews. Listen and pick was removed (Hayk, 2026-11-09: too easy).
import { useEffect, useRef, useState } from 'react'
import { content } from '../content/load.ts'
import type { ReviewState, WordSet } from '../content/schema.ts'
import { ArticleDrill } from '../components/ArticleDrill.tsx'
import { BuildSentence } from '../components/BuildSentence.tsx'
import { PRACTICE_NOTE } from '../components/GameFrame.tsx'
import type { GameBack } from '../components/GameFrame.tsx'
import { GapFill } from '../components/GapFill.tsx'
import { PairsGame } from '../components/PairsGame.tsx'
import { SpeakSentences, SpeakWords } from '../components/SpeakGames.tsx'
import { MatchPairs } from '../components/MatchPairs.tsx'
import type { MatchStats } from '../components/MatchPairs.tsx'
import { MistakesSession } from '../components/MistakesSession.tsx'
import type { MistakeStats } from '../components/MistakesSession.tsx'
import { ReviewRun } from '../components/ReviewRun.tsx'
import type { RunStats } from '../components/ReviewRun.tsx'
import { practiceWord } from '../lib/customWords.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { dueNow, introduced, matchRounds, MIN_PAIRS, MIX, MIX_STEP_LABEL, mixFinished, mixNewWords, mixSteps } from '../lib/daily.ts'
import type { MixStep, RoundPick } from '../lib/daily.ts'
import { deriveMistakes, MISTAKE_SESSION_MAX } from '../lib/mistakes.ts'
import type { Mistake } from '../lib/mistakes.ts'
import { lessonsOfPart, nextLesson, withCourseRest, wordsForSource } from '../lib/plan.ts'
import type { ProgressView } from '../lib/storage.ts'
import { link } from '../lib/router.ts'
import { useSettings } from '../lib/settings.ts'
import type { SpeechInfo } from '../lib/speech.ts'
import type { Settings } from '../lib/settings.ts'
import { counts } from '../lib/srs.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { reachOf } from '../lib/goalView.ts'
import { recordDailyMixDone, requestFlush, useProgress } from '../lib/storage.ts'
import { unionWordIds } from '../lib/vocabMap.ts'

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

/** The words of a practice game started from Home, in the order it takes them: the study pool, then the rest of the course in course order (lib/plan.ts withCourseRest). */
export function homeGameWords(progress: ProgressView): StudyWord[] {
  return withCourseRest(studyPool(progress), content.words, content.lessons)
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

/** What the daily mix would do now. */
export function mixPlan(progress: ProgressView, settings: Settings, now: Date): MixPlan {
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
    steps: mixSteps({ introduced: introduced(pool, state).length, due, newAvailable: newCount, mistakes: mistakes.length }),
    due,
    mistakes,
    newWords: fresh.words,
    newCount,
    newFrom: fresh.from,
    setProblem: problem,
  }
}

/** "about 12 minutes: a warm-up, 8 reviews, 5 new words". */
export function mixSummary(plan: MixPlan): string {
  const parts = plan.steps.map((s) =>
    s === 'warmup'
      ? 'a match-pairs warm-up'
      : s === 'reviews'
        ? `${plan.due} review${plan.due === 1 ? '' : 's'}`
        : s === 'new'
          ? `${plan.newCount} new word${plan.newCount === 1 ? '' : 's'}`
          : `${plan.mistakes.length} of your mistake${plan.mistakes.length === 1 ? '' : 's'}`,
  )
  const minutes = 2 * (plan.steps.includes('warmup') ? 1 : 0) + Math.ceil(plan.due * 0.3) + plan.newCount + plan.mistakes.length
  return `About ${Math.max(2, minutes)} minutes: ${parts.join(', ')}.`
}

/** The practice games of #/daily/<game> (design: _knowledge/2026-11-07_practice-games-design.md); each can take the words of one lesson or several: #/daily/<game>/<lesson id>[,<lesson id>...]. */
export const PRACTICE_GAMES = ['speak', 'sentences', 'articles', 'gaps', 'build', 'pairs'] as const
export type PracticeGameName = (typeof PRACTICE_GAMES)[number]
export const GAME_LABEL: Record<PracticeGameName | 'match', string> = {
  match: 'Match pairs',
  speak: 'Say the words',
  sentences: 'Say the sentence',
  articles: 'der, die, das',
  gaps: 'Fill the gap',
  build: 'Build the sentence',
  pairs: 'Opposites and synonyms',
}

/** `lessons` is the part after the game: one lesson id or several, joined by commas (lib/vocabMap.ts lessonsPart). */
export function DailyPage({ sub, lessons }: { sub?: string; lessons?: string }) {
  if (sub === undefined) return <Mix />
  if (sub === 'match') return <MatchOnly lessons={lessons} />
  if (sub === 'listen') {
    // An old link or shortcut: the game was removed (Hayk, 2026-11-09: too easy).
    return (
      <div className="card stack">
        <p>Listen and pick was removed: it was too easy.</p>
        <p>
          <a href={link('daily')}>Daily mix</a>
        </p>
      </div>
    )
  }
  if (sub === 'mistakes') return <MistakesOnly />
  const game = PRACTICE_GAMES.find((g) => g === sub)
  if (game) return <PracticeGame game={game} lessons={lessons} />
  return (
    <div className="alert error">
      The daily page has no part "{sub}". <a href={link('daily')}>Daily mix</a>
    </div>
  )
}

export interface GameScope {
  /** The words the game asks about, in path order from Home. */
  words: StudyWord[]
  /** Words for distractors (fill the gap, build the sentence): the scope's words and the rest. */
  pool: StudyWord[]
  /** Learned words first (from Home) or any word of the lessons (from the map). */
  pick: RoundPick
  back: GameBack
}

/**
 * What a game plays with (Hayk, 2026-11-09: "dont lock anything"). From Home: every word in path
 * order (homeGameWords), learned ones taken first, so a round is always full; no unit cap. From one
 * lesson or several (tiles on the Words map): all words of those lessons, learned or not.
 */
export function gameScope(progress: ProgressView, lessons: string | undefined): GameScope | { problem: string } {
  const home = homeGameWords(progress)
  if (lessons === undefined) return { words: home, pool: home, pick: 'learned-first', back: { href: link(), lessons: 0 } }
  const named = lessonsOfPart(lessons, content.allLessons)
  if ('problem' in named) return named
  const ids = new Set(unionWordIds(named.lessons))
  const words = content.words.filter((w) => ids.has(w.id))
  return { words, pool: [...words, ...home.filter((w) => !ids.has(w.id))], pick: 'any', back: { href: link('words', 'map'), lessons: named.lessons.length } }
}

function PracticeGame({ game, lessons }: { game: PracticeGameName; lessons: string | undefined }) {
  const progress = useProgress()
  const [run, setRun] = useState(0)
  const scope = gameScope(progress, lessons)
  if ('problem' in scope) {
    return (
      <div className="alert error">
        {scope.problem} <a href={link('words', 'map')}>Words map</a>
      </div>
    )
  }
  const props = { words: scope.words, state: progress.reviewState, back: scope.back, pick: scope.pick, onAgain: () => setRun((r) => r + 1) }
  switch (game) {
    case 'speak':
      return <SpeakWords key={run} {...props} />
    case 'sentences':
      return <SpeakSentences key={run} {...props} />
    case 'articles':
      return <ArticleDrill key={run} {...props} />
    case 'gaps':
      return <GapFill key={run} {...props} pool={scope.pool} />
    case 'build':
      return <BuildSentence key={run} {...props} pool={scope.pool} />
    case 'pairs':
      return <PairsGame key={run} {...props} />
  }
}

interface Done {
  warmup?: MatchStats
  reviews?: RunStats
  fresh?: RunStats
  mistakes?: MistakeStats
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
      {current === 'mistakes' && <MistakesSession mistakes={plan.mistakes} onDone={(s) => finish({ mistakes: s })} />}
    </div>
  )
}

/** The mix's warm-up stays on learned words: it warms up what is known before the reviews. */
function Warmup({ pool, state, onDone }: { pool: StudyWord[]; state: ReviewState; onDone: (s: MatchStats) => void }) {
  const [rounds] = useState(() => matchRounds(introduced(pool, state), state, MIX.warmupRounds, MIX.pairsPerRound))
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

function MixEnd({ done, startedAt, nothing }: { done: Done; startedAt: number; nothing: boolean }) {
  const progress = useProgress()
  const lesson = nextLesson(content.lessons, progress.lessonProgress)
  const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000))
  const lines: string[] = []
  if (done.warmup && done.warmup.pairs > 0) lines.push(`Matched ${done.warmup.pairs} pairs, ${done.warmup.firstTry} on the first try.`)
  if (done.reviews && done.reviews.cards > 0) lines.push(`Reviewed ${done.reviews.cards} word${done.reviews.cards === 1 ? '' : 's'} (${done.reviews.again} marked Again).`)
  if (done.fresh && done.fresh.fresh > 0) lines.push(`Learned ${done.fresh.fresh} new word${done.fresh.fresh === 1 ? '' : 's'}.`)
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

function MatchOnly({ lessons }: { lessons?: string }) {
  const progress = useProgress()
  const [run, setRun] = useState(0)
  const scope = gameScope(progress, lessons)
  if ('problem' in scope) return <div className="alert error">{scope.problem}</div>
  return <MatchGame key={run} pool={scope.words} state={progress.reviewState} pick={scope.pick} onAgain={() => setRun((r) => r + 1)} />
}

/** Match pairs on its own: 3 rounds. Also used by the Words page for a picked list of words. */
export function MatchGame(props: { pool: StudyWord[]; state: ReviewState; pick?: RoundPick; onAgain: () => void; rounds?: number }) {
  const { pool, state, pick = 'learned-first', onAgain, rounds = 3 } = props
  const [plan] = useState(() => matchRounds(pool, state, rounds, MIX.pairsPerRound, pick))
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
          <p className="muted small">{PRACTICE_NOTE}</p>
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

/** Too few words with different German and English, learned or not, for Match pairs. */
function TooFew({ need }: { need: number }) {
  return (
    <div className="card stack">
      <p>This game needs at least {need} words with different German and English, and there are fewer here.</p>
      <p>
        <a href={link('words', 'map')}>Words map</a> or <a href={link()}>Home</a>
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
