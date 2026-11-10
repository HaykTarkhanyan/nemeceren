// Text-to-speech through the browser's Web Speech API, German voices only.
// If there is no German voice, the app shows a warning and speak() reports an error
// instead of reading German with an English voice.
import { useSyncExternalStore } from 'react'
import { reportError } from './errors.ts'
import { getSettings } from './settings.ts'

export interface SpeechInfo {
  supported: boolean
  /** True once the browser has had a chance to list its voices. */
  loaded: boolean
  /** German voices only (de-DE, de-AT, de-CH, ...). */
  voices: SpeechSynthesisVoice[]
}

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
let info: SpeechInfo = { supported, loaded: !supported, voices: [] }
const listeners = new Set<() => void>()

function isGerman(v: SpeechSynthesisVoice): boolean {
  return /^de([-_]|$)/i.test(v.lang)
}

function refresh(): void {
  const all = speechSynthesis.getVoices()
  if (all.length === 0) return
  info = { supported: true, loaded: true, voices: all.filter(isGerman) }
  listeners.forEach((l) => l())
}

export function initSpeech(): void {
  if (!supported) return
  refresh()
  speechSynthesis.addEventListener('voiceschanged', refresh)
  // Some browsers never fire voiceschanged when they have no voices at all.
  window.setTimeout(() => {
    if (!info.loaded) {
      info = { ...info, loaded: true }
      listeners.forEach((l) => l())
    }
  }, 2500)
}

export function useSpeech(): SpeechInfo {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => info,
  )
}

/** The saved voice if this device has it, otherwise the first German voice. */
export function pickVoice(voices: SpeechSynthesisVoice[], voiceURI: string | null): SpeechSynthesisVoice | null {
  return voices.find((v) => v.voiceURI === voiceURI) ?? voices[0] ?? null
}

export const NO_VOICE_HELP =
  'No German voice found in this browser, so listening exercises cannot play. On Windows: Settings > Time & language > Speech > Add voices > Deutsch, then restart the browser. On a phone, install German text-to-speech data.'

/**
 * The voice for speaker number `speaker` in a dialogue (0 = the first speaker): the saved voice for
 * the first, another German voice for the next ones if the device has one. With only one German
 * voice, the others get the same voice at a different pitch.
 */
export function dialogueVoice(voices: SpeechSynthesisVoice[], voiceURI: string | null, speaker: number): { voice: SpeechSynthesisVoice | null; pitch: number } {
  const main = pickVoice(voices, voiceURI)
  if (speaker === 0 || !main) return { voice: main, pitch: 1 }
  const others = voices.filter((v) => v.voiceURI !== main.voiceURI)
  if (others.length > 0) return { voice: others[(speaker - 1) % others.length], pitch: 1 }
  return { voice: main, pitch: speaker % 2 === 1 ? 1.35 : 0.75 }
}

/**
 * Read dialogue lines one after another, each speaker with their own voice. Problems are reported
 * visibly; returns false if nothing could be played.
 */
export function speakLines(lines: { text: string; speaker: number }[], rate?: number): boolean {
  if (!supported) {
    reportError('This browser does not support speech synthesis (Web Speech API), so German audio cannot play.')
    return false
  }
  if (!pickVoice(info.voices, getSettings().voiceURI)) {
    reportError(NO_VOICE_HELP)
    return false
  }
  speechSynthesis.cancel()
  for (const line of lines) {
    const { voice, pitch } = dialogueVoice(info.voices, getSettings().voiceURI, line.speaker)
    if (!voice) throw new Error('A German voice disappeared while reading the dialogue')
    const u = new SpeechSynthesisUtterance(line.text)
    u.voice = voice
    u.lang = voice.lang
    u.pitch = pitch
    u.rate = rate ?? getSettings().rate
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return
      reportError(`Speech failed (${e.error}) while reading: "${line.text}"`)
    }
    speechSynthesis.speak(u)
  }
  return true
}

/** Play in a test with `"speed": "natural"`: natural speaking speed (the speed setting is 0.85 by default). */
export const NATURAL_RATE = 1
/** The Slow button. */
export const SLOW_RATE = 0.7

/**
 * The turns of listening audio (listen_mc, dictation): each line is one turn, read by the next voice
 * in turn, so a dialogue written one turn per line gets two voices. Text without a line break is one turn.
 */
export function audioTurns(text: string): { text: string; speaker: number }[] {
  return text
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .map((t, i) => ({ text: t, speaker: i % 2 }))
}

/** Speak listening audio: one voice, or alternating voices for a dialogue (see audioTurns). */
export function speakAudio(text: string, rate?: number): boolean {
  const turns = audioTurns(text)
  return turns.length > 1 ? speakLines(turns, rate) : speak(text, rate)
}

/** Stop anything being read aloud. */
export function stopSpeaking(): void {
  if (supported) speechSynthesis.cancel()
}

/** Speak German text. Problems are reported visibly; returns false if nothing could be played. */
export function speak(text: string, rate?: number): boolean {
  if (!supported) {
    reportError('This browser does not support speech synthesis (Web Speech API), so German audio cannot play.')
    return false
  }
  const voice = pickVoice(info.voices, getSettings().voiceURI)
  if (!voice) {
    reportError(NO_VOICE_HELP)
    return false
  }
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = rate ?? getSettings().rate
  u.onerror = (e) => {
    // "interrupted"/"canceled" just mean a newer utterance replaced this one.
    if (e.error === 'interrupted' || e.error === 'canceled') return
    reportError(`Speech failed (${e.error}) while reading: "${text}"`)
  }
  speechSynthesis.speak(u)
  return true
}
