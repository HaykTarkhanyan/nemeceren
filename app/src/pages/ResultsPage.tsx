import { useEffect, useState } from 'react'
import { content } from '../content/load.ts'
import { ResultView } from '../components/ResultView.tsx'
import { messageOf } from '../lib/errors.ts'
import { finalScore } from '../lib/grading.ts'
import { link } from '../lib/router.ts'
import { listResults, SAVE_MODE } from '../lib/storage.ts'
import type { SavedResult } from '../lib/storage.ts'

function useResults() {
  const [results, setResults] = useState<SavedResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listResults().then(setResults, (err: unknown) => setError(messageOf(err)))
  }, [])
  return { results, error }
}

export function ResultsPage() {
  const { results, error } = useResults()
  if (error) return <div className="alert error">Could not load results: {error}</div>
  if (!results) return <p className="muted">Loading...</p>
  return (
    <div className="stack">
      <h1>Results</h1>
      {SAVE_MODE === 'browser' && <p className="muted small">Phone mode: only attempts made in this browser are listed.</p>}
      {results.length === 0 && <p className="muted">No attempts yet.</p>}
      {results.map(({ file, result }) => {
        const s = finalScore(result)
        return (
          <a key={file} className="card test-card" href={link('results', file.replace(/^results\//, ''))}>
            <div className="row between">
              <strong>{result.testTitle}</strong>
              <span className="row">
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

/** name is the file name inside progress/results/, e.g. "a1-01__2026-09-28T19-30-05-123Z.json". */
export function ResultDetailPage({ name }: { name: string }) {
  const { results, error } = useResults()
  if (error) return <div className="alert error">Could not load results: {error}</div>
  if (!results) return <p className="muted">Loading...</p>
  const file = `results/${name}`
  const found = results.find((r) => r.file === file)
  if (!found) {
    return (
      <div className="alert error">
        No result named {file}. <a href={link('results')}>All results</a>
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
        {new Date(result.submittedAt).toLocaleString()} - {SAVE_MODE === 'repo' ? `progress/${file}` : 'saved in this browser'}
      </p>
      <ResultView result={result} test={content.tests.find((t) => t.id === result.testId)} />
    </div>
  )
}
