// Schemas for everything Claude authors (tests, words, reviews) and everything the app saves
// (results, review state). The TypeScript types are inferred from these, so the schema is the
// single source of truth. content/README.md documents the same shapes for authors.
// Objects are strict: an unknown or misspelled key is an error, not silently ignored.
import { z } from 'zod'
import { parseRich, RichTextError } from './richtext.ts'

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

/** Language of a question or prompt that is not always German. Default "de". */
export const Lang = z.enum(['de', 'en'])

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
  .strictObject({
    type: z.literal('mc'),
    question: Text,
    questionLang: Lang.optional(),
    options: z.array(Text).min(2),
    answer: Text,
    ...common,
  })
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
  promptLang: Lang.optional(),
  minWords: z.number().int().positive().optional(),
  ...common,
})

export const DictationItem = z.strictObject({ type: z.literal('dictation'), text: Text, ...common })

export const ListenMcItem = z
  .strictObject({
    type: z.literal('listen_mc'),
    audio: Text,
    question: Text,
    questionLang: Lang.optional(),
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

/** Syllabus unit (SYLLABUS.md): 0-6 lead to A1. */
export const Unit = z.number().int().min(0).max(20)

export const Test = z.strictObject({
  id: Slug,
  title: Text,
  level: Level,
  created: IsoDate,
  description: Text.optional(),
  /** Course order for "next test": unit, then the lesson's order. */
  unit: Unit.optional(),
  lesson: Slug.optional(),
  items: z.array(Item).min(1),
})

// ---------- Lessons (content/lessons/<id>.json) ----------

/** English text in the small lesson format of content/richtext.ts (**bold**, *italic*, lists, [[German]]). */
export const RichText = Text.superRefine((s, ctx) => {
  try {
    parseRich(s)
  } catch (err) {
    if (err instanceof RichTextError) ctx.addIssue({ code: 'custom', message: err.message })
    else throw err
  }
})

/** `id` names a block so a link can open the lesson at it (content/topics.json); unique within the lesson. */
const blockCommon = { id: Slug.optional(), title: Text.optional() }

export const ExplanationBlock = z.strictObject({ type: z.literal('explanation'), ...blockCommon, text: RichText })
export const ComparisonBlock = z.strictObject({ type: z.literal('comparison'), ...blockCommon, text: RichText })
export const TipBlock = z.strictObject({ type: z.literal('tip'), ...blockCommon, text: RichText })
export const WarningBlock = z.strictObject({ type: z.literal('warning'), ...blockCommon, text: RichText })

export const ExamplesBlock = z.strictObject({
  type: z.literal('examples'),
  ...blockCommon,
  items: z.array(z.strictObject({ de: Text, en: Text, note: Text.optional() })).min(1),
})

/** "words": German words (popups, glossary check, speaker). "sound": letters or sounds (speaker only). */
export const TableColumn = z.strictObject({ header: Text, de: z.enum(['words', 'sound']).optional() })

export const TableBlock = z
  .strictObject({ type: z.literal('table'), ...blockCommon, columns: z.array(TableColumn).min(1), rows: z.array(z.array(z.string())).min(1) })
  .superRefine((t, ctx) => {
    t.rows.forEach((row, i) => {
      if (row.length !== t.columns.length) {
        ctx.addIssue({ code: 'custom', path: ['rows', i], message: `has ${row.length} cells but there are ${t.columns.length} columns` })
      }
    })
  })

export const ExerciseBlock = z.strictObject({ type: z.literal('exercise'), ...blockCommon, items: z.array(Item).min(1) })

export const AudioBlock = z.strictObject({
  type: z.literal('audio'),
  ...blockCommon,
  items: z.array(z.strictObject({ de: Text, en: Text.optional(), note: Text.optional() })).min(1),
})

export const BLOCK_TYPES = ['explanation', 'comparison', 'examples', 'table', 'tip', 'warning', 'exercise', 'audio'] as const

export const LessonBlock = z.discriminatedUnion(
  'type',
  [ExplanationBlock, ComparisonBlock, ExamplesBlock, TableBlock, TipBlock, WarningBlock, ExerciseBlock, AudioBlock],
  { error: () => `"type" must be one of: ${BLOCK_TYPES.join(', ')}` },
)

/** A theme lesson is built from a song, a video, an article, or just a topic (content/themes/). */
export const THEME_KINDS = ['song', 'video', 'article', 'topic'] as const
/** Theme lesson ids start with this; course lesson ids never do. */
export const THEME_ID_PREFIX = 't-'

export const Theme = z
  .strictObject({
    kind: z.enum(THEME_KINDS),
    /** The song, video or article title, or the topic. */
    title: Text,
    /** Artist, channel or author. */
    by: Text.optional(),
    year: z.number().int().min(1000).max(2100).optional(),
    /** Where to listen, watch or read. */
    url: z.url().optional(),
    /** "standard German", "Bavarian", "youth slang", ... */
    variety: Text.optional(),
  })
  .superRefine((t, ctx) => {
    if (t.url !== undefined && !t.url.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['url'], message: 'must start with https://' })
    if (t.kind === 'topic') {
      if (t.url !== undefined) ctx.addIssue({ code: 'custom', path: ['url'], message: 'a topic has no url (it has no source)' })
      if (t.by !== undefined) ctx.addIssue({ code: 'custom', path: ['by'], message: 'a topic has no "by" (it has no source)' })
    }
  })

/**
 * A course lesson (content/lessons/) has `unit` and `order` and no `theme`; a theme lesson
 * (content/themes/) has `theme`, no `unit`/`order`, and an id starting with "t-". Exactly one of the two.
 */
export const Lesson = z.strictObject({
  id: Slug,
  /** Course lessons only. */
  unit: Unit.optional(),
  /** Course lessons only: position within the unit, 1, 2, 3... */
  order: z.number().int().positive().optional(),
  /** Theme lessons only. */
  theme: Theme.optional(),
  level: Level,
  title: Text,
  summary: Text,
  /** Can-do statements, in English. */
  goals: z.array(Text).min(1),
  nicosWeg: z.array(z.strictObject({ title: Text, url: z.url() })).optional(),
  /** Word ids from content/words.json that this lesson introduces. */
  words: z.array(Slug).optional(),
  /** Test ids that belong to this lesson. */
  tests: z.array(Slug).optional(),
  sections: z.array(LessonBlock).min(1),
}).superRefine((l, ctx) => {
  if (l.theme !== undefined) {
    for (const key of ['unit', 'order'] as const) {
      if (l[key] !== undefined) ctx.addIssue({ code: 'custom', path: [key], message: `a theme lesson has "theme" and no ${key} (a course lesson has unit and order and no theme)` })
    }
    if (!l.id.startsWith(THEME_ID_PREFIX)) ctx.addIssue({ code: 'custom', path: ['id'], message: `a theme lesson's id starts with "${THEME_ID_PREFIX}"` })
  } else {
    for (const key of ['unit', 'order'] as const) {
      if (l[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message: `required for a course lesson (a theme lesson has "theme" instead of unit and order)` })
    }
    if (l.id.startsWith(THEME_ID_PREFIX)) ctx.addIssue({ code: 'custom', path: ['id'], message: `"${THEME_ID_PREFIX}" is for theme lesson ids; a course lesson id does not start with it` })
  }
  const seen = new Map<string, number>()
  l.sections.forEach((b, i) => {
    if (b.id === undefined) return
    const other = seen.get(b.id)
    if (other !== undefined) ctx.addIssue({ code: 'custom', path: ['sections', i, 'id'], message: `"${b.id}" is already the id of sections[${other}]` })
    else seen.set(b.id, i)
  })
})

// ---------- Topics (content/topics.json): lesson sections worth revisiting ----------

export const TopicItem = z.strictObject({
  title: Text,
  lesson: Slug,
  /** The `id` of a block in that lesson. */
  section: Slug,
  /** A key topic (e.g. a table to learn by heart). Leave out otherwise. */
  star: z.literal(true).optional(),
})

export const Topics = z
  .strictObject({
    groups: z.array(z.strictObject({ id: Slug, title: Text, summary: Text, items: z.array(TopicItem).min(1) })).min(1),
  })
  .superRefine((t, ctx) => {
    const groupIds = new Set<string>()
    t.groups.forEach((g, gi) => {
      if (groupIds.has(g.id)) ctx.addIssue({ code: 'custom', path: ['groups', gi, 'id'], message: `duplicate group id "${g.id}"` })
      groupIds.add(g.id)
      // The same section may sit in two groups (a grammar point and a word theme), but not twice in one.
      const items = new Set<string>()
      g.items.forEach((it, ii) => {
        const key = `${it.lesson}/${it.section}`
        if (items.has(key)) ctx.addIssue({ code: 'custom', path: ['groups', gi, 'items', ii], message: `${key} is already listed in this group` })
        items.add(key)
      })
    })
  })

// ---------- Extras (content/extras.json): jokes, fun facts and everyday phrases to browse ----------

export const EXTRA_TYPES = ['joke', 'fact', 'phrase'] as const
/** The id starts with this letter: j01, f01, p01. */
export const EXTRA_ID_PREFIX = { joke: 'j', fact: 'f', phrase: 'p' } as const

export const ExtraItem = z
  .strictObject({
    id: z.string().regex(/^[jfp]\d{2,}$/, { message: 'must be j, f or p followed by 2 or more digits, e.g. "j01"' }),
    type: z.enum(EXTRA_TYPES),
    title: Text,
    lines: z.array(z.strictObject({ de: Text, en: Text })).min(1),
    breakdown: z.array(z.strictObject({ de: Text, en: Text, note: Text.optional() })).min(1),
    explain: RichText,
  })
  .superRefine((it, ctx) => {
    const prefix = EXTRA_ID_PREFIX[it.type]
    if (!it.id.startsWith(prefix)) ctx.addIssue({ code: 'custom', path: ['id'], message: `a ${it.type} id starts with "${prefix}"` })
    // Every line but the last is the setup; the last one is the punchline.
    if (it.type === 'joke' && it.lines.length < 2) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'a joke needs 2 or more lines (setup and punchline)' })
  })

