// Schemas for everything Claude authors (tests, words, reviews) and everything the app saves
// (results, review state). The TypeScript types are inferred from these, so the schema is the
// single source of truth. content/README.md documents the same shapes for authors.
// Objects are strict: an unknown or misspelled key is an error, not silently ignored.
import { z } from 'zod'

export const Text = z.string().regex(/\S/, { message: 'must not be empty' })
export const Level = z.enum(['A1', 'A2', 'B1', 'B2'])
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'must be a date like 2026-09-28' })
export const IsoDateTime = z.iso.datetime({ offset: true })
export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
  message: 'must be lowercase letters/digits separated by single hyphens, e.g. "a1-termine-01" or "termin"',
})

/** A run of 3 or more underscores marks one gap in a gap sentence. */
export const GAP_MARKER = /_{3,}/g

export function countGaps(text: string): number {
  return (text.match(GAP_MARKER) ?? []).length
}

/** Split an order answer into words. */
export function orderWords(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean)
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((v, i) => v === y[i])
}

const common = {
  instruction: Text.optional(),
  hint: Text.optional(),
  explanation: Text.optional(),
}

function checkChoice(item: { options: string[]; answer: string }, ctx: z.RefinementCtx): void {
  if (new Set(item.options).size !== item.options.length) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'options must be unique' })
  }
  if (!item.options.includes(item.answer)) {
    ctx.addIssue({ code: 'custom', path: ['answer'], message: `"${item.answer}" is not one of the options` })
  }
}

export const McItem = z
  .strictObject({ type: z.literal('mc'), question: Text, options: z.array(Text).min(2), answer: Text, ...common })
  .superRefine(checkChoice)

export const GapItem = z
  .strictObject({
    type: z.literal('gap'),
    text: Text,
    answers: z.array(z.array(Text).min(1)).min(1),
    caseSensitive: z.boolean().optional(),
    ...common,
  })
  .superRefine((item, ctx) => {
    const gaps = countGaps(item.text)
    if (gaps !== item.answers.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['answers'],
        message: `text has ${gaps} gap(s) marked with ___ but answers has ${item.answers.length} entr${item.answers.length === 1 ? 'y' : 'ies'}`,
      })
    }
  })

export const OrderItem = z
  .strictObject({
    type: z.literal('order'),
    prompt: Text.optional(),
    tiles: z.array(Text).min(2),
    answers: z.array(Text).min(1),
    ...common,
  })
  .superRefine((item, ctx) => {
    const tiles = item.tiles.map((t) => t.toLowerCase())
    item.tiles.forEach((t, i) => {
      if (/\s/.test(t.trim())) {
        ctx.addIssue({ code: 'custom', path: ['tiles', i], message: 'a tile must be a single word (no spaces)' })
      }
    })
    item.answers.forEach((answer, i) => {
      const words = orderWords(answer).map((w) => w.toLowerCase())
      if (!sameMultiset(words, tiles)) {
        ctx.addIssue({
          code: 'custom',
          path: ['answers', i],
          message: `"${answer}" does not use exactly the tiles [${item.tiles.join(', ')}] (compared ignoring case)`,
        })
      }
    })
  })

export const TranslateItem = z.strictObject({
  type: z.literal('translate'),
  direction: z.enum(['en-de', 'de-en']),
  text: Text,
  references: z.array(Text).optional(),
  ...common,
})

export const WriteItem = z.strictObject({
  type: z.literal('write'),
  prompt: Text,
  minWords: z.number().int().positive().optional(),
  ...common,
})

export const DictationItem = z.strictObject({ type: z.literal('dictation'), text: Text, ...common })

export const ListenMcItem = z
  .strictObject({
    type: z.literal('listen_mc'),
    audio: Text,
    question: Text,
    options: z.array(Text).min(2),
    answer: Text,
    ...common,
  })
  .superRefine(checkChoice)

export const ITEM_TYPES = ['mc', 'gap', 'order', 'translate', 'write', 'dictation', 'listen_mc'] as const
export const ItemType = z.enum(ITEM_TYPES)

export const Item = z.discriminatedUnion(
  'type',
  [McItem, GapItem, OrderItem, TranslateItem, WriteItem, DictationItem, ListenMcItem],
  { error: () => `"type" must be one of: ${ITEM_TYPES.join(', ')}` },
)

export const Test = z.strictObject({
  id: Slug,
  title: Text,
  level: Level,
  created: IsoDate,
  description: Text.optional(),
  items: z.array(Item).min(1),
})

const ARTICLE = /^(der|die|das) /

