import { describe, expect, it } from 'vitest'
import { bestAlternative, compareSpoken, numberWord, spokenWords } from './speaking.ts'

describe('numberWord', () => {
  it('writes 0-100 as German words', () => {
    expect(numberWord(0)).toBe('null')
    expect(numberWord(1)).toBe('eins')
    expect(numberWord(17)).toBe('siebzehn')
    expect(numberWord(21)).toBe('einundzwanzig')
    expect(numberWord(35)).toBe('fünfunddreißig')
    expect(numberWord(70)).toBe('siebzig')
    expect(numberWord(100)).toBe('hundert')
    expect(numberWord(101)).toBeNull()
  })
})

describe('spokenWords', () => {
  it('ignores case and punctuation and writes digits as words', () => {
    expect(spokenWords('Ich bin 21, und du?')).toEqual(['ich', 'bin', 'einundzwanzig', 'und', 'du'])
  })
})

describe('compareSpoken', () => {
  it('marks every word heard for a perfect match, whatever the punctuation and case', () => {
    const out = compareSpoken('Guten Morgen! Wie geht es Ihnen?', 'guten Morgen wie geht es ihnen')
    expect(out.score).toBe(1)
    expect(out.words.every((w) => w.heard)).toBe(true)
    expect(out.words.map((w) => w.text)).toEqual(['Guten', 'Morgen!', 'Wie', 'geht', 'es', 'Ihnen?'])
  })

  it('marks a missed word without shifting the rest', () => {
    const out = compareSpoken('Ich wohne in München.', 'ich wohne München')
    expect(out.words.map((w) => w.heard)).toEqual([true, true, false, true])
    expect(out.score).toBe(0.75)
  })

  it('treats a recognized digit as the number word', () => {
    expect(compareSpoken('Ich bin dreißig.', 'ich bin 30').score).toBe(1)
  })

  it('scores nothing heard as 0', () => {
    expect(compareSpoken('Hallo', '').score).toBe(0)
  })
})

describe('bestAlternative', () => {
  it('picks the alternative closest to the line', () => {
    expect(bestAlternative('Ich heiße Hayk.', ['ich weiß hallo', 'ich heiße Hayk', 'ich heiße'])).toBe('ich heiße Hayk')
  })
})