export const Extras = z.strictObject({ items: z.array(ExtraItem).min(1) }).superRefine((x, ctx) => {
  const seen = new Set<string>()
  x.items.forEach((it, i) => {
    if (seen.has(it.id)) ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: `duplicate id "${it.id}"` })
    seen.add(it.id)
  })
})

// ---------- Notes (written by Hayk in the app, feedback by Claude; stored in Neon) ----------

export const NOTE_MAX_CHARS = 5000

export const NoteText = z
  .string()
  .max(NOTE_MAX_CHARS, { message: `must be at most ${NOTE_MAX_CHARS} characters` })
  .regex(/\S/, { message: 'must not be empty or only whitespace' })

export const NoteEdit = z
  .strictObject({ from: Text, to: Text, why: Text, kind: z.enum(['error', 'style']) })
  .superRefine((e, ctx) => {
    if (e.from === e.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'from and to are the same' })
  })

/** Claude's feedback on a note, written with backend/scripts/progress.py (which mirrors these rules). */
export const NoteFeedback = z.strictObject({
  /** The lesson text format: **bold**, *italic*, lists, [[German]]. */
  summary: RichText,
  /** Nudges so Hayk can fix the note himself before looking at the corrections. */
  hints: z.array(Text).min(1).optional(),
  /** The whole note corrected. */
  corrected: Text.optional(),
  /** "error" is a real mistake; "style" is a suggestion and never counts as a mistake. */
  edits: z.array(NoteEdit).min(1).optional(),
  at: IsoDateTime,
})

