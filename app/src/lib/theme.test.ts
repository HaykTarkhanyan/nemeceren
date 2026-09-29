import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTheme, readTheme, resolveTheme } from './theme.ts'

describe('theme choice', () => {
  afterEach(() => vi.restoreAllMocks())

  it('cycles System, Light, Dark', () => {
    expect([nextTheme('system'), nextTheme('light'), nextTheme('dark')]).toEqual(['light', 'dark', 'system'])
  })

  it('resolves System from the device setting', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('reads the saved choice, System when there is none', () => {
    expect(readTheme({ getItem: () => 'dark' })).toBe('dark')
    expect(readTheme({ getItem: () => null })).toBe('system')
  })

  it('falls back to System loudly when storage fails or holds an unknown value', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const blocked = {
      getItem: (): string | null => {
        throw new Error('SecurityError: storage is disabled')
      },
    }
    expect(readTheme(blocked)).toBe('system')
    expect(readTheme({ getItem: () => 'blue' })).toBe('system')
    expect(logged.mock.calls.map((c) => String(c[0]))).toEqual([
      'The theme choice cannot be read on this device, so the app follows the system theme: SecurityError: storage is disabled',
      'The saved theme "blue" is unknown, so the app follows the system theme.',
    ])
  })
})
