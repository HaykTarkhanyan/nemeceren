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
