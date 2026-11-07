import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markMilestoneSeen, markNoticeSeen, milestoneSeen, noticeSeen, readOpenUnits, writeOpenUnits } from './homeView.ts'

let store: Map<string, string>

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('what Home remembers on this device', () => {
  it('folded units round-trip', () => {
    expect(readOpenUnits()).toEqual({})
    writeOpenUnits({ '0': false, '2': true })
    expect(readOpenUnits()).toEqual({ '0': false, '2': true })
  })

  it('the change notice is seen once dismissed', () => {
    expect(noticeSeen()).toBe(false)
    markNoticeSeen()
    expect(noticeSeen()).toBe(true)
  })

  it('a milestone is seen per milestone and day', () => {
    markMilestoneSeen(7, '2026-11-14')
    expect(milestoneSeen(7, '2026-11-14')).toBe(true)
    expect(milestoneSeen(7, '2026-11-21')).toBe(false)
    expect(milestoneSeen(30, '2026-11-14')).toBe(false)
  })

  it('bad JSON in the folds reports an error and starts folded', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    store.set('nemeceren.pathOpenUnits', '{not json')
    expect(readOpenUnits()).toEqual({})
    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0][0])).toMatch(/nemeceren\.pathOpenUnits/)
  })

  it('a storage that throws is reported, not silent', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(noticeSeen()).toBe(false)
    markNoticeSeen()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
