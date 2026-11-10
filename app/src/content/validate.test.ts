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
    const lessons = fs.readdirSync(path.join(repoRoot, 'content/lessons')).map((n) => ({ file: `content/lessons/${n}`, text: readText(`content/lessons/${n}`) }))
    const topics = { file: 'content/topics.json', text: readText('content/topics.json') }
    const extras = { file: 'content/extras.json', text: readText('content/extras.json') }
    // Theme lessons: the folder exists once Claude wrote the first one.
    const themeDir = path.join(repoRoot, 'content/themes')
    const themes = fs.existsSync(themeDir) ? fs.readdirSync(themeDir).map((n) => ({ file: `content/themes/${n}`, text: readText(`content/themes/${n}`) })) : []
    const pairs = { file: 'content/pairs.json', text: readText('content/pairs.json') }
    const out = checkAllContent({ tests, words: { file: 'content/words.json', text: readText('content/words.json') }, lessons, themes, topics, extras, pairs })
    expect(out.problems).toEqual([])
    expect(out.pairs.length).toBeGreaterThan(0)
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
      lessons: [],
      themes: [],
      topics: { file: 't.json', text: '{ "groups": [] }' },
      extras: { file: 'e.json', text: '{ "items": [] }' },
    })
    expect(out.problems.some((p) => p.startsWith('x.json: items:'))).toBe(true)
    expect(out.problems.some((p) => p.startsWith('y.json: level:'))).toBe(true)
    expect(out.problems.some((p) => p.startsWith('z.json: not valid JSON:'))).toBe(true)
    expect(out.problems.some((p) => p.startsWith('w.json: (top level):'))).toBe(true)
    expect(out.problems.some((p) => p.startsWith('t.json: groups:'))).toBe(true)
    expect(out.problems.some((p) => p.startsWith('e.json: items:'))).toBe(true)
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
    expect(p).toEqual(['r.json: review.items[0].index: index 3 is out of range (this result has items 0)'])
  })

  it('takes review indices of a result whose skipped write items were left out', () => {
    const item = result.items[0]
    const gapped = {
      ...result,
      score: { correct: 0, wrong: 0, pending: 2, total: 2 },
      items: [item, { ...item, index: 3 }],
    }
    const r = parseResult('r.json', { ...gapped, review: { gradedAt: '2026-09-28T12:00:00Z', summary: 's', items: [{ index: 3, correct: true }] } })
    expect(r.review?.items[0].index).toBe(3)
    const p = problemsOf(() =>
      parseResult('r.json', { ...gapped, review: { gradedAt: '2026-09-28T12:00:00Z', summary: 's', items: [{ index: 1, correct: true }] } }),
    )
    expect(p).toEqual(['r.json: review.items[0].index: index 1 is out of range (this result has items 0, 3)'])
  })
})

describe('word pair validation (content/pairs.json)', () => {
  const words = {
    file: 'content/words.json',
    text: JSON.stringify([
      { id: 'langsam', de: 'langsam', en: 'slow', level: 'A1', added: '2026-11-09' },
      { id: 'schnell', de: 'schnell', en: 'fast', level: 'A1', added: '2026-11-09' },
      { id: 'schulranzen', de: 'der Schulranzen', en: 'school bag', level: 'A2', added: '2026-11-09' },
    ]),
  }
  const empty = { tests: [], lessons: [], topics: { file: 't.json', text: '{ "groups": [] }' }, extras: { file: 'e.json', text: '{ "items": [] }' } }
  const pairsFile = (pairs: unknown[]) => ({ file: 'content/pairs.json', text: JSON.stringify({ pairs }) })
  // The empty topics and extras files have problems of their own; these tests look at the pairs.
  const pairProblems = (out: { problems: string[] }) => out.problems.filter((p) => p.startsWith('content/pairs.json'))

  it('accepts real pairs and returns them', () => {
    const out = checkAllContent({ ...empty, words, themes: [], pairs: pairsFile([{ a: 'langsam', b: 'schnell', kind: 'opposite', note: 'n' }]) })
    expect(pairProblems(out)).toEqual([])
    expect(out.pairs).toEqual([{ a: 'langsam', b: 'schnell', kind: 'opposite', note: 'n' }])
  })

  it('names an unknown id, a pair repeated the other way round, a word paired with itself and an unknown kind', () => {
    const out = checkAllContent({
      ...empty,
      words,
      themes: [],
      pairs: pairsFile([
        { a: 'langsam', b: 'langsam', kind: 'synonym' },
        { a: 'langsam', b: 'flott', kind: 'antonym' },
      ]),
    })
    expect(pairProblems(out)).toEqual([
      'content/pairs.json: pairs[0].b: a word cannot be paired with itself',
      'content/pairs.json: pairs[1].kind: Invalid option: expected one of "opposite"|"synonym"',
    ])
    const twice = checkAllContent({
      ...empty,
      words,
      themes: [],
      pairs: pairsFile([
        { a: 'langsam', b: 'schnell', kind: 'opposite' },
        { a: 'schnell', b: 'langsam', kind: 'synonym' },
      ]),
    })
    expect(pairProblems(twice)).toEqual(['content/pairs.json: pairs[1]: "schnell" and "langsam" are already paired in pairs[0]'])
    const unknown = checkAllContent({ ...empty, words, themes: [], pairs: pairsFile([{ a: 'langsam', b: 'flott', kind: 'opposite' }]) })
    expect(pairProblems(unknown)).toEqual(['content/pairs.json: pairs[0].b: no word with id "flott" in content/words.json'])
  })

  it('refuses a word of a lesson for some learners only (DECISIONS.md #95): its meaning may not be in English', () => {
    const limited = {
      id: 't-schule',
      theme: { kind: 'topic', title: 'School', variety: 'standard German' },
      level: 'A1',
      title: 'School',
      summary: 'S',
      goals: ['g'],
      words: ['schulranzen'],
      onlyFor: ['elya@nemeceren.example'],
      sections: [{ type: 'tip', text: 't' }],
    }
    const out = checkAllContent({
      ...empty,
      words,
      themes: [{ file: 'content/themes/t-schule.json', text: JSON.stringify(limited) }],
      pairs: pairsFile([{ a: 'schulranzen', b: 'schnell', kind: 'synonym' }]),
    })
    expect(pairProblems(out)).toEqual(['content/pairs.json: pairs[0].a: "schulranzen" belongs to t-schule, which only some learners see (its meaning may not be in English)'])
  })
})
