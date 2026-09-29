// Listening practice: dictation of the example sentences of words Hayk has already learned.
// Needs no new content; results are saved like a test (testId "listening-practice").
import { useMemo } from 'react'
import { content } from '../content/load.ts'
import type { Item } from '../content/schema.ts'
import { InlineExercise } from '../components/InlineExercise.tsx'
import { listeningWords } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { useReviewState } from './WordsPage.tsx'

export function ListenPage() {
  const { state, error } = useReviewState()
  const words = useMemo(() => (state ? listeningWords(content.words, state) : null), [state])

  if (error) return <div className="alert error">Could not load the review state: {error}</div>
  if (!words) return <p className="muted">Loading...</p>
  if (words.length === 0) {
    return (
      <div className="stack">
        <h1>Listening practice</h1>
        <p className="warn-text">
          This starts once you have learned words that have example sentences. Review some <a href={link('words')}>words</a> first.
        </p>
      </div>
    )
  }
  const items: Item[] = words.map((w) => ({ type: 'dictation', text: w.example!.de }))
  return (
    <div className="stack">
      <h1>Listening practice</h1>
      <p className="muted">
        {items.length} example sentence{items.length === 1 ? '' : 's'} from words you have learned, most recent first. Play each one, then type what you
        hear.
      </p>
      <InlineExercise items={items} meta={{ testId: 'listening-practice', testTitle: 'Listening practice', level: words[0].level }} />
    </div>
  )
}
