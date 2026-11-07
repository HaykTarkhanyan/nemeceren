// The browser's speech recognition (Web Speech API, de-DE, 3 alternatives), for the "listen and
// repeat" lines (components/SpeakLine.tsx, DECISIONS.md #79) and the speaking games. It is in
// Chrome and Edge, not in Firefox; the audio goes to the browser's recognition service.
import { useEffect, useRef, useState } from 'react'
import { messageOf, reportError } from './errors.ts'

// The recognition part of the Web Speech API, which TypeScript's DOM types leave out.
export interface RecognitionAlternative {
  transcript: string
}
export interface RecognitionEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative>>
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

/** Errors after which the mic will not work this time: the games switch to typing. */
const BLOCKING = new Set(['audio-capture', 'not-allowed', 'service-not-allowed', 'network', 'language-not-supported'])

export type Heard =
  | { kind: 'heard'; alternatives: string[] }
  /** Nothing usable: `blocked` means the mic or the service does not work, so typing is the way on. */
  | { kind: 'none'; message: string; blocked: boolean }

/**
 * One recognition at a time for a game: listen() starts it and calls back once with what was heard.
 * A miss ("no-speech") is a note, never an error; a blocked mic or a failed start is reported
 * (reportError) and comes back as blocked, so the game offers typing.
 */
export function useRecognition(): { supported: boolean; listening: boolean; listen: (onDone: (h: Heard) => void) => void; stop: () => void } {
  const [listening, setListening] = useState(false)
  const current = useRef<Recognition | null>(null)
  const session = useRef(0)
  useEffect(
    () => () => {
      session.current += 1
      current.current?.abort()
    },
    [],
  )

  function listen(onDone: (h: Heard) => void) {
    current.current?.abort()
    const my = ++session.current
    const Ctor = recognitionCtor()
    if (!Ctor) {
      onDone({ kind: 'none', message: 'This browser has no speech recognition, so type your answers.', blocked: true })
      return
    }
    const rec = new Ctor()
    rec.lang = 'de-DE'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 3
    let alternatives: string[] = []
    let code: string | null = null
    rec.onresult = (e) => {
      alternatives = Array.from(e.results[0] ?? [], (a) => a.transcript).filter((t) => t.trim() !== '')
    }
    rec.onerror = (e) => {
      code = e.error
    }
    rec.onend = () => {
      if (current.current === rec) current.current = null
      if (my !== session.current) return
      setListening(false)
      if (alternatives.length > 0) {
        onDone({ kind: 'heard', alternatives })
        return
      }
      const blocked = code !== null && BLOCKING.has(code)
      const message = code === null ? 'Nothing was recognised. Try again, or type it.' : (RECOGNITION_ERRORS[code] ?? `Speech recognition failed (${code}).`)
      if (blocked) reportError(`Speech recognition: ${message}`)
      onDone({ kind: 'none', message, blocked })
    }
    current.current = rec
    setListening(true)
    try {
      rec.start()
    } catch (err) {
      current.current = null
      setListening(false)
      const message = `Speech recognition did not start: ${messageOf(err)}`
      reportError(message)
      onDone({ kind: 'none', message, blocked: true })
    }
  }

  return { supported: recognitionCtor() !== null, listening, listen, stop: () => current.current?.stop() }
}
