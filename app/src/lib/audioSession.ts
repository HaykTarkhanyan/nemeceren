// iOS Safari treats a page's sound as "ambient" by default, so the silent switch mutes the app's
// German audio on the speaker, and only headphones play it (Anahit, 2026-11-11; DECISIONS.md #117).
// While the app reads aloud, the audio session type is "playback" (media, like a video), which plays
// in silent mode; afterwards it goes back to "auto", so the mic and other apps' audio work as before.
// navigator.audioSession exists only in Safari (settable to "playback" from iOS 17); elsewhere this
// does nothing.
import { messageOf, reportError } from './errors.ts'

export type AudioSessionType = 'auto' | 'playback'

interface AudioSessionLike {
  type: string
}

let reported = false

export function setAudioSession(type: AudioSessionType, nav: unknown = typeof navigator === 'undefined' ? undefined : navigator): void {
  const session = (nav as { audioSession?: AudioSessionLike } | undefined)?.audioSession
  if (!session || session.type === type) return
  try {
    session.type = type
  } catch (err) {
    // Reported once: a failure here would otherwise repeat on every Listen button.
    if (reported) return
    reported = true
    reportError(`Could not switch the audio mode to "${type}" (${messageOf(err)}). On an iPhone in silent mode, the German audio may only play in headphones.`)
  }
}
