// Keyboard shortcuts (DECISIONS.md #64). Pure helpers, so the rules are testable without a browser.
//   - While typing in a German answer box, the digit keys 1-4 type ä ö ü ß (Shift+1-3: Ä Ö Ü).
//     The physical key counts (KeyboardEvent.code), so it works with any keyboard layout. The
//     number pad still types digits.
//   - In a test: 1-9 pick a multiple-choice option, Space plays the audio (Shift+Space while
//     typing), Enter goes to the next question (Ctrl+Enter in the long writing box).

import type { Item } from '../content/schema.ts'
import type { Settings } from './settings.ts'

/** Where a text box is: an answer box (tests, exercises, word reviews) or free writing (notes, own words). */
export type UmlautScope = 'answer' | 'free'

const PLAIN: Record<string, string> = { Digit1: 'ä', Digit2: 'ö', Digit3: 'ü', Digit4: 'ß' }
const SHIFTED: Record<string, string> = { Digit1: 'Ä', Digit2: 'Ö', Digit3: 'Ü' }

/** The letter a key types in an umlaut box, or null when the key keeps its normal meaning. */
export function umlautFor(code: string, mods: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean }): string | null {
  if (mods.ctrl || mods.alt || mods.meta) return null
  return (mods.shift ? SHIFTED[code] : PLAIN[code]) ?? null
}

/** Whether the digit keys type umlauts in a box of this scope, under the device setting. */
export function umlautKeysOn(setting: Settings['umlautKeys'], scope: UmlautScope): boolean {
  if (setting === 'off') return false
  return setting === 'everywhere' || scope === 'answer'
}

/** An answer that needs real digits (a number, a time) keeps the digit keys as digits. */
export function needsDigits(expected: string[]): boolean {
  return expected.some((s) => /\d/.test(s))
}

/** The texts a typed answer is checked against: a digit among them means the answer needs digits. */
function expectedTexts(item: Item): string[] {
  if (item.type === 'gap') return item.answers.flat()
  if (item.type === 'translate') return item.references ?? []
  if (item.type === 'dictation') return [item.text]
  return []
}

/** Whether an item's answer box gets the digit umlaut keys: not if the item says `digits: true`
 * (a write task about times or prices) or its expected answer contains a digit. */
export function itemUmlautScope(item: Item): UmlautScope | null {
  return item.digits || needsDigits(expectedTexts(item)) ? null : 'answer'
}

export type TestKeyAction = { kind: 'next' } | { kind: 'play' } | { kind: 'choose'; option: number } | null

export interface TestKeyInput {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  /** What has the focus. */
  focus: 'textbox' | 'textarea-long' | 'choice' | 'button' | 'other'
  /** Choices on screen (multiple choice, listening), 0 for other items. */
  options: number
  hasAudio: boolean
  last: boolean
}

/** What a key press does on a test question; null = leave the key alone. */
export function testKeyAction(k: TestKeyInput): TestKeyAction {
  if (k.alt || k.meta) return null
  if (k.key === 'Enter') {
    if (k.ctrl) return k.last ? null : { kind: 'next' }
    // Other buttons (Back, Next, hint, the item dots) keep their own Enter; a long text needs new lines.
    if (k.focus === 'button' || k.focus === 'textarea-long' || k.shift) return null
    return k.last ? null : { kind: 'next' }
  }
  if (k.ctrl) return null
  if (k.key === ' ') {
    if (!k.hasAudio) return null
    if (k.focus === 'textbox' || k.focus === 'textarea-long') return k.shift ? { kind: 'play' } : null
    return { kind: 'play' }
  }
  if (k.focus === 'textbox' || k.focus === 'textarea-long' || k.shift) return null
  const n = /^[1-9]$/.test(k.key) ? Number(k.key) : 0
  return n >= 1 && n <= k.options ? { kind: 'choose', option: n - 1 } : null
}
