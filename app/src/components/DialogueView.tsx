// A scene as a dialogue (the stories at the end of each unit, DECISIONS.md #80): the text is
// always shown, each line has a play button and a translation on tap, and "Play the scene" reads
// all lines one after another, each speaker in their own voice where the device has two.
import { useEffect, useState } from 'react'
import type { LessonBlock } from '../content/schema.ts'
import { speakLines, stopSpeaking } from '../lib/speech.ts'
import { GermanText } from './GermanText.tsx'
import { SpeakerIcon } from './Speaker.tsx'

type Dialogue = Extract<LessonBlock, { type: 'dialogue' }>

export function DialogueView({ block }: { block: Dialogue }) {
  const speakers = [...new Set(block.lines.map((l) => l.speaker))]
  const who = (name: string) => speakers.indexOf(name)
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set())
  const [allShown, setAllShown] = useState(false)
  // A scene read with "Play the scene" stops when the lesson is left.
  useEffect(() => stopSpeaking, [])
  function toggle(i: number) {
    setShown((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }
  return (
    <div className="dialogue">
      <div className="row">
        <button type="button" className="btn small" onClick={() => speakLines(block.lines.map((l) => ({ text: l.de, speaker: who(l.speaker) })))}>
          <SpeakerIcon /> Play the scene
        </button>
        <button type="button" className="btn small" onClick={stopSpeaking}>
          Stop
        </button>
        <button type="button" className="btn small" onClick={() => setAllShown((v) => !v)}>
          {allShown ? 'Hide translations' : 'Show all translations'}
        </button>
      </div>
      <ol className="dialogue-lines">
        {block.lines.map((l, i) => (
          <li key={i} className={`dialogue-line speaker-${who(l.speaker) % 4}`}>
            <span className="dialogue-speaker">{l.speaker}</span>
            <div className="dialogue-body">
              <span className="row dialogue-de">
                <button type="button" className="icon-btn" aria-label="Listen" title="Listen" onClick={() => speakLines([{ text: l.de, speaker: who(l.speaker) }])}>
                  <SpeakerIcon />
                </button>
                <span lang="de">
                  <GermanText text={l.de} />
                </span>
              </span>
              {allShown || shown.has(i) ? (
                <span className="muted small dialogue-en">{l.en}</span>
              ) : (
                <button type="button" className="link-btn small" onClick={() => toggle(i)}>
                  translation
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
