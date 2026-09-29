import { describe, expect, it } from 'vitest'
import { germanSpans, parseRich, RichTextError } from './richtext.ts'

describe('lesson rich text', () => {
  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(parseRich('One.\nTwo.\n\nThree.')).toEqual([
      { t: 'p', lines: [[{ t: 'text', v: 'One.' }], [{ t: 'text', v: 'Two.' }]] },
      { t: 'p', lines: [[{ t: 'text', v: 'Three.' }]] },
    ])
  })

  it('reads bullet and numbered lists', () => {
    const blocks = parseRich('- a\n- b\n\n1. x\n2. y')
    expect(blocks.map((b) => b.t)).toEqual(['ul', 'ol'])
    expect(blocks[1]).toEqual({ t: 'ol', items: [[{ t: 'text', v: 'x' }], [{ t: 'text', v: 'y' }]] })
  })

  it('starts a list right after a text line, and goes back to text after it', () => {
    const blocks = parseRich('Three questions:\n- [[Wie heißen Sie?]]\n- [[Woher kommen Sie?]]\nThat is all.')
    expect(blocks.map((b) => b.t)).toEqual(['p', 'ul', 'p'])
    expect(blocks[1]).toEqual({ t: 'ul', items: [[{ t: 'de', v: 'Wie heißen Sie?' }], [{ t: 'de', v: 'Woher kommen Sie?' }]] })
  })

  it('reads bold, italic and German, with German inside bold', () => {
    expect(parseRich('Say **[[ich heiße]] Hayk** or *not*.')).toEqual([
      {
        t: 'p',
        lines: [
          [
            { t: 'text', v: 'Say ' },
            { t: 'b', c: [{ t: 'de', v: 'ich heiße' }, { t: 'text', v: ' Hayk' }] },
            { t: 'text', v: ' or ' },
            { t: 'i', c: [{ t: 'text', v: 'not' }] },
            { t: 'text', v: '.' },
          ],
        ],
      },
    ])
  })

  it('collects the German parts, including those in lists and bold', () => {
    expect(germanSpans('[[Hallo]] and **[[Tschüss]]**\n\n- [[Wie heißen Sie?]]')).toEqual(['Hallo', 'Tschüss', 'Wie heißen Sie?'])
  })

  it('rejects broken markup loudly', () => {
    expect(() => parseRich('an **open bold')).toThrow(RichTextError)
    expect(() => parseRich('an [[open German')).toThrow(/without a closing/)
    expect(() => parseRich('stray ]] here')).toThrow(/without an opening/)
    expect(() => parseRich('**bold *and italic* inside**')).toThrow(/cannot be nested/)
    expect(() => parseRich('empty [[ ]] here')).toThrow(/empty/)
  })
})
