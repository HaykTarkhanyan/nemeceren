import { describe, expect, it } from 'vitest'
import { audioTurns } from './speech.ts'

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
