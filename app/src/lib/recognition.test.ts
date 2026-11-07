import { describe, expect, it } from 'vitest'
import { makeRecognizer } from './recognition.ts'
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

function setup() {
  const listening: boolean[] = []
  const reported: string[] = []
  const heard: Heard[] = []
  const r = makeRecognizer(
    () => FakeRecognition,
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
})
