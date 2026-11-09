// The browser's speech recognition (Web Speech API, de-DE, 3 alternatives), for the "listen and
// repeat" lines (components/SpeakLine.tsx, DECISIONS.md #79) and the speaking games. It is in
// Chrome and Edge, not in Firefox; the audio goes to the browser's recognition service.
import { useEffect, useState } from 'react'
import { messageOf, reportError } from './errors.ts'

// The recognition part of the Web Speech API, which TypeScript's DOM types leave out.
export interface RecognitionAlternative {
  transcript: string
}
export interface RecognitionEvent {
  /** One entry per recognised piece; `isFinal` is false for a live (interim) result. */
  results: ArrayLike<ArrayLike<RecognitionAlternative> & { isFinal?: boolean }>
  /** The first entry of `results` that is new or changed in this event (continuous sessions). */
  resultIndex?: number
}
export interface RecognitionErrorEvent {
  error: string
}
export interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => Recognition

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * What to do about a blocked mic. The installed app has no address bar, and it uses Chrome's
 * permission for the site, so it gets the Chrome and Android steps that worked for Hayk (2026-11-08).
 */
export function blockedMicMessage(installed = isInstalledApp()): string {
  return installed
    ? 'The microphone is blocked. The installed app uses the permission Chrome has for this site: open Chrome, menu > Settings > Site settings > Microphone, and allow hayktarkhanyan.github.io. If it is allowed there, check Android Settings > Apps > Chrome > Permissions > Microphone. Then reopen the app.'
    : 'The microphone is blocked for this site. Allow it in the browser (the icon next to the address), then try again.'
}

function isInstalledApp(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
}

export const RECOGNITION_ERRORS: Record<string, string> = {
  'no-speech': 'Nothing was heard. Press the mic and say the line.',
  'audio-capture': 'No microphone was found.',
  get 'not-allowed'() {
    return blockedMicMessage()
  },
  network: 'Speech recognition needs the internet (the browser sends the audio to its recognition service).',
  aborted: 'Stopped.',
}

/**
 * After Stop, how long the browser gets to end the recognition before the app ends it itself. Chrome
 * on some Android phones accepts stop() but never fires `end`, so the mic stayed on "Listening..."
 * (Hayk, 2026-11-08: "pressing stop recording didn't work").
 */
export const STOP_GRACE_MS = 1500

/** Errors after which the mic will not work this time: the games switch to typing. */
const BLOCKING = new Set(['audio-capture', 'not-allowed', 'service-not-allowed', 'network', 'language-not-supported'])

/**
 * A mic session (startSession) that the browser ends this soon after it started counts as a quick
 * end. After MAX_QUICK_ENDS in a row the session stops and says so, so it can never restart in a
 * silent loop. Chrome on Android ends continuous sessions after pauses; each restart beeps.
 */
export const QUICK_END_MS = 1000
export const MAX_QUICK_ENDS = 3

/** Session ends after which the session starts again by itself: a silence, or the browser stopping it. */
const RESTART_AFTER = new Set(['no-speech', 'aborted'])

const NO_RECOGNITION_MESSAGE = 'This browser has no speech recognition, so type your answers.'

export type Heard =
  | { kind: 'heard'; alternatives: string[] }
  /** Nothing usable: `blocked` means the mic or the service does not work, so typing is the way on. */
  | { kind: 'none'; message: string; blocked: boolean }

export interface ListenOptions {
  /**
   * Checked on every result while the person talks (live results are switched on). Returning true
   * finishes the listen at once with those alternatives: the right word needs no Stop and no silence.
   */
  accept?: (alternatives: string[]) => boolean
}

/** One result of a mic session (startSession). */
export interface SessionResult {
  /**
   * The result's place among everything this recognizer has heard. It never goes down, also over
   * restarts and new sessions; a live result keeps its index while it changes, the next phrase gets
   * the next one. Compare it with sessionMark().
   */
  index: number
  alternatives: string[]
  /** False for a live (interim) result that may still change. */
  final: boolean
}

export interface SessionHandlers {
  /** Each new or changed result, live or final. */
  onResult: (r: SessionResult) => void
  /**
   * The session ended by itself and will not start again: an error, a failed start, or the browser
   * kept ending it right after it started. Already reported; `blocked` means typing is the way on.
   */
  onEnd: (h: { message: string; blocked: boolean }) => void
}

