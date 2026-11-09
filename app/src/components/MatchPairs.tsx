// Match pairs (the daily mode): tap a German word and its meaning. A right pair stays matched, a wrong one
// flashes. Tapping a German word reads it aloud. Practice only: every matched pair of a word with a
// card is logged with practice: true and the FSRS schedule stays as it is; a word not learned yet
// is not logged (lib/reviewEntries.ts logsPractice, DECISIONS.md #25).
import { useEffect, useMemo, useState } from 'react'
import type { ReviewState } from '../content/schema.ts'
import type { GameWord } from '../lib/daily.ts'
import { messageOf } from '../lib/errors.ts'
import { logsPractice, practiceEntry } from '../lib/reviewEntries.ts'
import { shuffle } from '../lib/shuffle.ts'
import { speak } from '../lib/speech.ts'
import { Rating } from '../lib/srs.ts'
import { recordPractice } from '../lib/storage.ts'

export interface MatchStats {
  pairs: number
  /** Pairs matched without a wrong tap on either of their words. */
  firstTry: number
  ms: number
}

type Side = 'de' | 'en'

export function MatchPairs({ rounds, state, onDone }: { rounds: GameWord[][]; state: ReviewState; onDone: (s: MatchStats) => void }) {
  const [round, setRound] = useState(0)
  const [total, setTotal] = useState<MatchStats>({ pairs: 0, firstTry: 0, ms: 0 })
  const words = rounds[round]
  if (!words) throw new Error(`Match pairs has no round ${round + 1}`)
  return (
    <Round
      key={round}
      words={words}
      state={state}
      label={`Round ${round + 1} of ${rounds.length}`}
      onDone={(s) => {
        const sum = { pairs: total.pairs + s.pairs, firstTry: total.firstTry + s.firstTry, ms: total.ms + s.ms }
        if (round + 1 < rounds.length) {
          setTotal(sum)
          setRound(round + 1)
        } else onDone(sum)
      }}
    />
  )
}

function Round({ words, state, label, onDone }: { words: GameWord[]; state: ReviewState; label: string; onDone: (s: MatchStats) => void }) {
  const left = useMemo(() => shuffle(words), [words])
  const right = useMemo(() => shuffle(words), [words])
  const [startedAt] = useState(() => performance.now())
  const [lastAt, setLastAt] = useState(() => performance.now())
  const [elapsed, setElapsed] = useState(0)
  const [picked, setPicked] = useState<{ side: Side; id: string } | null>(null)
  const [matched, setMatched] = useState<ReadonlySet<string>>(() => new Set())
  const [missed, setMissed] = useState<ReadonlySet<string>>(() => new Set())
  const [flash, setFlash] = useState<{ de: string; en: string } | null>(null)
  const [failed, setFailed] = useState<{ word: GameWord; first: boolean; ms: number; message: string } | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => setElapsed(Math.floor((performance.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [startedAt])

  useEffect(() => {
    if (flash === null) return
    const t = window.setTimeout(() => setFlash(null), 600)
    return () => window.clearTimeout(t)
  }, [flash])

  const done = matched.size === words.length
  useEffect(() => {
    if (!done) return
    const firstTry = words.filter((w) => !missed.has(w.id)).length
    // A short pause, so the last pair is seen locking before the next round.
    const t = window.setTimeout(() => onDone({ pairs: words.length, firstTry, ms: Math.round(performance.now() - startedAt) }), 500)
    return () => window.clearTimeout(t)
    // onDone is called once when the round is complete.
  }, [done])

  function log(word: GameWord, first: boolean, ms: number): boolean {
    if (!logsPractice(state, word.id)) return true
    try {
      recordPractice(
        practiceEntry({
          state,
          word,
          mode: 'recognition',
          rating: first ? Rating.Good : Rating.Again,
          answer: { text: word.en, correct: first, nearMiss: null },
          timeMs: ms,
          at: new Date(),
        }),
      )
      setFailed(null)
      return true
    } catch (err) {
      setFailed({ word, first, ms, message: messageOf(err) })
      return false
    }
  }

  function tap(side: Side, id: string) {
    if (failed || matched.has(id)) return
    if (side === 'de') {
      const w = words.find((x) => x.id === id)
      if (w) speak(w.de)
    }
    if (!picked || picked.side === side) {
      setPicked({ side, id })
      return
    }
    const de = side === 'de' ? id : picked.id
    const en = side === 'en' ? id : picked.id
    setPicked(null)
    if (de === en) {
      const now = performance.now()
      const word = words.find((x) => x.id === de)
      if (!word) throw new Error(`Match pairs lost the word "${de}"`)
      if (log(word, !missed.has(de), Math.round(now - lastAt))) {
        setMatched((m) => new Set([...m, de]))
        setLastAt(now)
      }
    } else {
      // The word picked first is the one being matched: that one counts as missed.
      setMissed((m) => new Set([...m, picked.id]))
      setFlash({ de, en })
    }
  }

  function tileClass(side: Side, id: string): string {
    if (matched.has(id)) return 'match-tile matched'
    if (flash && flash[side] === id) return 'match-tile wrong'
    if (picked && picked.side === side && picked.id === id) return 'match-tile picked'
    return 'match-tile'
  }

  return (
    <div className="stack">
      <div className="row between">
        <span className="muted small">
          {label}: {matched.size}/{words.length} pairs
        </span>
        <span className="muted small">{elapsed} s</span>
      </div>
      {failed && (
        <div className="alert error" role="alert">
          <span>The pair "{failed.word.de}" was NOT saved: {failed.message}</span>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              if (log(failed.word, failed.first, failed.ms)) setMatched((m) => new Set([...m, failed.word.id]))
            }}
          >
            Retry saving
          </button>
        </div>
      )}
      <div className="match-grid">
        <div className="match-col">
          {left.map((w) => (
            <button key={w.id} type="button" className={tileClass('de', w.id)} lang="de" disabled={matched.has(w.id)} onClick={() => tap('de', w.id)}>
              {w.de}
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((w) => (
            <button key={w.id} type="button" className={tileClass('en', w.id)} disabled={matched.has(w.id)} onClick={() => tap('en', w.id)}>
              {w.en}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">Tap a German word, then its meaning (or the other way round). Practice: your review schedule stays as it is.</p>
    </div>
  )
}
