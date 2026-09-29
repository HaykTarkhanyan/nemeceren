import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NoteFeedback } from '../content/schema.ts'
import { GlossScope } from '../components/GermanText.tsx'
import { FeedbackBody } from './NotesPage.tsx'

const feedback: NoteFeedback = {
  summary: 'Good. Look at [[Morgen ich gehe]] again.',
  hints: ['Where does the verb go?'],
  corrected: 'Morgen gehe ich zur Arbeit.',
  edits: [
    { from: 'Morgen ich gehe', to: 'Morgen gehe ich', why: 'The verb comes second.', kind: 'error' },
    { from: 'zu der', to: 'zur', why: 'Shorter.', kind: 'style' },
  ],
  at: '2026-09-29T12:00:00.000Z',
}

const render = (f: NoteFeedback, revealed: boolean) =>
  renderToStaticMarkup(
    <GlossScope surface={{ kind: 'notes' }}>
      <FeedbackBody feedback={f} revealed={revealed} onReveal={() => {}} />
    </GlossScope>,
  )

describe('note feedback: hint first, corrections on request', () => {
  it('shows the summary and hints, but not the corrections, until "Show corrections"', () => {
    const html = render(feedback, false)
    expect(html).toContain('Where does the verb go?')
    expect(html).toContain('Morgen ich gehe')
    expect(html).toContain('Show corrections')
    expect(html).not.toContain('Morgen gehe ich zur Arbeit.')
    expect(html).not.toContain('The verb comes second.')
    expect(html).not.toContain('Shorter.')
  })

  it('then shows the corrected text, and mistakes apart from style suggestions', () => {
    const html = render(feedback, true)
    expect(html).not.toContain('Show corrections')
    expect(html).toContain('Morgen gehe ich zur Arbeit.')
    const mistakes = html.indexOf('Mistakes')
    const style = html.indexOf('Style suggestions (not mistakes)')
    expect(mistakes).toBeGreaterThan(-1)
    expect(style).toBeGreaterThan(mistakes)
    expect(html.indexOf('The verb comes second.')).toBeGreaterThan(mistakes)
    expect(html.indexOf('The verb comes second.')).toBeLessThan(style)
    expect(html.indexOf('Shorter.')).toBeGreaterThan(style)
  })

  it('has no button when there are no corrections, and no word popups', () => {
    const html = render({ summary: 'All correct: [[Guten Morgen]]!', at: feedback.at }, false)
    expect(html).not.toContain('Show corrections')
    expect(html).not.toContain('gloss-word')
  })
})
