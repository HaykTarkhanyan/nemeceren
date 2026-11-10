import { describe, expect, it } from 'vitest'
import { setAudioSession } from './audioSession.ts'

describe('audio session for reading aloud (DECISIONS.md #117)', () => {
  it('switches the type where the browser has navigator.audioSession', () => {
    const nav = { audioSession: { type: 'auto' } }
    setAudioSession('playback', nav)
    expect(nav.audioSession.type).toBe('playback')
    setAudioSession('auto', nav)
    expect(nav.audioSession.type).toBe('auto')
  })

  it('does nothing in browsers without it', () => {
    expect(() => setAudioSession('playback', {})).not.toThrow()
    expect(() => setAudioSession('playback', undefined)).not.toThrow()
  })
})
