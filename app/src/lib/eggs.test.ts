import { describe, expect, it } from 'vitest'
import { CARDIO_LINES, cardioFan, cardioLine } from './eggs.ts'

describe('cardio easter eggs (DECISIONS.md #116)', () => {
  it('greets only the listed learners, by name', () => {
    expect(cardioFan('anahit@nemeceren.example')).toBe('Anahit')
    expect(cardioFan('Anahit@Nemeceren.example')).toBe('Anahit')
    expect(cardioFan('armen@nemeceren.example')).toBeNull()
    expect(cardioFan(null)).toBeNull()
  })

  it('keeps one line all day and goes through every line on consecutive days', () => {
    expect(cardioLine('2026-11-10')).toBe(cardioLine('2026-11-10'))
    const days = CARDIO_LINES.map((_, i) => cardioLine(`2026-12-${String(i + 1).padStart(2, '0')}`).de)
    expect(new Set(days).size).toBe(CARDIO_LINES.length)
    expect(cardioLine('2025-06-01')).toBeDefined() // a day before the start date still gets a line
  })
})
