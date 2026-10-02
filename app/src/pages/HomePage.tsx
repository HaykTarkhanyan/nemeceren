import { content } from '../content/load.ts'
import { PASS_PERCENT, testStatus } from '../lib/grading.ts'
import { practiceWord } from '../lib/customWords.ts'
import { courseTests, nextLesson, nextTest, wordsForSource } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { useSettings } from '../lib/settings.ts'
import { counts } from '../lib/srs.ts'
import { useProgress } from '../lib/storage.ts'
import { StreakLine } from './StatsPage.tsx'

export function HomePage() {
  const { results } = useProgress()

  return (
    <div className="stack">
      <TodayPanel />

      <h2>Tests</h2>
      {content.tests.length === 0 && <p className="muted">No tests yet. Claude adds them to content/tests/.</p>}
      {courseTests(content.tests, content.lessons).map((t) => {
        const s = testStatus(results.filter((r) => r.result.testId === t.id).map((r) => r.result))
        return (
          <a key={t.id} className={`card test-card test-status ${s.kind}`} href={link('test', t.id)}>
            <div className="row between">
              <strong>{t.title}</strong>
              <span className="row">
                {s.kind === 'new' && <span className="badge">not taken</span>}
                {s.kind === 'tried' && <span className="badge warn">tried, best {s.bestPercent}%</span>}
                {s.kind === 'passed' && <span className="badge ok">passed, best {s.bestPercent}%</span>}
                {s.kind !== 'new' && s.waiting > 0 && <span className="badge pending">waiting for Claude</span>}
                <span className="badge">{t.unit !== undefined ? `Unit ${t.unit}` : t.level}</span>
              </span>
            </div>
            {t.description && <p className="muted">{t.description}</p>}
            <p className="muted small">
              {t.items.length} items
              {s.kind === 'new'
                ? `, added ${t.created}`
                : `. Taken ${s.attempts}x, last on ${s.lastDay}: ${s.last.correct}/${s.last.total}${s.waiting ? ` (${s.waiting} waiting for Claude's review)` : ''}.${s.kind === 'tried' ? ` Passed from ${PASS_PERCENT}%.` : ''}`}
            </p>
          </a>
        )
      })}
    </div>
  )
}

/** Today at a glance: reviews due, new words, the lesson and test to do next, the streak. */
function TodayPanel() {
  const settings = useSettings()
  const progress = useProgress()
  const words = wordsForSource(
    { kind: 'all' },
    content.words,
    progress.customWords.map(practiceWord),
    content.allLessons,
    progress.lessonProgress,
    progress.reviewState,
  )
  const c = counts(words, progress.reviewState, new Date(), settings.newPerDay)
  const lesson = nextLesson(content.lessons, progress.lessonProgress)
  const test = nextTest(
    content.tests,
    content.lessons,
    progress.results.map((r) => r.result),
  )
  return (
    <section className="card stack today">
      <h2>Today</h2>
      <StreakLine />
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
    </section>
  )
}
