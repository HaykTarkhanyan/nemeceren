// Tabs of a page that keeps the chosen tab in the URL (lib/router.ts tabOf, tabLink), so a reload
// or a shared link opens the same tab.
import { tabLink } from '../lib/router.ts'

export function Tabs<T extends string>(props: { page: string; tabs: readonly [T, ...T[]]; labels: Record<T, string>; current: T }) {
  const { page, tabs, labels, current } = props
  return (
    <nav className="tabs" aria-label="Tabs">
      {tabs.map((t) => (
        <a key={t} className={`tab ${t === current ? 'active' : ''}`} href={tabLink(page, tabs, t)} aria-current={t === current ? 'page' : undefined}>
          {labels[t]}
        </a>
      ))}
    </nav>
  )
}
