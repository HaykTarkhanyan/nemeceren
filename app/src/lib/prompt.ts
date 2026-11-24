// A word card's `en` is also the question when Hayk answers from English to German (review, "Say the words"). Some
// bracketed notes in it give the answer away (Hayk, 2026-11-24, on "to walk; to run (er läuft)"; DECISIONS.md #120):
// a conjugated form, German letters, a wrong spelling to avoid, a literal translation, a false friend, "x = y". While
// the question is open those notes are hidden; once answered, the full `en` shows. Notes that tell two cards apart
// ("informal", "male", "separable", "against a 'not' question") stay.

const GIVEAWAY: readonly RegExp[] = [
  /^(ich|du|er|sie|es|wir|ihr|man)\s/i, // a conjugated form: "er läuft", "du sprichst, er spricht"
  /[äöüÄÖÜß]/, // German letters: "with ß", "gehangen; gehängt"
  /\bliterally\b/i, // "literally 'mid-week'", "literally: one-and-twenty"
  /=/, // "auf = for", "ich will = I want"
  /\bnot\s+'/i, // a false friend: "not 'to become'"
  /\bnot\s+\p{L}+-\p{L}+/iu, // a wrong spelling: "not sechs-zehn"
  /\bwith\s+(der|die|das)\b/i, // the article: "always with die"
]

/** True when a bracketed note (without its brackets) would give the German answer away. */
export function isGiveaway(note: string): boolean {
  return GIVEAWAY.some((re) => re.test(note.trim()))
}

/** The English to show as the question: `en` without the bracketed notes that give the answer away. */
export function promptOf(en: string): string {
  return en
    .replace(/\s*\(([^()]*)\)/g, (whole, note: string) => (isGiveaway(note) ? '' : whole))
    .trim()
}
