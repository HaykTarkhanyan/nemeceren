// One lesson section, by block type. Explanations, examples, tables and audio are reading
// material: word popups are on. Exercises are gated like tests (off until checked).
import { useEffect } from 'react'
import { exerciseTestId } from '../content/lessons.ts'
import type { Lesson, LessonBlock } from '../content/schema.ts'
import { De, GermanText, GlossScope } from './GermanText.tsx'
import { InlineExercise } from './InlineExercise.tsx'
import { RichText } from './RichText.tsx'
import { PlayButtons, Speaker } from './Speaker.tsx'
import { ensureGlossary, useGlossary } from '../glossary/load.ts'
import { lyricsLines, wordCounts } from '../lib/lyrics.ts'

const LABEL: Partial<Record<LessonBlock['type'], string>> = {
  comparison: 'Russian and Armenian',
  tip: 'Tip',
  warning: 'Watch out',
  exercise: 'Exercise',
  audio: 'Listen and repeat',
}

export function BlockView(props: { lesson: Lesson; block: LessonBlock; section: number; exerciseNumber: number | null }) {
  const { lesson, block, section, exerciseNumber } = props
  const label = LABEL[block.type]
  const heading = block.title ?? (block.type === 'exercise' ? `Exercise ${exerciseNumber}` : undefined)
  return (
    <GlossScope surface={{ kind: 'page' }}>
      <div className={`block block-${block.type}`}>
        {label && block.type !== 'exercise' && <span className="block-label">{label}</span>}
        {heading && <h3 className="block-title">{heading}</h3>}
        <BlockBody lesson={lesson} block={block} section={section} exerciseNumber={exerciseNumber} />
      </div>
    </GlossScope>
  )
}

function BlockBody(props: { lesson: Lesson; block: LessonBlock; section: number; exerciseNumber: number | null }) {
  const { lesson, block, section, exerciseNumber } = props
  switch (block.type) {
    case 'explanation':
    case 'comparison':
    case 'tip':
    case 'warning':
      return <RichText text={block.text} />
    case 'examples':
      return (
        <ul className="examples">
          {block.items.map((it, i) => (
            <li key={i}>
              <div className="example-de">
                <De text={it.de} />
              </div>
              <div className="muted">{it.en}</div>
              {it.note && <div className="small">{it.note}</div>}
            </li>
          ))}
        </ul>
      )
    case 'table':
      return (
        <div className="table-wrap">
          <table className="lesson-table">
            <thead>
              <tr>
                {block.columns.map((c, i) => (
                  <th key={i}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => {
                    const col = block.columns[c]
                    if (cell === '') return <td key={c} />
                    if (col.de === 'words') {
                      return (
                        <td key={c}>
                          <De text={cell} />
                        </td>
                      )
                    }
                    if (col.de === 'sound') {
                      return (
                        <td key={c}>
                          <span lang="de" className="sound">
                            {cell}
                          </span>{' '}
                          <Speaker text={cell} />
                        </td>
                      )
                    }
                    return <td key={c}>{cell}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'audio':
      return (
        <ul className="audio-list">
          {block.items.map((it, i) => (
            <li key={i}>
              <PlayButtons text={it.de} />
              <div>
                <span lang="de" className="audio-de">
                  <GermanText text={it.de} />
                </span>
                {it.en && <div className="muted">{it.en}</div>}
                {it.note && <div className="small">{it.note}</div>}
              </div>
            </li>
          ))}
        </ul>
      )
    case 'lyrics':
      return <LyricsView block={block} />
    case 'exercise': {
      if (exerciseNumber === null) throw new Error(`Exercise at section ${section} of "${lesson.id}" has no number`)
      return (
        <InlineExercise
          items={block.items}
          meta={{
            testId: exerciseTestId(lesson.id, exerciseNumber),
            testTitle: `${lesson.title}: ${block.title ?? `Exercise ${exerciseNumber}`}`,
            level: lesson.level,
            lessonId: lesson.id,
            section,
          }}
        />
      )
    }
  }
}

/** The full text with a translation per line, folded away; the header counts the words (lib/lyrics.ts). */
function LyricsView({ block }: { block: Extract<LessonBlock, { type: 'lyrics' }> }) {
  const glossary = useGlossary()
  // The dictionary-word count needs the glossary; load it now so the count shows before opening.
  useEffect(() => ensureGlossary(), [])
  const counts = wordCounts(lyricsLines(block), glossary.status === 'ready' ? glossary.glossary : null)
  return (
    <details className="lyrics">
      <summary>
        <strong>{block.title ?? 'Full lyrics with translation'}</strong>{' '}
        <span className="muted small">
          {counts.lines} lines, {counts.forms} unique words
          {counts.lemmas !== null ? ` (${counts.lemmas} dictionary words)` : ''}
        </span>
      </summary>
      <div className="stack">
        {block.stanzas.map((s, si) => (
          <div key={si} className="lyrics-stanza">
            {s.label && <div className="label">{s.label}</div>}
            {s.lines.map((l, li) => (
              <div key={li} className="lyrics-line">
                <Speaker text={l.de} />
                <div>
                  <span lang="de">
                    <GermanText text={l.de} />
                  </span>
                  <div className="muted">{l.en}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  )
}
