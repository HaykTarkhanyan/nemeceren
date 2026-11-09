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

/**
 * The app's own voice (speechSynthesis) during a mic session. On Android it can take the audio and
 * end the recognition; then the session starts again only once the voice has finished, never in a
 * loop while it speaks, and such an end does not count as a quick end. An end this soon after the
 * voice counts as caused by it. A "speaking" longer than VOICE_STUCK_MS is taken as stuck (Chrome can
 * leave it on), so the mic never waits or goes deaf for good. The voice is checked every
 * VOICE_POLL_MS, only while a session is on.
 */
export const VOICE_TAIL_MS = 1500
export const VOICE_STUCK_MS = 8000
const VOICE_POLL_MS = 200

/** A mic error that the app's voice taking the audio may cause: during the voice, it is restarted, not shown. */
const VOICE_CAN_CAUSE = new Set(['audio-capture'])

/** Why the browser ended a mic session that was still wanted. */
export type EndReason = 'silence' | 'voice' | 'error' | 'plain'

/** What a recognizer's mic sessions did, for the diagnostics line (micStatsLine) and the console. */
export interface MicStats {
  /** Sessions started (a tap on the mic). */
  starts: number
  /** Times the app started the session again after the browser ended it. */
  restarts: number
  /** The browser's ends of a wanted session, by reason (each is a click on Android). */
  ends: Record<EndReason, number>
  /** The error codes of the ends counted as errors (every end's code is in `runs`). */
  codes: Record<string, number>
  /** Why a session stopped by itself for good: an error code, or "kept-stopping". */
  stopped: string[]
  /** The latest runs (one start of the browser's recognition each): how long, and how it ended. */
  runs: { ms: number; end: EndReason | 'stop' | 'fatal'; code: string | null }[]
}
const MAX_RUNS_KEPT = 40

const END_TEXT: Record<EndReason, string> = { silence: 'after silence', voice: "after the app's voice", error: 'after an error', plain: 'with no reason given' }

/** One short line for the end of a round, e.g. "Mic: 1 start, 3 restarts (2 after silence, 1 after the app's voice)." */
export function micStatsLine(s: MicStats): string {
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  const reasons = (Object.keys(END_TEXT) as EndReason[])
    .filter((r) => s.ends[r] > 0)
    .map((r) => `${s.ends[r]} ${END_TEXT[r]}${r === 'error' ? ` (${Object.keys(s.codes).join(', ')})` : ''}`)
  const ended = Object.values(s.ends).reduce((a, b) => a + b, 0)
  if (ended > s.restarts) reasons.push(`${ended - s.restarts} not restarted`)
  const restarts = s.restarts === 0 && ended === 0 ? 'no restarts' : `${n(s.restarts, 'restart')} (${reasons.join(', ')})`
  const stopped = s.stopped.length > 0 ? `; it stopped itself: ${s.stopped.join(', ')}` : ''
  return `Mic: ${n(s.starts, 'start')}, ${restarts}${stopped}.`
}

function emptyStats(): MicStats {
  return { starts: 0, restarts: 0, ends: { silence: 0, voice: 0, error: 0, plain: 0 }, codes: {}, stopped: [], runs: [] }
}

function defaultSpeaking(): boolean {
  return typeof window !== 'undefined' && window.speechSynthesis?.speaking === true
}

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

export interface SessionEnd {
  message: string
  blocked: boolean
}

export interface SessionHandlers {
  /** Each new or changed result, live or final. */
  onResult: (r: SessionResult) => void
  /**
   * The session ended by itself and will not start again: an error, a failed start, or the browser
   * kept ending it right after it started. Already reported; `blocked` means typing is the way on.
   */
  onEnd: (h: SessionEnd) => void
  /**
   * Whether an item on screen takes results now. When the browser ends the session while none does
   * (an answer is showing, a card without the mic), it starts again only on resumeSession(), so an
   * idle mic does not click off and on.
   */
  wantsResults?: () => boolean
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
  /** An item wants results again: a session the browser ended meanwhile starts again (once the voice is quiet). */
  resumeSession: () => void
  /** The app's own voice is speaking now (and not stuck). */
  voiceOn: () => boolean
  /** What the mic sessions of this recognizer did so far (a copy). */
  stats: () => MicStats
}

