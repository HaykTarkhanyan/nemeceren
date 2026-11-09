import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// An effect's return value is its cleanup: React's production build calls anything that is not
// undefined at unmount. An expression-bodied effect returns its expression, and browser calls can
// start returning values (window.scrollTo returns a Promise since Chrome 149/150), which crashed the
// daily mix on Hayk's phone with "l is not a function" (DECISIONS.md #108). So: block bodies only,
// unless the expression is itself the cleanup (a function name, an arrow, or a ternary with undefined).
const SRC = join(__dirname, '..')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.includes('.test.') ? [p] : []
  })

describe('effects return only a cleanup function or nothing', () => {
  it('has no expression-bodied effect that returns a call result', () => {
    const bad: string[] = []
    for (const f of files(SRC)) {
      const src = readFileSync(f, 'utf-8')
      for (const m of src.matchAll(/use(?:Layout)?Effect\(\s*\(\)\s*=>\s*([^{\s][^\n]*)/g)) {
        const expr = m[1]
        // allowed: returning a cleanup directly (() => ..., a function name), or cond ? cleanup() : undefined
        if (/^\(\)\s*=>/.test(expr) || /^[A-Za-z_$][\w$]*\s*,/.test(expr) || /\?\s*\w+\(\)\s*:\s*undefined/.test(expr)) continue
        bad.push(`${f.slice(SRC.length + 1)}: useEffect(() => ${expr.slice(0, 60)}`)
      }
    }
    expect(bad).toEqual([])
  })
})
