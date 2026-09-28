import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { GlossSurface } from '../glossary/gate.ts'
import { GermanText, GlossScope } from './GermanText.tsx'

function render(surface: GlossSurface, text: string): string {
  return renderToStaticMarkup(
    <GlossScope surface={surface}>
      <p>
        <GermanText text={text} />
      </p>
    </GlossScope>,
  )
}

const wordCount = (html: string) => (html.match(/class="gloss-word /g) ?? []).length

describe('GermanText popups follow the gate', () => {
  it('renders plain text on an unanswered test item', () => {
    expect(render({ kind: 'test-item', submitted: false }, 'Ich komme aus Armenien.')).toBe('<p>Ich komme aus Armenien.</p>')
  })

  it('makes every word focusable once the test is submitted, keeping the text intact', () => {
    const html = render({ kind: 'test-item', submitted: true }, 'Ich komme aus Armenien.')
    expect(wordCount(html)).toBe(4)
    expect(html).toContain('tabindex="0"')
    expect(html.replace(/<[^>]+>/g, '')).toBe('Ich komme aus Armenien.')
  })

  it('is off on a review card before reveal and on after', () => {
    expect(wordCount(render({ kind: 'review-card', revealed: false }, 'der Termin'))).toBe(0)
    expect(wordCount(render({ kind: 'review-card', revealed: true }, 'der Termin'))).toBe(2)
  })

  it('is on elsewhere', () => {
    expect(wordCount(render({ kind: 'page' }, 'Guten Tag'))).toBe(2)
  })

  it('refuses to render German text outside a scope', () => {
    expect(() => renderToStaticMarkup(<GermanText text="Hallo" />)).toThrow(/outside a GlossScope/)
  })
})
