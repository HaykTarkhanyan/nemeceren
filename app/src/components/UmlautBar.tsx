// Buttons that insert German letters at the cursor of the last focused text box, and the digit
// keys that do the same while typing (1 ä, 2 ö, 3 ü, 4 ß; lib/keys.ts). Hayk's keyboard is not German.
import { useState } from 'react'
import { messageOf, reportError } from '../lib/errors.ts'
import { umlautFor, umlautKeysOn } from '../lib/keys.ts'
import type { UmlautScope } from '../lib/keys.ts'
import { getSettings, useSettings } from '../lib/settings.ts'

const LETTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü']

type TextBox = HTMLInputElement | HTMLTextAreaElement
let lastBox: TextBox | null = null

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target
    if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === 'text')) lastBox = t
  })
  // The digit keys type umlauts in boxes marked with umlautKeys(scope), if the device setting allows.
  document.addEventListener(
    'keydown',
    (e) => {
      const t = e.target
      if (!(t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === 'text'))) return
      const scope = t.dataset.umlautKeys as UmlautScope | undefined
      if (!scope || e.isComposing || t.readOnly || t.disabled) return
      const letter = umlautFor(e.code, { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey })
      if (!letter) return
      let setting
      try {
        setting = getSettings().umlautKeys
      } catch (err) {
        reportError(`The umlaut keys are off: the settings on this device cannot be read: ${messageOf(err)}`)
        return
      }
      if (!umlautKeysOn(setting, scope)) return
      e.preventDefault()
      insertAtCursor(t, letter)
    },
    true,
  )
}

/** Props that let the digit keys type umlauts in a text box (null: the box keeps real digits). */
export function umlautKeys(scope: UmlautScope | null): { 'data-umlaut-keys'?: UmlautScope } {
  return scope ? { 'data-umlaut-keys': scope } : {}
}

function insertAtCursor(el: TextBox, text: string): void {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  // Use the native setter so React's onChange sees the change.
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  el.setSelectionRange(start + text.length, start + text.length)
}

/** `keys`: the scope of the boxes this bar serves, to show the key reminder when the digit keys are on. */
export function UmlautBar({ keys = null }: { keys?: UmlautScope | null }) {
  const [msg, setMsg] = useState<string | null>(null)
  const settings = useSettings()
  const onClick = (letter: string) => {
    if (!lastBox || !lastBox.isConnected || lastBox.readOnly || lastBox.disabled) {
      setMsg('Tap into a text box first.')
      return
    }
    setMsg(null)
    insertAtCursor(lastBox, letter)
  }
  return (
    <div className="umlaut-bar" aria-label="German letters">
      {LETTERS.map((l) => (
        <button
          key={l}
          type="button"
          className="umlaut-btn"
          // Keep focus (and the cursor position) in the text box.
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onClick(l)}
        >
          {l}
        </button>
      ))}
      {msg && <span className="muted small">{msg}</span>}
      {keys && umlautKeysOn(settings.umlautKeys, keys) && (
        <span className="muted small">Keys: 1 ä, 2 ö, 3 ü, 4 ß (with Shift: Ä Ö Ü). The number pad types digits.</span>
      )}
    </div>
  )
}
