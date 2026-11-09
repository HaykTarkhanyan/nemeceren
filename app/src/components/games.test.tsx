// A smoke test of the practice games: each renders its first screen from real word cards, learned
// or not, and says so plainly when the words are too few. Speech and taps need a browser; the logic
// is in lib/games.test.ts.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { content } from '../content/load.ts'
import type { ReviewState } from '../content/schema.ts'
import { emptyState, Rating, review } from '../lib/srs.ts'
import { ArticleDrill } from './ArticleDrill.tsx'
import { BuildSentence } from './BuildSentence.tsx'
import type { GameBack } from './GameFrame.tsx'
import { GapFill } from './GapFill.tsx'
import { SpeakSentences, SpeakWords } from './SpeakGames.tsx'

// Without a browser there is no speech recognition, so the speaking games start in typing mode; the
// umlaut bar reads the device settings through a store that server rendering cannot use.
vi.mock('./UmlautBar.tsx', () => ({ UmlautBar: () => null, umlautKeys: () => ({}) }))

const t0 = new Date(2026, 10, 7, 10, 0, 0)
const words = content.words.filter((w) => w.example).slice(0, 80)
let learned: ReviewState = emptyState(t0)
for (const w of words) learned = review(learned, w.id, Rating.Good, t0).state
const back: GameBack = { href: '#/', lessons: 0 }
const noop = () => {}

const pick = 'learned-first' as const

describe('the practice games render', () => {
  it('each shows its first question with learned words', () => {
    const speak = renderToStaticMarkup(<SpeakWords words={words} state={learned} back={back} pick={pick} onAgain={noop} />)
    expect(speak).toContain('Say the words')
    // Recall, not repeating: the English shows big, the German (text and play button) only after an answer.
    expect(speak).toContain('speak-prompt')
    expect(speak).not.toContain('Slow')
    // The helper text sits below the answer controls.
    expect(speak.indexOf('Say or type the German')).toBeGreaterThan(speak.indexOf('German word'))
    expect(renderToStaticMarkup(<SpeakSentences words={words} state={learned} back={back} pick={pick} onAgain={noop} />)).toContain('Say it in German')
    expect(renderToStaticMarkup(<ArticleDrill words={words} state={learned} back={back} pick={pick} onAgain={noop} />)).toContain('der, die or das?')
    const gaps = renderToStaticMarkup(<GapFill words={words} pool={words} state={learned} back={back} pick={pick} onAgain={noop} />)
    expect(gaps).toContain('gap-blank')
    expect((gaps.match(/class="btn pick-option/g) ?? []).length).toBe(3)
    const build = renderToStaticMarkup(<BuildSentence words={words} pool={words} state={learned} back={back} pick={pick} onAgain={noop} />)
    expect(build).toContain('Build it in German')
    expect(build).toContain('build-tile')
  })

  it('each plays on words not learned yet too, from Home and from map tiles', () => {
    const none = emptyState(t0)
    for (const p of ['learned-first', 'any'] as const) {
      expect(renderToStaticMarkup(<SpeakWords words={words} state={none} back={back} pick={p} onAgain={noop} />)).toContain('speak-prompt')
      expect(renderToStaticMarkup(<SpeakSentences words={words} state={none} back={back} pick={p} onAgain={noop} />)).toContain('Say it in German')
      const drill = renderToStaticMarkup(<ArticleDrill words={words} state={none} back={back} pick={p} onAgain={noop} />)
      expect(drill).toContain('der, die or das?')
      // The start screen does not call these nouns learned.
      expect(drill).toContain('not learned yet')
      expect(drill).not.toContain('you have learned')
      expect(renderToStaticMarkup(<GapFill words={words} pool={words} state={none} back={back} pick={p} onAgain={noop} />)).toContain('gap-blank')
      expect(renderToStaticMarkup(<BuildSentence words={words} pool={words} state={none} back={back} pick={p} onAgain={noop} />)).toContain('build-tile')
    }
  })

  it('each says so when the words are too few, without asking for learned words', () => {
    const none = emptyState(t0)
    for (const html of [
      renderToStaticMarkup(<SpeakWords words={[]} state={none} back={back} pick={pick} onAgain={noop} />),
      renderToStaticMarkup(<SpeakSentences words={[]} state={none} back={back} pick={pick} onAgain={noop} />),
      renderToStaticMarkup(<ArticleDrill words={[]} state={none} back={back} pick={pick} onAgain={noop} />),
      renderToStaticMarkup(<GapFill words={[]} pool={[]} state={none} back={back} pick={pick} onAgain={noop} />),
      renderToStaticMarkup(<BuildSentence words={[]} pool={[]} state={none} back={back} pick={pick} onAgain={noop} />),
    ]) {
      expect(html).toContain('This game needs at least')
      expect(html).not.toContain('learned')
    }
    // From several tiles on the Words map: it says where the words were looked for.
    const fromTiles = renderToStaticMarkup(<SpeakWords words={[]} state={none} back={{ href: '#/words/map', lessons: 2 }} pick="any" onAgain={noop} />)
    expect(fromTiles).toContain(' in these 2 lessons')
    expect(fromTiles).toContain('back to the map')
  })
})
