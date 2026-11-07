// Opening the Words review with its words picked from one unit or lesson, from outside the Words
// page (a test station's sheet on Home, a lesson tile on the Words map). The pick is saved per
// device, the same as choosing it under "Words from" on the Words page.
import { messageOf, reportError } from './errors.ts'
import { link } from './router.ts'
import { updateSettings } from './settings.ts'

/**
 * A pick under "Words from" on the Words page: saved per device by `save`. The page keeps its own
 * copy (`picked`) only when the save failed, so the pick still applies there; after a successful
 * save the saved setting is the one truth, and a later pick from the Map or a test station wins.
 */
export function pickWordSource(key: string, save: (key: string) => void): { picked: string | null; problem: string | null } {
  try {
    save(key)
    return { picked: null, problem: null }
  } catch (err) {
    return { picked: key, problem: `Could not remember the word pick on this device: ${messageOf(err)}` }
  }
}

/** `key` is a word source key ("unit:3", "lesson:u3-01-uhrzeit", lib/plan.ts sourceKey); `what` names it in an error. */
export function openWordReview(key: string, what: string): void {
  try {
    updateSettings({ wordSource: key })
  } catch (err) {
    reportError(`Could not pick ${what} for the word review on this device, so it shows your last pick: ${messageOf(err)}`)
  }
  window.location.hash = link('words')
}
