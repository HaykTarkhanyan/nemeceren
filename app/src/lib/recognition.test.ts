import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRecognizer, makeResultRouter, MAX_QUICK_ENDS, QUICK_END_MS, STOP_GRACE_MS } from './recognition.ts'
import type { Heard, Recognition, RecognitionAlternative, SessionResult } from './recognition.ts'

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
  /** A live (not final) result while the person is still talking. */
  hearInterim(transcript: string) {
    this.onresult?.({ results: [Object.assign([{ transcript }], { isFinal: false })] })
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

  describe('live results (hands-free: the right word ends the listen)', () => {
    it('asks for live results only when the caller checks them', () => {
      const s = setup()
      s.r.listen(s.onDone)
      expect(FakeRecognition.last!.interimResults).toBe(false)
      s.r.listen(s.onDone, { accept: () => false })
      expect(FakeRecognition.last!.interimResults).toBe(true)
    })

    it('a live result the caller accepts finishes at once, and the mic stops', () => {
      const s = setup()
      const seen: string[][] = []
      s.r.listen(s.onDone, { accept: (alts) => (seen.push(alts), alts.includes('Tisch')) })
      const rec = FakeRecognition.last!
      rec.hearInterim('Ti')
      expect(s.heard).toEqual([])
      rec.hearInterim('Tisch')
      expect(s.heard).toEqual([{ kind: 'heard', alternatives: ['Tisch'] }])
      expect(rec.aborted).toBe(true)
      expect(s.listening).toEqual([true, false])
      expect(seen).toEqual([['Ti'], ['Tisch']])
      // The browser's own end afterwards changes nothing.
      rec.onend?.()
      expect(s.heard).toHaveLength(1)
    })

    it('without an accepted live result, the final result comes as before when the person stops talking', () => {
      const s = setup()
      s.r.listen(s.onDone, { accept: () => false })
      FakeRecognition.last!.hearInterim('Tasch')
      FakeRecognition.last!.hear('Tasche')
      expect(s.heard).toEqual([{ kind: 'heard', alternatives: ['Tasche'] }])
    })
  })
})

type FakeResult = RecognitionAlternative[] & { isFinal: boolean }

/**
 * A continuous session like Chrome's: results pile up in one list per start, a live result changes
 * in place until it is final, and each event says from which entry on things changed. `end` is the
 * browser ending the session by itself.
 */
class ContinuousRecognition implements Recognition {
  static made: ContinuousRecognition[] = []
  static starts = 0
  static get last(): ContinuousRecognition {
    return ContinuousRecognition.made[ContinuousRecognition.made.length - 1]
  }
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: Recognition['onresult'] = null
  onerror: Recognition['onerror'] = null
  onend: Recognition['onend'] = null
  results: FakeResult[] = []
  stopped = false
  aborted = false
  constructor() {
    ContinuousRecognition.made.push(this)
  }
  start() {
    ContinuousRecognition.starts += 1
  }
  stop() {
    this.stopped = true
    this.onend?.()
  }
  abort() {
    this.aborted = true
  }
  /** The person talks: the open live result changes, or a new one starts. `final` closes it. */
  say(final: boolean, ...alternatives: string[]) {
    const last = this.results[this.results.length - 1]
    const i = last && !last.isFinal ? this.results.length - 1 : this.results.length
    this.results[i] = Object.assign(
      alternatives.map((transcript) => ({ transcript })),
      { isFinal: final },
    )
    this.onresult?.({ resultIndex: i, results: this.results })
  }
  end(error?: string) {
    if (error) this.onerror?.({ error })
    this.onend?.()
  }
}

/** Accepts stop() but never ends the session (Chrome on some Android phones). */
class StuckContinuous extends ContinuousRecognition {
  stop() {
    this.stopped = true
  }
}

