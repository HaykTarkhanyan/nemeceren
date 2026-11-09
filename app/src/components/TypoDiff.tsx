// A wrong typed answer above the right one, letters lined up in a fixed-width font, with the
// differences marked (lib/charDiff.ts; DECISIONS.md #103).
import { alignChars, MARK_LETTERS_FROM, similarity } from '../lib/charDiff.ts'

const NBSP = ' '

export function TypoDiff({ typed, expected: given }: { typed: string; expected: string }) {
  // A final . ! or ? never counts in grading, so it is not shown as missing either.
  const expected = /[.!?]$/.test(typed) ? given : given.replace(/[.!?]+$/, '')
  const cells = alignChars(typed, expected)
  const mark = similarity(cells) >= MARK_LETTERS_FROM
  const show = (ch: string | null) => (ch === null || ch === ' ' ? NBSP : ch)
  return (
    <div className="typo-diff" lang="de" role="group" aria-label={`You typed: ${typed}. Right: ${expected}.`}>
      <div className="typo-line">
        <span className="typo-label">You</span>
        <span className="typo-text">
          {mark ? cells.map((c, i) => <span key={i} className={c.typed === null ? 'typo-gap' : `typo-${c.op}`}>{show(c.typed)}</span>) : typed}
        </span>
      </div>
      <div className="typo-line">
        <span className="typo-label">Right</span>
        <span className="typo-text">
          {mark ? cells.map((c, i) => <span key={i} className={c.expected === null ? 'typo-gap' : `typo-right-${c.op}`}>{show(c.expected)}</span>) : expected}
        </span>
      </div>
    </div>
  )
}