// ---------- Custom words (Hayk's own words, added in the app, checked by Claude; stored in Neon) ----------

/** Ids are "u-" + crypto.randomUUID(), so they never clash with content word ids. */
export const CUSTOM_WORD_PREFIX = 'u-'
export const CustomWordId = z
  .string()
  .regex(/^u-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, { message: 'must be "u-" followed by a lowercase UUID' })

/** Most characters per field (the API and the table use the same limits). */
export const CUSTOM_WORD_MAX = { de: 100, en: 200, plural: 100, example: 300, note: 500 } as const

const upTo = (max: number) => Text.max(max, { message: `must be at most ${max} characters` })

/** Claude's check of a custom word (written only with backend/scripts/progress.py check-word, which mirrors these rules). */
export const WordCheck = z
  .strictObject({
    at: IsoDateTime,
    /** true: fine as it is. false: corrected, see `fixed`. */
    ok: z.boolean(),
    note: upTo(CUSTOM_WORD_MAX.note).optional(),
    /** The corrected fields; the app shows them instead of Hayk's. */
    fixed: z
      .strictObject({ de: upTo(CUSTOM_WORD_MAX.de).optional(), en: upTo(CUSTOM_WORD_MAX.en).optional(), plural: upTo(CUSTOM_WORD_MAX.plural).optional() })
      .optional(),
  })
  .superRefine((c, ctx) => {
    if (c.ok && c.fixed !== undefined) ctx.addIssue({ code: 'custom', path: ['fixed'], message: 'a check that is ok has no corrections' })
    if (!c.ok && (c.fixed === undefined || Object.keys(c.fixed).length === 0)) {
      ctx.addIssue({ code: 'custom', path: ['fixed'], message: 'a correction (ok: false) names at least one fixed field' })
    }
  })

