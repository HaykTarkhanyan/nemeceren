import { describe, expect, it } from 'vitest'
import type { ExtraItem } from '../content/schema.ts'
import { ContentError, parseExtras } from '../content/validate.ts'
import { glossEnabled } from '../glossary/gate.ts'
import { extrasCountText, filterExtras, listLabel, surprise } from './extras.ts'

const item = (id: string, type: ExtraItem['type'], lines = 1): ExtraItem => ({
  id,
  type,
  title: `${id} title`,
  lines: Array.from({ length: lines }, (_, i) => ({ de: `${id} line ${i + 1}`, en: `en ${i + 1}` })),
  breakdown: [{ de: 'Hallo', en: 'hello' }],
  explain: 'E',
})
const items = [item('j01', 'joke', 2), item('f01', 'fact'), item('p01', 'phrase'), item('j02', 'joke', 3)]

function problemsOf(data: unknown): string[] {
  try {
    parseExtras('content/extras.json', data)
  } catch (err) {
    if (err instanceof ContentError) return err.problems
    throw err
  }
  throw new Error('expected a ContentError')
}

describe('extras.json validation', () => {
  it('accepts any number of items per type, in any order', () => {
    expect(parseExtras('e.json', { items }).items).toHaveLength(4)
  })

  it('wants unique ids whose letter matches the type', () => {
    expect(problemsOf({ items: [item('j01', 'joke', 2), item('j01', 'joke', 2)] })).toEqual(['content/extras.json: items[1].id: duplicate id "j01"'])
    expect(problemsOf({ items: [item('p02', 'fact')] })).toEqual(['content/extras.json: items[0].id: a fact id starts with "f"'])
    expect(problemsOf({ items: [{ ...item('f01', 'fact'), id: 'fact1' }] })[0]).toMatch(/items\[0\]\.id: must be j, f or p followed by 2 or more digits/)
  })

  it('wants jokes with a setup and a punchline, and a non-empty breakdown', () => {
    expect(problemsOf({ items: [item('j01', 'joke', 1)] })).toEqual(['content/extras.json: items[0].lines: a joke needs 2 or more lines (setup and punchline)'])
    expect(problemsOf({ items: [{ ...item('f01', 'fact'), breakdown: [] }] })[0]).toMatch(/^content\/extras\.json: items\[0\]\.breakdown:/)
  })

  it('rejects unknown keys and an empty list', () => {
    expect(problemsOf({ items: [{ ...item('f01', 'fact'), date: '2026-09-29' }] })[0]).toMatch(/items\[0\]: Unrecognized key.*date/)
    expect(problemsOf({ items: [] })[0]).toMatch(/^content\/extras\.json: items:/)
    expect(problemsOf({ startDate: '2026-09-29', items })[0]).toMatch(/Unrecognized key.*startDate/)
  })
})

describe('the Extras page', () => {
  it('filters by type', () => {
    expect(filterExtras(items, 'all')).toHaveLength(4)
    expect(filterExtras(items, 'joke').map((it) => it.id)).toEqual(['j01', 'j02'])
    expect(filterExtras(items, 'phrase').map((it) => it.id)).toEqual(['p01'])
  })

  it('lists a joke by its first line, never by its title (the title gives the punchline away)', () => {
    expect(listLabel(items[0])).toBe('j01 line 1')
    expect(listLabel(items[3])).toBe('j02 line 1')
    expect(listLabel(items[1])).toBe('f01 title')
    expect(listLabel(items[2])).toBe('p01 title')
  })

  it('surprises with an item of the current filter, not the same one twice in a row', () => {
    const jokes = filterExtras(items, 'joke')
    expect(surprise(jokes, null, () => 0).id).toBe('j01')
    expect(surprise(jokes, 'j01', () => 0).id).toBe('j02')
    expect(surprise(jokes, 'j01', () => 0.99).id).toBe('j02')
    expect(surprise([items[1]], 'f01', () => 0.5).id).toBe('f01')
    expect(() => surprise([], null, () => 0)).toThrow(/no items/)
  })

  it('prints the counts per type for check-content', () => {
    expect(extrasCountText(items)).toBe('Extras page: 4 items (jokes 2, facts 1, phrases 1).')
  })

  it('never has word popups', () => {
    expect(glossEnabled({ kind: 'extras' })).toBe(false)
  })
})
