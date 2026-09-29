// Lessons grouped by syllabus unit, and the view of one lesson.
import { useEffect, useRef, useState } from 'react'
import { content } from '../content/load.ts'
import { byCourseOrder, exerciseSections } from '../content/lessons.ts'
import type { Lesson } from '../content/schema.ts'
import { BlockView } from '../components/LessonBlocks.tsx'
import { messageOf, reportError } from '../lib/errors.ts'
import { lessonStatus, markLessonDone, setLastSection, startLesson } from '../lib/plan.ts'
import type { LessonStatus } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { KNOWN_DAYS } from '../lib/stats.ts'
import { progressStore, saveLessonProgress, useProgress } from '../lib/storage.ts'

const STATUS_LABEL: Record<LessonStatus, string> = { 'not-started': 'not started', 'in-progress': 'in progress', done: 'done' }
const STATUS_CLASS: Record<LessonStatus, string> = { 'not-started': '', 'in-progress': 'pending', done: 'ok' }

export function StatusBadge({ status }: { status: LessonStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
}

export function LessonsPage() {
  const progress = useProgress().lessonProgress
  if (content.lessons.length === 0) {
    return (
      <div className="stack">
        <h1>Lessons</h1>
        <p className="muted">No lessons prepared yet. Ask Claude to write the next one.</p>
      </div>
    )
  }
  const units = [...new Set(content.lessons.map((l) => l.unit))].sort((a, b) => a - b)
  return (
    <div className="stack">
      <h1>Lessons</h1>
      {units.map((unit) => (
        <section key={unit} className="stack">
          <h2>Unit {unit}</h2>
          {content.lessons
            .filter((l) => l.unit === unit)
            .sort(byCourseOrder)
            .map((l) => (
              <a key={l.id} className="card test-card" href={link('lesson', l.id)}>
                <div className="row between">
                  <strong>
                    {l.unit}.{l.order} {l.title}
                  </strong>
                  <StatusBadge status={lessonStatus(progress, l.id)} />
                </div>
                <p className="muted">{l.summary}</p>
                <p className="muted small">
                  {l.words?.length ?? 0} new words, {exerciseSections(l).length} exercise{exerciseSections(l).length === 1 ? '' : 's'}
                </p>
              </a>
            ))}
        </section>
      ))}
    </div>
  )
}

export function LessonPage({ id }: { id: string }) {
  const lesson = content.lessons.find((l) => l.id === id)
  if (!lesson) {
    return (
      <div className="alert error">
        No lesson with id "{id}". <a href={link('lessons')}>All lessons</a>
      </div>
    )
  }
  return <LessonView key={lesson.id} lesson={lesson} />
}

const SAVE_POSITION_MS = 1500

function LessonView({ lesson }: { lesson: Lesson }) {
  const view = useProgress()
  const progress = view.lessonProgress
  const state = view.reviewState
  const [error, setError] = useState<string | null>(null)
  const restored = useRef(false)
  const started = progress.lessons[lesson.id] !== undefined

  // Opening a lesson starts it, which also unlocks its words for the daily new words.
  useEffect(() => {
    try {
      const p = progressStore().getView().lessonProgress
      const next = startLesson(p, lesson.id, new Date())
      if (next !== p) saveLessonProgress(next)
    } catch (err) {
      setError(messageOf(err))
    }
  }, [lesson.id])

  // Go back to where Hayk was last time.
  useEffect(() => {
    if (!started || restored.current) return
    restored.current = true
    const last = progressStore().getView().lessonProgress.lessons[lesson.id]?.lastSection ?? 0
    if (last > 0) document.getElementById(`section-${last}`)?.scrollIntoView({ block: 'start' })
  }, [started, lesson.id])

  // Remember the section at the top of the screen (saved a moment after scrolling stops; it goes
  // into the outbox and is sent with the next sync, never one request per scroll).
  useEffect(() => {
    if (!started) return
    const visible = new Set<number>()
    let timer: number | undefined
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.section)
          if (e.isIntersecting) visible.add(i)
          else visible.delete(i)
        }
        if (visible.size === 0) return
        const current = Math.min(...visible)
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          try {
            const p = progressStore().getView().lessonProgress
            const next = setLastSection(p, lesson.id, current, new Date())
            if (next !== p) saveLessonProgress(next)
          } catch (err) {
            reportError(`Could not save your place in the lesson: ${messageOf(err)}`)
          }
        }, SAVE_POSITION_MS)
      },
      { rootMargin: '0px 0px -60% 0px' },
    )
    document.querySelectorAll('[data-section]').forEach((el) => observer.observe(el))
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [started, lesson.id])

  function toggleDone(done: boolean) {
    try {
      saveLessonProgress(markLessonDone(progressStore().getView().lessonProgress, lesson.id, done, new Date()))
    } catch (err) {
      reportError(`Could not save the lesson status: ${messageOf(err)}`)
    }
  }

  if (error) return <div className="alert error">Could not open the lesson: {error}</div>
  if (!started) return <p className="muted">Opening the lesson...</p>

  const status = lessonStatus(progress, lesson.id)
  const exercises = exerciseSections(lesson)
  const words = (lesson.words ?? []).map((wid) => content.words.find((w) => w.id === wid)).filter((w) => w !== undefined)
  const tests = content.tests.filter((t) => lesson.tests?.includes(t.id) || t.lesson === lesson.id)
  const ordered = [...content.lessons].sort(byCourseOrder)
  const following = ordered[ordered.findIndex((l) => l.id === lesson.id) + 1]
  const wordStatus = (wid: string) => {
    const card = state.cards[wid]
    if (!card) return 'new'
    return card.state === 2 && card.scheduled_days >= KNOWN_DAYS ? 'known' : 'learning'
  }

  const doneButton = (
    <button type="button" className={`btn ${status === 'done' ? '' : 'primary'}`} onClick={() => toggleDone(status !== 'done')}>
      {status === 'done' ? 'Mark as not done' : 'Mark lesson as done'}
    </button>
  )

  return (
    <div className="stack lesson">
      <a href={link('lessons')} className="small">
        All lessons
      </a>
      <div>
        <p className="muted small">
          Unit {lesson.unit}, lesson {lesson.order} <StatusBadge status={status} />
        </p>
        <h1>{lesson.title}</h1>
        <p>{lesson.summary}</p>
      </div>

      <section className="card stack">
        <h2>After this lesson you can</h2>
        <ul className="goals">
          {lesson.goals.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
        {lesson.nicosWeg && lesson.nicosWeg.length > 0 && (
          <p className="small">
            Nicos Weg:{' '}
            {lesson.nicosWeg.map((n, i) => (
              <span key={n.url}>
                {i > 0 && ', '}
                <a href={n.url} target="_blank" rel="noopener noreferrer">
                  {n.title}
                </a>
              </span>
            ))}
          </p>
        )}
        {words.length > 0 && (
          <div className="small">
            <p>
              <strong>{words.length} new words</strong> in this lesson. Opening the lesson added them to your daily new words on the{' '}
              <a href={link('words')}>Words</a> page.
            </p>
            <p className="lesson-words">
              {words.map((w) => (
                <span key={w.id} className={`badge word-${wordStatus(w.id)}`} lang="de">
                  {w.de}
                </span>
              ))}
            </p>
          </div>
        )}
      </section>

      {lesson.sections.map((block, i) => (
        <section key={i} id={`section-${i}`} data-section={i} className="card">
          <BlockView lesson={lesson} block={block} section={i} exerciseNumber={exercises.find((e) => e.section === i)?.number ?? null} />
        </section>
      ))}

      <section className="card stack">
        {tests.length > 0 && (
          <p>
            Tests for this lesson:{' '}
            {tests.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ', '}
                <a href={link('test', t.id)}>{t.title}</a>
              </span>
            ))}
          </p>
        )}
        <div className="row">
          {doneButton}
          {following && (
            <a className="btn" href={link('lesson', following.id)}>
              Next lesson: {following.title}
            </a>
          )}
        </div>
      </section>
    </div>
  )
}
