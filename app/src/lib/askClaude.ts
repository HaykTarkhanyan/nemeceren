// The "Ask Claude" button on an answered item (DECISIONS.md #78): a plain-text block Hayk pastes
// into the chat. It names the test or lesson exercise and the item number, so Claude can open the
// item in content/, and it carries the question, the answer, the right answer and the result.
// Claude answers it by explaining right away (CLAUDE.md "How to teach").
import type { Result, ResultItem, Review } from '../content/schema.ts'

/** The first line of every block; CLAUDE.md names it, so Claude recognizes a pasted item. */
export const ASK_HEADER = 'Question about a nemeceren item'

/** Where the item comes from: "test u1-t2-..." or "lesson u1-01-..., exercise u1-01-...-ex2". */
export function itemSource(result: Pick<Result, 'testId' | 'lessonId'>): string {
  return result.lessonId ? `lesson ${result.lessonId}, exercise ${result.testId}` : `test ${result.testId}`
}

function answerText(ri: ResultItem): string {
  if (ri.answer === null) return '(no answer)'
  if (ri.type === 'gap' && ri.gaps) return ri.gaps.map((g) => g.answer || '(empty)').join(' / ')
  return Array.isArray(ri.answer) ? ri.answer.join(' ') : ri.answer
}

export function askClaudeText(input: {
  source: string
  ri: ResultItem
  status: ResultItem['status']
  review: Review['items'][number] | undefined
  explanation: string | undefined
}): string {
  const { source, ri, status, review, explanation } = input
  const lines = [`${ASK_HEADER}: ${source}, item ${ri.index + 1} (${ri.type})`, `Question: ${ri.question}`, `My answer: ${answerText(ri)}`]
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