/** What Hayk writes: the fields of the form. Optional fields are left out, never empty. */
export const CustomWordFields = {
  de: upTo(CUSTOM_WORD_MAX.de),
  en: upTo(CUSTOM_WORD_MAX.en),
  plural: upTo(CUSTOM_WORD_MAX.plural).optional(),
  example: z.strictObject({ de: upTo(CUSTOM_WORD_MAX.example), en: upTo(CUSTOM_WORD_MAX.example).optional() }).optional(),
  note: upTo(CUSTOM_WORD_MAX.note).optional(),
}

/** A custom word as the server has it (GET /v1/state, stale in a sync reply). deletedAt is a soft delete. */
export const CustomWord = z
  .strictObject({
    id: CustomWordId,
    ...CustomWordFields,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    deletedAt: IsoDateTime.optional(),
    check: WordCheck.optional(),
  })
  .superRefine((w, ctx) => {
    if (Date.parse(w.updatedAt) < Date.parse(w.createdAt)) ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'is before createdAt' })
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
    /** Where the attempt was made: "repo" and "browser" before 2026-09-29 (file storage), "web" since the Neon backend. */
    mode: z.enum(['repo', 'browser', 'web']),
    startedAt: IsoDateTime,
    submittedAt: IsoDateTime,
    /** Hayk's local calendar day at submit time. Missing in results saved before 2026-09-29. */
    localDay: IsoDate.optional(),
    /** Set for an exercise inside a lesson: the lesson id and the index of its section. */
    lessonId: Slug.optional(),
    section: Count.optional(),
    score: z.strictObject({ correct: Count, wrong: Count, pending: Count, total: Count }),
    items: z.array(ResultItem),
    review: Review.optional(),
  })
  .superRefine((r, ctx) => {
    if ((r.lessonId === undefined) !== (r.section === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['section'], message: 'lessonId and section go together: set both or neither' })
    }
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
  /** New words introduced on `date`, and extra new words Hayk asked for that day ("learn more"). */
  newToday: z.strictObject({ date: IsoDate, count: Count, extra: Count.optional() }),
  cards: z.record(z.string(), StoredCard),
})

// ---------- Word review log (one review event, written by the app, stored in Neon) ----------

export const ReviewMode = z.enum(['recognition', 'production', 'listening'])

export const ReviewLogEntry = z.strictObject({
  ts: IsoDateTime,
  /** Local calendar day when the review happened. Missing in lines written before 2026-09-29. */
  localDay: IsoDate.optional(),
  /** Time from showing the card to grading it. Missing in lines written before 2026-09-29. */
  timeMs: Count.optional(),
  wordId: z.string(),
  de: z.string(),
  mode: ReviewMode,
  rating: z.number().int().min(1).max(4),
  answer: z.string().nullable(),
  correct: z.boolean().nullable(),
  nearMiss: z.array(NearMissKind).nullable(),
  isNew: z.boolean(),
  stateBefore: z.number().int().min(0).max(3),
  stateAfter: z.number().int().min(0).max(3),
  due: IsoDateTime,
  /** Extra practice of weak words: logged, but the FSRS schedule was not changed. */
  practice: z.literal(true).optional(),
})

