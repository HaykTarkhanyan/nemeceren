// "Ask Claude about this": copies an answered item as plain text for the chat (lib/askClaude.ts).
// A failed copy is an error, and the text then stays on screen to copy by hand.
import { useState } from 'react'
import { messageOf, reportError } from '../lib/errors.ts'

export function AskClaude({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('this browser gives the page no clipboard access')
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch (err) {
      reportError(`Could not copy the question for Claude: ${messageOf(err)}. The text is shown below the item; copy it by hand.`)
      setState('failed')
    }
  }
  return (
    <div className="ask-claude">
      <button type="button" className="btn small" onClick={copy}>
        Ask Claude about this
      </button>
      {state === 'copied' && <span className="small muted">Copied. Paste it into the chat with Claude.</span>}
      {state === 'failed' && <textarea className="ask-claude-text" readOnly value={text} rows={6} onFocus={(e) => e.currentTarget.select()} />}
    </div>
  )
}
