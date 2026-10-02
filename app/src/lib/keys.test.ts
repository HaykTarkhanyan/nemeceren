import { describe, expect, it } from 'vitest'
import { needsDigits, testKeyAction, umlautFor, umlautKeysOn } from './keys.ts'
import type { TestKeyInput } from './keys.ts'

const none = { shift: false, ctrl: false, alt: false, meta: false }

describe('umlaut keys', () => {
  it('maps 1-4 to ä ö ü ß and Shift+1-3 to Ä Ö Ü, by physical key', () => {
    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4'].map((c) => umlautFor(c, none))).toEqual(['ä', 'ö', 'ü', 'ß'])
    expect(['Digit1', 'Digit2', 'Digit3'].map((c) => umlautFor(c, { ...none, shift: true }))).toEqual(['Ä', 'Ö', 'Ü'])
  })

  it('leaves other keys, the number pad, Shift+4 and modifier combos alone', () => {
    expect(umlautFor('Digit5', none)).toBeNull()
    expect(umlautFor('Numpad3', none)).toBeNull()
    expect(umlautFor('Digit4', { ...none, shift: true })).toBeNull()
    expect(umlautFor('Digit3', { ...none, ctrl: true })).toBeNull()
    expect(umlautFor('Digit3', { ...none, alt: true })).toBeNull()
  })

  it('applies the device setting per scope', () => {
    expect(umlautKeysOn('answers', 'answer')).toBe(true)
    expect(umlautKeysOn('answers', 'free')).toBe(false)
    expect(umlautKeysOn('everywhere', 'free')).toBe(true)
    expect(umlautKeysOn('off', 'answer')).toBe(false)
  })

  it('keeps real digits when an answer needs them', () => {
    expect(needsDigits(['vierzig'])).toBe(false)
    expect(needsDigits(['Um 8 Uhr.'])).toBe(true)
  })
})

describe('test keys', () => {
  const base: TestKeyInput = { key: 'Enter', ctrl: false, shift: false, alt: false, meta: false, focus: 'other', options: 0, hasAudio: false, last: false }

  it('Enter goes to the next question, also from a choice or a short answer box', () => {
    expect(testKeyAction(base)).toEqual({ kind: 'next' })
    expect(testKeyAction({ ...base, focus: 'choice' })).toEqual({ kind: 'next' })
    expect(testKeyAction({ ...base, focus: 'textbox' })).toEqual({ kind: 'next' })
  })

  it('Enter never submits: nothing happens on the last question, even with Ctrl', () => {
    expect(testKeyAction({ ...base, last: true })).toBeNull()
    expect(testKeyAction({ ...base, last: true, ctrl: true })).toBeNull()
  })

  it('keeps Enter for other buttons and for new lines in the long writing box (Ctrl+Enter = next)', () => {
    expect(testKeyAction({ ...base, focus: 'button' })).toBeNull()
    expect(testKeyAction({ ...base, focus: 'textarea-long' })).toBeNull()
    expect(testKeyAction({ ...base, focus: 'textarea-long', ctrl: true })).toEqual({ kind: 'next' })
    expect(testKeyAction({ ...base, shift: true })).toBeNull()
  })

  it('Space plays the audio; while typing only Shift+Space does', () => {
    const space = { ...base, key: ' ', hasAudio: true }
    expect(testKeyAction(space)).toEqual({ kind: 'play' })
    expect(testKeyAction({ ...space, focus: 'textbox' })).toBeNull()
    expect(testKeyAction({ ...space, focus: 'textbox', shift: true })).toEqual({ kind: 'play' })
    expect(testKeyAction({ ...space, hasAudio: false })).toBeNull()
  })

  it('1-9 pick a choice that exists, and not while typing', () => {
    const mc = { ...base, options: 3 }
    expect(testKeyAction({ ...mc, key: '1' })).toEqual({ kind: 'choose', option: 0 })
    expect(testKeyAction({ ...mc, key: '3' })).toEqual({ kind: 'choose', option: 2 })
    expect(testKeyAction({ ...mc, key: '4' })).toBeNull()
    expect(testKeyAction({ ...mc, key: '2', focus: 'textbox' })).toBeNull()
    expect(testKeyAction({ ...base, key: '1' })).toBeNull()
  })
})
