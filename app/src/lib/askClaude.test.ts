import { describe, expect, it } from 'vitest'
import type { ResultItem } from '../content/schema.ts'
import { ASK_HEADER, askClaudeText, askSource, itemSource } from './askClaude.ts'

const ri = (extra: Partial<ResultItem> = {}): ResultItem => ({
  index: 2,
  type: 'mc',
  question: 'Ich ___ Hayk.',
  answer: 'bist',
  expected: 'heiße',
  status: 'wrong',
  nearMiss: null,
  timeMs: 4000,
  hintUsed: false,
  ...extra,
})

describe('askClaudeText', () => {
  it('names the source and item and carries question, answers and result', () => {
    const text = askClaudeText({ source: itemSource({ testId: 'u1-t1-x' }), number: 3, ri: ri(), status: 'wrong', review: undefined, explanation: 'ich heiße' })
    expect(text.split('\n')).toEqual([
      `${ASK_HEADER}: test u1-t1-x, item 3 (mc)`,
      'Question: Ich ___ Hayk.',
      'My answer: bist',
      'Correct answer: heiße',
      'Result: wrong',
      'Explanation shown: ich heiße',
      'Please explain this to me.',
    ])
  })

  it('names a lesson exercise, joins gap answers and shows near misses and the review', () => {
    const gap = ri({
      type: 'gap',
      answer: ['bin', ''],
      gaps: [
        { answer: 'bin', correct: true, nearMiss: null },
        { answer: '', correct: false, nearMiss: null },
      ],
      expected: 'bin / Hayk',
      nearMiss: ['case'],
    })
    const text = askClaudeText({
      source: itemSource({ testId: 'u1-01-x-ex2', lessonId: 'u1-01-x' }),
      number: 3,
      ri: gap,
      status: 'wrong',
      review: { index: 2, correct: false, correction: 'Ich bin Hayk.' },
      explanation: undefined,
    })
    expect(text).toContain('lesson u1-01-x, exercise u1-01-x-ex2, item 3 (gap)')
    expect(text).toContain('My answer: bin / (empty)')
    expect(text).toContain('Result: wrong (close: case)')
    expect(text).toContain('Your review: not correct, correction: Ich bin Hayk.')
  })

  it('says when an item is still waiting for review', () => {
    const text = askClaudeText({ source: 'test t', number: 3, ri: ri({ type: 'write', expected: null, status: 'pending' }), status: 'pending', review: undefined, explanation: undefined })
    expect(text).toContain('Result: waiting for your review')
    expect(text).not.toContain('Correct answer')
  })
})

describe('askSource', () => {
  it('names the repeated test and the item number there for a Mistakes replay redo', () => {
    expect(askSource({ testId: 'm-u1-t1-x-i6' }, ri({ index: 0 }))).toEqual({ source: 'mistakes replay of u1-t1-x', number: 7 })
    expect(askSource({ testId: 'u1-t1-x' }, ri({ index: 2 }))).toEqual({ source: 'test u1-t1-x', number: 3 })
  })
})
