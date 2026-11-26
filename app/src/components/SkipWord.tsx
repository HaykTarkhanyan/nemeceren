// "Skip word" (DECISIONS.md #123): a word Hayk does not want to study (asked for with "stamina") leaves every
// review, new-word pick and game, on every device. The button sits on the review card, in All words, in a
// lesson's word list and on the games' answer screens. After a skip, a toast offers Undo for a few seconds;
// All words keeps a "Skipped" filter to bring a word back later.
import { useEffect, useSyncExternalStore } from 'react'
import { messageOf, reportError } from '../lib/errors.ts'
import { skipWord, useProgress } from '../lib/storage.ts'

const UNDO_MS = 6000

// The last skip, for the Undo toast (one at a time: a new skip replaces it).
let lastSkip: { wordId: string; de: string; at: number } | null = null
const listeners = new Set<() => void>()
function setLastSkip(v: typeof lastSkip) {
  lastSkip = v
  listeners.forEach((l) => l())
}
function useLastSkip() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => lastSkip,
  )
}

function change(word: { id: string; de: string }, skipped: boolean): boolean {
  try {
    skipWord(word.id, skipped)
    return true
  } catch (err) {
    reportError(`Could not ${skipped ? 'skip' : 'bring back'} "${word.de}": ${messageOf(err)}`)
    return false
  }
}

/**
 * Skip word, or Unskip for a word already skipped (in lists). `onSkipped` runs after a skip, so a game can move
 * on at once without the word coming back in the same round.
 */
export function SkipWordButton({ word, onSkipped }: { word: { id: string; de: string }; onSkipped?: () => void }) {
  const skipped = useProgress().skipped.has(word.id)
  if (skipped) {
    return (
      <button type="button" className="btn small skip-btn" title={`Bring "${word.de}" back into reviews, new words and games`} onClick={() => change(word, false)}>
        Unskip
      </button>
    )
  }
  return (
    <button
      type="button"
      className="btn small skip-btn"
      title={`Never show "${word.de}" in reviews, new words or games (Undo right after, or later in Words, All words)`}
      onClick={() => {
        if (!change(word, true)) return
        setLastSkip({ wordId: word.id, de: word.de, at: Date.now() })
        onSkipped?.()
      }}
    >
      Skip word
    </button>
  )
}

/** "Skipped die Ausdauer. Undo" for a few seconds after a skip, wherever it happened. */
export function SkipUndoToast() {
  const last = useLastSkip()
  useEffect(() => {
    if (last === null) return
    const t = window.setTimeout(() => setLastSkip(null), UNDO_MS)
    return () => window.clearTimeout(t)
  }, [last])
  if (last === null) return null
  return (
    <div className="goal-toast skip-toast" role="status">
      <span>
        Skipped <span lang="de">{last.de}</span>: it won't come up in reviews, new words or games.
      </span>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          if (change({ id: last.wordId, de: last.de }, false)) setLastSkip(null)
        }}
      >
        Undo
      </button>
    </div>
  )
}
