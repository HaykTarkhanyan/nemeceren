// Runs one test: one item per screen, then grades everything, saves the result and shows feedback.
import { useEffect, useRef, useState } from 'react'
import { content } from '../content/load.ts'
import type { Result, Test } from '../content/schema.ts'
import { ResultView } from '../components/ResultView.tsx'
import { GlossScope } from '../components/GermanText.tsx'
import { initialAnswer, initialLayout, ItemInput, SaveLine } from '../components/ItemInput.tsx'
import type { SaveStatus } from '../components/ItemInput.tsx'
import { localDay } from '../lib/dates.ts'
import { messageOf } from '../lib/errors.ts'
import { instructionFor, isBlank, resultItems, scoreOf } from '../lib/grading.ts'
import { testKeyAction } from '../lib/keys.ts'
import type { TestKeyInput } from '../lib/keys.ts'
import type { AnswerValue } from '../lib/grading.ts'
import { link } from '../lib/router.ts'
import { speak } from '../lib/speech.ts'
import { saveResult } from '../lib/storage.ts'

export function TestPage({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0)
  const test = content.tests.find((t) => t.id === id)
  if (!test) {
    return (
      <div className="alert error">
        No test with id "{id}". <a href={link()}>Back to the list</a>
      </div>
    )
  }
  return <Attempt key={attempt} test={test} onRestart={() => setAttempt((a) => a + 1)} />
}

function Attempt({ test, onRestart }: { test: Test; onRestart: () => void }) {
  const [startedAt] = useState(() => new Date().toISOString())
  const [layouts] = useState(() => test.items.map(initialLayout))
  const [answers, setAnswers] = useState<AnswerValue[]>(() => test.items.map(initialAnswer))
  const [hints, setHints] = useState<boolean[]>(() => test.items.map(() => false))
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [save, setSave] = useState<SaveStatus | null>(null)
  const times = useRef<number[]>(test.items.map(() => 0))
  const plays = useRef<number[]>(test.items.map(() => 0))
  const enteredAt = useRef(performance.now())

  const item = test.items[index]
  const last = index === test.items.length - 1

  function leaveItem() {
    const now = performance.now()
    times.current[index] += now - enteredAt.current
    enteredAt.current = now
  }

  function goTo(i: number) {
    leaveItem()
    setIndex(i)
    window.scrollTo(0, 0)
  }

  function setAnswer(value: AnswerValue) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)))
  }

  // Keys (lib/keys.ts): 1-9 choose, Space plays (Shift+Space while typing), Enter = Next.
  const audio = item.type === 'listen_mc' ? item.audio : item.type === 'dictation' ? item.text : null
  const options = item.type === 'mc' || item.type === 'listen_mc' ? (layouts[index] ?? item.options) : []
  function play() {
    if (audio !== null && speak(audio)) plays.current[index] += 1
  }
  useEffect(() => {
    if (result) return
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const action = testKeyAction({
        key: e.key,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
        focus: focusKind(e.target, item.type),
        options: options.length,
        hasAudio: audio !== null,
        last,
      })
      if (!action) return
      e.preventDefault()
      if (action.kind === 'next') goTo(index + 1)
      else if (action.kind === 'play') play()
      else setAnswer(options[action.option])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** Saves on this device (and starts a sync); a failure here is shown with a retry button. */
  function persist(r: Result) {
    try {
      setSave({ state: 'saved', id: saveResult(r) })
    } catch (err) {
      setSave({ state: 'error', message: messageOf(err) })
    }
  }

  function submit() {
    const unanswered = answers.flatMap((a, i) => (isBlank(a) ? [i + 1] : []))
    if (unanswered.length > 0 && !window.confirm(`Not answered yet: ${unanswered.join(', ')}. Submit anyway?`)) return
    leaveItem()
    const items = resultItems(test.items, answers, times.current, hints, plays.current)
    const submitted = new Date()
    const r: Result = {
      version: 1,
      testId: test.id,
      testTitle: test.title,
      level: test.level,
      mode: 'web',
      startedAt,
      localDay: localDay(submitted),
      submittedAt: submitted.toISOString(),
      score: scoreOf(items),
      items,
    }
    setResult(r)
    window.scrollTo(0, 0)
    persist(r)
  }

  if (result) {
    return (
      <div className="stack">
        <h1>{test.title}</h1>
        <SaveLine save={save} onRetry={() => persist(result)} />
        <ResultView result={result} items={test.items} />
        <div className="row">
          <button type="button" className="btn primary" onClick={onRestart}>
            Take it again
          </button>
          <a className="btn" href={link()}>
            Back to tests
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div>
        <h1>{test.title}</h1>
        <div className="progress" aria-label={`Item ${index + 1} of ${test.items.length}`}>
          {test.items.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`dot ${i === index ? 'current' : ''} ${isBlank(answers[i]) ? '' : 'answered'}`}
              onClick={() => goTo(i)}
              aria-label={`Go to item ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Word popups stay off until the test is submitted (Hayk, 2026-09-29). */}
      <GlossScope surface={{ kind: 'test-item', submitted: false }}>
      <section className="card item">
        <p className="instruction">{instructionFor(item)}</p>
        <ItemInput
          key={index}
          item={item}
          layout={layouts[index]}
          answer={answers[index]}
          onChange={setAnswer}
          onPlay={() => {
            plays.current[index] += 1
          }}
          numbered
        />
        {item.hint && (
          <div className="hint">
            {hints[index] ? (
              <p>
                <span className="label">Hint</span> {item.hint}
              </p>
            ) : (
              <button type="button" className="btn small" onClick={() => setHints((h) => h.map((v, i) => (i === index ? true : v)))}>
                Show hint
              </button>
            )}
          </div>
        )}
      </section>
      </GlossScope>

      <div className="row between">
        <button type="button" className="btn" disabled={index === 0} onClick={() => goTo(index - 1)}>
          Back
        </button>
        <span className="muted">
          {index + 1} / {test.items.length}
        </span>
        {last ? (
          <button type="button" className="btn primary" onClick={submit}>
            Submit test
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={() => goTo(index + 1)}>
            Next
          </button>
        )}
      </div>
      <p className="small muted">{keyReminder(options.length, audio !== null, item.type, last)}</p>
    </div>
  )
}

/** The keys that work on this question, in one line. */
function keyReminder(options: number, hasAudio: boolean, itemType: string, last: boolean): string {
  const keys = [
    ...(options > 0 ? [`1-${options} choose`] : []),
    ...(hasAudio ? [itemType === 'dictation' ? 'Space play (Shift+Space while typing)' : 'Space play'] : []),
    last ? 'Enter does nothing on the last question: click Submit test' : itemType === 'write' ? 'Ctrl+Enter next' : 'Enter next',
  ]
  return `Keys: ${keys.join(', ')}.`
}

/** What has the focus, for the test keys. */
function focusKind(target: EventTarget | null, itemType: string): TestKeyInput['focus'] {
  if (target instanceof HTMLTextAreaElement) return itemType === 'write' ? 'textarea-long' : 'textbox'
  if (target instanceof HTMLInputElement && (target.type === 'text' || target.type === 'number')) return 'textbox'
  if (target instanceof HTMLButtonElement) return target.classList.contains('choice') || target.classList.contains('tile') ? 'choice' : 'button'
  if (target instanceof HTMLAnchorElement || target instanceof HTMLSelectElement) return 'button'
  return 'other'
}
