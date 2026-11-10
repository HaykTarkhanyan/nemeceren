// The "Ask Claude" button on an answered item (DECISIONS.md #78): a plain-text block Hayk pastes
// into the chat. It names the test or lesson exercise and the item number, so Claude can open the
// item in content/, and it carries the question, the answer, the right answer and the result.
// Claude answers it by explaining right away (CLAUDE.md "How to teach").
import { parseRedoTestId } from '../content/lessons.ts'
import { readingIdOf } from '../content/readings.ts'
import type { Result, ResultItem, Review } from '../content/schema.ts'

/** The first line of every block; CLAUDE.md names it, so Claude recognizes a pasted item. */
export const ASK_HEADER = 'Question about a nemeceren item'

/** Where the item comes from: "test u1-t2-...", "lesson u1-01-..., exercise u1-01-...-ex2" or "reading falsche-nummer (content/readings.json)". */
export function itemSource(result: Pick<Result, 'testId' | 'lessonId'>): string {
  if (result.lessonId) return `lesson ${result.lessonId}, exercise ${result.testId}`
  const reading = readingIdOf(result.testId)
  return reading !== null ? `reading ${reading} (content/readings.json)` : `test ${result.testId}`
}

/**
 * The source and the item number (from 1) as Claude finds them in content/: a Mistakes replay redo
 * (DECISIONS.md #81) names the test or exercise it repeats and the item's number there.
 */
export function askSource(result: Pick<Result, 'testId' | 'lessonId'>, ri: ResultItem): { source: string; number: number } {
  const redo = parseRedoTestId(result.testId)
  if (redo) return { source: `mistakes replay of ${redo.sourceId}`, number: redo.index + 1 }
  return { source: itemSource(result), number: ri.index + 1 }
}

function answerText(ri: ResultItem): string {
  if (ri.answer === null) return '(no answer)'
  if (ri.type === 'gap' && ri.gaps) return ri.gaps.map((g) => g.answer || '(empty)').join(' / ')
  return Array.isArray(ri.answer) ? ri.answer.join(' ') : ri.answer
}

export function askClaudeText(input: {
  source: string
  /** The item's number in its test or exercise, from 1. */
  number: number
  ri: ResultItem
  status: ResultItem['status']
  review: Review['items'][number] | undefined
  explanation: string | undefined
}): string {
  const { source, number, ri, status, review, explanation } = input
  const lines = [`${ASK_HEADER}: ${source}, item ${number} (${ri.type})`, `Question: ${ri.question}`, `My answer: ${answerText(ri)}`]
  if (ri.expected !== null) lines.push(`Correct answer: ${ri.expected}`)
  const near = ri.nearMiss && ri.nearMiss.length > 0 ? ` (close: ${ri.nearMiss.join(', ')})` : ''
  lines.push(`Result: ${status === 'pending' ? 'waiting for your review' : status}${near}`)
  if (review) {
    const correction = review.correction ? `, correction: ${review.correction}` : ''
    const note = review.note ? `, note: ${review.note}` : ''
    lines.push(`Your review: ${review.correct ? 'correct' : 'not correct'}${correction}${note}`)
  }
  if (explanation) lines.push(`Explanation shown: ${explanation}`)
  lines.push('Please explain this to me.')
  return lines.join('\n')
}
