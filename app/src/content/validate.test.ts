import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkAllContent, ContentError, parseResult, parseTest, parseWords } from './validate.ts'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const readText = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

function problemsOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (err) {
    if (err instanceof ContentError) return err.problems
    throw err
  }
  throw new Error('expected a ContentError')
}

const baseTest = { id: 'x', title: 'T', level: 'A1', created: '2026-09-28' }
const withItems = (...items: unknown[]) => ({ ...baseTest, items })

describe('the seed content', () => {
  it('is valid', () => {
    const dir = path.join(repoRoot, 'content/tests')
    const tests = fs.readdirSync(dir).map((n) => ({ file: `content/tests/${n}`, text: readText(`content/tests/${n}`) }))
    const out = checkAllContent({ tests, words: { file: 'content/words.json', text: readText('content/words.json') } })
    expect(out.problems).toEqual([])
    expect(out.tests.length).toBeGreaterThan(0)
    const types = new Set(out.tests.flatMap((t) => t.items.map((i) => i.type)))
    expect([...types].sort()).toEqual(['dictation', 'gap', 'listen_mc', 'mc', 'order', 'translate', 'write'])
  })
})

describe('test validation names the file and field', () => {
  it('mc answer must be one of the options', () => {
    const p = problemsOf(() => parseTest('x.json', withItems({ type: 'mc', question: 'Q', options: ['a', 'b'], answer: 'c' })))
    expect(p).toEqual(['x.json: items[0].answer: "c" is not one of the options'])
  })

  it('gap count must match answers', () => {
    const p = problemsOf(() => parseTest('x.json', withItems({ type: 'gap', text: 'Ich ___ Hayk.', answers: [['heiße'], ['x']] })))
    expect(p[0]).toMatch(/^x\.json: items\[0\]\.answers: text has 1 gap\(s\)/)
  })

  it('order answers must use exactly the tiles', () => {
    const p = problemsOf(() =>
      parseTest('x.json', withItems({ type: 'order', tiles: ['ich', 'habe', 'Zeit'], answers: ['Ich habe keine Zeit'] })),
    )
    expect(p[0]).toMatch(/^x\.json: items\[0\]\.answers\[0\]: "Ich habe keine Zeit" does not use exactly the tiles/)
  })

  it('rejects unknown keys (typos) and unknown types', () => {
    const typo = problemsOf(() => parseTest('x.json', withItems({ type: 'dictation', text: 'Hallo', explanaton: 'typo' })))
    expect(typo[0]).toMatch(/^x\.json: items\[0\]: Unrecognized key.*explanaton/)
    const badType = problemsOf(() => parseTest('x.json', withItems({ type: 'essay', prompt: 'P' })))
    expect(badType[0]).toMatch(/^x\.json: items\[0\]\.type: "type" must be one of: mc, gap, order/)
  })

  it('requires the id to match the file name', () => {
    const p = problemsOf(() => parseTest('content/tests/other.json', withItems({ type: 'dictation', text: 'Hallo' })))
    expect(p).toEqual(['content/tests/other.json: id: "x" must match the file name ("other")'])
  })

  it('collects problems from several files at once, including JSON syntax errors', () => {
    const out = checkAllContent({
      tests: [
        { file: 'x.json', text: JSON.stringify(withItems()) },
        { file: 'y.json', text: JSON.stringify({ ...baseTest, id: 'y', level: 'C9', items: [{ type: 'write', prompt: 'P' }] }) },
        { file: 'z.json', text: '{ "id": "z", ' },
      ],
      words: { file: 'w.json', text: '[]' },
    })
    expect(out.problems.some((p) => p.startsWith('x.json: items:'))).toBe(true)
    expect(out.problems.some((p) => p.startsWith('y.json: level:'))).toBe(true)
    expect(out.problems.some((p) => p.startsWith('z.json: not valid JSON:'))).toBe(true)
    expect(out.problems.some((p) => p.startsWith('w.json: (top level):'))).toBe(true)
  })
})

describe('word validation', () => {
  const w = { id: 'termin', de: 'der Termin', plural: 'die Termine', en: 'appointment', level: 'A1', added: '2026-09-28' }

  it('accepts a noun with article and plural', () => {
    expect(parseWords('w.json', [w])).toHaveLength(1)
  })

  it('needs an article when a plural is given, and a full plural', () => {
    const p = problemsOf(() => parseWords('w.json', [{ ...w, de: 'Termin', plural: 'Termine' }]))
    expect(p).toEqual([
      'w.json: [0].de: a word with a plural is a noun, so "de" must start with der/die/das',
      'w.json: [0].plural: write the full plural with its article, e.g. "die Termine"',
    ])
  })

  it('rejects duplicate ids', () => {
    const p = problemsOf(() => parseWords('w.json', [w, w]))
    expect(p).toEqual(['w.json: [1].id: duplicate word id "termin"'])
  })
})

describe('result review validation', () => {
  const result = {
    version: 1,
    testId: 'x',
    testTitle: 'T',
    level: 'A1',
    mode: 'repo',
    startedAt: '2026-09-28T10:00:00.000Z',
    submittedAt: '2026-09-28T10:05:00.000Z',
    score: { correct: 0, wrong: 0, pending: 1, total: 1 },
    items: [
      { index: 0, type: 'write', question: 'q', answer: 'a', expected: null, status: 'pending', nearMiss: null, timeMs: 5, hintUsed: false },
    ],
  }

  it('accepts a well-formed review', () => {
    const r = parseResult('r.json', { ...result, review: { gradedAt: '2026-09-28T12:00:00Z', summary: 'Gut!', items: [{ index: 0, correct: true, note: 'ok' }] } })
    expect(r.review?.items[0].correct).toBe(true)
  })

  it('rejects a bad gradedAt and a missing summary', () => {
    const p = problemsOf(() =>
      parseResult('r.json', { ...result, review: { gradedAt: 'yesterday', items: [{ index: 3, correct: true }] } }),
    )
    expect(p.some((x) => x.startsWith('r.json: review.gradedAt:'))).toBe(true)
    expect(p.some((x) => x.startsWith('r.json: review.summary:'))).toBe(true)
  })

  it('rejects an out-of-range review index', () => {
    const p = problemsOf(() =>
      parseResult('r.json', { ...result, review: { gradedAt: '2026-09-28T12:00:00Z', summary: 's', items: [{ index: 3, correct: true }] } }),
    )
    expect(p).toEqual(['r.json: review.items[0].index: index 3 is out of range (this result has items 0-0)'])
  })
})
