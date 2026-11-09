// The frame every practice game shares (design: _knowledge/2026-11-07_practice-games-design.md):
// the full-screen focus view with its bar (DECISIONS.md #85), the end screen, "too few words",
// the mic button, and saving an answer: as practice in the recognition games (practice: true, the
// schedule unchanged, #25), as a scheduled review in the recall games (saveGameReview, 2026-11-09).
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ReviewMode, ReviewState } from '../content/schema.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { gameReview, logsPractice, practiceEntry } from '../lib/reviewEntries.ts'
import type { Typed } from '../lib/reviewEntries.ts'
import { link } from '../lib/router.ts'
import { Rating } from '../lib/srs.ts'
import { recordPractice, recordReview, requestFlush } from '../lib/storage.ts'
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
 * (the banner) and the game goes on. A word without a card (not learned yet) is not logged at all
 * (lib/reviewEntries.ts logsPractice), so practice never creates a card.
 */
export function savePractice(input: { state: ReviewState; word: { id: string; de: string }; mode: ReviewMode; right: boolean; text: string; nearMiss?: Comparison['nearMiss']; timeMs: number }): void {
  if (!logsPractice(input.state, input.word.id)) return
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

/**
 * Records a recall game's answer as a scheduled review (lib/reviewEntries.ts gameReview): the first
 * answer to a word in the round only (`counted` is the round's set), Good when right, Again when
 * wrong or "I don't know"; a word without a card is introduced by a right answer, and nothing is
 * recorded for a miss on it. Saved like a review in Words > Review; a failed save is reported.
 */
export function saveGameReview(input: { state: ReviewState; word: { id: string; de: string }; right: boolean; typed: Typed | null; timeMs: number; counted: Set<string> }): void {
  const out = gameReview({ ...input, at: new Date() })
  if (!out) return
  try {
    recordReview(out.entry, out.card)
  } catch (err) {
    reportError(`Your answer to "${input.word.de}" was not saved as a review: ${messageOf(err)}`)
  }
}

/** The round's set of words already reviewed, for saveGameReview (one review per word per round). */
export function useRoundCounted(): Set<string> {
  const [counted] = useState(() => new Set<string>())
  return counted
}

export function GameEnd(props: { title: string; back: GameBack; onAgain: () => void; children: ReactNode; /** The answers were scheduled reviews (a recall game). */ reviews?: boolean }) {
  const { title, back, onAgain, children, reviews = false } = props
  // The game is over: send its answers.
  useEffect(() => {
    requestFlush()
  }, [])
  return (
    <div className="stack round-end">
      <h2>{title}</h2>
      {children}
      <p className="muted small">{reviews ? REVIEW_NOTE : PRACTICE_NOTE}</p>
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

/** The end of a recognition game: practice leaves the schedule alone and adds no new words to it. */
export const PRACTICE_NOTE = 'Practice: your review schedule is unchanged, and words you have not learned yet are not added to it.'

/** The end of a recall game: its answers were scheduled reviews. */
export const REVIEW_NOTE =
  'These answers count as reviews: the first answer to each word this round updated its schedule (Good when right, Again when not), and a new word you got right was added to your words.'

/** Learned or not, the words are not enough: the content lacks them (from Home), or the ticked lessons do. */
export function TooFewWords({ need, what, back }: { need: number; what: string; back: GameBack }) {
  return (
    <div className="card stack">
      <p>
        This game needs at least {need} {what}
        {back.lessons === 1 ? ' in this lesson' : back.lessons > 1 ? ` in these ${back.lessons} lessons` : ' in the course'}, and there are fewer.
      </p>
      <p>
        {back.lessons > 0 ? (
          <>
            Go <a href={back.href}>back to the map</a> and tick other or more tiles.
          </>
        ) : (
          <a href={link()}>Home</a>
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
