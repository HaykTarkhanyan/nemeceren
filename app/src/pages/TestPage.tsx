// Runs one test: one item per screen, then grades everything, saves the result and shows feedback.
import { useRef, useState } from 'react'
import { content } from '../content/load.ts'
import type { Item, Result, ResultItem, Test } from '../content/schema.ts'
import { GAP_MARKER } from '../content/schema.ts'
import { ResultView } from '../components/ResultView.tsx'
import { De, GlossScope } from '../components/GermanText.tsx'
import { PlayButtons, Speaker } from '../components/Speaker.tsx'
import { UmlautBar } from '../components/UmlautBar.tsx'
import { localDay } from '../lib/dates.ts'
import { messageOf } from '../lib/errors.ts'
import { describeItem, gradeItem, instructionFor, isBlank, scoreOf } from '../lib/grading.ts'
import type { AnswerValue } from '../lib/grading.ts'
import { link } from '../lib/router.ts'
import { shuffle } from '../lib/shuffle.ts'
import { SAVE_MODE, saveResult } from '../lib/storage.ts'
import { countWords } from '../lib/text.ts'

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

function initialAnswer(item: Item): AnswerValue {
  if (item.type === 'gap') return item.answers.map(() => '')
  if (item.type === 'order') return []
  if (item.type === 'mc' || item.type === 'listen_mc') return null
  return ''
}

/** Shuffled options (mc, listen_mc) or tiles (order), fixed for the whole attempt. */
function initialLayout(item: Item): string[] | null {
  if (item.type === 'mc' || item.type === 'listen_mc') return shuffle(item.options)
  if (item.type === 'order') {
    const target = item.answers[0].toLowerCase()
    let tiles = shuffle(item.tiles)
    // Avoid handing out the tiles already in the right order.
    for (let tries = 0; tries < 10 && tiles.join(' ').toLowerCase() === target; tries++) tiles = shuffle(item.tiles)
    return tiles
  }
  return null
}

function answerForResult(a: AnswerValue): string | string[] | null {
  if (isBlank(a)) return null
  return typeof a === 'string' ? a.trim() : a
}

type SaveStatus = { state: 'saving' } | { state: 'saved'; file: string } | { state: 'error'; message: string }

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

  async function persist(r: Result) {
    setSave({ state: 'saving' })
    try {
      setSave({ state: 'saved', file: await saveResult(r) })
    } catch (err) {
      setSave({ state: 'error', message: messageOf(err) })
    }
  }

  function submit() {
    const unanswered = answers.flatMap((a, i) => (isBlank(a) ? [i + 1] : []))
    if (unanswered.length > 0 && !window.confirm(`Not answered yet: ${unanswered.join(', ')}. Submit anyway?`)) return
    leaveItem()
    const items: ResultItem[] = test.items.map((it, i) => {
      const g = gradeItem(it, answers[i])
      const audio = it.type === 'dictation' || it.type === 'listen_mc'
      return {
        index: i,
        type: it.type,
        question: describeItem(it),
        answer: answerForResult(answers[i]),
        expected: g.expected,
        status: g.status,
        nearMiss: g.nearMiss,
        ...(g.gaps ? { gaps: g.gaps } : {}),
        ...(g.diff ? { diff: g.diff } : {}),
        timeMs: Math.round(times.current[i]),
        hintUsed: hints[i],
        ...(audio ? { plays: plays.current[i] } : {}),
      }
    })
    const submitted = new Date()
    const r: Result = {
      version: 1,
      testId: test.id,
      testTitle: test.title,
      level: test.level,
      mode: SAVE_MODE,
      startedAt,
      localDay: localDay(submitted),
      submittedAt: submitted.toISOString(),
      score: scoreOf(items),
      items,
    }
    setResult(r)
    window.scrollTo(0, 0)
    void persist(r)
  }

  if (result) {
    return (
      <div className="stack">
        <h1>{test.title}</h1>
        <SaveLine save={save} onRetry={() => void persist(result)} />
        <ResultView result={result} test={test} />
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
    </div>
  )
}

function SaveLine({ save, onRetry }: { save: SaveStatus | null; onRetry: () => void }) {
  if (!save || save.state === 'saving') return <p className="muted">Saving...</p>
  if (save.state === 'saved') {
    return (
      <p className="muted small">
        {SAVE_MODE === 'repo' ? `Saved to progress/${save.file}` : 'Saved in this browser (phone mode, not synced to the repo).'}
      </p>
    )
  }
  return (
    <div className="alert error" role="alert">
      <span>Your result was NOT saved: {save.message}</span>
      <button type="button" className="btn small" onClick={onRetry}>
        Retry saving
      </button>
    </div>
  )
}

interface InputProps {
  item: Item
  layout: string[] | null
  answer: AnswerValue
  onChange: (a: AnswerValue) => void
  onPlay: () => void
}

const TEXT_INPUT_PROPS = { autoCapitalize: 'off', autoCorrect: 'off', autoComplete: 'off', spellCheck: false, lang: 'de' } as const

