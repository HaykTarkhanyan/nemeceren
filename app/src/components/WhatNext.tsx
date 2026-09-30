// "What next" when the day's reviews are done: more new words, practice of weak words, the next
// lesson, the next test, listening practice. Every option either works or says plainly why not.
import { useState } from 'react'
import { content } from '../content/load.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { messageOf } from '../lib/errors.ts'
import { listeningWords, lockedWordIds, nextLesson, nextTest, weakWords } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { addExtraNewWords, useProgress } from '../lib/storage.ts'

/** `words` are the words the review uses (all, or the unit or lesson Hayk picked); `allWords` says which. */
export function WhatNext(props: { words: StudyWord[]; allWords: boolean; onMoreNew: () => void; onPractice: (words: StudyWord[]) => void }) {
  const { words, allWords, onMoreNew, onPractice } = props
  const view = useProgress()
  const state = view.reviewState
  const progress = view.lessonProgress
  const data = { results: view.results.map((r) => r.result), log: view.reviewLog }
  const [error, setError] = useState<string | null>(null)

  function moreNew(n: number) {
    try {
      addExtraNewWords(n)
      onMoreNew()
    } catch (err) {
      setError(`Could not add new words: ${messageOf(err)}`)
    }
  }

  if (error) return <div className="alert error">{error}</div>

  const now = new Date()
  const available = words.filter((w) => !state.cards[w.id]).length
  // A picked unit or lesson already includes the words of its unopened lessons. Only course
  // lessons count here: the message below points to the next course lesson, and theme lessons
  // are not part of the course (their words wait until Hayk opens them).
  const locked = allWords ? [...lockedWordIds(content.lessons, progress)].filter((id) => !state.cards[id]).length : 0
  const weak = weakWords(words, state, data.log, now)
  const lesson = nextLesson(content.lessons, progress)
  const test = nextTest(content.tests, content.lessons, data.results)
  const listening = listeningWords(content.words, state)

  return (
    <section className="card stack what-next">
      <h2>What next?</h2>

      <div className="option">
        <strong>Learn more new words today</strong>
        {available > 0 ? (
          <>
            <span className="muted small">
              {available} new word{available === 1 ? '' : 's'} ready. This only raises today's limit.
            </span>
            <div className="row">
              {[5, 10].map((n) => (
                <button key={n} type="button" className="btn small" onClick={() => moreNew(n)}>
                  +{Math.min(n, available)} new
                </button>
              ))}
            </div>
          </>
        ) : locked > 0 && lesson ? (
          <span className="small">
            The next {locked} new words come with a lesson. Open <a href={link('lesson', lesson.lesson.id)}>{lesson.lesson.title}</a> to unlock
            its words.
          </span>
        ) : allWords ? (
          <span className="small warn-text">No more new words prepared yet. Ask Claude for more.</span>
        ) : (
          <span className="small muted">No new words left in this pick. Choose other words under "Words from" on the Words page.</span>
        )}
      </div>

      <div className="option">
        <strong>Practise weak words</strong>
        {weak.length > 0 ? (
          <>
            <span className="muted small">
              {weak.length} word{weak.length === 1 ? '' : 's'} you missed recently or forgot before. Practice does not change your review schedule;
              it is logged as practice.
            </span>
            <div>
              <button type="button" className="btn small" onClick={() => onPractice(weak.map((w) => w.word))}>
                Practise {weak.length} word{weak.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        ) : (
          <span className="small muted">No weak words right now: nothing graded Again or close in the last two weeks.</span>
        )}
      </div>

      <div className="option">
        <strong>{lesson?.status === 'in-progress' ? 'Continue lesson' : 'Next lesson'}</strong>
        {lesson ? (
          <a href={link('lesson', lesson.lesson.id)}>
            {lesson.lesson.unit}.{lesson.lesson.order} {lesson.lesson.title}
          </a>
        ) : (
          <span className="small warn-text">
            {content.lessons.length === 0 ? 'No lessons prepared yet.' : 'All lessons are done.'} Ask Claude for the next one.
          </span>
        )}
      </div>

      <div className="option">
        <strong>Next test</strong>
        {test ? (
          <a href={link('test', test.id)}>{test.title}</a>
        ) : (
          <span className="small warn-text">
            {content.tests.length === 0 ? 'No tests prepared yet.' : 'You have taken every test.'} Ask Claude for a new one, or retake one from{' '}
            <a href={link()}>Home</a>.
          </span>
        )}
      </div>

      <div className="option">
        <strong>Listening practice</strong>
        {listening.length > 0 ? (
          <a href={link('listen')}>Type what you hear: {listening.length} example sentence{listening.length === 1 ? '' : 's'} from your words</a>
        ) : (
          <span className="small muted">Starts once you have learned words that have example sentences.</span>
        )}
      </div>
    </section>
  )
}
