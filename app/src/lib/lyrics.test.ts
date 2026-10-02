import { describe, expect, it } from 'vitest'
import { makeGlossary } from '../glossary/lookup.ts'
import { wordCounts } from './lyrics.ts'

const g = makeGlossary(
  {
    source: 'test',
    entries: {
      trinken: [{ lemma: 'trinken', pos: 'verb', gloss: ['to drink'] }],
      trinkt: [{ lemma: 'trinken', pos: 'verb', form: 'er/sie/es form, present', gloss: ['to drink'] }],
      wir: [{ lemma: 'wir', pos: 'pronoun', gloss: ['we'] }],
    },
  },
  { entries: {}, ignore: [] },
)

describe('wordCounts', () => {
  const lines = ['Wir trinken, wir trinken!', 'Er trinkt Wasser.']

  it('counts lines, all words, and distinct forms ignoring case', () => {
    expect(wordCounts(lines, null)).toEqual({ lines: 2, words: 7, forms: 5, lemmas: null })
  })

  it('merges forms with the same base form once the glossary is there', () => {
    // wir, trinken (trinken + trinkt), er, wasser
    expect(wordCounts(lines, g).lemmas).toBe(4)
  })
})