function ItemInput({ item, layout, answer, onChange, onPlay }: InputProps) {
  switch (item.type) {
    case 'mc':
      return (
        <>
          <p className="question">{item.questionLang === 'en' ? item.question : <De text={item.question} />}</p>
          <Choices options={layout ?? item.options} value={answer as string | null} onChange={onChange} />
        </>
      )
    case 'listen_mc':
      return (
        <>
          <PlayButtons text={item.audio} onPlay={onPlay} />
          <p className="question" lang={item.questionLang ?? 'de'}>
            {item.question}
          </p>
          <Choices options={layout ?? item.options} value={answer as string | null} onChange={onChange} />
        </>
      )
    case 'gap': {
      const parts = item.text.split(GAP_MARKER)
      const fills = answer as string[]
      return (
        <>
          <p className="gap-text" lang="de">
            {parts.map((p, i) => (
              <span key={i}>
                {p}
                {i < parts.length - 1 && (
                  <input
                    type="text"
                    className="gap-input"
                    aria-label={`Gap ${i + 1}`}
                    value={fills[i]}
                    onChange={(e) => onChange(fills.map((f, k) => (k === i ? e.target.value : f)))}
                    {...TEXT_INPUT_PROPS}
                  />
                )}
              </span>
            ))}
          </p>
          <UmlautBar />
        </>
      )
    }
    case 'order':
      return <OrderInput prompt={item.prompt} tiles={layout ?? item.tiles} placed={answer as string[]} onChange={onChange} />
    case 'translate':
      return (
        <>
          <p className="question">
            {item.direction === 'de-en' ? <De text={item.text} /> : <span>{item.text}</span>}
          </p>
          <textarea
            className="text"
            rows={3}
            aria-label="Your translation"
            value={answer as string}
            onChange={(e) => onChange(e.target.value)}
            lang={item.direction === 'en-de' ? 'de' : 'en'}
            spellCheck={false}
          />
          {item.direction === 'en-de' && <UmlautBar />}
        </>
      )
    case 'write': {
      const words = countWords(answer as string)
      return (
        <>
          <p className="question" lang={item.promptLang ?? 'de'}>
            {item.prompt}
          </p>
          <textarea
            className="text"
            rows={8}
            aria-label="Your text"
            value={answer as string}
            onChange={(e) => onChange(e.target.value)}
            lang="de"
            spellCheck={false}
          />
          <p className={`small ${item.minWords && words < item.minWords ? 'warn-text' : 'muted'}`}>
            {words} word{words === 1 ? '' : 's'}
            {item.minWords ? ` (at least ${item.minWords})` : ''}
          </p>
          <UmlautBar />
        </>
      )
    }
    case 'dictation':
      return (
        <>
          <PlayButtons text={item.text} onPlay={onPlay} />
          <input
            type="text"
            className="text"
            aria-label="What you heard"
            value={answer as string}
            onChange={(e) => onChange(e.target.value)}
            {...TEXT_INPUT_PROPS}
          />
          <UmlautBar />
        </>
      )
  }
}

function Choices({ options, value, onChange }: { options: string[]; value: string | null; onChange: (a: string) => void }) {
  return (
    <div className="choices" role="radiogroup">
      {options.map((o) => (
        <div key={o} className="choice-row">
          <button
            type="button"
            role="radio"
            aria-checked={value === o}
            className={`choice ${value === o ? 'selected' : ''}`}
            onClick={() => onChange(o)}
            lang="de"
          >
            {o}
          </button>
          <Speaker text={o} />
        </div>
      ))}
    </div>
  )
}

function OrderInput(props: { prompt: string | undefined; tiles: string[]; placed: string[]; onChange: (a: string[]) => void }) {
  const { prompt, tiles, placed, onChange } = props
  // Tiles still in the pool: all tiles minus the placed ones (duplicates handled by count).
  const pool: { tile: string; key: number }[] = []
  const used = [...placed]
  tiles.forEach((t, i) => {
    const at = used.indexOf(t)
    if (at >= 0) used.splice(at, 1)
    else pool.push({ tile: t, key: i })
  })
  const sentence = placed.join(' ')
  return (
    <>
      {prompt && <p className="question">{prompt}</p>}
      <div className="order-line" aria-label="Your sentence">
        {placed.length === 0 && <span className="muted">Tap the words below.</span>}
        {placed.map((t, i) => (
          <button key={i} type="button" className="tile placed" lang="de" onClick={() => onChange(placed.filter((_, k) => k !== i))}>
            {t}
          </button>
        ))}
      </div>
      <div className="order-pool">
        {pool.map(({ tile, key }) => (
          <button key={key} type="button" className="tile" lang="de" onClick={() => onChange([...placed, tile])}>
            {tile}
          </button>
        ))}
      </div>
      {placed.length > 0 && (
        <div className="row">
          <button type="button" className="btn small" onClick={() => onChange([])}>
            Clear
          </button>
          {pool.length === 0 && <Speaker text={sentence} label="Listen to your sentence" />}
        </div>
      )}
    </>
  )
}
