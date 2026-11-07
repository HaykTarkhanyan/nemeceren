// The bottom sheet for one station on the path Home: what the station holds and how to start it.
// A done lesson step can also be marked as not done (undo).
import type { CSSProperties, ReactNode } from 'react'
import { useEffect } from 'react'
import { content } from '../content/load.ts'
import type { LessonBlock } from '../content/schema.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { PASS_PERCENT } from '../lib/grading.ts'
import { englishName, germanName, testStationName, unitColor, unitTextColor, unitTitle } from '../lib/path.ts'
import type { PathProgress, Station } from '../lib/path.ts'
import { sourceKey, unitWordsLeft } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { undoStation } from '../lib/stationActions.ts'
import { progressStore, useProgress } from '../lib/storage.ts'
import { openWordReview } from '../lib/wordReview.ts'

const BLOCK_LABEL: Record<LessonBlock['type'], string> = {
  explanation: 'Explanation',
  comparison: 'Russian and Armenian',
  examples: 'Examples',
  table: 'Table',
  tip: 'Tip',
  warning: 'Watch out',
  exercise: 'Exercises',
  audio: 'Listen and repeat',
  lyrics: 'Lyrics',
  dialogue: 'Dialogue',
}

export function StationSheet({ station, path, onClose }: { station: Station | null; path: PathProgress; onClose: () => void }) {
  const state = useProgress().reviewState
  useEffect(() => {
    if (!station) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [station, onClose])

  if (!station) return null
  const s = station
  const done = path.done.has(s.id)
  let body: ReactNode
  let action: { href: string; label: string } | null = null
  let undo: (() => void) | null = null

  if (s.kind === 'end') {
    const u = path.units.get(s.unit)
    const left = u ? u.total - u.done : 0
    body = (
      <>
        <h3>Endstation: Unit {s.unit}</h3>
        <p className="muted small">{unitTitle(s.unit)}</p>
        <p>{done ? 'You reached the end of this line.' : `${left} station${left === 1 ? '' : 's'} left on this line.`}</p>
      </>
    )
  } else if (s.kind === 'test') {
    const t = content.tests.find((x) => x.id === s.testId)!
    const best = path.best.get(s.id)
    const words = unitWordsLeft(s.unit, content.lessons, state)
    body = (
      <>
        <h3>{testStationName(t.id, t.title)}</h3>
        <p className="muted small">{t.title}</p>
        <p>
          {t.items.length} items, passed from {PASS_PERCENT}%.{best !== undefined ? ` Your best so far: ${best}%.` : ''}
        </p>
        {words.total > 0 && (
          <div className="sheet-words">
            <p className="small">
              {words.left > 0
                ? `${words.left} of the ${words.total} Unit ${s.unit} words are not learned yet.`
                : `You have learned all ${words.total} Unit ${s.unit} words.`}
            </p>
            <button type="button" className="btn small" onClick={() => openWordReview(sourceKey({ kind: 'unit', unit: s.unit }), `Unit ${s.unit}`)}>
              Review Unit {s.unit} words
            </button>
          </div>
        )}
      </>
    )
    action = { href: link('test', t.id), label: done ? 'Take it again' : best !== undefined ? 'Retake' : 'Take the test' }
  } else {
    const lesson = content.lessons.find((l) => l.id === s.lessonId)!
    const prevDone = s.step! > 0 && path.done.has(`${lesson.id}#${s.step! - 1}`)
    body = (
      <>
        <h3>
          <span lang="de">{germanName(lesson.title)}</span>
          {s.of! > 1 && (
            <span className="muted small">
              {' '}
              step {s.step! + 1} of {s.of}
            </span>
          )}
        </h3>
        <p className="muted small">{englishName(lesson.title)}. About 8 minutes.</p>
        <ul>
          {lesson.sections.slice(s.from, s.to).map((b, i) => (
            <li key={i}>{b.title ?? <span className="muted">{BLOCK_LABEL[b.type]}</span>}</li>
          ))}
        </ul>
      </>
    )
    action = { href: link('lesson', lesson.id, 'station', String(s.step)), label: done ? 'Do it again' : prevDone ? 'Continue' : 'Start' }
    if (path.fromEvents.has(s.id)) {
      undo = () => {
        try {
          undoStation(progressStore(), lesson, [s.from!, s.to!], new Date())
          onClose()
        } catch (err) {
          reportError(`Could not mark the station as not done: ${messageOf(err)}`)
        }
      }
    }
  }

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="station-sheet" role="dialog" aria-modal="true" style={{ '--c': unitColor(s.unit), '--on-c': unitTextColor(s.unit) } as CSSProperties}>
        <div className="grab" />
        <span className="ubadge">U{s.unit}</span>
        {body}
        <div className="row sheet-actions">
          {undo && (
            <button type="button" className="btn small" onClick={undo}>
              Mark as not done
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          {action && (
            <a className="btn primary sheet-go" href={action.href}>
              {action.label}
            </a>
          )}
        </div>
      </div>
    </>
  )
}
