import { describe, expect, it } from 'vitest'
import { pickWordSource } from './wordReview.ts'

describe('picking where the review words come from (the Words page "Words from")', () => {
  it('keeps no page-local pick after a successful save, so a later save elsewhere (Map, test station) wins', () => {
    const saved: string[] = []
    expect(pickWordSource('unit:2', (k) => saved.push(k))).toEqual({ picked: null, problem: null })
    expect(saved).toEqual(['unit:2'])
  })

  it('keeps the pick on the page when this device cannot save it, and says why', () => {
    const out = pickWordSource('unit:2', () => {
      throw new Error('quota exceeded')
    })
    expect(out.picked).toBe('unit:2')
    expect(out.problem).toContain('quota exceeded')
  })
})
