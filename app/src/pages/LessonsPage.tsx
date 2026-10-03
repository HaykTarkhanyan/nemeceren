// The Lessons page with two tabs: Course (lessons grouped by syllabus unit) and Themes (theme
// lessons from songs, videos, articles and topics, DECISIONS.md #61), and the view of one lesson.
// A theme lesson opens like a course lesson; it is just not part of the course.
import { useEffect, useRef, useState } from 'react'
import { content } from '../content/load.ts'
import { byCourseOrder, exerciseSections, isThemeLesson, openAt, sectionIndex, THEME_KIND_LABEL, THEME_LINK_LABEL } from '../content/lessons.ts'
import type { Lesson, Theme, ThemeLesson } from '../content/schema.ts'
import { BlockView } from '../components/LessonBlocks.tsx'
import { Tabs } from '../components/Tabs.tsx'
import { VideoList } from '../components/VideoList.tsx'
import { messageOf, reportError } from '../lib/errors.ts'
import { lessonStatus, markLessonDone, setLastSection, startLesson } from '../lib/plan.ts'
import type { LessonStatus } from '../lib/plan.ts'
import { link, tabLink, tabOf } from '../lib/router.ts'
import { lessonLyrics, wordCounts } from '../lib/lyrics.ts'
import { KNOWN_DAYS } from '../lib/stats.ts'
import { progressStore, saveLessonProgress, useProgress } from '../lib/storage.ts'

const STATUS_LABEL: Record<LessonStatus, string> = { 'not-started': 'not started', 'in-progress': 'in progress', done: 'done' }
const STATUS_CLASS: Record<LessonStatus, string> = { 'not-started': '', 'in-progress': 'pending', done: 'ok' }

