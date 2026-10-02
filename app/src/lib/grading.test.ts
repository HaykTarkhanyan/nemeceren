import { describe, expect, it } from 'vitest'
import type { Item, Result } from '../content/schema.ts'
import { diffWords, finalScore, gradeItem, testStatus } from './grading.ts'

const gap: Item = { type: 'gap', text: 'Ich ___ Hayk und ich ___ aus Armenien.', answers: [['heiße'], ['komme']] }

describe('gap', () => {
  it('is correct when every gap matches', () => {
    const g = gradeItem(gap, ['heiße', ' komme '])
    expect(g.status).toBe('correct')
    expect(g.gaps?.map((x) => x.correct)).toEqual([true, true])
    expect(g.expected).toBe('Ich heiße Hayk und ich komme aus Armenien.')
  })

  it('is wrong with near-miss labels per gap and merged on the item', () => {
    const g = gradeItem(gap, ['heisse', 'Komme'])
    expect(g.status).toBe('wrong')
    expect(g.gaps?.map((x) => x.nearMiss)).toEqual([['umlaut'], ['case']])
    expect(g.nearMiss?.sort()).toEqual(['case', 'umlaut'])
  })

  it('treats an empty gap as wrong without a label', () => {
    const g = gradeItem(gap, ['heiße', ''])
    expect(g.status).toBe('wrong')
    expect(g.gaps?.[1]).toEqual({ answer: '', correct: false, nearMiss: null })
  })

  it('honours caseSensitive: false', () => {
    const item: Item = { type: 'gap', text: 'Am ___ habe ich Zeit.', answers: [['Montag']], caseSensitive: false }
    expect(gradeItem(item, ['montag']).status).toBe('correct')
  })

  it('accepts any of several answers for one gap', () => {
    const item: Item = { type: 'gap', text: 'Ich ___ aus Armenien.', answers: [['komme', 'bin']] }
    expect(gradeItem(item, ['bin']).status).toBe('correct')
  })
})

describe('order', () => {
  const item: Item = {
    type: 'order',
    tiles: ['habe', 'ich', 'einen', 'Termin', 'morgen'],
    answers: ['Morgen habe ich einen Termin', 'Ich habe morgen einen Termin'],
  }

  it('accepts any listed order, ignoring case', () => {
    expect(gradeItem(item, ['morgen', 'habe', 'ich', 'einen', 'Termin']).status).toBe('correct')
    expect(gradeItem(item, ['ich', 'habe', 'morgen', 'einen', 'Termin']).status).toBe('correct')
  })

  it('rejects a wrong verb position and incomplete sentences', () => {
    expect(gradeItem(item, ['morgen', 'ich', 'habe', 'einen', 'Termin']).status).toBe('wrong')
    expect(gradeItem(item, ['ich', 'habe']).status).toBe('wrong')
    expect(gradeItem(item, []).status).toBe('wrong')
  })
})

describe('dictation', () => {
  it('ignores punctuation but not case', () => {
    expect(diffWords('Der Termin ist am Dienstag.', 'Der Termin ist am Dienstag').every((d) => d.op === 'ok')).toBe(true)
    const d = diffWords('Der Termin ist am Dienstag.', 'der Termin ist am Dienstag')
    expect(d[0]).toEqual({ op: 'wrong', expected: 'Der', typed: 'der', nearMiss: ['case'] })
  })

  it('marks wrong, missing and extra words', () => {
    const d = diffWords('Der Termin ist am Dienstag um neun Uhr.', 'Der Termin ist am Diensttag um Uhr jetzt')
    expect(d).toEqual([
      { op: 'ok', expected: 'Der', typed: 'Der' },
      { op: 'ok', expected: 'Termin', typed: 'Termin' },
      { op: 'ok', expected: 'ist', typed: 'ist' },
      { op: 'ok', expected: 'am', typed: 'am' },
      { op: 'wrong', expected: 'Dienstag', typed: 'Diensttag' },
      { op: 'ok', expected: 'um', typed: 'um' },
      { op: 'missing', expected: 'neun' },
      { op: 'ok', expected: 'Uhr.', typed: 'Uhr' },
      { op: 'extra', typed: 'jetzt' },
    ])
  })

  it('labels umlaut slips inside a dictation', () => {
    const d = diffWords('Ich komme aus München.', 'Ich komme aus Muenchen.')
    expect(d[3]).toEqual({ op: 'wrong', expected: 'München.', typed: 'Muenchen.', nearMiss: ['umlaut'] })
  })

  it('grades the whole item', () => {
    const item: Item = { type: 'dictation', text: 'Es ist vier Uhr.' }
    expect(gradeItem(item, 'Es ist vier Uhr').status).toBe('correct')
    expect(gradeItem(item, 'Es ist vir Uhr').status).toBe('wrong')
    const empty = gradeItem(item, '')
    expect(empty.status).toBe('wrong')
    expect(empty.diff?.every((d) => d.op === 'missing')).toBe(true)
  })
})

