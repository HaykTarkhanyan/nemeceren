import { describe, expect, it } from 'vitest'
import { checkWord, compareText, countWords, matchAny } from './text.ts'

describe('compareText', () => {
  it('accepts exact matches after trimming and collapsing whitespace', () => {
    expect(compareText('  ich   heiße ', 'ich heiße')).toEqual({ correct: true, nearMiss: null })
  })

  it('is case-sensitive by default and labels case-only differences', () => {
    expect(compareText('termin', 'Termin')).toEqual({ correct: false, nearMiss: ['case'] })
  })

  it('accepts case differences when caseSensitive is false', () => {
    expect(compareText('termin', 'Termin', false)).toEqual({ correct: true, nearMiss: null })
  })

  it('labels ae/oe/ue/ss spellings as umlaut near misses', () => {
    expect(compareText('heisse', 'heiße')).toEqual({ correct: false, nearMiss: ['umlaut'] })
    expect(compareText('fuer', 'für')).toEqual({ correct: false, nearMiss: ['umlaut'] })
    expect(compareText('Strasse', 'Straße')).toEqual({ correct: false, nearMiss: ['umlaut'] })
  })

  it('labels missing umlaut dots as umlaut near misses', () => {
    expect(compareText('fur', 'für')).toEqual({ correct: false, nearMiss: ['umlaut'] })
    expect(compareText('Lander', 'Länder')).toEqual({ correct: false, nearMiss: ['umlaut'] })
  })

  it('labels case plus umlaut together', () => {
    expect(compareText('laender', 'Länder')).toEqual({ correct: false, nearMiss: ['case', 'umlaut'] })
  })

  it('gives no label for a plainly wrong answer', () => {
    expect(compareText('komme', 'heiße')).toEqual({ correct: false, nearMiss: null })
  })
})

describe('matchAny', () => {
  it('prefers an exact match over an earlier near miss', () => {
    const m = matchAny('Mein Name', ['mein name', 'Mein Name'])
    expect(m.correct).toBe(true)
    expect(m.closest).toBe('Mein Name')
  })

  it('reports the first near miss when nothing matches', () => {
    expect(matchAny('heisse', ['heiße', 'bin'])).toEqual({ correct: false, nearMiss: ['umlaut'], closest: 'heiße' })
  })
})

describe('checkWord', () => {
  it('accepts noun with article, article capitalization does not matter', () => {
    expect(checkWord('der Termin', 'der Termin').correct).toBe(true)
    expect(checkWord('Der Termin', 'der Termin').correct).toBe(true)
  })

  it('flags a missing article', () => {
    expect(checkWord('Termin', 'der Termin')).toEqual({ correct: false, nearMiss: ['article_missing'] })
  })

  it('flags a wrong article', () => {
    expect(checkWord('die Termin', 'der Termin')).toEqual({ correct: false, nearMiss: ['article_wrong'] })
  })

  it('combines article and spelling labels', () => {
    expect(checkWord('Lander', 'das Land')).toEqual({ correct: false, nearMiss: null })
    expect(checkWord('die Lander', 'die Länder')).toEqual({ correct: false, nearMiss: ['umlaut'] })
    expect(checkWord('Laender', 'die Länder')).toEqual({ correct: false, nearMiss: ['article_missing', 'umlaut'] })
  })

  it('checks non-nouns as plain text, noun capitalization matters', () => {
    expect(checkWord('heißen', 'heißen').correct).toBe(true)
    expect(checkWord('der termin', 'der Termin')).toEqual({ correct: false, nearMiss: ['case'] })
  })
})

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('  Ich heiße   Hayk. ')).toBe(3)
    expect(countWords('   ')).toBe(0)
  })
})
