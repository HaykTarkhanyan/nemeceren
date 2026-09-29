// A block of exercise items shown together (lesson exercises, listening practice). Same inputs,
// grading and result files as tests; word popups stay off until the answers are checked.
import { useRef, useState } from 'react'
import type { Item, Level, Result } from '../content/schema.ts'
import { localDay } from '../lib/dates.ts'
import { messageOf } from '../lib/errors.ts'
import { instructionFor, isBlank, resultItems, scoreOf } from '../lib/grading.ts'
import type { AnswerValue } from '../lib/grading.ts'
import { saveResult } from '../lib/storage.ts'
import { GlossScope } from './GermanText.tsx'
import { initialAnswer, initialLayout, ItemInput, SaveLine } from './ItemInput.tsx'
import type { SaveStatus } from './ItemInput.tsx'
import { ResultView } from './ResultView.tsx'

export interface ExerciseMeta {
  /** Saved as the result's testId, e.g. "u1-01-hallo-ex2" or "listening-practice". */
  testId: string
  testTitle: string
  level: Level
  /** For exercises inside a lesson. */
  lessonId?: string
  section?: number
}

export function InlineExercise({ items, meta, onChecked }: { items: Item[]; meta: ExerciseMeta; onChecked?: () => void }) {
  const [attempt, setAttempt] = useState(0)
  return <Attempt key={attempt} items={items} meta={meta} onRetry={() => setAttempt((a) => a + 1)} onChecked={onChecked} />
}

function Attempt(props: { items: Item[]; meta: ExerciseMeta; onRetry: () => void; onChecked?: () => void }) {
  const { items, meta, onRetry, onChecked } = props
  const [startedAt] = useState(() => new Date().toISOString())
  const [layouts] = useState(() => items.map(initialLayout))
  const [answers, setAnswers] = useState<AnswerValue[]>(() => items.map(initialAnswer))
  const [hints, setHints] = useState<boolean[]>(() => items.map(() => false))
  const [result, setResult] = useState<Result | null>(null)
  const [save, setSave] = useState<SaveStatus | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const times = useRef<number[]>(items.map(() => 0))
  const plays = useRef<number[]>(items.map(() => 0))
  // Time per item: the item Hayk last clicked or focused is the one being worked on.
  const active = useRef<{ index: number; since: number } | null>(null)

  function settle() {
    const a = active.current
    if (a) times.current[a.index] += performance.now() - a.since
    active.current = null
  }

  function touch(i: number) {
    if (active.current?.index === i) return
    settle()
    active.current = { index: i, since: performance.now() }
  }

  /** Saves on this device (and starts a sync); a failure here is shown with a retry button. */
  function persist(r: Result) {
    try {
      setSave({ state: 'saved', id: saveResult(r) })
    } catch (err) {
      setSave({ state: 'error', message: messageOf(err) })
    }
  }

  function check() {
    const unanswered = answers.flatMap((a, i) => (isBlank(a) ? [i + 1] : []))
    if (unanswered.length === items.length) {
      setNotice('Answer at least one item first.')
      return
    }
    if (unanswered.length > 0 && !window.confirm(`Not answered yet: ${unanswered.join(', ')}. Check anyway?`)) return
    settle()
    const graded = resultItems(items, answers, times.current, hints, plays.current)
    const submitted = new Date()
    const r: Result = {
      version: 1,
      testId: meta.testId,
      testTitle: meta.testTitle,
      level: meta.level,
      mode: 'web',
      startedAt,
      submittedAt: submitted.toISOString(),
      localDay: localDay(submitted),
      ...(meta.lessonId !== undefined ? { lessonId: meta.lessonId, section: meta.section } : {}),
      score: scoreOf(graded),
      items: graded,
    }
    setResult(r)
    persist(r)
    onChecked?.()
  }

  if (result) {
    return (
      <div className="stack">
        <SaveLine save={save} onRetry={() => persist(result)} />
        <ResultView result={result} items={items} />
        <div>
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    // Word popups stay off until the answers are checked (Hayk, 2026-09-29).
    <GlossScope surface={{ kind: 'test-item', submitted: false }}>
      <ol className="exercise-items">
        {items.map((item, i) => (
          <li key={i} className="exercise-item" onFocusCapture={() => touch(i)} onPointerDownCapture={() => touch(i)}>
            <p className="instruction">{instructionFor(item)}</p>
            <ItemInput
              item={item}
              layout={layouts[i]}
              answer={answers[i]}
              onChange={(v) => {
                setNotice(null)
                setAnswers((prev) => prev.map((a, k) => (k === i ? v : a)))
              }}
              onPlay={() => {
                plays.current[i] += 1
              }}
            />
            {item.hint && (
              <div className="hint">
                {hints[i] ? (
                  <p>
                    <span className="label">Hint</span> {item.hint}
                  </p>
                ) : (
                  <button type="button" className="btn small" onClick={() => setHints((h) => h.map((v, k) => (k === i ? true : v)))}>
                    Show hint
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {notice && <p className="warn-text">{notice}</p>}
      <button type="button" className="btn primary" onClick={check}>
        Check answers
      </button>
    </GlossScope>
  )
}
