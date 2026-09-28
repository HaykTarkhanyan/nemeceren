// Buttons that insert German letters at the cursor of the last focused text box.
// Hayk's keyboard is not German.
import { useState } from 'react'

const LETTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü']

type TextBox = HTMLInputElement | HTMLTextAreaElement
let lastBox: TextBox | null = null

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target
    if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === 'text')) lastBox = t
  })
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

export function UmlautBar() {
  const [msg, setMsg] = useState<string | null>(null)
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
    </div>
  )
}