export function StatusBadge({ status }: { status: LessonStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
}

export const LESSON_TABS = ['course', 'themes'] as const
const TAB_LABEL = { course: 'Course', themes: 'Themes' } as const

/** `tab` is the part after "#/lessons/": none for Course, "themes" for Themes. */
export function LessonsPage({ tab }: { tab?: string }) {
  const current = tabOf(tab, LESSON_TABS)
  if (current === null) {
    return (
      <div className="alert error">
        The Lessons page has no tab "{tab}". <a href={link('lessons')}>Lessons</a>
      </div>
    )
  }
  return (
    <div className="stack">
      <h1>Lessons</h1>
      <Tabs page="lessons" tabs={LESSON_TABS} labels={TAB_LABEL} current={current} />
      {current === 'course' ? <CourseList /> : <ThemeList />}
    </div>
  )
}

// Which units are folded open, per device (localStorage). A unit nobody toggled yet is open only if
// it is the current one: the first unit with a lesson not done.
const OPEN_UNITS_KEY = 'nemeceren.lessonUnitsOpen'

function readOpenUnits(): Record<string, boolean> {
  let raw: string | null
  try {
    raw = localStorage.getItem(OPEN_UNITS_KEY)
  } catch (err) {
    reportError(`Which units are folded open cannot be read on this device: ${messageOf(err)}`)
    return {}
  }
  if (raw === null) return {}
  try {
    return JSON.parse(raw) as Record<string, boolean>
  } catch (err) {
    reportError(`Browser storage "${OPEN_UNITS_KEY}" is not valid JSON, so the units start folded: ${messageOf(err)}`)
    return {}
  }
}

function CourseList() {
  const progress = useProgress().lessonProgress
  const [openUnits, setOpenUnits] = useState(readOpenUnits)
  if (content.lessons.length === 0) return <p className="muted">No lessons prepared yet. Ask Claude to write the next one.</p>
  const units = [...new Set(content.lessons.map((l) => l.unit))].sort((a, b) => a - b)
  const lessonsOf = (unit: number) => content.lessons.filter((l) => l.unit === unit).sort(byCourseOrder)
  const current = units.find((u) => lessonsOf(u).some((l) => lessonStatus(progress, l.id) !== 'done'))
  const isOpen = (unit: number) => openUnits[unit] ?? unit === current
  function toggled(unit: number, open: boolean) {
    if (open === isOpen(unit)) return
    const next = { ...openUnits, [unit]: open }
    setOpenUnits(next)
    try {
      localStorage.setItem(OPEN_UNITS_KEY, JSON.stringify(next))
    } catch (err) {
      reportError(`Could not remember the folded units on this device: ${messageOf(err)}`)
    }
  }
  return (
    <>
      {units.map((unit) => {
        const lessons = lessonsOf(unit)
        const done = lessons.filter((l) => lessonStatus(progress, l.id) === 'done').length
        return (
        <details key={unit} className="unit" open={isOpen(unit)} onToggle={(e) => toggled(unit, e.currentTarget.open)}>
          <summary>
            <h2>Unit {unit}</h2>
            <span className={`badge ${done === lessons.length ? 'ok' : ''}`}>
              {done}/{lessons.length} done
            </span>
          </summary>
          <div className="stack">
          {lessons.map((l) => (
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
          </div>
        </details>
        )
      })}
    </>
  )
}

/** "by Cro, 2019", "2019", or "" when the theme has neither. */
export function themeByline(t: Theme): string {
  return [t.by !== undefined ? `by ${t.by}` : null, t.year !== undefined ? String(t.year) : null].filter((x) => x !== null).join(', ')
}

/** The external "Listen" / "Watch" / "Read" link; a topic has no source. */
function SourceLink({ theme, className }: { theme: Theme; className?: string }) {
  if (theme.kind === 'topic' || theme.url === undefined) return null
  return (
    <a className={className} href={theme.url} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">
      {THEME_LINK_LABEL[theme.kind]} ↗
    </a>
  )
}

function ThemeList() {
  const progress = useProgress().lessonProgress
  if (content.themes.length === 0) return <p className="muted">No theme lessons yet. Send Claude a song or video link.</p>
  return (
    <>
      <p className="muted small">Lessons built from songs, videos, articles and topics you bring. They are not part of the course, so take them in any order.</p>
      {content.themes.map((l) => (
        <ThemeCard key={l.id} lesson={l} status={lessonStatus(progress, l.id)} />
      ))}
    </>
  )
}

function ThemeCard({ lesson, status }: { lesson: ThemeLesson; status: LessonStatus }) {
  const t = lesson.theme
  const byline = themeByline(t)
  const lyrics = lessonLyrics(lesson)
  return (
    <article className="card stack theme-card">
      <div className="row between">
        <span className="row">
          <span className="badge">{THEME_KIND_LABEL[t.kind]}</span>
          <span className="badge">{lesson.level}</span>
        </span>
        <StatusBadge status={status} />
      </div>
      <div>
        <a className="theme-title" href={link('lesson', lesson.id)}>
          {t.title}
        </a>
        {byline && <p className="muted small">{byline}</p>}
      </div>
      <p className="muted">{lesson.summary}</p>
      {lyrics.length > 0 && <p className="small">Full lyrics inside: {wordCounts(lyrics, null).forms} unique words.</p>}
      <div className="row">
        <a className="btn small primary" href={link('lesson', lesson.id)}>
          Open lesson
        </a>
        <SourceLink theme={t} className="btn small" />
      </div>
    </article>
  )
}

/** `sectionId` (from "#/lesson/<id>/<section id>", e.g. a Topics link) opens the lesson at that section. */
export function LessonPage({ id, sectionId }: { id: string; sectionId?: string }) {
  const lesson = content.allLessons.find((l) => l.id === id)
  if (!lesson) {
    return (
      <div className="alert error">
        No lesson with id "{id}". <a href={link('lessons')}>All lessons</a>
      </div>
    )
  }
  const linked = sectionId === undefined ? null : sectionIndex(lesson, sectionId)
  if (linked === -1) {
    return (
      <div className="alert error">
        Lesson "{lesson.title}" has no section "{sectionId}". <a href={link('lesson', lesson.id)}>Open the lesson</a>
      </div>
    )
  }
  return <LessonView key={lesson.id} lesson={lesson} linked={linked} />
}

const SAVE_POSITION_MS = 1500

function LessonView({ lesson, linked }: { lesson: Lesson; linked: number | null }) {
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

  // Go to the linked section, or back to where Hayk was last time. The hash keeps the section,
  // so a reload or a direct link lands there too.
  useEffect(() => {
    if (!started || restored.current) return
    restored.current = true
    const last = progressStore().getView().lessonProgress.lessons[lesson.id]?.lastSection ?? 0
    const at = openAt(linked, last)
    if (at !== null) document.getElementById(`section-${at}`)?.scrollIntoView({ block: 'start' })
  }, [started, lesson.id, linked])

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
  // The course's next lesson; a theme lesson is not part of the course, so it has none.
  const ordered = [...content.lessons].sort(byCourseOrder)
  const following = isThemeLesson(lesson) ? undefined : ordered[ordered.findIndex((l) => l.id === lesson.id) + 1]
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
      {isThemeLesson(lesson) ? (
        <a href={tabLink('lessons', LESSON_TABS, 'themes')} className="small">
          All theme lessons
        </a>
      ) : (
        <a href={link('lessons')} className="small">
          All lessons
        </a>
      )}
      <div>
        {isThemeLesson(lesson) ? (
          <p className="muted small">
            {THEME_KIND_LABEL[lesson.theme.kind]}: {lesson.theme.title}
            {themeByline(lesson.theme) ? ` (${themeByline(lesson.theme)})` : ''}
            {lesson.theme.variety ? `, ${lesson.theme.variety}` : ''} <StatusBadge status={status} />
          </p>
        ) : (
          <p className="muted small">
            Unit {lesson.unit}, lesson {lesson.order} <StatusBadge status={status} />
          </p>
        )}
        <h1>{lesson.title}</h1>
        <p>{lesson.summary}</p>
        {isThemeLesson(lesson) && <SourceLink theme={lesson.theme} className="small" />}
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
        {lesson.videos && lesson.videos.length > 0 && (
          <div className="stack">
            <p className="small">
              <strong>Videos</strong> to watch with this lesson (Learn German on YouTube):
            </p>
            <VideoList videos={lesson.videos} />
          </div>
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
        <section key={i} id={`section-${i}`} data-section={i} className={`card${i === linked ? ' linked-section' : ''}`}>
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
