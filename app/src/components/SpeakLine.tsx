// Speaking practice on one "listen and repeat" line (DECISIONS.md #79). The mic button records
// Hayk saying the line and, where the browser has speech recognition (Chrome, Edge), shows what it
// heard word by word against the line. The recording stays in this page's memory: it is never
// uploaded or saved, and nothing is logged. A mismatch is never a mistake (recognition mishears).
import { useEffect, useRef, useState } from 'react'
import { messageOf } from '../lib/errors.ts'
import { bestAlternative, compareSpoken } from '../lib/speaking.ts'
import { speak } from '../lib/speech.ts'

// The Web Speech API's recognition part, which TypeScript's DOM types leave out.
interface RecognitionAlternative {
  transcript: string
}
interface RecognitionEvent {
  results: ArrayLike<ArrayLike<RecognitionAlternative>>
}
interface RecognitionErrorEvent {
  error: string
}
interface Recognition {
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

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const RECOGNITION_ERRORS: Record<string, string> = {
  'no-speech': 'Nothing was heard. Press the mic and say the line.',
  'audio-capture': 'No microphone was found.',
  'not-allowed': 'The microphone is blocked for this site. Allow it in the browser (the icon next to the address), then try again.',
  network: 'Speech recognition needs the internet (the browser sends the audio to its recognition service).',
  aborted: 'Stopped.',
}

type Phase = { kind: 'idle' } | { kind: 'listening' } | { kind: 'done'; heard: string | null; note: string | null } | { kind: 'error'; message: string }

export function SpeakLine({ text }: { text: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const canRecognize = typeof window !== 'undefined' && recognitionCtor() !== null

  // Free the recording and the microphone when the line goes away.
  useEffect(
    () => () => {
      recognition.current?.abort()
      stream.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    },
    [audioUrl],
  )

  function stopRecorder() {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }

  async function startRecording(): Promise<string | null> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return 'this browser cannot record audio'
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = s
      const chunks: Blob[] = []
      const r = new MediaRecorder(s)
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop())
        stream.current = null
        if (chunks.length > 0) setAudioUrl(URL.createObjectURL(new Blob(chunks, { type: r.mimeType })))
      }
      r.start()
      recorder.current = r
      return null
    } catch (err) {
      return messageOf(err)
    }
  }

  async function start() {
    setPhase({ kind: 'listening' })
    setAudioUrl(null)
    const recordProblem = await startRecording()
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
      recognition.current = null
      stopRecorder()
      if (problem && heard === null) setPhase({ kind: 'error', message: problem })
      else setPhase({ kind: 'done', heard, note: recordProblem ? `Your voice could not be recorded for playback: ${recordProblem}` : null })
    }
    recognition.current = rec
    try {
      rec.start()
    } catch (err) {
      stopRecorder()
      setPhase({ kind: 'error', message: `Speech recognition did not start: ${messageOf(err)}` })
    }
  }

  function stop() {
    if (recognition.current) recognition.current.stop()
    else {
      stopRecorder()
      setPhase({ kind: 'done', heard: null, note: null })
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
          <button type="button" className="btn small" onClick={() => void new Audio(audioUrl).play()}>
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

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