/**
 * One recognition at a time for a game. Every listen is a session; a result that arrives for an
 * ended session (cancelled, or replaced by a newer listen) is dropped, so it can never land on the
 * next word. A miss ("no-speech") is a note, never an error; a blocked mic or a failed start is
 * reported and comes back as blocked, so the game offers typing. A mic session (startSession) is
 * the hands-free form: one start of the browser's recognition for a whole round of answers, since
 * Android beeps at every start and stop (Hayk, 2026-11-09).
 */
export function makeRecognizer(
  getCtor: () => RecognitionCtor | null,
  onListening: (on: boolean) => void,
  report: (message: string) => void,
  /** Whether the app's own voice (speechSynthesis) is speaking. */
  speaking: () => boolean = defaultSpeaking,
): Recognizer {
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
  // Starts an ended session again if it waits for an item (resumeSession); null when none waits.
  let resumeRunning: (() => void) | null = null
  const stats = emptyStats()

  // The app's voice: since when it speaks (for "stuck"), and when it was last heard speaking.
  let voiceSince: number | null = null
  let voiceLastOn = Number.NEGATIVE_INFINITY
  let voiceTimer: ReturnType<typeof setInterval> | null = null
  function voiceOn(): boolean {
    const t = Date.now()
    if (!speaking()) {
      voiceSince = null
      return false
    }
    voiceSince ??= t
    if (t - voiceSince >= VOICE_STUCK_MS) return false
    voiceLastOn = t
    return true
  }
  const voiceRecent = () => voiceOn() || Date.now() - voiceLastOn < VOICE_TAIL_MS
  function watchVoice(on: boolean) {
    if (on && voiceTimer === null) voiceTimer = setInterval(voiceOn, VOICE_POLL_MS)
    if (!on && voiceTimer !== null) {
      clearInterval(voiceTimer)
      voiceTimer = null
    }
  }

  function logRun(run: MicStats['runs'][number]) {
    stats.runs.push(run)
    if (stats.runs.length > MAX_RUNS_KEPT) stats.runs.shift()
  }

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
    resumeRunning = null
    watchVoice(false)
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
    stats.starts += 1
    let wanted = true
    let quickEnds = 0
    // The browser ended the last run: the next one starts when an item wants results and the voice is quiet.
    let waiting = false
    let waitTimer: ReturnType<typeof setTimeout> | null = null

    /** The session is over for good: later events of its recognition are ignored. */
    function over() {
      session += 1
      current = null
      stopRunning = null
      resumeRunning = null
      watchVoice(false)
      closeRun()
      setListening(false)
    }
    function fail(message: string, blocked: boolean, reported = `Speech recognition: ${message}`) {
      over()
      report(reported)
      handlers.onEnd({ message, blocked })
    }

    function restartWhenReady() {
      if (my !== session || !wanted || !waiting || waitTimer !== null) return
      if (handlers.wantsResults && !handlers.wantsResults()) return
      if (voiceOn()) {
        waitTimer = setTimeout(() => {
          waitTimer = null
          restartWhenReady()
        }, VOICE_POLL_MS)
        return
      }
      waiting = false
      stats.restarts += 1
      run()
    }

    function run() {
      const rec = new Ctor!()
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
        const ms = Date.now() - startedAt
        // Stopped (stopSession), and the browser ended it within the grace.
        if (!wanted) {
          logRun({ ms, end: 'stop', code })
          return over()
        }
        const byVoice = voiceRecent()
        if (code !== null && !RESTART_AFTER.has(code) && !(byVoice && VOICE_CAN_CAUSE.has(code))) {
          logRun({ ms, end: 'fatal', code })
          stats.stopped.push(code)
          return fail(RECOGNITION_ERRORS[code] ?? `Speech recognition failed (${code}).`, BLOCKING.has(code))
        }
        const reason: EndReason = byVoice ? 'voice' : code === 'no-speech' ? 'silence' : code !== null ? 'error' : 'plain'
        logRun({ ms, end: reason, code })
        stats.ends[reason] += 1
        if (reason === 'error') stats.codes[code!] = (stats.codes[code!] ?? 0) + 1
        // An end the app's voice caused has its cause, and the restart waits for the voice: no loop.
        if (reason !== 'voice') {
          quickEnds = ms < QUICK_END_MS ? quickEnds + 1 : 0
          if (quickEnds >= MAX_QUICK_ENDS) {
            stats.stopped.push('kept-stopping')
            return fail('The microphone kept stopping right after it started, so it was switched off. Tap the mic to try again, or type.', false)
          }
        }
        current = null
        waiting = true
        restartWhenReady()
      }
      current = rec
      try {
        rec.start()
      } catch (err) {
        const message = `Speech recognition did not start: ${messageOf(err)}`
        stats.stopped.push('start-failed')
        fail(message, true, message)
      }
    }

    stopRunning = () => {
      wanted = false
      stopRunning = null
      setListening(false)
      const rec = current
      // Between runs (waiting) there is nothing to stop.
      if (rec === null) return over()
      rec.stop()
      // Some phones accept stop() but never end the session: then the app ends it.
      setTimeout(() => {
        if (my !== session || current !== rec) return
        over()
        rec.abort()
      }, STOP_GRACE_MS)
    }
    resumeRunning = restartWhenReady
    setListening(true)
    watchVoice(true)
    run()
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
    resumeSession: () => resumeRunning?.(),
    voiceOn,
    stats: () => structuredClone(stats),
  }
}

