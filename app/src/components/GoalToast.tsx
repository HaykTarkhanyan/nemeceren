// A short toast when the daily goal is met, or a unit's Endstation is reached, while the app is open.
// AuthGate renders the app only once progress is loaded, so the first render is the baseline and
// loading never toasts; a sync that brings a station done on another device may (and that is true).
import { useEffect, useRef, useState } from 'react'
import { useGoal } from '../lib/goalView.ts'

const SHOW_MS = 3500

export function GoalToast() {
  const { goal, path } = useGoal()
  const before = useRef<{ met: boolean; ends: Set<string> } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const ends = new Set([...path.done].filter((id) => id.startsWith('end-')))
    const prev = before.current
    before.current = { met: goal.todayMet, ends }
    if (prev === null) return
    const reached = [...ends].find((id) => !prev.ends.has(id))
    if (reached) setMessage(`Endstation: Unit ${reached.slice('end-'.length)} done.`)
    else if (goal.todayMet && !prev.met) setMessage(`Goal done for today. Streak: ${goal.current} day${goal.current === 1 ? '' : 's'}.`)
  }, [goal.todayMet, goal.current, path.done])

  useEffect(() => {
    if (message === null) return
    const t = window.setTimeout(() => setMessage(null), SHOW_MS)
    return () => window.clearTimeout(t)
  }, [message])

  if (message === null) return null
  return (
    <div className="goal-toast" role="status">
      {message}
    </div>
  )
}
