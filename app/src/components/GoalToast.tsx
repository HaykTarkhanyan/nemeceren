// A short toast when the daily goal is met, or a unit's Endstation is reached, by something done on
// this device (a change still waiting in the outbox). Loading progress from the server never toasts.
import { useEffect, useRef, useState } from 'react'
import { useGoal } from '../lib/goalView.ts'
import { useProgress } from '../lib/storage.ts'

const SHOW_MS = 3500

export function GoalToast() {
  const { goal, path, today } = useGoal()
  const progress = useProgress()
  const before = useRef<{ met: boolean; ends: Set<string> } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const localChange = progress.pathEvents.some((e) => e.pending && e.localDay === today) || progress.pendingAttemptIds.length > 0

  useEffect(() => {
    const ends = new Set([...path.done].filter((id) => id.startsWith('end-')))
    const prev = before.current
    before.current = { met: goal.todayMet, ends }
    if (prev === null || !localChange) return
    const reached = [...ends].find((id) => !prev.ends.has(id))
    if (reached) setMessage(`Endstation: Unit ${reached.slice('end-'.length)} done.`)
    else if (goal.todayMet && !prev.met) setMessage(`Goal done for today. Streak: ${goal.current} day${goal.current === 1 ? '' : 's'}.`)
  }, [goal.todayMet, goal.current, path.done, localChange])

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
