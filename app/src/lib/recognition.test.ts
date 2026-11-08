import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeRecognizer, STOP_GRACE_MS } from './recognition.ts'
import type { Heard, Recognition } from './recognition.ts'

/** A stand-in for the browser's SpeechRecognition: the test fires its events by hand. */
class FakeRecognition implements Recognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = true
  interimResults = true
  maxAlternatives = 1
  onresult: Recognition['onresult'] = null
  onerror: Recognition['onerror'] = null
  onend: Recognition['onend'] = null
  aborted = false
  constructor() {
    FakeRecognition.last = this
  }
  start() {}
  stop() {
    this.onend?.()
  }
  abort() {
    this.aborted = true
  }
  hear(...alternatives: string[]) {
    this.onresult?.({ results: [alternatives.map((transcript) => ({ transcript }))] })
    this.onend?.()
  }
}

/** Like Chrome on some Android phones: stop() is accepted, but the session never ends by itself. */
class StuckRecognition extends FakeRecognition {
  stop() {}
}

function setup(ctor: new () => Recognition = FakeRecognition) {
  const listening: boolean[] = []
  const reported: string[] = []
  const heard: Heard[] = []
  const r = makeRecognizer(
    () => ctor,
    (on) => listening.push(on),
    (m) => reported.push(m),
  )
  return { r, listening, reported, heard, onDone: (h: Heard) => heard.push(h) }
}

describe('speech recognition for the games (makeRecognizer)', () => {
  it('listens once in German and calls back with what was heard', () => {
    const s = setup()
    s.r.listen(s.onDone)
    expect(FakeRecognition.last!.lang).toBe('de-DE')
    FakeRecognition.last!.hear('Hallo', 'hallo')
    expect(s.heard).toEqual([{ kind: 'heard', alternatives: ['Hallo', 'hallo'] }])
    expect(s.listening).toEqual([true, false])
  })

  it('after cancel (Skip, Type instead, the next card) a late result is dropped and the mic shows idle', () => {
    const s = setup()
    s.r.listen(s.onDone)
    const rec = FakeRecognition.last!
    s.r.cancel()
    expect(rec.aborted).toBe(true)
    expect(s.listening).toEqual([true, false])
    rec.hear('Tisch')
    expect(s.heard).toEqual([])
  })

  it('a new listen drops the result of the one before', () => {
    const s = setup()
    s.r.listen(s.onDone)
    const first = FakeRecognition.last!
    s.r.listen(s.onDone)
    first.hear('alt')
    FakeRecognition.last!.hear('neu')
    expect(s.heard).toEqual([{ kind: 'heard', alternatives: ['neu'] }])
  })

  it('"nothing heard" is a note; a blocked mic is reported and says so', () => {
    const s = setup()
    s.r.listen(s.onDone)
    FakeRecognition.last!.onerror?.({ error: 'no-speech' })
    FakeRecognition.last!.onend?.()
    s.r.listen(s.onDone)
    FakeRecognition.last!.onerror?.({ error: 'not-allowed' })
    FakeRecognition.last!.onend?.()
    expect(s.heard.map((h) => h.kind === 'none' && h.blocked)).toEqual([false, true])
    expect(s.reported).toHaveLength(1)
  })

  describe('Stop (tap while listening)', () => {
    afterEach(() => vi.useRealTimers())

    it('answers at once, and finishes the listen itself when the browser never ends it', () => {
      vi.useFakeTimers()
      const s = setup(StuckRecognition)
      s.r.listen(s.onDone)
      const rec = FakeRecognition.last!
      s.r.stop()
      expect(s.listening).toEqual([true, false])
      expect(s.heard).toEqual([])
      vi.advanceTimersByTime(STOP_GRACE_MS)
      expect(rec.aborted).toBe(true)
      expect(s.heard).toHaveLength(1)
      expect(s.heard[0]).toMatchObject({ kind: 'none', blocked: false })
      // The browser's late end changes nothing.
      rec.onend?.()
      expect(s.heard).toHaveLength(1)
      expect(s.reported).toEqual([])
    })

    it('keeps what was heard before the stop', () => {
      vi.useFakeTimers()
      const s = setup(StuckRecognition)
      s.r.listen(s.onDone)
      FakeRecognition.last!.onresult?.({ results: [[{ transcript: 'Tisch' }]] })
      s.r.stop()
      vi.advanceTimersByTime(STOP_GRACE_MS)
      expect(s.heard).toEqual([{ kind: 'heard', alternatives: ['Tisch'] }])
    })

    it('a browser that ends the session on stop gives its result at once, with no second callback later', () => {
      vi.useFakeTimers()
      const s = setup()
      s.r.listen(s.onDone)
      FakeRecognition.last!.onresult?.({ results: [[{ transcript: 'Hallo' }]] })
      s.r.stop()
      expect(s.heard).toEqual([{ kind: 'heard', alternatives: ['Hallo'] }])
      vi.advanceTimersByTime(STOP_GRACE_MS)
      expect(s.heard).toHaveLength(1)
      expect(s.listening).toEqual([true, false])
    })
  })
})
