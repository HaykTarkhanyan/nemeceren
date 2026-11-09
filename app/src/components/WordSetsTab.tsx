// The "Word sets" tab of the Words page (DECISIONS.md #77): topic word lists (content/sets.json).
// A set can be the source of the daily mix's new words, and its learned words can be practised
// with a game or by typing. Practice never changes the review schedule.
import { content } from '../content/load.ts'
import { MIN_PAIRS } from '../lib/daily.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { link } from '../lib/router.ts'
import { updateSettings, useSettings } from '../lib/settings.ts'
import { useProgress } from '../lib/storage.ts'
import { learnedSetWords, practiceIds, PRACTICE_MAX, setProgress } from '../lib/wordSets.ts'

export type PracticeHow = 'match' | 'type'

export function PracticeButtons({ ids, onPractice }: { ids: string[]; onPractice: (ids: string[], how: PracticeHow) => void }) {
  return (
    <div className="row">
      <button type="button" className="btn small" disabled={ids.length < MIN_PAIRS} onClick={() => onPractice(ids, 'match')}>
        Match pairs
      </button>
      <button type="button" className="btn small" disabled={ids.length === 0} onClick={() => onPractice(ids, 'type')}>
        Type the German
      </button>
    </div>
  )
}

export function WordSetsTab({ onPractice }: { onPractice: (ids: string[], how: PracticeHow) => void }) {
  const view = useProgress()
  const settings = useSettings()
  const state = view.reviewState
  function use(id: string | null) {
    try {
      updateSettings({ activeSet: id })
    } catch (err) {
      reportError(`Could not save the word set on this device: ${messageOf(err)}`)
    }
  }
  return (
    <section className="stack">
      <p className="muted">
        Topic word lists, outside the course order. Pick one as the source of new words: the <a href={link('daily')}>daily mix</a> then brings its words
        (up to 5 a mix, while you have learned fewer than {settings.newPerDay} new words that day; see Settings) instead of the next lesson's. Practice
        uses the words of a set you have already learned, at most {PRACTICE_MAX} at a time, and does not change your review schedule.
      </p>
      {content.sets.map((s) => {
        const p = setProgress(s, state)
        const active = settings.activeSet === s.id
        const ids = practiceIds(learnedSetWords(s, state), state)
        return (
          <div key={s.id} className={`card stack word-set${active ? ' active' : ''}`}>
            <div className="row between">
              <strong>{s.title}</strong>
              {active && <span className="badge ok">new words come from here</span>}
            </div>
            <p className="muted small">{s.description}</p>
            <p className="small">
              {p.learned} of {p.total} learned, {p.known} known.
            </p>
            <div className="row">
              {active ? (
                <button type="button" className="btn small" onClick={() => use(null)}>
                  Back to the next lessons' words
                </button>
              ) : (
                <button type="button" className="btn small primary" disabled={p.learned === p.total} onClick={() => use(s.id)}>
                  Use for new words
                </button>
              )}
            </div>
            {ids.length > 0 ? <PracticeButtons ids={ids} onPractice={onPractice} /> : <p className="muted small">Learn a few of its words first to practise them.</p>}
          </div>
        )
      })}
    </section>
  )
}
