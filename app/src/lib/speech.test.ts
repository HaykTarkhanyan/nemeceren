import { describe, expect, it } from 'vitest'
import { audioTurns, dialogueVoice, isRobotic, pickVoice, rankVoices } from './speech.ts'

describe('listening audio turns', () => {
  it('one line is one turn with the first voice', () => {
    expect(audioTurns('Der Zug nach Berlin hat Verspätung.')).toEqual([{ text: 'Der Zug nach Berlin hat Verspätung.', speaker: 0 }])
  })

  it('a dialogue, one turn per line, alternates two voices', () => {
    expect(audioTurns('Wie geht es Ihnen?\nGut, danke. Und Ihnen?\nAuch gut.')).toEqual([
      { text: 'Wie geht es Ihnen?', speaker: 0 },
      { text: 'Gut, danke. Und Ihnen?', speaker: 1 },
      { text: 'Auch gut.', speaker: 0 },
    ])
  })

  it('ignores blank lines and spaces around a turn', () => {
    expect(audioTurns('  Hallo!  \n\n Tschüss! ')).toEqual([
      { text: 'Hallo!', speaker: 0 },
      { text: 'Tschüss!', speaker: 1 },
    ])
  })
})

describe('robotic voices last (DECISIONS.md #117)', () => {
  const voice = (name: string, voiceURI = `test.${name}`) => ({ name, voiceURI, lang: 'de-DE' }) as SpeechSynthesisVoice
  const eddy = voice('Eddy (Deutsch (Deutschland))', 'com.apple.eloquence.de-DE.Eddy')
  const grandma = voice('Grandma (German (Germany))')
  const anna = voice('Anna', 'com.apple.voice.compact.de-DE.Anna')
  const markus = voice('Markus')

  it("knows Apple's novelty voices by name or by their Eloquence id", () => {
    expect([eddy, grandma, anna, markus].map(isRobotic)).toEqual([true, true, false, false])
    expect(isRobotic(voice('Floriane'))).toBe(false)
  })

  it('puts robotic voices last and keeps the order otherwise', () => {
    expect(rankVoices([eddy, anna, grandma, markus])).toEqual([anna, markus, eddy, grandma])
  })

  it('picks a natural voice by default, and a saved robotic one only when chosen', () => {
    const ranked = rankVoices([eddy, anna])
    expect(pickVoice(ranked, null)).toBe(anna)
    expect(pickVoice(ranked, eddy.voiceURI)).toBe(eddy)
  })

  it('gives a natural first speaker no robotic partner: another natural voice, else a pitch change', () => {
    expect(dialogueVoice(rankVoices([eddy, anna, markus]), null, 1)).toEqual({ voice: markus, pitch: 1 })
    expect(dialogueVoice(rankVoices([eddy, anna]), null, 1)).toEqual({ voice: anna, pitch: 1.35 })
    // Only robotic voices on the device: they may pair up.
    expect(dialogueVoice([eddy, grandma], null, 1)).toEqual({ voice: grandma, pitch: 1 })
  })
})
