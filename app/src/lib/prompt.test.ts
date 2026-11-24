import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { promptOf } from './prompt.ts'

const wordsFile = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../content/words.json', import.meta.url)), 'utf8')) as
  | { id: string; en: string }[]
  | { words: { id: string; en: string }[] }
const allWords = Array.isArray(wordsFile) ? wordsFile : wordsFile.words

describe('the English question hides notes that give the answer away (DECISIONS.md #120)', () => {
  it('hides conjugated forms, German letters, wrong spellings, literal translations, false friends and "x = y"', () => {
    expect(promptOf('to walk; to run (er läuft)')).toBe('to walk; to run')
    expect(promptOf('to speak (du sprichst, er spricht)')).toBe('to speak')
    expect(promptOf('thirty (with ß)')).toBe('thirty')
    expect(promptOf('sixteen (not sechs-zehn)')).toBe('sixteen')
    expect(promptOf("Wednesday (literally 'mid-week')")).toBe('Wednesday')
    expect(promptOf('twenty-one (literally: one-and-twenty)')).toBe('twenty-one')
    expect(promptOf("to get, to receive (not 'to become')")).toBe('to get, to receive')
    expect(promptOf('to wait (auf = for)')).toBe('to wait')
    expect(promptOf('Switzerland (always with die)')).toBe('Switzerland')
    expect(promptOf('to take; to have (food or a drink) (du nimmst, er nimmt)')).toBe('to take; to have (food or a drink)')
  })

  it('keeps the notes that tell cards apart', () => {
    for (const en of ['hello, hi (informal)', 'hello, good day (polite)', 'teacher (male)', 'to begin, to start (not separable)', "yes (against a 'not' question)", 'letter (of the alphabet)', 'no, not a (with nouns)']) {
      expect(promptOf(en)).toBe(en)
    }
  })

  it('never leaves a card with an empty question, and no real card keeps a conjugated form in it', () => {
    expect(allWords.length).toBeGreaterThan(1000)
    for (const w of allWords) {
      const q = promptOf(w.en)
      expect(q, w.id).not.toBe('')
      expect(q, w.id).not.toMatch(/\((ich|du|er|sie|es|wir|ihr) /)
    }
  })
})
