// Per-item feedback for a finished test, including Claude's review when the result has one.
import type { Item, NearMissKind, Result, ResultItem, Review, Test } from '../content/schema.ts'
import { GAP_MARKER } from '../content/schema.ts'
import { finalScore, finalStatus } from '../lib/grading.ts'
import { De } from './Speaker.tsx'

const NEAR_MISS_LABEL: Record<NearMissKind, string> = {
  case: 'capitalization',
  umlaut: 'umlaut or ß spelling',
  article_missing: 'missing article',
  article_wrong: 'wrong article',
}

export function nearMissText(kinds: NearMissKind[] | null | undefined): string | null {
  if (!kinds || kinds.length === 0) return null
  return `Close - ${kinds.map((k) => NEAR_MISS_LABEL[k]).join(', ')}`
}

const TYPE_LABEL: Record<Item['type'], string> = {
  mc: 'Multiple choice',
  gap: 'Gap fill',
  order: 'Word order',
  translate: 'Translation',
  write: 'Writing',
  dictation: 'Dictation',
  listen_mc: 'Listening',
}

function StatusBadge({ status }: { status: ResultItem['status'] }) {
  if (status === 'correct') return <span className="badge ok">Correct</span>
  if (status === 'wrong') return <span className="badge bad">Wrong</span>
  return <span className="badge pending">Waiting for Claude</span>
}

function GapAnswer({ ri }: { ri: ResultItem }) {
  const parts = ri.question.split(GAP_MARKER)
  return (
    <span lang="de">
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && ri.gaps && (
            <mark className={ri.gaps[i].correct ? 'fill ok' : 'fill bad'}>{ri.gaps[i].answer || '(empty)'}</mark>
          )}
        </span>
      ))}
    </span>
  )
}

function DictationDiff({ ri }: { ri: ResultItem }) {
  if (!ri.diff) return null
  const expected = ri.diff.filter((d) => d.op !== 'extra').length
  const ok = ri.diff.filter((d) => d.op === 'ok').length
  return (
    <div>
      <p className="diff" lang="de">
        {ri.diff.map((d, i) => {
          if (d.op === 'ok') return <span key={i} className="w ok">{d.typed} </span>
          if (d.op === 'wrong') {
            return (
              <span key={i} className="w">
                <del>{d.typed}</del> <ins>{d.expected}</ins>{' '}
              </span>
            )
          }
          if (d.op === 'missing') return <ins key={i} className="w missing" title="missing">{d.expected} </ins>
          return <del key={i} className="w extra" title="extra">{d.typed} </del>
        })}
      </p>
      <p className="muted small">
        {ok} of {expected} words right. Red = your version, green = correct.
      </p>
    </div>
  )
}

function YourAnswer({ ri }: { ri: ResultItem }) {
  if (ri.answer === null) return <span className="muted">(no answer)</span>
  if (ri.type === 'gap') return <GapAnswer ri={ri} />
  if (ri.type === 'dictation') return <DictationDiff ri={ri} />
  if (ri.type === 'order' && Array.isArray(ri.answer)) {
    // Tiles are often lowercase so they do not give away the first word; show a sentence.
    const s = ri.answer.join(' ')
    return <span lang="de">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
  }
  const text = Array.isArray(ri.answer) ? ri.answer.join(' ') : ri.answer
  return <span className="answer-text">{text}</span>
}

function ItemFeedback(props: {
  ri: ResultItem
  status: ResultItem['status']
  item: Item | null
  review: Review['items'][number] | undefined
}) {
  const { ri, status, item, review } = props
  const near = nearMissText(ri.nearMiss)
  const germanExpected = ri.expected !== null && !(item?.type === 'translate' && item.direction === 'de-en')
  return (
    <article className="card feedback">
      <div className="row between">
        <strong>
          {ri.index + 1}. {TYPE_LABEL[ri.type]}
        </strong>
        <span className="row">
          <StatusBadge status={status} />
          {near && <span className="badge near">{near}</span>}
        </span>
      </div>
      {ri.type !== 'gap' && ri.type !== 'dictation' && <p className="question">{ri.question}</p>}
      <div className="field">
        <span className="label">Your answer</span>
        <YourAnswer ri={ri} />
      </div>
      {ri.expected !== null && status !== 'correct' && (
        <div className="field">
          <span className="label">{ri.type === 'translate' ? 'Reference' : 'Correct'}</span>
          {germanExpected ? <De text={ri.expected} /> : <span>{ri.expected}</span>}
        </div>
      )}
      {item?.explanation && <p className="explanation">{item.explanation}</p>}
      {review && (
        <div className={`claude-review ${review.correct ? 'ok' : 'bad'}`}>
          <span className="label">Claude: {review.correct ? 'correct' : 'not correct'}</span>
          {review.correction && (
            <div>
              <De text={review.correction} />
            </div>
          )}
          {review.note && <p>{review.note}</p>}
        </div>
      )}
      <p className="muted small">
        {Math.round(ri.timeMs / 1000)} s{ri.hintUsed ? ', hint used' : ''}
        {ri.plays !== undefined ? `, played ${ri.plays}x` : ''}
      </p>
    </article>
  )
}

export function ScoreLine({ result }: { result: Result }) {
  const s = result.score
  const f = finalScore(result)
  return (
    <div className="score">
      <div className="score-big">
        {result.review ? f.correct : s.correct} / {s.total}
      </div>
      <div className="muted">
        {result.review
          ? `after Claude's review${f.pending ? `, ${f.pending} still waiting` : ''} (auto-graded: ${s.correct} correct)`
          : s.pending > 0
            ? `${s.pending} waiting for Claude's review`
            : 'all auto-graded'}
      </div>
    </div>
  )
}

export function ResultView({ result, test }: { result: Result; test: Test | undefined }) {
  return (
    <div className="stack">
      <ScoreLine result={result} />
      {result.review && (
        <div className="card claude-summary">
          <span className="label">Claude's review, {new Date(result.review.gradedAt).toLocaleString()}</span>
          <p>{result.review.summary}</p>
        </div>
      )}
      {result.items.map((ri) => {
        const candidate = test?.items[ri.index]
        const item = candidate && candidate.type === ri.type ? candidate : null
        return (
          <ItemFeedback
            key={ri.index}
            ri={ri}
            status={finalStatus(result, ri.index)}
            item={item}
            review={result.review?.items.find((r) => r.index === ri.index)}
          />
        )
      })}
    </div>
  )
}
