// A smoke test of the practice games: each renders its first screen from real word cards, and says
// so plainly when there are too few learned words. Speech and taps need a browser; the logic is in
// lib/games.test.ts.
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

describe('the practice games render', () => {
  it('each shows its first question with learned words', () => {
    const speak = renderToStaticMarkup(<SpeakWords words={words} state={learned} back={back} onAgain={noop} />)
    expect(speak).toContain('Say the words')
    // Recall, not repeating: the English shows big, the German (text and play button) only after an answer.
    expect(speak).toContain('speak-prompt')
    expect(speak).not.toContain('Slow')
    // The helper text sits below the answer controls.
    expect(speak.indexOf('Say or type the German')).toBeGreaterThan(speak.indexOf('German word'))
    expect(renderToStaticMarkup(<SpeakSentences words={words} state={learned} back={back} onAgain={noop} />)).toContain('Say it in German')
    expect(renderToStaticMarkup(<ArticleDrill words={words} state={learned} back={back} onAgain={noop} />)).toContain('der, die or das?')
    const gaps = renderToStaticMarkup(<GapFill words={words} pool={words} state={learned} back={back} onAgain={noop} />)
    expect(gaps).toContain('gap-blank')
    expect((gaps.match(/class="btn pick-option/g) ?? []).length).toBe(3)
    const build = renderToStaticMarkup(<BuildSentence words={words} pool={words} state={learned} back={back} onAgain={noop} />)
    expect(build).toContain('Build it in German')
    expect(build).toContain('build-tile')
  })

  it('each says it needs learned words when there are none', () => {
    const none = emptyState(t0)
    for (const html of [
      renderToStaticMarkup(<SpeakWords words={words} state={none} back={back} onAgain={noop} />),
      renderToStaticMarkup(<SpeakSentences words={words} state={none} back={back} onAgain={noop} />),
      renderToStaticMarkup(<ArticleDrill words={words} state={none} back={back} onAgain={noop} />),
      renderToStaticMarkup(<GapFill words={words} pool={words} state={none} back={back} onAgain={noop} />),
      renderToStaticMarkup(<BuildSentence words={words} pool={words} state={none} back={back} onAgain={noop} />),
    ]) {
      expect(html).toContain('This game needs at least')
    }
    // From several tiles on the Words map: it says where the words were looked for.
    const fromTiles = renderToStaticMarkup(<SpeakWords words={words} state={none} back={{ href: '#/words/map', lessons: 2 }} onAgain={noop} />)
    expect(fromTiles).toContain(' in these 2 lessons')
    expect(fromTiles).toContain('back to the map')
  })
})
