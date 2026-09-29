import { content } from '../content/load.ts'
import { itemsForResult } from '../content/lessons.ts'
import { ResultView } from '../components/ResultView.tsx'
import { finalScore } from '../lib/grading.ts'
import { link } from '../lib/router.ts'
import { useProgress } from '../lib/storage.ts'

export function ResultsPage() {
  const { results, pendingAttemptIds } = useProgress()
  return (
    <div className="stack">
      <h1>Results</h1>
      {results.length === 0 && <p className="muted">No attempts yet.</p>}
      {results.map(({ id, result }) => {
        const s = finalScore(result)
        return (
          <a key={id} className="card test-card" href={link('results', id)}>
            <div className="row between">
              <strong>{result.testTitle}</strong>
              <span className="row">
                {pendingAttemptIds.includes(id) && <span className="badge warn">Not synced yet</span>}
                {result.review && <span className="badge ok">Reviewed by Claude</span>}
                {!result.review && result.score.pending > 0 && <span className="badge pending">Waiting for review</span>}
                <span className="badge">
                  {s.correct}/{s.total}
                </span>
              </span>
            </div>
            <p className="muted small">{new Date(result.submittedAt).toLocaleString()}</p>
          </a>
        )
      })}
    </div>
  )
}

/** id is the attempt id (a UUID). */
export function ResultDetailPage({ id }: { id: string }) {
  const { results, pendingAttemptIds } = useProgress()
  const found = results.find((r) => r.id === id)
  if (!found) {
    return (
      <div className="alert error">
        No result with id {id}. <a href={link('results')}>All results</a>
      </div>
    )
  }
  const { result } = found
  return (
    <div className="stack">
      <a href={link('results')} className="small">
        All results
      </a>
      <h1>{result.testTitle}</h1>
      <p className="muted small">
        {new Date(result.submittedAt).toLocaleString()} - attempt {id}
        {pendingAttemptIds.includes(id) ? ' (not synced yet)' : ''}
      </p>
      <ResultView result={result} items={itemsForResult(result, content.tests, content.lessons)} />
    </div>
  )
}
