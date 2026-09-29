// "German in the wild": one joke, one fun fact and one everyday sentence per day, each with a
// breakdown (content/daily.json). Deliberately not tied to Hayk's level. Today's day comes first,
// earlier days below; later days stay hidden. No word popups here: the breakdown is the gloss.
import { useState } from 'react'
import { content } from '../content/load.ts'
import type { DailyCard } from '../content/schema.ts'
import { De, GlossScope } from '../components/GermanText.tsx'
import { RichText } from '../components/RichText.tsx'
import { dailyView } from '../lib/daily.ts'
import type { DailyDay } from '../lib/daily.ts'
import { localDay } from '../lib/dates.ts'

export function DailyPage() {
  // Fixed while the page is open, so nothing changes under Hayk at midnight.
  const [today] = useState(() => localDay(new Date()))
  const v = dailyView(content.daily, today)
  return (
    <GlossScope surface={{ kind: 'daily' }}>
      <div className="stack">
        <div>
          <h1>Daily</h1>
          <p className="muted">German in the wild: a joke, a fun fact and an everyday sentence each day. Not tied to your level, so enjoy whatever you catch.</p>
        </div>
        {v.startsOn && (
          <p className="warn-text">
            The first day unlocks on {v.startsOn} ({v.total} days prepared).
          </p>
        )}
        {v.today && (
          <>
            <h2>
              Today: day {v.today.number} <span className="muted small">{v.today.date}</span>
            </h2>
            <DayView day={v.today} />
          </>
        )}
        {!v.startsOn && v.left === 0 && <p className="warn-text">That's all {v.total} days so far. Ask Claude for more.</p>}
        {v.archive.length > 0 && (
          <section className="stack">
            <h2>Earlier days</h2>
            {v.archive.map((d) => (
              <details key={d.id} className="card daily-archive">
                {/* The joke's title stays out of the summary: it would give the punchline away. */}
                <summary>
                  <strong>Day {d.number}</strong>{' '}
                  <span className="muted small">
                    {d.date}: {d.fact.title} / {d.phrase.title}
                  </span>
                </summary>
                <DayView day={d} />
              </details>
            ))}
          </section>
        )}
      </div>
    </GlossScope>
  )
}

function DayView({ day }: { day: DailyDay }) {
  return (
    <div className="stack">
      <JokeCard card={day.joke} />
      <CardView label="Fun fact" card={day.fact} />
      <CardView label="In the wild" card={day.phrase} />
    </div>
  )
}

/** Every line but the last is the setup; the punchline, its title and the explanation wait for the button. */
function JokeCard({ card }: { card: DailyCard }) {
  const [shown, setShown] = useState(false)
  const setup = card.lines.slice(0, -1)
  const punchline = card.lines[card.lines.length - 1]
  return (
    <section className="card stack">
      <span className="block-label daily-label">Joke</span>
      {shown && <h3 className="block-title">{card.title}</h3>}
      {setup.length > 0 && <Lines lines={setup} />}
      {shown ? (
        <>
          <Lines lines={[punchline]} />
          <Explained card={card} />
        </>
      ) : (
        <div>
          <button type="button" className="btn" onClick={() => setShown(true)}>
            Show punchline
          </button>
        </div>
      )}
    </section>
  )
}

function CardView({ label, card }: { label: string; card: DailyCard }) {
  return (
    <section className="card stack">
      <span className="block-label daily-label">{label}</span>
      <h3 className="block-title">{card.title}</h3>
      <Lines lines={card.lines} />
      <Explained card={card} />
    </section>
  )
}

function Lines({ lines }: { lines: DailyCard['lines'] }) {
  return (
    <ul className="examples">
      {lines.map((l, i) => (
        <li key={i}>
          <div className="example-de">
            <De text={l.de} />
          </div>
          <div className="muted">{l.en}</div>
        </li>
      ))}
    </ul>
  )
}

function Explained({ card }: { card: DailyCard }) {
  return (
    <>
      <ul className="breakdown">
        {card.breakdown.map((b, i) => (
          <li key={i}>
            <span lang="de" className="de-inline">
              {b.de}
            </span>{' '}
            - {b.en}
            {b.note && <div className="muted small">{b.note}</div>}
          </li>
        ))}
      </ul>
      <RichText text={card.explain} />
    </>
  )
}
