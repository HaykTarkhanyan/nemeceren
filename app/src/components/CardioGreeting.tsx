// The Home greeting for the learners in lib/eggs.ts (DECISIONS.md #116): "Grüß Gott" and a cardio
// line that changes daily. Everyone else sees nothing.
import { cardioFan, cardioLine } from '../lib/eggs.ts'
import { useSession } from '../lib/session.ts'
import { emailOf } from '../lib/visibleContent.ts'

export function CardioGreeting({ today }: { today: string }) {
  const name = cardioFan(emailOf(useSession()))
  if (name === null) return null
  const line = cardioLine(today)
  return (
    <section className="card greeting-card">
      <p lang="de">
        <strong>Grüß Gott, {name}!</strong> {line.de}
      </p>
      <p className="muted small">
        Hello, the way people say it in southern Germany! {line.en}
      </p>
    </section>
  )
}
