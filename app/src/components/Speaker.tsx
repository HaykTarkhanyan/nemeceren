import { SLOW_RATE, speak, speakAudio } from '../lib/speech.ts'

export function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3z" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  )
}

/** A small button that reads German text aloud. */
export function Speaker({ text, rate, label = 'Listen' }: { text: string; rate?: number; label?: string }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={() => speak(text, rate)}>
      <SpeakerIcon />
    </button>
  )
}

/**
 * Big play buttons for listening exercises: Play at `rate` (default: the speed setting) and Slow.
 * A text with line breaks is a dialogue, one turn per line, read with alternating voices.
 */
export function PlayButtons({ text, rate, onPlay }: { text: string; rate?: number; onPlay?: () => void }) {
  const play = (r?: number) => {
    if (speakAudio(text, r)) onPlay?.()
  }
  return (
    <div className="row">
      <button type="button" className="btn primary" onClick={() => play(rate)}>
        <SpeakerIcon /> Play
      </button>
      <button type="button" className="btn" onClick={() => play(SLOW_RATE)}>
        Slow
      </button>
    </div>
  )
}
