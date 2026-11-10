import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LessonVideo } from '../content/schema.ts'
import { VideoList } from './VideoList.tsx'

const withNotes: LessonVideo = {
  id: 'IowuDehrLFk',
  title: 'Regular verbs',
  minutes: 15,
  notes: {
    points: ['Say [[ich wohne]].', 'With **du**: -st.', 'Plural: -en.'],
    phrases: [
      { de: 'Wir wohnen hier.', en: 'We live here.' },
      { de: 'Du wohnst dort.', en: 'You live there.' },
      { de: 'Er wohnt da.', en: 'He lives there.' },
    ],
    extra: 'The verb [[reisen]].',
  },
}
const plain: LessonVideo = { id: 'RElBVZ1Wke0', title: 'Introducing yourself', minutes: 10 }

describe('VideoList "Read instead"', () => {
  it('folds the notes away under the video, with the points, the phrases and the extra line', () => {
    const html = renderToStaticMarkup(<VideoList videos={[withNotes]} />)
    expect(html).toContain('<details class="video-notes"><summary>Read instead</summary>')
    expect(html).not.toMatch(/<details[^>]* open/)
    expect((html.match(/<li>/g) ?? []).length).toBe(6) // 3 points + 3 phrases
    expect((html.match(/aria-label="Listen"/g) ?? []).length).toBe(3) // a speaker per phrase
    expect(html).toContain('We live here.')
    expect(html).toContain('Also in the video:')
    // The German gets word popups (the notes sit in a GlossScope), the English does not.
    expect(html).toMatch(/class="gloss-word "[^>]*>wohnen<\/span>/)
    expect(html).not.toMatch(/class="gloss-word "[^>]*>live<\/span>/)
  })

  it('shows no "Read instead" for a video without notes', () => {
    const html = renderToStaticMarkup(<VideoList videos={[plain]} />)
    expect(html).not.toContain('Read instead')
    expect(html).toContain('Introducing yourself')
  })
})