describe('other types', () => {
  it('mc compares the chosen option text', () => {
    const item: Item = { type: 'mc', question: 'Q', options: ['a', 'b'], answer: 'b' }
    expect(gradeItem(item, 'b').status).toBe('correct')
    expect(gradeItem(item, 'a').status).toBe('wrong')
    expect(gradeItem(item, null).status).toBe('wrong')
  })

  it('translate: exact reference match is correct, anything else waits for review', () => {
    const item: Item = { type: 'translate', direction: 'en-de', text: 'I live in Munich.', references: ['Ich wohne in München.'] }
    expect(gradeItem(item, 'Ich wohne in München').status).toBe('correct')
    expect(gradeItem(item, 'Ich lebe in München.').status).toBe('pending')
    expect(gradeItem(item, '  ').status).toBe('wrong')
  })

  it('write is always pending unless empty', () => {
    const item: Item = { type: 'write', prompt: 'P' }
    expect(gradeItem(item, 'Ich heiße Hayk.').status).toBe('pending')
    expect(gradeItem(item, '').status).toBe('wrong')
  })
})

describe('finalScore', () => {
  it("lets Claude's review override auto-grades", () => {
    const base = { index: 0, type: 'write' as const, question: 'q', answer: 'a', expected: null, nearMiss: null, timeMs: 1, hintUsed: false }
    const result: Result = {
      version: 1,
      testId: 't',
      testTitle: 'T',
      level: 'A1',
      mode: 'repo',
      startedAt: '2026-09-28T10:00:00.000Z',
      submittedAt: '2026-09-28T10:05:00.000Z',
      score: { correct: 1, wrong: 0, pending: 2, total: 3 },
      items: [
        { ...base, index: 0, status: 'pending' },
        { ...base, index: 1, status: 'pending' },
        { ...base, index: 2, status: 'correct' },
      ],
      review: { gradedAt: '2026-09-28T11:00:00Z', summary: 's', items: [{ index: 0, correct: true }] },
    }
    expect(finalScore(result)).toEqual({ correct: 2, wrong: 0, pending: 1, total: 3 })
  })
})

describe('testStatus', () => {
  const item = { index: 0, type: 'mc' as const, question: 'q', answer: 'a', expected: 'a', nearMiss: null, timeMs: 1, hintUsed: false }
  const attempt = (statuses: ('correct' | 'wrong' | 'pending')[], day: string): Result => ({
    version: 1,
    testId: 't',
    testTitle: 'T',
    level: 'A1',
    mode: 'web',
    startedAt: `${day}T10:00:00.000Z`,
    localDay: day,
    submittedAt: `${day}T10:05:00.000Z`,
    score: { correct: 0, wrong: 0, pending: 0, total: statuses.length },
    items: statuses.map((status, index) => ({ ...item, index, status })),
  })

  it('is new without attempts', () => {
    expect(testStatus([])).toEqual({ kind: 'new' })
  })

  it('passes on the best attempt at 80% or more, and reports the newest attempt as last', () => {
    const older = attempt(['correct', 'correct', 'correct', 'correct', 'wrong'], '2026-10-01') // 80%
    const newer = attempt(['correct', 'wrong', 'wrong', 'wrong', 'wrong'], '2026-10-02') // 20%
    const s = testStatus([newer, older])
    expect(s).toMatchObject({ kind: 'passed', attempts: 2, bestPercent: 80, lastDay: '2026-10-02', waiting: 0 })
  })

  it('is tried below 80%, counts pending answers as not correct, and flags them as waiting', () => {
    const s = testStatus([attempt(['correct', 'correct', 'correct', 'pending', 'wrong'], '2026-10-02')])
    expect(s).toMatchObject({ kind: 'tried', bestPercent: 60, waiting: 1 })
  })
})