export const Word = z
  .strictObject({
    id: Slug,
    de: Text,
    plural: Text.optional(),
    en: Text,
    example: z.strictObject({ de: Text, en: Text.optional() }).optional(),
    level: Level,
    tags: z.array(Text).optional(),
    added: IsoDate,
  })
  .superRefine((w, ctx) => {
    if (w.plural !== undefined) {
      if (!ARTICLE.test(w.de)) {
        ctx.addIssue({ code: 'custom', path: ['de'], message: 'a word with a plural is a noun, so "de" must start with der/die/das' })
      }
      if (!w.plural.startsWith('die ')) {
        ctx.addIssue({ code: 'custom', path: ['plural'], message: 'write the full plural with its article, e.g. "die Termine"' })
      }
    }
  })

export const WordList = z.array(Word).min(1).superRefine((words, ctx) => {
  const seen = new Set<string>()
  words.forEach((w, i) => {
    if (seen.has(w.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate word id "${w.id}"` })
    seen.add(w.id)
  })
})

// ---------- Results (written by the app, "review" added by Claude) ----------

export const NearMissKind = z.enum(['case', 'umlaut', 'article_missing', 'article_wrong'])
export const ItemStatus = z.enum(['correct', 'wrong', 'pending'])

export const DiffOp = z.strictObject({
  op: z.enum(['ok', 'wrong', 'missing', 'extra']),
  expected: z.string().optional(),
  typed: z.string().optional(),
  nearMiss: z.array(NearMissKind).optional(),
})

export const GapResult = z.strictObject({
  answer: z.string(),
  correct: z.boolean(),
  nearMiss: z.array(NearMissKind).nullable(),
})

export const ResultItem = z.strictObject({
  index: z.number().int().nonnegative(),
  type: ItemType,
  question: z.string(),
  answer: z.union([z.string(), z.array(z.string())]).nullable(),
  expected: z.string().nullable(),
  status: ItemStatus,
  nearMiss: z.array(NearMissKind).nullable(),
  gaps: z.array(GapResult).optional(),
  diff: z.array(DiffOp).optional(),
  timeMs: z.number().nonnegative(),
  hintUsed: z.boolean(),
  plays: z.number().int().nonnegative().optional(),
})

export const Review = z.strictObject({
  gradedAt: IsoDateTime,
  summary: Text,
  items: z.array(
    z.strictObject({
      index: z.number().int().nonnegative(),
      correct: z.boolean(),
      correction: Text.optional(),
      note: Text.optional(),
    }),
  ),
})

const Count = z.number().int().nonnegative()

export const Result = z
  .strictObject({
    version: z.literal(1),
    testId: Slug,
    testTitle: z.string(),
    level: Level,
    mode: z.enum(['repo', 'browser']),
    startedAt: IsoDateTime,
    submittedAt: IsoDateTime,
    score: z.strictObject({ correct: Count, wrong: Count, pending: Count, total: Count }),
    items: z.array(ResultItem),
    review: Review.optional(),
  })
  .superRefine((r, ctx) => {
    const seen = new Set<number>()
    r.review?.items.forEach((ri, i) => {
      if (ri.index >= r.items.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['review', 'items', i, 'index'],
          message: `index ${ri.index} is out of range (this result has items 0-${r.items.length - 1})`,
        })
      }
      if (seen.has(ri.index)) {
        ctx.addIssue({ code: 'custom', path: ['review', 'items', i, 'index'], message: `index ${ri.index} is reviewed twice` })
      }
      seen.add(ri.index)
    })
  })

// ---------- Word review state (written by the app) ----------

export const StoredCard = z.strictObject({
  due: IsoDateTime,
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: Count,
  lapses: Count,
  state: z.number().int().min(0).max(3),
  last_review: IsoDateTime.nullable(),
})

export const ReviewState = z.strictObject({
  version: z.literal(1),
  scheduler: z.literal('fsrs'),
  updatedAt: IsoDateTime,
  newToday: z.strictObject({ date: IsoDate, count: Count }),
  cards: z.record(z.string(), StoredCard),
})

export type Level = z.infer<typeof Level>
export type Item = z.infer<typeof Item>
export type ItemType = z.infer<typeof ItemType>
export type McItem = z.infer<typeof McItem>
export type GapItem = z.infer<typeof GapItem>
export type OrderItem = z.infer<typeof OrderItem>
export type TranslateItem = z.infer<typeof TranslateItem>
export type WriteItem = z.infer<typeof WriteItem>
export type DictationItem = z.infer<typeof DictationItem>
export type ListenMcItem = z.infer<typeof ListenMcItem>
export type Test = z.infer<typeof Test>
export type Word = z.infer<typeof Word>
export type NearMissKind = z.infer<typeof NearMissKind>
export type ItemStatus = z.infer<typeof ItemStatus>
export type DiffOp = z.infer<typeof DiffOp>
export type GapResult = z.infer<typeof GapResult>
export type ResultItem = z.infer<typeof ResultItem>
export type Review = z.infer<typeof Review>
export type Result = z.infer<typeof Result>
export type StoredCard = z.infer<typeof StoredCard>
export type ReviewState = z.infer<typeof ReviewState>
