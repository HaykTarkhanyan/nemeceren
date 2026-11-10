import { describe, expect, it } from 'vitest'
import { afterAnswer, answerZones, clock, startZones, toNextZone, zoneOf, zoneTimes } from './zones.ts'

describe('zone meter (DECISIONS.md #116)', () => {
  it('starts the zones at the Fibonacci runs 3, 5, 8 and 13', () => {
    expect([0, 2, 3, 4, 5, 7, 8, 12, 13, 40].map(zoneOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  })

  it('drops one zone on a miss, and back to 0 in Zone 1', () => {
    expect(afterAnswer(2, false)).toBe(0)
    expect(afterAnswer(4, false)).toBe(0)
    expect(afterAnswer(7, false)).toBe(3)
    expect(afterAnswer(12, false)).toBe(5)
    expect(afterAnswer(20, false)).toBe(8)
    expect(afterAnswer(20, true)).toBe(21)
  })

  it('counts the right answers to the next zone', () => {
    expect(toNextZone(0)).toBe(3)
    expect(toNextZone(4)).toBe(1)
    expect(toNextZone(12)).toBe(1)
    expect(toNextZone(13)).toBeNull()
  })

  it('adds up the time in each zone and keeps the highest zone', () => {
    let s = startZones(0)
    for (let i = 1; i <= 3; i++) s = answerZones(s, true, i * 10_000) // Zone 2 at 30 s
    expect(s.top).toBe(2)
    s = answerZones(s, false, 50_000) // back to Zone 1 at 50 s
    expect(s.top).toBe(2)
    expect(zoneTimes(s, 60_000)).toEqual([40_000, 20_000, 0, 0, 0])
  })

  it('formats minutes and seconds', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(65_400)).toBe('1:05')
    expect(clock(600_000)).toBe('10:00')
  })
})
