import { useEffect, useState } from 'react'
import { content } from '../content/load.ts'
import { messageOf } from '../lib/errors.ts'
import { finalScore } from '../lib/grading.ts'
import { link } from '../lib/router.ts'
import { useSettings } from '../lib/settings.ts'
import { counts } from '../lib/srs.ts'
import { listResults } from '../lib/storage.ts'
import type { SavedResult } from '../lib/storage.ts'
import { useReviewState } from './WordsPage.tsx'

export function HomePage() {
  const settings = useSettings()
  const review = useReviewState()
  const [results, setResults] = useState<SavedResult[] | null>(null)
  const [resultsError, setResultsError] = useState<string | null>(null)
  useEffect(() => {
    listResults().then(setResults, (err: unknown) => setResultsError(messageOf(err)))
  }, [])

  const c = review.state ? counts(content.words, review.state, new Date(), settings.newPerDay) : null

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <h2>Words</h2>
          <a className="btn primary" href={link('words')}>
            Review words
          </a>
        </div>
        {review.error && <div className="alert error">Could not load the review state: {review.error}</div>}
        {c && (
          <p>
            <strong>{c.due}</strong> due today, <strong>{c.newLeft}</strong> new today
          </p>
        )}
        {!c && !review.error && <p className="muted">Loading...</p>}
      </section>

      <h2>Tests</h2>
      {resultsError && <div className="alert error">Could not load past results: {resultsError}</div>}
      {content.tests.length === 0 && <p className="muted">No tests yet. Claude adds them to content/tests/.</p>}
      {content.tests.map((t) => {
        const attempts = results?.filter((r) => r.result.testId === t.id) ?? []
        const last = attempts[0]?.result
        const score = last ? finalScore(last) : null
        let status = ''
        if (score) {
          status = ` - taken ${attempts.length}x, last: ${score.correct}/${score.total}`
          if (score.pending) status += ` (${score.pending} waiting for review)`
        } else if (results) {
          status = ' - not taken yet'
        }
        return (
          <a key={t.id} className="card test-card" href={link('test', t.id)}>
            <div className="row between">
              <strong>{t.title}</strong>
              <span className="badge">{t.level}</span>
            </div>
            {t.description && <p className="muted">{t.description}</p>}
            <p className="muted small">
              {t.items.length} items, added {t.created}
              {status}
            </p>
          </a>
        )
      })}
    </div>
  )
}
