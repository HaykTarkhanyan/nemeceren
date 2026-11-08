// The theme lessons and words the signed-in learner sees (DECISIONS.md #95). A theme lesson with
// `onlyFor` is shown only to those emails; the pages that list lessons or words read them from here
// instead of `content.themes` / `content.words`. Content is bundled for everyone, so this hides,
// it does not protect: the repo is public anyway.
import { useMemo } from 'react'
import { visibleThemesAndWords } from '../content/lessons.ts'
import { content } from '../content/load.ts'
import { useSession } from './session.ts'
import type { Session } from './session.ts'

/** The signed-in learner's email; null for a guest and before sign-in. */
export function emailOf(s: Session): string | null {
  return 'user' in s && s.user ? s.user.email : null
}

export function useVisibleContent() {
  const email = emailOf(useSession())
  return useMemo(() => visibleThemesAndWords(content.themes, content.words, content.lessons, email), [email])
}
