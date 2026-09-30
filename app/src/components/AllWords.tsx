// "All words" on the Words page (DECISIONS.md #59): every content word (locked ones filtered out by
// default) and Hayk's own words, with status, next review, reviews and % correct. A compact table
// on the desktop, a card list on the phone (styles.css, .words-table). The rules are in lib/allWords.ts.
import { Fragment, useMemo, useState } from 'react'
import { content } from '../content/load.ts'
import { lessonLabel } from '../content/lessons.ts'
import { buildRows, correctPct, filterRows, relativeDue, relativePast, SORT_LABEL, sortRows, sourceText, STATUS_LABEL, statusCounts, WORD_STATUSES } from '../lib/allWords.ts'
import type { SortKey, SourceFilter, StatusFilter, WordRow } from '../lib/allWords.ts'
import { asSentence, checkText } from '../lib/customWords.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { sourceLessons, sourceThemes } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { deleteCustomWord, STATE_DAYS, useProgress } from '../lib/storage.ts'
import type { CustomWordView } from '../lib/storage.ts'
import { Speaker } from './Speaker.tsx'

const GRADE_NAME: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }
const MODE_NAME: Record<string, string> = { recognition: 'German to English', production: 'English to German', listening: 'listening' }
const SORTS: SortKey[] = ['due', 'alpha', 'hardest', 'recent']

