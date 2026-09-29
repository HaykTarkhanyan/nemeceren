// When word popups are allowed (decided by Hayk, 2026-09-29: only after answering).
// Text inputs never get popups: they show their value as plain text, and German text
// components are never rendered inside them.

export type GlossSurface =
  /** A test item. Popups only after the test is submitted and graded. */
  | { kind: 'test-item'; submitted: boolean }
  /** A word-review card, prompt and answer side alike. Popups only after the answer is revealed or checked. */
  | { kind: 'review-card'; revealed: boolean }
  /** Anywhere else German is shown (results page and similar). */
  | { kind: 'page' }
  /** The Extras page: never. Its breakdown is the gloss, jokes use made-up words, and extras.json is not in the glossary. */
  | { kind: 'extras' }
  /** Claude's feedback on a note: never. It is written after the content was glossary-checked, so many words would have no entry. */
  | { kind: 'notes' }

export function glossEnabled(s: GlossSurface): boolean {
  switch (s.kind) {
    case 'test-item':
      return s.submitted
    case 'review-card':
      return s.revealed
    case 'page':
      return true
    case 'extras':
    case 'notes':
      return false
  }
}
