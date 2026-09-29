// Listening practice: dictation of the example sentences of words Hayk has already learned.
// Needs no new content; results are saved like a test (testId "listening-practice").
import { useState } from 'react'
import { content } from '../content/load.ts'
import type { Item } from '../content/schema.ts'
import { InlineExercise } from '../components/InlineExercise.tsx'
import { listeningWords } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { useProgress } from '../lib/storage.ts'

export function ListenPage() {
  const state = useProgress().reviewState
  // Fixed when the page opens, so sentences do not change while Hayk types.
  const [words] = useState(() => listeningWords(content.words, state))

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
