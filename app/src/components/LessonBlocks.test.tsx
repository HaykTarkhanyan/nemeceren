import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Lesson, LessonBlock } from '../content/schema.ts'
import { BlockView } from './LessonBlocks.tsx'

const lesson: Lesson = { id: 'u1-01-x', unit: 1, order: 1, level: 'A1', title: 'T', summary: 'S', goals: ['g'], sections: [] }
const render = (block: LessonBlock, exerciseNumber: number | null = null) =>
  renderToStaticMarkup(<BlockView lesson={lesson} block={block} section={0} exerciseNumber={exerciseNumber} />)
const popupWords = (html: string) => (html.match(/class="gloss-word /g) ?? []).length

describe('word popups in lessons (Hayk: reading material yes, exercises only after answering)', () => {
  it('are on for explanation, examples, table "words" columns and audio', () => {
    expect(popupWords(render({ type: 'explanation', text: 'Say **[[Guten Tag]]** to everyone.' }))).toBe(2)
    expect(popupWords(render({ type: 'examples', items: [{ de: 'Ich heiße Hayk.', en: 'My name is Hayk.' }] }))).toBe(3)
    expect(popupWords(render({ type: 'audio', items: [{ de: 'Wie heißen Sie?' }] }))).toBe(3)
    const table = render({ type: 'table', columns: [{ header: 'L', de: 'sound' }, { header: 'W', de: 'words' }, { header: 'E' }], rows: [['ei', 'mein', 'my']] })
    expect(popupWords(table)).toBe(1)
    expect(table).toContain('<span lang="de" class="sound">ei</span>')
  })

  it('are off in an exercise until the answers are checked', () => {
    const html = render(
      {
        type: 'exercise',
        items: [
          { type: 'mc', question: 'Woher kommen Sie?', options: ['Aus Armenien.', 'In München.'], answer: 'Aus Armenien.' },
          { type: 'translate', direction: 'de-en', text: 'Ich wohne in München.' },
        ],
      },
      1,
    )
    expect(html).toContain('Woher kommen Sie?')
    expect(html).toContain('Check answers')
    expect(popupWords(html)).toBe(0)
  })

  it('never renders lesson text as HTML', () => {
    const html = render({ type: 'explanation', text: 'Not <b>bold</b> <script>x</script>' })
    expect(html).toContain('Not &lt;b&gt;bold&lt;/b&gt; &lt;script&gt;x&lt;/script&gt;')
  })
})