function sessionSetup(ctor: new () => Recognition = ContinuousRecognition) {
  const listening: boolean[] = []
  const reported: string[] = []
  const results: SessionResult[] = []
  const ended: { message: string; blocked: boolean }[] = []
  const r = makeRecognizer(
    () => ctor,
    (on) => listening.push(on),
    (m) => reported.push(m),
  )
  const handlers = { onResult: (x: SessionResult) => results.push(x), onEnd: (h: { message: string; blocked: boolean }) => ended.push(h) }
  return { r, listening, reported, results, ended, handlers }
}

describe('a mic session for a round (hands-free: one start, many answers)', () => {
  beforeEach(() => {
    ContinuousRecognition.made = []
    ContinuousRecognition.starts = 0
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('starts once, continuous with live results in German, and reports each new or changed result', () => {
    const s = sessionSetup()
    s.r.startSession(s.handlers)
    const rec = ContinuousRecognition.last
    expect([rec.lang, rec.continuous, rec.interimResults, rec.maxAlternatives]).toEqual(['de-DE', true, true, 3])
    rec.say(false, 'der')
    rec.say(true, 'der Tisch', 'der tisch')
    rec.say(false, 'Stu')
    rec.say(true, 'Stuhl')
    rec.say(true, 'Lampe')
    expect(s.results).toEqual([
      { index: 0, alternatives: ['der'], final: false },
      { index: 0, alternatives: ['der Tisch', 'der tisch'], final: true },
      { index: 1, alternatives: ['Stu'], final: false },
      { index: 1, alternatives: ['Stuhl'], final: true },
      { index: 2, alternatives: ['Lampe'], final: true },
    ])
    expect(ContinuousRecognition.starts).toBe(1)
    expect(s.listening).toEqual([true])
  })

  it('reports every changed result of one event, and not the unchanged ones before it', () => {
    const s = sessionSetup()
    s.r.startSession(s.handlers)
    const rec = ContinuousRecognition.last
    rec.say(true, 'eins')
    rec.results.push(Object.assign([{ transcript: 'zwei' }], { isFinal: true }), Object.assign([{ transcript: 'drei' }], { isFinal: false }))
    rec.onresult?.({ resultIndex: 1, results: rec.results })
    expect(s.results.map((x) => [x.index, x.alternatives[0]])).toEqual([
      [0, 'eins'],
      [1, 'zwei'],
      [2, 'drei'],
    ])
  })

  it('sessionMark is where the next new result goes: a live result still changing stays before it', () => {
    const s = sessionSetup()
    expect(s.r.sessionMark()).toBe(0)
    s.r.startSession(s.handlers)
    const rec = ContinuousRecognition.last
    rec.say(true, 'Tisch')
    rec.say(false, 'Stu')
    expect(s.r.sessionMark()).toBe(2)
    // The open live result keeps index 1; the next phrase is at the mark.
    rec.say(true, 'Stuhl')
    rec.say(true, 'Lampe')
    expect(s.results.slice(-2).map((x) => x.index)).toEqual([1, 2])
  })

  it('starts again by itself when the browser ends the session, and indexes go on from where they were', () => {
    const s = sessionSetup()
    s.r.startSession(s.handlers)
    const first = ContinuousRecognition.last
    first.say(true, 'Tisch')
    vi.advanceTimersByTime(5000)
    // A silence: Chrome ends with "no-speech" (desktop) or just ends (Android).
    first.end('no-speech')
    const second = ContinuousRecognition.last
    expect(second).not.toBe(first)
    expect(ContinuousRecognition.starts).toBe(2)
    expect(second.continuous).toBe(true)
    second.say(true, 'Stuhl')
    expect(s.results.map((x) => x.index)).toEqual([0, 1])
    expect(s.r.sessionMark()).toBe(2)
    // No flicker to idle, nothing reported: a restart is not an error.
    expect(s.listening).toEqual([true])
    expect(s.reported).toEqual([])
    expect(s.ended).toEqual([])
    // A late event of the ended run is ignored.
    first.say(true, 'alt')
    expect(s.results).toHaveLength(2)
  })

  it(`stops and says so when the browser ends it within ${QUICK_END_MS} ms of starting ${MAX_QUICK_ENDS} times in a row`, () => {
    const s = sessionSetup()
    s.r.startSession(s.handlers)
    // A slow end in between resets the count.
    ContinuousRecognition.last.end()
    vi.advanceTimersByTime(QUICK_END_MS + 1)
    ContinuousRecognition.last.end()
    for (let i = 0; i < MAX_QUICK_ENDS; i++) {
      vi.advanceTimersByTime(100)
      ContinuousRecognition.last.end()
    }
    expect(ContinuousRecognition.starts).toBe(2 + MAX_QUICK_ENDS)
    expect(s.listening).toEqual([true, false])
    expect(s.reported).toHaveLength(1)
    expect(s.ended).toHaveLength(1)
    expect(s.ended[0].blocked).toBe(false)
    expect(s.ended[0].message).toContain('kept stopping')
    // Nothing more starts, also not later.
    vi.advanceTimersByTime(10_000)
    expect(ContinuousRecognition.starts).toBe(2 + MAX_QUICK_ENDS)
  })

  it('a blocked mic ends the session, is reported, and does not restart', () => {
    const s = sessionSetup()
    s.r.startSession(s.handlers)
    ContinuousRecognition.last.end('not-allowed')
    expect(ContinuousRecognition.starts).toBe(1)
    expect(s.ended).toEqual([{ message: expect.stringContaining('blocked'), blocked: true }])
    expect(s.reported).toHaveLength(1)
    expect(s.listening).toEqual([true, false])
  })

  it('a start that throws is reported as blocked', () => {
    class Throws extends ContinuousRecognition {
      start() {
        throw new Error('InvalidStateError')
      }
    }
    const s = sessionSetup(Throws)
    s.r.startSession(s.handlers)
    expect(s.ended).toEqual([{ message: expect.stringContaining('InvalidStateError'), blocked: true }])
    expect(s.listening).toEqual([true, false])
    expect(s.reported).toHaveLength(1)
  })

  it('Stop ends it at once on screen, even when the browser never ends the session, and it never restarts', () => {
    const s = sessionSetup(StuckContinuous)
    s.r.startSession(s.handlers)
    const rec = ContinuousRecognition.last
    s.r.stopSession()
    expect(rec.stopped).toBe(true)
    expect(s.listening).toEqual([true, false])
    // What was said as Stop was tapped still comes in during the grace.
    rec.say(true, 'Tisch')
    expect(s.results).toHaveLength(1)
    vi.advanceTimersByTime(STOP_GRACE_MS)
    expect(rec.aborted).toBe(true)
    // The browser's late end neither restarts nor reports anything.
    rec.end()
    rec.say(true, 'danach')
    expect(ContinuousRecognition.starts).toBe(1)
    expect(s.results).toHaveLength(1)
    expect(s.reported).toEqual([])
    expect(s.ended).toEqual([])
    expect(s.listening).toEqual([true, false])
  })

  it('Stop with a browser that ends the session at once: no restart', () => {
    const s = sessionSetup()
    s.r.startSession(s.handlers)
    s.r.stop()
    vi.advanceTimersByTime(STOP_GRACE_MS)
    expect(ContinuousRecognition.starts).toBe(1)
    expect(s.listening).toEqual([true, false])
    expect(ContinuousRecognition.last.aborted).toBe(false)
  })

  it('cancel (Type instead, the round ends, leaving) aborts, drops late results, and does not restart', () => {
    const s = sessionSetup()
    s.r.startSession(s.handlers)
    const rec = ContinuousRecognition.last
    rec.say(true, 'Tisch')
    s.r.cancel()
    expect(rec.aborted).toBe(true)
    rec.say(true, 'Stuhl')
    rec.end()
    expect(ContinuousRecognition.starts).toBe(1)
    expect(s.results).toHaveLength(1)
    expect(s.listening).toEqual([true, false])
    // A new session (a tap on the mic) goes on counting, so a mark taken before stays right.
    s.r.startSession(s.handlers)
    ContinuousRecognition.last.say(true, 'Lampe')
    expect(s.results[1].index).toBe(1)
  })

  it('a one-off listen ends a running session (one recognition at a time)', () => {
    const s = sessionSetup()
    s.r.startSession(s.handlers)
    const rec = ContinuousRecognition.last
    s.r.listen(() => {})
    expect(rec.aborted).toBe(true)
    rec.end()
    expect(ContinuousRecognition.starts).toBe(2)
    expect(ContinuousRecognition.last.continuous).toBe(false)
  })
})

describe('the results of a session go to the word on screen (makeResultRouter)', () => {
  const result = (index: number, text: string, final = true): SessionResult => ({ index, alternatives: [text], final })

  it('a word gets only the results from its mark on; a newer word takes over', () => {
    const router = makeResultRouter(() => false)
    const a: string[] = []
    const b: string[] = []
    router.route(result(0, 'vorher'))
    router.attach(1, (r) => a.push(r.alternatives[0]))
    router.route(result(0, 'vorher, noch live'))
    router.route(result(1, 'Tisch'))
    router.attach(2, (r) => b.push(r.alternatives[0]))
    router.route(result(1, 'Tisch, final'))
    router.route(result(2, 'Stuhl'))
    expect(a).toEqual(['Tisch'])
    expect(b).toEqual(['Stuhl'])
  })

  it('after letting go nothing arrives; an old let-go does not drop the newer word', () => {
    const router = makeResultRouter(() => false)
    const got: string[] = []
    const leaveA = router.attach(0, () => got.push('a'))
    router.attach(0, (r) => got.push(r.alternatives[0]))
    leaveA()
    router.route(result(0, 'b'))
    expect(got).toEqual(['b'])
  })

  it("a result heard while the app's voice speaks is dropped for good, also once the voice has stopped", () => {
    let speaking = false
    const router = makeResultRouter(() => speaking)
    const got: SessionResult[] = []
    router.attach(0, (r) => got.push(r))
    speaking = true
    router.route(result(0, 'der Ti', false))
    speaking = false
    router.route(result(0, 'der Tisch'))
    router.route(result(1, 'Stuhl'))
    expect(got.map((r) => r.alternatives[0])).toEqual(['Stuhl'])
  })

  it('a round of five words on one session: one start, each word gets only its own answer', () => {
    vi.useFakeTimers()
    try {
      ContinuousRecognition.made = []
      ContinuousRecognition.starts = 0
      const s = sessionSetup()
      let speaking = false
      const router = makeResultRouter(() => speaking)
      s.r.startSession({ onResult: router.route, onEnd: s.handlers.onEnd })
      const rec = ContinuousRecognition.last
      const answers = ['Tisch', 'Stuhl', 'Lampe', 'Fenster', 'Tür']
      const taken: string[][] = []
      for (const [n, answer] of answers.entries()) {
        const mine: string[] = []
        taken.push(mine)
        const leave = router.attach(s.r.sessionMark(), (r) => mine.push(r.alternatives[0]))
        // The last word's phrase was still live when this word appeared; it ends now and must not
        // reach this word.
        if (n > 0) rec.say(true, answers[n - 1])
        if (n === 2) {
          // The app reads a word aloud while this one is up.
          speaking = true
          rec.say(true, 'das Fenster')
          speaking = false
        }
        rec.say(false, answer.slice(0, 2))
        // Right while still live: the word counts it at once and the next word comes, phrase open.
        rec.say(false, answer)
        vi.advanceTimersByTime(1500)
        leave()
      }
      expect(taken).toEqual(answers.map((a) => [a.slice(0, 2), a]))
      expect(ContinuousRecognition.starts).toBe(1)
      expect(s.ended).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
