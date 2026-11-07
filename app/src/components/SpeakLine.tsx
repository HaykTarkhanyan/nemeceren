// Speaking practice on one "listen and repeat" line (DECISIONS.md #79). The mic button records
// Hayk saying the line and, where the browser has speech recognition (Chrome, Edge), shows what it
// heard word by word against the line. The recording stays in this page's memory: it is never
// uploaded or saved, and nothing is logged. A mismatch is never a mistake (recognition mishears).
import { useEffect, useRef, useState } from 'react'
import { messageOf, reportError } from '../lib/errors.ts'
import { RECOGNITION_ERRORS, recognitionCtor } from '../lib/recognition.ts'
import type { Recognition } from '../lib/recognition.ts'
import { bestAlternative, compareSpoken } from '../lib/speaking.ts'
import { speak } from '../lib/speech.ts'

type Phase = { kind: 'idle' } | { kind: 'listening' } | { kind: 'done'; heard: string | null; note: string | null } | { kind: 'error'; message: string }

export function SpeakLine({ text }: { text: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const stream = useRef<MediaStream | null>(null)
  // Each press of "Say it" is a new session; a stopped or replaced session must not start the mic
  // later (the permission prompt can still be open) or show its recording.
  const session = useRef(0)
  const unmounted = useRef(false)
  const canRecognize = typeof window !== 'undefined' && recognitionCtor() !== null

  function releaseStream() {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  function stopRecorder() {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
    recorder.current = null
  }

  // Free the microphone when the line goes away; a recording that ends afterwards is dropped.
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      session.current += 1
      recognition.current?.abort()
      stopRecorder()
      releaseStream()
    }
  }, [])
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    },
    [audioUrl],
  )

  /** Starts recording for session `my`; returns a problem text, or null. 'cancelled': the session ended while asking for the mic. */
  async function startRecording(my: number): Promise<string | null> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return 'this browser cannot record audio'
    let s: MediaStream
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      return messageOf(err)
    }
    if (my !== session.current || unmounted.current) {
      s.getTracks().forEach((t) => t.stop())
      return 'cancelled'
    }
    stream.current = s
    const chunks: Blob[] = []
    const r = new MediaRecorder(s)
    r.ondataavailable = (e) => chunks.push(e.data)
    r.onstop = () => {
      s.getTracks().forEach((t) => t.stop())
      if (stream.current === s) stream.current = null
      if (my !== session.current || unmounted.current || chunks.length === 0) return
      setAudioUrl(URL.createObjectURL(new Blob(chunks, { type: r.mimeType })))
    }
    r.start()
    recorder.current = r
    return null
  }

  async function start() {
    // A new press ends whatever the last one left running.
    recognition.current?.abort()
    recognition.current = null
    stopRecorder()
    releaseStream()
    const my = ++session.current
    setPhase({ kind: 'listening' })
    setAudioUrl(null)
    const recordProblem = await startRecording(my)
    if (recordProblem === 'cancelled' || my !== session.current) return
    const Ctor = recognitionCtor()
    if (!Ctor) {
      if (recordProblem) setPhase({ kind: 'error', message: `Could not record: ${recordProblem}` })
      // Without recognition the recording runs until Stop.
      return
    }
    const rec = new Ctor()
    rec.lang = 'de-DE'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 3
    let heard: string | null = null
    let problem: string | null = null
    rec.onresult = (e) => {
      const alts = Array.from(e.results[0] ?? [], (a) => a.transcript)
      if (alts.length > 0) heard = bestAlternative(text, alts)
    }
    rec.onerror = (e) => {
      // Some phones cannot record and recognize at the same time: the recording still works then.
      problem =
        e.error === 'audio-capture' && recordProblem === null
          ? 'This device could not listen and record at the same time, so there is no recognition this time. Compare the recordings.'
          : (RECOGNITION_ERRORS[e.error] ?? `Speech recognition failed (${e.error}).`)
    }
    rec.onend = () => {
      if (recognition.current === rec) recognition.current = null
      if (my !== session.current) return
      stopRecorder()
      if (problem && heard === null) setPhase({ kind: 'error', message: problem })
      else setPhase({ kind: 'done', heard, note: recordProblem ? `Your voice could not be recorded for playback: ${recordProblem}` : null })
    }
    recognition.current = rec
    try {
      rec.start()
    } catch (err) {
      recognition.current = null
      stopRecorder()
      setPhase({ kind: 'error', message: `Speech recognition did not start: ${messageOf(err)}` })
    }
  }

  function stop() {
    if (recognition.current) recognition.current.stop()
    else if (recorder.current) {
      stopRecorder()
      setPhase({ kind: 'done', heard: null, note: null })
    } else {
      // Still waiting for the microphone permission: cancel, so the mic does not start later.
      session.current += 1
      setPhase({ kind: 'idle' })
    }
  }

  const result = phase.kind === 'done' && phase.heard !== null ? compareSpoken(text, phase.heard) : null
  return (
    <div className="speak-line">
      {phase.kind === 'listening' ? (
        <button type="button" className="btn small speak-on" onClick={stop}>
          {canRecognize ? 'Listening... (tap to stop)' : 'Recording... tap to stop'}
        </button>
      ) : (
        <button type="button" className="btn small" onClick={start} aria-label={`Say it: ${text}`}>
          <MicIcon /> {phase.kind === 'idle' ? 'Say it' : 'Again'}
        </button>
      )}
      {audioUrl && (
        <>
          <button type="button" className="btn small" onClick={() => speak(text)}>
            German
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => new Audio(audioUrl).play().catch((err: unknown) => reportError(`Could not play your recording: ${messageOf(err)}`))}
          >
            Mine
          </button>
        </>
      )}
      {result && (
        <div className="speak-result small">
          <span lang="de">
            {result.words.map((w, i) => (
              <span key={i} className={w.heard ? 'heard' : 'missed'}>
                {w.text}{' '}
              </span>
            ))}
          </span>
          <span className="muted">
            {result.score === 1 ? 'All words recognized.' : `Heard: "${phase.kind === 'done' ? phase.heard : ''}". Underlined words were not recognized; try again or compare the recordings.`}
          </span>
        </div>
      )}
      {phase.kind === 'done' && phase.heard === null && (
        <span className="small muted">
          {canRecognize ? 'Nothing was recognized. Try again, or compare the recordings.' : 'This browser has no speech recognition; compare the recordings.'}
        </span>
      )}
      {phase.kind === 'done' && phase.note && <span className="small warn-text">{phase.note}</span>}
      {phase.kind === 'error' && <span className="small warn-text">{phase.message}</span>}
    </div>
  )
}

export function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