/**
 * For a game that keeps one mic session over many items: hands each result to the item on screen
 * and drops what that item must not take. An item gets only the results from its `from` index on
 * (sessionMark() when it appeared), so what was said for the item before can never count for it.
 * A result heard, even in part, while the app's own voice was speaking is dropped for good, so the
 * German the app reads out can never count as an answer.
 */
export function makeResultRouter(
  isSpeaking: () => boolean,
  /** Called when an item starts taking results (the session may need to start again). */
  onAttach: () => void = () => {},
): {
  route: (r: SessionResult) => void
  /** The item on screen takes the results from index `from` on; the returned function lets go. */
  attach: (from: number, take: (r: SessionResult) => void) => () => void
  /** Whether an item takes results now. */
  attached: () => boolean
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
      onAttach()
      return () => {
        if (target === mine) target = null
      }
    },
    attached: () => target !== null,
  }
}

/** makeRecognizer for a component: one recognizer for its lifetime, cancelled when it unmounts. */
export function useRecognition(): Recognizer & { supported: boolean; listening: boolean } {
  const [listening, setListening] = useState(false)
  const [recognizer] = useState(() => makeRecognizer(recognitionCtor, setListening, reportError))
  useEffect(() => () => recognizer.cancel(), [recognizer])
  return { ...recognizer, supported: recognitionCtor() !== null, listening }
}

/** One mic session for a screen of many items (useMicSession). */
export interface MicSession {
  supported: boolean
  /** The session is on (between two runs of the browser's recognition too). */
  listening: boolean
  /** Why the last session stopped by itself (already reported); null after a new start. */
  ended: SessionEnd | null
  /** A tap on the mic: starts the session (ending any earlier one). */
  start: () => void
  /** Stop: no restart; what is on the way still comes. */
  stop: () => void
  /** Type instead, the end of a round: off at once, late results dropped. */
  cancel: () => void
  /** The item on screen takes the results heard from now on (stale ones never); returns "let go". */
  attach: (take: (r: SessionResult) => void) => () => void
  stats: () => MicStats
}

/**
 * One mic session for a whole screen (a game round, a review): a tap starts it, it stays on over the
 * items, and each item takes only the results heard after it appeared (makeResultRouter). Android
 * clicks at every start and stop of the mic (Hayk, 2026-11-09), so the screen never starts it per
 * item. When the browser ends it while no item takes results, it starts again only when one does.
 * The app going to the background stops it; the screen stops it at the end of a round, on Type
 * instead, and when it unmounts.
 */
export function useMicSession(onEnd?: (h: SessionEnd) => void): MicSession {
  const rec = useRecognition()
  const [router] = useState(() => makeResultRouter(rec.voiceOn, rec.resumeSession))
  const [ended, setEnded] = useState<SessionEnd | null>(null)
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  })
  const cancel = rec.cancel
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) cancel()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [cancel])
  return {
    supported: rec.supported,
    listening: rec.listening,
    ended,
    start: () => {
      setEnded(null)
      rec.startSession({
        onResult: router.route,
        wantsResults: router.attached,
        onEnd: (h) => {
          setEnded(h)
          onEndRef.current?.(h)
        },
      })
    },
    stop: rec.stopSession,
    cancel,
    attach: (take) => router.attach(rec.sessionMark(), take),
    stats: rec.stats,
  }
}