export interface Recognizer {
  /** Starts listening (ending any earlier listen) and calls back once with what was heard. */
  listen: (onDone: (h: Heard) => void, options?: ListenOptions) => void
  /** Ends listening early: what was said so far is still recognised. */
  stop: () => void
  /** Ends listening and drops whatever comes back (Skip, Type instead, the next card, leaving the game). */
  cancel: () => void
  /**
   * Keeps the mic on (ending any earlier listen) and reports every result until stopSession or
   * cancel: one start, so one beep on Android, for many answers. When the browser ends the session
   * by itself (a silence), it starts again.
   */
  startSession: (handlers: SessionHandlers) => void
  /** Ends the session: no restart, the mic shows idle at once; results still on the way are reported. */
  stopSession: () => void
  /** The index the next new result will get: what has a lower index was heard before now. */
  sessionMark: () => number
}

/**
 * One recognition at a time for a game. Every listen is a session; a result that arrives for an
 * ended session (cancelled, or replaced by a newer listen) is dropped, so it can never land on the
 * next word. A miss ("no-speech") is a note, never an error; a blocked mic or a failed start is
 * reported and comes back as blocked, so the game offers typing. A mic session (startSession) is
 * the hands-free form: one start of the browser's recognition for a whole round of answers, since
 * Android beeps at every start and stop (Hayk, 2026-11-09).
 */
export function makeRecognizer(getCtor: () => RecognitionCtor | null, onListening: (on: boolean) => void, report: (message: string) => void): Recognizer {
  let current: Recognition | null = null
  let session = 0
  // Finishes the current session now, with what was heard so far (Stop's grace ran out).
  let finishCurrent: (() => void) | null = null
  let isListening = false
  // Mic sessions: the results of the runs that have ended, and of the run going on now. Each run
  // (a start of the browser's recognition) counts its results from 0; their sum is the next index.
  let heardBefore = 0
  let heardNow = 0
  // Ends the running mic session gently (stopSession); null when none is running.
  let stopRunning: (() => void) | null = null

  function setListening(on: boolean) {
    if (on === isListening) return
    isListening = on
    onListening(on)
  }

  function closeRun() {
    heardBefore += heardNow
    heardNow = 0
  }

  function end() {
    session += 1
    const rec = current
    current = null
    finishCurrent = null
    stopRunning = null
    closeRun()
    rec?.abort()
  }

  function startSession(handlers: SessionHandlers) {
    end()
    const my = session
    const Ctor = getCtor()
    if (!Ctor) {
      handlers.onEnd({ message: NO_RECOGNITION_MESSAGE, blocked: true })
      return
    }
    let wanted = true
    let quickEnds = 0

    /** The session is over for good: later events of its recognition are ignored. */
    function over() {
      session += 1
      current = null
      stopRunning = null
      closeRun()
      setListening(false)
    }
    function fail(message: string, blocked: boolean, reported = `Speech recognition: ${message}`) {
      over()
      report(reported)
      handlers.onEnd({ message, blocked })
    }

    function run(Ctor: RecognitionCtor) {
      const rec = new Ctor()
      rec.lang = 'de-DE'
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 3
      const startedAt = Date.now()
      let code: string | null = null
      const mine = () => my === session && current === rec
      rec.onresult = (e) => {
        if (!mine()) return
        const n = e.results.length
        heardNow = Math.max(heardNow, n)
        // Chrome says which results are new or changed; without that, only the last one is.
        for (let i = Math.max(0, e.resultIndex ?? n - 1); i < n; i++) {
          const result = e.results[i]
          const alternatives = Array.from(result, (a) => a.transcript).filter((t) => t.trim() !== '')
          if (alternatives.length > 0) handlers.onResult({ index: heardBefore + i, alternatives, final: result.isFinal !== false })
        }
      }
      rec.onerror = (e) => {
        if (mine()) code = e.error
      }
      rec.onend = () => {
        if (!mine()) return
        closeRun()
        // Stopped (stopSession), and the browser ended it within the grace.
        if (!wanted) return over()
        if (code !== null && !RESTART_AFTER.has(code)) return fail(RECOGNITION_ERRORS[code] ?? `Speech recognition failed (${code}).`, BLOCKING.has(code))
        quickEnds = Date.now() - startedAt < QUICK_END_MS ? quickEnds + 1 : 0
        if (quickEnds >= MAX_QUICK_ENDS) return fail('The microphone kept stopping right after it started, so it was switched off. Tap the mic to try again, or type.', false)
        run(Ctor)
      }
      current = rec
      try {
        rec.start()
      } catch (err) {
        const message = `Speech recognition did not start: ${messageOf(err)}`
        fail(message, true, message)
      }
    }

    stopRunning = () => {
      wanted = false
      stopRunning = null
      setListening(false)
      const rec = current
      rec?.stop()
      // Some phones accept stop() but never end the session: then the app ends it.
      setTimeout(() => {
        if (my !== session || current !== rec) return
        over()
        rec?.abort()
      }, STOP_GRACE_MS)
    }
    setListening(true)
    run(Ctor)
  }

  function listen(onDone: (h: Heard) => void, options: ListenOptions = {}) {
    end()
    const my = session
    const Ctor = getCtor()
    if (!Ctor) {
      onDone({ kind: 'none', message: NO_RECOGNITION_MESSAGE, blocked: true })
      return
    }
    const rec = new Ctor()
    rec.lang = 'de-DE'
    rec.continuous = false
    rec.interimResults = options.accept !== undefined
    rec.maxAlternatives = 3
    let alternatives: string[] = []
    let code: string | null = null
    let finished = false
    rec.onresult = (e) => {
      if (finished || my !== session) return
      const last = e.results[e.results.length - 1]
      const alts = Array.from(last ?? [], (a) => a.transcript).filter((t) => t.trim() !== '')
      if (alts.length === 0) return
      alternatives = alts
      if (options.accept?.(alts)) finishCurrent?.()
    }
    rec.onerror = (e) => {
      code = e.error
    }
    const finish = () => {
      if (finished || my !== session) return
      finished = true
      current = null
      finishCurrent = null
      setListening(false)
      if (alternatives.length > 0) {
        onDone({ kind: 'heard', alternatives })
        return
      }
      const blocked = code !== null && BLOCKING.has(code)
      const message = code === null ? 'Nothing was recognised. Try again, or type it.' : (RECOGNITION_ERRORS[code] ?? `Speech recognition failed (${code}).`)
      if (blocked) report(`Speech recognition: ${message}`)
      onDone({ kind: 'none', message, blocked })
    }
    rec.onend = finish
    finishCurrent = () => {
      finish()
      // The browser may still end it later: that end is ignored (finished), and the mic is released.
      rec.abort()
    }
    current = rec
    setListening(true)
    try {
      rec.start()
    } catch (err) {
      current = null
      finishCurrent = null
      setListening(false)
      const message = `Speech recognition did not start: ${messageOf(err)}`
      report(message)
      onDone({ kind: 'none', message, blocked: true })
    }
  }

  return {
    listen,
    stop: () => {
      if (stopRunning) return stopRunning()
      if (!current || !finishCurrent) return
      const force = finishCurrent
      // The button answers at once; the result follows when the browser ends the session, or after the grace.
      setListening(false)
      current.stop()
      setTimeout(() => force?.(), STOP_GRACE_MS)
    },
    cancel: () => {
      end()
      setListening(false)
    },
    startSession,
    stopSession: () => stopRunning?.(),
    sessionMark: () => heardBefore + heardNow,
  }
}

