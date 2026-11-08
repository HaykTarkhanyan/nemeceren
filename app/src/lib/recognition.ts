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

export const RECOGNITION_ERRORS: Record<string, string> = {
  'no-speech': 'Nothing was heard. Press the mic and say the line.',
  'audio-capture': 'No microphone was found.',
  'not-allowed': 'The microphone is blocked for this site. Allow it in the browser (the icon next to the address), then try again.',
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

export interface Recognizer {
  /** Starts listening (ending any earlier listen) and calls back once with what was heard. */
  listen: (onDone: (h: Heard) => void, options?: ListenOptions) => void
  /** Ends listening early: what was said so far is still recognised. */
  stop: () => void
  /** Ends listening and drops whatever comes back (Skip, Type instead, the next card, leaving the game). */
  cancel: () => void
}

/**
 * One recognition at a time for a game. Every listen is a session; a result that arrives for an
 * ended session (cancelled, or replaced by a newer listen) is dropped, so it can never land on the
 * next word. A miss ("no-speech") is a note, never an error; a blocked mic or a failed start is
 * reported and comes back as blocked, so the game offers typing.
 */
export function makeRecognizer(getCtor: () => RecognitionCtor | null, onListening: (on: boolean) => void, report: (message: string) => void): Recognizer {
  let current: Recognition | null = null
  let session = 0
  // Finishes the current session now, with what was heard so far (Stop's grace ran out).
  let finishCurrent: (() => void) | null = null
  let isListening = false

  function setListening(on: boolean) {
    if (on === isListening) return
    isListening = on
    onListening(on)
  }

  function end() {
    session += 1
    const rec = current
    current = null
    finishCurrent = null
    rec?.abort()
  }

  function listen(onDone: (h: Heard) => void, options: ListenOptions = {}) {
    end()
    const my = session
    const Ctor = getCtor()
    if (!Ctor) {
      onDone({ kind: 'none', message: 'This browser has no speech recognition, so type your answers.', blocked: true })
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
      if (!current) return
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
  }
}

/** makeRecognizer for a component: one recognizer for its lifetime, cancelled when it unmounts. */
export function useRecognition(): Recognizer & { supported: boolean; listening: boolean } {
  const [listening, setListening] = useState(false)
  const [recognizer] = useState(() => makeRecognizer(recognitionCtor, setListening, reportError))
  useEffect(() => () => recognizer.cancel(), [recognizer])
  return { ...recognizer, supported: recognitionCtor() !== null, listening }
}
