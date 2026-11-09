import { describe, expect, it } from 'vitest'
import { alignChars, closestAnswer, MARK_LETTERS_FROM, similarity } from './charDiff.ts'

const line = (cells: ReturnType<typeof alignChars>, side: 'typed' | 'expected') => cells.map((c) => c[side] ?? '_').join('')

describe('letter diff of a typed answer (DECISIONS.md #103)', () => {
  it('marks one wrong letter as one changed column', () => {
    const cells = alignChars('der Tish', 'der Tisch')
    expect(line(cells, 'typed')).toBe('der Tis_h')
    expect(line(cells, 'expected')).toBe('der Tisch')
    expect(cells.filter((c) => c.op === 'missing').map((c) => c.expected)).toEqual(['c'])
    expect(alignChars('Strase', 'Straße').filter((c) => c.op !== 'same')).toEqual([{ typed: 's', expected: 'ß', op: 'changed' }])
  })

  it('shows an extra letter in the typed line only, and counts case as a difference', () => {
    const cells = alignChars('Hallloo', 'Hallo')
    expect(line(cells, 'typed')).toBe('Hallloo')
    expect(cells.filter((c) => c.op === 'extra')).toHaveLength(2)
    expect(alignChars('tisch', 'Tisch')[0]).toEqual({ typed: 't', expected: 'T', op: 'changed' })
  })

  it('marks letters only when the answers are close; identical ones are fully the same', () => {
    expect(similarity(alignChars('der Tisch', 'der Tisch'))).toBe(1)
    expect(similarity(alignChars('der Tish', 'der Tisch'))).toBeGreaterThanOrEqual(MARK_LETTERS_FROM)
    expect(similarity(alignChars('Auto', 'das Fenster'))).toBeLessThan(MARK_LETTERS_FROM)
    expect(alignChars('', 'Hallo').every((c) => c.op === 'missing')).toBe(true)
  })
})

describe('closest accepted answer', () => {
  it('lines a typo up with the accepted answer it was meant to be', () => {
    expect(closestAnswer('bim', ['bin', 'komme'])).toBe('bin')
    expect(closestAnswer('komen', ['bin', 'komme'])).toBe('komme')
    expect(() => closestAnswer('x', [])).toThrow()
  })
})
