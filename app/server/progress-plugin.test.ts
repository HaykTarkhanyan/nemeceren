import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PathError, resolveInside } from './progress-plugin.ts'

const root = path.resolve('/tmp/progress-root')

describe('resolveInside', () => {
  it('resolves normal relative paths inside the root', () => {
    expect(resolveInside(root, 'results/a1-01__2026-09-28T10-00-00-000Z.json', ['.json'])).toBe(
      path.join(root, 'results', 'a1-01__2026-09-28T10-00-00-000Z.json'),
    )
    expect(resolveInside(root, 'review-log.jsonl', ['.jsonl'])).toBe(path.join(root, 'review-log.jsonl'))
  })

  it.each([
    '../secret.json',
    'results/../../secret.json',
    '..\\secret.json',
    '/etc/passwd.json',
    'C:/Windows/x.json',
    'results/./x.json',
    '.hidden.json',
    '',
    'results//x.json',
    'a%2F..%2Fb.json',
  ])('rejects %j', (bad) => {
    expect(() => resolveInside(root, bad, ['.json'])).toThrow(PathError)
  })

  it('rejects wrong extensions', () => {
    expect(() => resolveInside(root, 'results/x.txt', ['.json'])).toThrow(/must end with .json/)
  })
})