/**
 * For a game that keeps one mic session over many items: hands each result to the item on screen
 * and drops what that item must not take. An item gets only the results from its `from` index on
 * (sessionMark() when it appeared), so what was said for the item before can never count for it.
 * A result heard, even in part, while the app's own voice was speaking is dropped for good, so the
 * German the app reads out can never count as an answer.
 */
export function makeResultRouter(isSpeaking: () => boolean): {
  route: (r: SessionResult) => void
  /** The item on screen takes the results from index `from` on; the returned function lets go. */
  attach: (from: number, take: (r: SessionResult) => void) => () => void
} {
  let target: { from: number; take: (r: SessionResult) => void } | null = null
  const voiced = new Set<number>()
  return {
    route: (r) => {
      if (isSpeaking()) voiced.add(r.index)
      if (voiced.has(r.index) || target === null || r.index < target.from) return
      target.take(r)
    },
    attach: (from, take) => {
      const mine = { from, take }
      target = mine
      return () => {
        if (target === mine) target = null
      }
    },
  }
}

/** makeRecognizer for a component: one recognizer for its lifetime, cancelled when it unmounts. */
export function useRecognition(): Recognizer & { supported: boolean; listening: boolean } {
  const [listening, setListening] = useState(false)
  const [recognizer] = useState(() => makeRecognizer(recognitionCtor, setListening, reportError))
  useEffect(() => () => recognizer.cancel(), [recognizer])
  return { ...recognizer, supported: recognitionCtor() !== null, listening }
}
