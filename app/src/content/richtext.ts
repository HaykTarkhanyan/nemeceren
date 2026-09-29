// The small text format of lesson explanations, comparisons, tips and warnings.
//   paragraphs     separated by a blank line; a single line break stays a line break
//   lists          consecutive lines starting with "- " (bullets) or "1. " (numbered), also right
//                  after a text line
//   **bold**, *italic*
//   [[German]]     German inside English text: word popups, and checked against the glossary
// Bold and italic may contain [[German]] but not each other. Anything else is plain text, and it
// is rendered as React text nodes (never as HTML), so content cannot inject markup.

export type Inline = { t: 'text'; v: string } | { t: 'de'; v: string } | { t: 'b' | 'i'; c: Inline[] }

export type RichBlock = { t: 'p'; lines: Inline[][] } | { t: 'ul' | 'ol'; items: Inline[][] }

export class RichTextError extends Error {}

function parseSpans(s: string, allowEmphasis: boolean): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ t: 'text', v: text })
    text = ''
  }
  let i = 0
  while (i < s.length) {
    if (s.startsWith('[[', i)) {
      const end = s.indexOf(']]', i + 2)
      if (end < 0) throw new RichTextError(`"[[" without a closing "]]" in: ${s}`)
      const de = s.slice(i + 2, end)
      if (de.trim() === '') throw new RichTextError(`empty [[ ]] in: ${s}`)
      if (de.includes('[[')) throw new RichTextError(`nested "[[" in: ${s}`)
      flush()
      out.push({ t: 'de', v: de })
      i = end + 2
    } else if (s.startsWith(']]', i)) {
      throw new RichTextError(`"]]" without an opening "[[" in: ${s}`)
    } else if (s[i] === '*') {
      if (!allowEmphasis) throw new RichTextError(`bold and italic cannot be nested: ${s}`)
      const bold = s.startsWith('**', i)
      const marker = bold ? '**' : '*'
      const end = s.indexOf(marker, i + marker.length)
      if (end < 0) throw new RichTextError(`"${marker}" without a closing "${marker}" in: ${s}`)
      const inner = s.slice(i + marker.length, end)
      if (inner.trim() === '') throw new RichTextError(`empty ${marker}${marker} in: ${s}`)
      flush()
      out.push({ t: bold ? 'b' : 'i', c: parseSpans(inner, false) })
      i = end + marker.length
    } else {
      text += s[i]
      i += 1
    }
  }
  flush()
  return out
}

const BULLET = /^\s*- /
const NUMBER = /^\s*\d+\. /

export function parseRich(text: string): RichBlock[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.split('\n').filter((l) => l.trim() !== ''))
    .flatMap((lines): RichBlock[] => {
      // Consecutive list lines form a list, also right after a text line ("Intro:\n- a\n- b").
      const out: RichBlock[] = []
      for (const line of lines) {
        const last = out[out.length - 1]
        const kind = BULLET.test(line) ? 'ul' : NUMBER.test(line) ? 'ol' : 'p'
        if (kind === 'p') {
          const spans = parseSpans(line, true)
          if (last?.t === 'p') last.lines.push(spans)
          else out.push({ t: 'p', lines: [spans] })
        } else {
          const spans = parseSpans(line.replace(kind === 'ul' ? BULLET : NUMBER, ''), true)
          if (last?.t === kind) last.items.push(spans)
          else out.push({ t: kind, items: [spans] })
        }
      }
      return out
    })
}

function collectGerman(spans: Inline[], out: string[]): void {
  for (const s of spans) {
    if (s.t === 'de') out.push(s.v)
    else if (s.t === 'b' || s.t === 'i') collectGerman(s.c, out)
  }
}

/** The [[German]] parts of a rich text, in order. Throws RichTextError on invalid markup. */
export function germanSpans(text: string): string[] {
  const out: string[] = []
  for (const b of parseRich(text)) {
    for (const line of b.t === 'p' ? b.lines : b.items) collectGerman(line, out)
  }
  return out
}