export function AllWords({ onEdit, onNotice }: { onEdit: (w: CustomWordView) => void; onNotice: (message: string) => void }) {
  const view = useProgress()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [sort, setSort] = useState<SortKey>('due')
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const rows = useMemo(
    () =>
      buildRows({
        words: content.words,
        custom: view.customWords,
        lessons: content.lessons,
        themes: content.themes,
        progress: view.lessonProgress,
        state: view.reviewState,
        log: view.reviewLog,
      }),
    [view],
  )
  const now = new Date()
  const counts = statusCounts(rows, { query, source })
  const shown = sortRows(filterRows(rows, { query, source, status }), sort)
  const hasBank = rows.some((r) => r.source.kind === 'bank')

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function remove(w: CustomWordView) {
    if (!window.confirm(`Delete "${w.de}"? It leaves your practice; its review history stays in your stats.`)) return
    try {
      deleteCustomWord(w.id)
      onNotice(`Deleted "${w.de}".`)
    } catch (err) {
      reportError(`Could not delete "${w.de}": ${messageOf(err)}`)
    }
  }

  return (
    <section className="stack">
      <div className="chips" role="group" aria-label="Status">
        {(['all', ...WORD_STATUSES] as StatusFilter[]).map((s) => (
          <button key={s} type="button" className={`chip ${status === s ? 'active' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === 'all' ? 'All' : STATUS_LABEL[s]} <span className="chip-count">{counts[s]}</span>
          </button>
        ))}
      </div>
      <div className="words-tools">
        <label className="field">
          <span className="label">Search</span>
          <input type="text" value={query} placeholder="German or English" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">From</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">All sources</option>
            <option value="custom">My words</option>
            {hasBank && <option value="bank">Word bank (no lesson)</option>}
            <optgroup label="Course">
              {sourceLessons(content.lessons).map((l) => (
                <option key={l.id} value={`lesson:${l.id}`}>{`${lessonLabel(l)} ${l.title}`}</option>
              ))}
            </optgroup>
            {sourceThemes(content.themes).length > 0 && (
              <optgroup label="Themes">
                {sourceThemes(content.themes).map((l) => (
                  <option key={l.id} value={`lesson:${l.id}`}>
                    {lessonLabel(l)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className="field">
          <span className="label">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        {shown.length} word{shown.length === 1 ? '' : 's'}. Tap a word for its example, notes and last reviews. Reviews and % correct count the scheduled
        reviews of the last {STATE_DAYS} days (practice not included).
      </p>
      {shown.length === 0 ? (
        <p className="muted">No words match.{status === 'all' && counts.locked > 0 ? ' Words of lessons you have not opened are under "locked".' : ''}</p>
      ) : (
        <div className="words-table-wrap">
          <table className="words-table">
            <colgroup>
              <col className="col-de" />
              <col className="col-en" />
              <col className="col-source" />
              <col className="col-status" />
              <col className="col-due" />
              <col className="col-num" />
              <col className="col-num" />
              <col className="col-last" />
            </colgroup>
            <thead>
              <tr>
                <th>German</th>
                <th>English</th>
                <th>Source</th>
                <th>Status</th>
                <th>Next review</th>
                <th className="num">Reviews</th>
                <th className="num">Correct</th>
                <th>Last review</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isOpen = open.has(r.id)
                const pct = correctPct(r)
                return (
                  <Fragment key={r.id}>
                    <tr className={`word-row status-${r.status}${isOpen ? ' open' : ''}`} onClick={() => toggle(r.id)}>
                      <td className="cell-de">
                        <button
                          type="button"
                          className="word-toggle"
                          aria-expanded={isOpen}
                          lang="de"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggle(r.id)
                          }}
                        >
                          {r.de}
                        </button>{' '}
                        <span onClick={(e) => e.stopPropagation()}>
                          <Speaker text={r.de} />
                        </span>
                        {r.custom?.check && <span className={`badge ${r.custom.check.ok ? 'ok' : 'warn'}`}>{r.custom.check.ok ? 'checked' : 'corrected'}</span>}
                      </td>
                      <td data-label="English">{r.en}</td>
                      <td data-label="Source">
                        {r.source.kind === 'lesson' ? (
                          <a href={link('lesson', r.source.lesson.id)} onClick={(e) => e.stopPropagation()}>
                            {sourceText(r.source)}
                          </a>
                        ) : (
                          sourceText(r.source)
                        )}
                      </td>
                      <td data-label="Status">
                        <span className={`badge word-status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      </td>
                      <td data-label="Next review">{r.status === 'locked' || r.status === 'not-started' ? '-' : relativeDue(r.due, now)}</td>
                      <td data-label="Reviews" className="num">
                        {r.reviews}
                      </td>
                      <td data-label="Correct" className="num">
                        {pct === null ? '-' : `${pct}%`}
                      </td>
                      <td data-label="Last review">{relativePast(r.lastReview, now)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="word-detail">
                        <td colSpan={8}>
                          <WordDetail row={r} onEdit={onEdit} onDelete={remove} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <details className="card small">
        <summary>What the statuses mean</summary>
        <ul>
          <li>
            <strong>locked</strong>: in a lesson you have not opened yet (hidden unless you pick "locked"). <strong>not started</strong>: waiting among the
            daily new words.
          </li>
          <li>
            <strong>new</strong>: added by you (or from a lesson hint) and not reviewed yet; it comes up right away.
          </li>
          <li>
            <strong>struggling</strong>: forgotten twice or more, or your last review of it was Again. This comes before the next three.
          </li>
          <li>
            <strong>learning</strong>: still in the short first steps. <strong>review</strong>: in the long-term schedule. <strong>known</strong>: its next
            review is 21 days or more away (the same rule as the Stats page).
          </li>
        </ul>
      </details>
    </section>
  )
}

function WordDetail({ row, onEdit, onDelete }: { row: WordRow; onEdit: (w: CustomWordView) => void; onDelete: (w: CustomWordView) => void }) {
  const view = useProgress()
  const own = row.custom ? view.customWords.find((w) => w.id === row.id) : undefined
  const claude = checkText(row.custom?.check)
  return (
    <div className="stack word-detail-body">
      {row.plural && (
        <p>
          <span className="label">Plural</span> <span lang="de">{row.plural}</span>
        </p>
      )}
      {row.example && (
        <div className="example">
          <span lang="de">{row.example.de}</span> <Speaker text={row.example.de} />
          {row.example.en && <div className="muted">{row.example.en}</div>}
        </div>
      )}
      {row.custom?.note && (
        <p className="small">
          <span className="label">Your note</span> {row.custom.note}
        </p>
      )}
      {row.custom &&
        (claude === null ? (
          <p className="small muted">Not checked by Claude yet.</p>
        ) : (
          <p className={`small ${row.custom.check?.ok ? '' : 'warn-text'}`}>
            {asSentence(claude)}
            {!row.custom.check?.ok && (
              <>
                {' '}
                You wrote: <span lang="de">{row.custom.de}</span>
                {row.custom.plural ? `, plural ${row.custom.plural}` : ''} = {row.custom.en}
              </>
            )}
          </p>
        ))}
      {row.status === 'locked' && row.source.kind === 'lesson' && (
        <p className="small muted">
          Opening <a href={link('lesson', row.source.lesson.id)}>{lessonLabel(row.source.lesson)}</a> adds it to your daily new words.
        </p>
      )}
      <div>
        <span className="label">Last reviews</span>
        {row.history.length === 0 ? (
          <p className="small muted">None in the last {STATE_DAYS} days.</p>
        ) : (
          <ul className="review-history small">
            {row.history.map((e) => (
              <li key={`${e.ts}-${e.mode}`}>
                {new Date(e.ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}:{' '}
                <span className={e.rating === 1 ? 'warn-text' : ''}>{GRADE_NAME[e.rating]}</span>, {MODE_NAME[e.mode]}
                {e.practice ? ' (practice)' : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      {own && (
        <div className="row">
          <button type="button" className="btn small" onClick={() => onEdit(own)}>
            Edit
          </button>
          <button type="button" className="btn small" onClick={() => onDelete(own)}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