// ---------- Lesson progress (written by the app) ----------

export const LessonProgress = z.strictObject({
  version: z.literal(1),
  lessons: z.record(
    z.string(),
    z.strictObject({
      startedAt: IsoDateTime,
      updatedAt: IsoDateTime,
      /** Index of the section Hayk was last looking at. */
      lastSection: Count,
      doneAt: IsoDateTime.nullable(),
    }),
  ),
})

// ---------- Glossary (word popups) ----------

export const POS = z.enum([
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'article',
  'determiner',
  'numeral',
  'interjection',
  'particle',
  'name',
  'phrase',
  'contraction',
  'other',
])

export const GlossEntry = z.strictObject({
  /** Base form: "machen", "Termin". */
  lemma: Text,
  pos: POS,
  /** 1-3 short English senses. */
  gloss: z.array(Text).min(1).max(3),
  /** Nouns only. */
  article: z.enum(['der', 'die', 'das']).optional(),
  /** Nouns only, without the article: "Termine". */
  plural: Text.optional(),
  /** Only when the word is an inflected form: "er/sie/es form, present". */
  form: Text.optional(),
  /** Extra hint, e.g. for separable verbs. */
  note: Text.optional(),
  /** CEFR level of the lemma (word bank or DWDS Goethe lists), if it is a learner word. */
  level: Level.optional(),
})

const GlossMap = z.record(z.string().regex(/^\S+$/, { message: 'keys are single words' }), z.array(GlossEntry).min(1).max(3))

export const GeneratedGlossary = z.strictObject({ source: z.string(), entries: GlossMap })

export const CuratedGlossary = z
  .strictObject({ ignore: z.array(Text), entries: GlossMap })
  .superRefine((g, ctx) => {
    const seen = new Set<string>()
    g.ignore.forEach((w, i) => {
      if (seen.has(w)) ctx.addIssue({ code: 'custom', path: ['ignore', i], message: `"${w}" is listed twice` })
      if (g.entries[w]) ctx.addIssue({ code: 'custom', path: ['ignore', i], message: `"${w}" is both ignored and has an entry` })
      seen.add(w)
    })
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
/** Any lesson: a course lesson or a theme lesson. */
export type Lesson = z.infer<typeof Lesson>
export type Theme = z.infer<typeof Theme>
export type ThemeKind = Theme['kind']
/** A lesson in the course (content/lessons/): it has a unit and an order. */
export type CourseLesson = Lesson & { unit: number; order: number; theme?: undefined }
/** A theme lesson (content/themes/): it has a theme and no place in the course. */
export type ThemeLesson = Lesson & { theme: Theme; unit?: undefined; order?: undefined }
export type LessonBlock = z.infer<typeof LessonBlock>
export type Topics = z.infer<typeof Topics>
export type TopicItem = z.infer<typeof TopicItem>
export type ExtraItem = z.infer<typeof ExtraItem>
export type ExtraType = ExtraItem['type']
export type Extras = z.infer<typeof Extras>
export type NoteEdit = z.infer<typeof NoteEdit>
export type NoteFeedback = z.infer<typeof NoteFeedback>
export type WordCheck = z.infer<typeof WordCheck>
export type CustomWord = z.infer<typeof CustomWord>
export type TableColumn = z.infer<typeof TableColumn>
export type LessonProgress = z.infer<typeof LessonProgress>
export type ReviewMode = z.infer<typeof ReviewMode>
export type ReviewLogEntry = z.infer<typeof ReviewLogEntry>
export type Pos = z.infer<typeof POS>
export type GlossEntry = z.infer<typeof GlossEntry>
export type GeneratedGlossary = z.infer<typeof GeneratedGlossary>
export type CuratedGlossary = z.infer<typeof CuratedGlossary>
