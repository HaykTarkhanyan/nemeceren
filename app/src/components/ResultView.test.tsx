import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Item, Result, ResultItem } from '../content/schema.ts'
import { ResultView } from './ResultView.tsx'

const mc: Item = { type: 'mc', question: 'Wie heißen Sie?', questionLang: 'de', options: ['Ich heiße Eva.', 'Gut, danke.'], answer: 'Ich heiße Eva.' }
const write: Item = { type: 'write', prompt: 'Write about yourself.', promptLang: 'en' }
const tr: Item = { type: 'translate', direction: 'en-de', text: 'I live in Munich.', references: ['Ich wohne in München.'] }
const items: Item[] = [mc, write, tr, write]

const base = { question: 'q', expected: null, nearMiss: null, timeMs: 1000, hintUsed: false }
// Items 1 and 3 (the write items) were skipped, so the attempt has indices 0 and 2 only.
const saved: ResultItem[] = [
  { ...base, index: 0, type: 'mc', question: 'Wie heißen Sie?', answer: 'Ich heiße Eva.', expected: 'Ich heiße Eva.', status: 'correct' },
  { ...base, index: 2, type: 'translate', question: 'Translate (en-de): I live in Munich.', answer: 'Ich lebe in München.', expected: 'Ich wohne in München.', status: 'pending' },
]
const result: Result = {
  version: 1,
  testId: 'u1-t1-x',
  testTitle: 'T',
  level: 'A1',
  mode: 'web',
  startedAt: '2026-11-10T10:00:00.000Z',
  localDay: '2026-11-10',
  submittedAt: '2026-11-10T10:05:00.000Z',
  score: { correct: 1, wrong: 0, pending: 1, total: 2 },
  items: saved,
}
const render = (r: Result, its: Item[] | undefined) => renderToStaticMarkup(<ResultView result={r} items={its} />)

describe('ResultView of an attempt with skipped write items', () => {
  it('renders the saved items under their own numbers and says how many writes were skipped', () => {
    const html = render(result, items)
    expect(html).toContain('2 writing tasks skipped (needs Claude), not counted in the score.')
    expect(html).toContain('1. Multiple choice')
    expect(html).toContain('3. Translation')
    expect(html).not.toContain('Writing')
    expect(html).toContain('1 / 2')
  })

  it("uses Claude's verdict for the item it names, not the item at that position", () => {
    const html = render({ ...result, review: { gradedAt: '2026-11-10T12:00:00Z', summary: 'Fine.', items: [{ index: 2, correct: true }] } }, items)
    expect(html).toContain('2 / 2')
    expect(html).not.toContain('Waiting for Claude')
  })

  it('shows no skip line when nothing was left out, or when the items no longer exist', () => {
    const full: Result = { ...result, items: [saved[0]], score: { correct: 1, wrong: 0, pending: 0, total: 1 } }
    expect(render(full, [mc])).not.toContain('skipped')
    expect(render(result, undefined)).not.toContain('skipped')
    expect(render(result, undefined)).toContain('3. Translation')
  })
})
