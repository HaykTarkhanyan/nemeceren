// A Mistakes replay session (DECISIONS.md #81): the due mistakes one by one, each in its original
// form. Every check is saved at once as a one-item attempt (content/lessons.ts redoTestId), so an
// interrupted session keeps what was done. Write items wait for Claude's review like any writing.
import { useEffect, useRef, useState } from 'react'
import type { Result } from '../content/schema.ts'
import { lessonLabel, redoTestId } from '../content/lessons.ts'
import { localDay } from '../lib/dates.ts'
import { messageOf } from '../lib/errors.ts'
import { instructionFor, isBlank, resultItems, scoreOf } from '../lib/grading.ts'
import type { AnswerValue } from '../lib/grading.ts'
import type { Mistake } from '../lib/mistakes.ts'
import { link } from '../lib/router.ts'
import { requestFlush, saveResult } from '../lib/storage.ts'
import { De, GlossScope } from './GermanText.tsx'
import { initialAnswer, initialLayout, ItemInput, SaveLine } from './ItemInput.tsx'
import type { SaveStatus } from './ItemInput.tsx'
import { ResultView } from './ResultView.tsx'

export interface MistakeStats {
  right: number
  wrong: number
  /** Write items waiting for Claude. */
  pending: number
}

export function MistakesSession({ mistakes, onDone }: { mistakes: Mistake[]; onDone: (s: MistakeStats) => void }) {
  const [index, setIndex] = useState(0)
  const [stats, setStats] = useState<MistakeStats>({ right: 0, wrong: 0, pending: 0 })
  const m = mistakes[index]
  if (!m) throw new Error(`The Mistakes session has no item ${index + 1}`)
  return (
    <One
      key={m.key}
      mistake={m}
      label={`${index + 1} of ${mistakes.length}`}
      onNext={(status) => {
        const field = status === 'correct' ? 'right' : status === 'wrong' ? 'wrong' : 'pending'
        const next = { ...stats, [field]: stats[field] + 1 }
        if (index + 1 < mistakes.length) {
          setStats(next)
          setIndex(index + 1)
        } else {
          requestFlush()
          onDone(next)
        }
      }}
    />
  )
}

function One({ mistake, label, onNext }: { mistake: Mistake; label: string; onNext: (status: 'correct' | 'wrong' | 'pending') => void }) {
  const { item, source } = mistake
  const [startedAt] = useState(() => new Date().toISOString())
  const [shownAt] = useState(() => performance.now())
  const [layout] = useState(() => initialLayout(item))
  const [answer, setAnswer] = useState<AnswerValue>(() => initialAnswer(item))
  const [hint, setHint] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [save, setSave] = useState<SaveStatus | null>(null)
  const plays = useRef(0)

  // A block body: since Chrome 149/150 window.scrollTo returns a Promise, and an effect that returns
  // it makes React's production build call the Promise as a cleanup at unmount ("l is not a function",
  // Hayk's daily mix crash, DECISIONS.md #108).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  function persist(r: Result) {
    try {
      setSave({ state: 'saved', id: saveResult(r) })
    } catch (err) {
      setSave({ state: 'error', message: messageOf(err) })
    }
  }

  function check() {
    if (isBlank(answer)) return
    const items = resultItems([item], [answer], [performance.now() - shownAt], [hint], [plays.current])
    const submitted = new Date()
    const r: Result = {
      version: 1,
      testId: redoTestId(mistake.sourceId, mistake.index),
      // The API takes titles up to 300 characters (backend/src/schema.ts AttemptUpload).
      testTitle: `Mistakes: ${source.title}, item ${mistake.index + 1}`.slice(0, 300),
      level: source.level,
      mode: 'web',
      startedAt,
      submittedAt: submitted.toISOString(),
      localDay: localDay(submitted),
      score: scoreOf(items),
      items,
    }
    setResult(r)
    persist(r)
  }

  const reread = source.reread
  return (
    <section className="stack">
      <div className="row between">
        <span className="muted small">
          Mistake {label}, from {source.title}
        </span>
        {mistake.rightDays > 0 && <span className="badge ok">right once already; once more on another day fixes it</span>}
      </div>
      {result ? (
        <>
          <SaveLine save={save} onRetry={() => persist(result)} />
          <ResultView result={result} items={[item]} />
          {result.items[0].status === 'pending' && (
            <div className="card small">
              <p>Claude will check your new answer.</p>
              {mistake.correction && (
                <p>
                  Last time Claude corrected it to: <De text={mistake.correction} />
                </p>
              )}
            </div>
          )}
          <div className="row actions">
            {reread && (
              <a className="btn small" href={link('lesson', reread.id)}>
                Reread {lessonLabel(reread)}: {reread.title}
              </a>
            )}
            <button type="button" className="btn primary" disabled={save?.state !== 'saved'} onClick={() => onNext(result.items[0].status)}>
              Next
            </button>
          </div>
        </>
      ) : (
        <GlossScope surface={{ kind: 'test-item', submitted: false }}>
          <div className="card stack">
            <p className="instruction">{instructionFor(item)}</p>
            <ItemInput item={item} layout={layout} answer={answer} onChange={setAnswer} onPlay={() => (plays.current += 1)} />
            {item.hint &&
              (hint ? (
                <p className="hint">
                  <span className="label">Hint</span> {item.hint}
                </p>
              ) : (
                <div>
                  <button type="button" className="btn small" onClick={() => setHint(true)}>
                    Show hint
                  </button>
                </div>
              ))}
            <div>
              <button type="button" className="btn primary" disabled={isBlank(answer)} onClick={check}>
                Check
              </button>
            </div>
          </div>
        </GlossScope>
      )}
    </section>
  )
}
