// A short run of scheduled word reviews inside the daily mix: due cards first, then new words up
// to a cap. Unlike the Words page session it stops after maxCards, so the mix stays light.
// Every grade moves the FSRS schedule like any word review (lib/reviewEntries.ts scheduledEntry).
import { useEffect, useRef, useState } from 'react'
import type { ReviewLogEntry, ReviewMode, ReviewState, StoredCard } from '../content/schema.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { messageOf } from '../lib/errors.ts'
import { scheduledEntry } from '../lib/reviewEntries.ts'
import type { Typed } from '../lib/reviewEntries.ts'
import { nextCard, previewIntervals, Rating } from '../lib/srs.ts'
import type { Grade } from '../lib/srs.ts'
import { recordReview } from '../lib/storage.ts'
import { Card } from './ReviewCard.tsx'

export interface RunStats {
  cards: number
  /** New words introduced in this run. */
  fresh: number
  again: number
}

export function ReviewRun(props: {
  words: StudyWord[]
  mode: ReviewMode
  state: ReviewState
  /** The daily new-word limit (Settings newPerDay); the run never goes past it. */
  newLimit: number
  maxCards: number
  maxNew: number
  onDone: (s: RunStats) => void
  /** Called after each saved grade: false for Again (the zone meter, DECISIONS.md #116). */
  onAnswer?: (ok: boolean) => void
}) {
  const { words, mode, state, newLimit, maxCards, maxNew, onDone, onAnswer } = props
  const [now, setNow] = useState(() => new Date())
  const [stats, setStats] = useState<RunStats>({ cards: 0, fresh: 0, again: 0 })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<{ entry: ReviewLogEntry; card: StoredCard; message: string } | null>(null)
  const next = nextCard(words, state, now, newLimit)
  const over = failed === null && (stats.cards >= maxCards || next.kind !== 'card' || (next.isNew && stats.fresh >= maxNew))

  // Reported once, also when React runs effects twice (StrictMode in development).
  const reported = useRef(false)
  useEffect(() => {
    if (!over || reported.current) return
    reported.current = true
    onDone(stats)
  }, [over])

  function persist(entry: ReviewLogEntry, card: StoredCard) {
    setSaving(true)
    try {
      recordReview(entry, card)
      setFailed(null)
      setStats((s) => ({ cards: s.cards + 1, fresh: s.fresh + (entry.isNew ? 1 : 0), again: s.again + (entry.rating === Rating.Again ? 1 : 0) }))
      setNow(new Date())
      onAnswer?.(entry.rating !== Rating.Again)
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

  if (failed) {
    return (
      <div className="alert error" role="alert">
        <span>Your last grade was NOT saved: {failed.message}</span>
        <button type="button" className="btn small" disabled={saving} onClick={() => persist(failed.entry, failed.card)}>
          Retry saving
        </button>
      </div>
    )
  }
  if (over || next.kind !== 'card') return <p className="muted">Done.</p>
  return (
    <Card
      key={`${next.word.id}-${stats.cards}`}
      word={next.word}
      isNew={next.isNew}
      mode={mode}
      intervals={previewIntervals(state, next.word.id, now)}
      disabled={saving}
      onGrade={(rating, typed, timeMs) => grade(next.word, next.isNew, rating, typed, timeMs)}
    />
  )
}
