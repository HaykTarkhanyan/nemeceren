import { useEffect, useState } from 'react'
import { content } from '../content/load.ts'
import { messageOf } from '../lib/errors.ts'
import { finalScore } from '../lib/grading.ts'
import { courseTests, nextLesson, nextTest, studyWords } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { useSettings } from '../lib/settings.ts'
import { counts } from '../lib/srs.ts'
import { listResults } from '../lib/storage.ts'
import type { SavedResult } from '../lib/storage.ts'
import { useLessonProgress } from './LessonsPage.tsx'
import { StreakLine } from './StatsPage.tsx'
import { useReviewState } from './WordsPage.tsx'

export function HomePage() {
  const [results, setResults] = useState<SavedResult[] | null>(null)
  const [resultsError, setResultsError] = useState<string | null>(null)
  useEffect(() => {
    listResults().then(setResults, (err: unknown) => setResultsError(messageOf(err)))
  }, [])

  return (
    <div className="stack">
      <TodayPanel results={results} />

      <h2>Tests</h2>
      {resultsError && <div className="alert error">Could not load past results: {resultsError}</div>}
      {content.tests.length === 0 && <p className="muted">No tests yet. Claude adds them to content/tests/.</p>}
      {courseTests(content.tests, content.lessons).map((t) => {
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
              <span className="badge">{t.unit !== undefined ? `Unit ${t.unit}` : t.level}</span>
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

/** Today at a glance: reviews due, new words, the lesson and test to do next, the streak. */
function TodayPanel({ results }: { results: SavedResult[] | null }) {
  const settings = useSettings()
  const review = useReviewState()
  const lessons = useLessonProgress()
  const error = review.error ?? lessons.error

  let body = <p className="muted">Loading...</p>
  if (error) {
    body = <div className="alert error">Could not load your progress: {error}</div>
  } else if (review.state && lessons.progress && results) {
    const words = studyWords(content.words, content.lessons, lessons.progress, review.state)
    const c = counts(words, review.state, new Date(), settings.newPerDay)
    const lesson = nextLesson(content.lessons, lessons.progress)
    const test = nextTest(
      content.tests,
      content.lessons,
      results.map((r) => r.result),
    )
    body = (
      <>
        <div className="today-row">
          <span>
            {c.due + c.newLeft > 0 ? (
              <>
                <strong>{c.due}</strong> review{c.due === 1 ? '' : 's'} due, <strong>{c.newLeft}</strong> new word{c.newLeft === 1 ? '' : 's'}
              </>
            ) : (
              'Word reviews done for today. The Words page has more to do.'
            )}
          </span>
          <a className="btn primary" href={link('words')}>
            {c.due + c.newLeft > 0 ? 'Review words' : 'What next'}
          </a>
        </div>
        <div className="today-row">
          {lesson ? (
            <span>
              {lesson.status === 'in-progress' ? 'Continue lesson' : 'Next lesson'}:{' '}
              <a href={link('lesson', lesson.lesson.id)}>
                {lesson.lesson.unit}.{lesson.lesson.order} {lesson.lesson.title}
              </a>
            </span>
          ) : (
            <span className="muted">{content.lessons.length === 0 ? 'No lessons prepared yet.' : 'All lessons done.'} Ask Claude for more.</span>
          )}
        </div>
        <div className="today-row">
          {test ? (
            <span>
              Next test: <a href={link('test', test.id)}>{test.title}</a>
            </span>
          ) : (
            <span className="muted">No untaken tests. Ask Claude for a new one.</span>
          )}
        </div>
      </>
    )
  }

  return (
    <section className="card stack today">
      <h2>Today</h2>
      <StreakLine />
      {body}
    </section>
  )
}
