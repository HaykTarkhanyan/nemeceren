// Lesson sections worth revisiting (content/topics.json), grouped, with the key ones starred.
// Each links to its lesson, opened at that section.
import { content } from '../content/load.ts'
import { isThemeLesson } from '../content/lessons.ts'
import { link } from '../lib/router.ts'

export function TopicsPage() {
  const lessonById = new Map(content.allLessons.map((l) => [l.id, l]))
  /** "Unit 2", or "Theme" for a theme lesson. */
  const badge = (lessonId: string) => {
    const l = lessonById.get(lessonId)
    // check-content and the app's content check reject a topic whose lesson does not exist.
    if (l === undefined) throw new Error(`Topics: no lesson with id "${lessonId}"`)
    return isThemeLesson(l) ? 'Theme' : `Unit ${l.unit}`
  }
  return (
    <div className="stack">
      <div>
        <h1>Topics</h1>
        <p className="muted">Lesson sections to come back to. The starred ones are the key ones.</p>
      </div>
      {content.topics.groups.map((g) => (
        <section key={g.id} className="card stack">
          <div>
            <h2>{g.title}</h2>
            <p className="muted small">{g.summary}</p>
          </div>
          <ul className="topic-list">
            {g.items.map((it) => (
              <li key={`${it.lesson}/${it.section}`}>
                <a href={link('lesson', it.lesson, it.section)}>
                  {it.star && (
                    <span className="star" title="Key topic">
                      ★{' '}
                    </span>
                  )}
                  {it.title}
                </a>
                <span className="badge">{badge(it.lesson)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
