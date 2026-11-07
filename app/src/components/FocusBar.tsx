// The top bar of the full-screen focus view (DECISIONS.md #85), shared by the word review, the
// practice and the practice games: close, how far the round is, and the sound switch.
import { useState } from 'react'
import { readReviewSound, writeReviewSound } from '../lib/homeView.ts'

export function FocusBar(props: { onClose: () => void; closeLabel: string; done: number; target: number; label: string; sound: boolean; onSound: () => void }) {
  const { onClose, closeLabel, done, target, label, sound, onSound } = props
  return (
    <div className="focus-bar">
      <button type="button" className="btn small" onClick={onClose}>
        {closeLabel}
      </button>
      <div className="focus-progress" aria-label={`${done} of ${target}`}>
        <span>
          {label}: {done} of {target}
        </span>
        <span className="bar">
          <i style={{ width: `${target ? Math.min(100, (100 * done) / target) : 0}%` }} />
        </span>
      </div>
      <button type="button" className="btn small" aria-pressed={sound} onClick={onSound}>
        {sound ? 'Sound on' : 'Sound off'}
      </button>
    </div>
  )
}

/** The focus view's sound switch, kept per device. */
export function useReviewSound(): [boolean, () => void] {
  const [sound, setSound] = useState(readReviewSound)
  return [
    sound,
    () => {
      writeReviewSound(!sound)
      setSound(!sound)
    },
  ]
}
