// Renders the lesson text format (content/richtext.ts) as React elements, never as raw HTML.
import type { ReactNode } from 'react'
import { parseRich } from '../content/richtext.ts'
import type { Inline } from '../content/richtext.ts'
import { GermanText } from './GermanText.tsx'

function spans(list: Inline[]): ReactNode[] {
  return list.map((s, i) => {
    if (s.t === 'text') return <span key={i}>{s.v}</span>
    if (s.t === 'de')
      return (
        <span key={i} lang="de" className="de-inline">
          <GermanText text={s.v} />
        </span>
      )
    if (s.t === 'b') return <strong key={i}>{spans(s.c)}</strong>
    return <em key={i}>{spans(s.c)}</em>
  })
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="rich">
      {parseRich(text).map((b, i) => {
        if (b.t === 'p') {
          return (
            <p key={i}>
              {b.lines.map((line, k) => (
                <span key={k}>
                  {k > 0 && <br />}
                  {spans(line)}
                </span>
              ))}
            </p>
          )
        }
        const items = b.items.map((it, k) => <li key={k}>{spans(it)}</li>)
        return b.t === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>
      })}
    </div>
  )
}
