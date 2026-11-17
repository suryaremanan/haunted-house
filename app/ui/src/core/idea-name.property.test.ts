// Property 7: Every idea yields a new, valid mansion name
//
// For all idea texts and all sets of existing names, `mansionNameFromIdea`
// returns a name that matches the Mansion name rule, is at most 40 characters,
// is not in the set, and is the same for the same inputs; an Example Idea
// keeps its own name when that name is free.
//
// **Validates: Requirements 10.4**
//
// Three references are written here and share no code with the module:
// - the Mansion name rule, read one character at a time, beside the module's
//   own `isMansionName`;
// - "new", in the design's words: the name the idea gets in an empty house,
//   then that name with -2, -3, ... until one is free;
// - for an idea in plain ASCII, where no Unicode folding is involved, the name
//   is made of the idea's own words in the idea's order, or is the fallback
//   when the idea holds no letter or digit.
//
// Every character outside ASCII is written by code point, so this file stays
// plain ASCII.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EXAMPLE_IDEAS, FALLBACK_MANSION_NAME, MAX_IDEA_NAME_LENGTH, mansionNameFromIdea } from './first-visit'
import { MAX_MANSION_NAME_LENGTH, isMansionName } from './mansion-api'

/** The Mansion name rule's length, stated here rather than imported. */
const NAME_LIMIT = 40

function isLowerAlphanumeric(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')
}

/** Independent reference for the Mansion name rule: 1 to 40 of a-z and 0-9, in groups joined by single hyphens. */
function followsNameRule(name: string): boolean {
  if (name.length < 1 || name.length > NAME_LIMIT) return false
  // Starting "after a hyphen" refuses a leading one.
  let previous = '-'
  for (const char of name) {
    if (char === '-' ? previous === '-' : !isLowerAlphanumeric(char)) return false
    previous = char
  }
  return previous !== '-'
}

/** Independent reference for "new": the base, then base-2, base-3, ... until one is free. */
function firstFree(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  let count = 2
  while (taken.has(`${base}-${count}`)) count += 1
  return `${base}-${count}`
}

/** The words of a plain ASCII idea: runs of letters and digits, lower-cased. */
function asciiWords(idea: string): string[] {
  const words: string[] = []
  let word = ''
  for (const char of idea.toLowerCase()) {
    if (isLowerAlphanumeric(char)) {
      word += char
    } else if (word !== '') {
      words.push(word)
      word = ''
    }
  }
  if (word !== '') words.push(word)
  return words
}

/** True when `parts` occur in `words` in the same order, not necessarily side by side. */
function inOrder(parts: readonly string[], words: readonly string[]): boolean {
  let from = 0
  for (const part of parts) {
    const found = words.indexOf(part, from)
    if (found === -1) return false
    from = found + 1
  }
  return true
}

function isPlainAscii(text: string): boolean {
  return /^[\u0000-\u007f]*$/.test(text)
}

/** Valid by both readings of the rule, within the limit, and not one of the existing names. */
function expectValidAndNew(name: string, taken: ReadonlySet<string>): void {
  expect(isMansionName(name)).toBe(true)
  expect(followsNameRule(name)).toBe(true)
  expect(name.length).toBeLessThanOrEqual(MAX_MANSION_NAME_LENGTH)
  expect(name.length).toBeLessThanOrEqual(NAME_LIMIT)
  expect(taken.has(name)).toBe(false)
}

/** One character by its code point. */
function u(codePoint: number): string {
  return String.fromCodePoint(codePoint)
}

function chars(...codePoints: number[]): string[] {
  return codePoints.map(u)
}

function between(first: number, last: number): fc.Arbitrary<string> {
  return fc.integer({ min: first, max: last }).map((codePoint) => String.fromCodePoint(codePoint))
}

// ---------------------------------------------------------------------------
// Ideas.

const WORDS = [
  'a', 'an', 'the', 'I', 'we', 'want', 'to', 'build', 'make', 'write', 'tool', 'app', 'program', 'that', 'which',
  'counts', 'tracks', 'converts', 'words', 'lines', 'recipes', 'budget', 'weather', 'station', 'chess', 'clock',
  'timer', 'Pomodoro', 'to-do', 'list', 'notes', 'markdown', 'viewer', 'JSON', 'CLI', 'API', 'v2', '3D', '42', '2',
  'my', 'house', 'small', 'simple', 'please', 'Python', 'tests', 'file',
] as const
const JOINS = [' ', ' ', ' ', '  ', ', ', '. ', ': ', '; ', ' - ', '-', '_', '/', '\n', '\t', '! ', '? ', " '", '" ', ' (', ') ', ' & ', '+'] as const

const asciiAlphanumeric = fc.constantFrom(...Array.from('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'))
const wordArb = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...WORDS) },
  { weight: 1, arbitrary: fc.string({ unit: asciiAlphanumeric, minLength: 1, maxLength: 12, size: 'max' }) },
)

function sentenceArb(minWords: number, maxWords: number): fc.Arbitrary<string> {
  return fc
    .array(fc.tuple(wordArb, fc.constantFrom(...JOINS)), { minLength: minWords, maxLength: maxWords, size: 'max' })
    .map((pairs) => pairs.map(([word, join]) => `${word}${join}`).join(''))
}

/** Space, tab, line breaks, no-break space, em space, line and paragraph separators, ideographic space. */
const WHITE_SPACE = chars(0x20, 0x09, 0x0a, 0x0d, 0xa0, 0x2003, 0x2028, 0x2029, 0x3000)
const whiteSpaceArb = fc.string({ unit: fc.constantFrom(...WHITE_SPACE), maxLength: 12, size: 'max' })

/** ASCII punctuation, then arrows, stars, currency, dashes, CJK punctuation, emoji, a variation selector and a joiner. */
const SYMBOLS = [
  ...Array.from('!@#$%^&*()[]{}<>?/\\|~`+=_-.,;:\'"'),
  ...chars(0x2192, 0x2605, 0x2713, 0x20ac, 0x2014, 0x2026, 0x00d7, 0x3002, 0x300c, 0x1f47b, 0x1f3da, 0xfe0f, 0x200d),
]
const symbolsArb = fc.string({ unit: fc.constantFrom(...SYMBOLS), minLength: 1, maxLength: 30, size: 'max' })
const asciiSymbolsArb = fc.string({ unit: fc.constantFrom(...Array.from('!@#$%^&*()[]{}<>?/\\|~`+=_-.,;:\'" \t\n')), maxLength: 30, size: 'max' })

/** Cyrillic, Greek, Hebrew, Arabic, Devanagari with vowel signs, Thai, kana, CJK, Hangul; words parted by spaces. */
const nonLatinArb = fc.string({
  unit: fc.oneof(
    { weight: 2, arbitrary: fc.constant(' ') },
    between(0x0410, 0x044f),
    between(0x03b1, 0x03c9),
    between(0x05d0, 0x05ea),
    between(0x0621, 0x064a),
    between(0x0905, 0x094c),
    between(0x0e01, 0x0e3a),
    between(0x3041, 0x3096),
    between(0x30a1, 0x30fa),
    between(0x4e00, 0x9fff),
    between(0xac00, 0xd7a3),
  ),
  minLength: 1,
  maxLength: 60,
  size: 'max',
})

/** Words with marks and strokes: some fold to plain letters, some have no plain form at all. */
const ACCENTED_WORDS = [
  `Caf${u(0xe9)}`, // e with acute
  `na${u(0xef)}ve`, // i with diaeresis
  `cr${u(0xe8)}me br${u(0xfb)}l${u(0xe9)}e`, // grave, circumflex, acute
  `jalape${u(0xf1)}o`, // n with tilde
  `Zoe${u(0x308)}`, // a plain e, then a combining diaeresis
  `${u(0x130)}stanbul`, // dotted capital I
  `sm${u(0xf8)}rrebr${u(0xf8)}d`, // o with stroke
  `Stra${u(0xdf)}e`, // sharp s
  `${u(0x141)}${u(0xf3)}d${u(0x17a)}`, // L with stroke, o with acute, z with acute
]
/** Latin letters with marks and strokes, composed and decomposed, among plain ones. */
const accentedLatinArb = fc.string({
  unit: fc.oneof(
    { weight: 3, arbitrary: asciiAlphanumeric },
    { weight: 2, arbitrary: fc.constant(' ') },
    { weight: 2, arbitrary: fc.constantFrom(...ACCENTED_WORDS) },
    { weight: 2, arbitrary: between(0x00c0, 0x00ff) },
    { weight: 2, arbitrary: between(0x0100, 0x017f) },
    { weight: 1, arbitrary: between(0x1e00, 0x1eff) },
    { weight: 2, arbitrary: between(0x0300, 0x036f) },
  ),
  minLength: 1,
  maxLength: 60,
  size: 'max',
})

/**
 * Characters that are not ASCII but fold to ASCII letters and digits: full
 * width, circled and superscript digits, Roman numerals, ligatures, bold
 * mathematical letters, the Kelvin and Angstrom signs, squared units, and one
 * ligature that unfolds to eighteen characters.
 */
const compatibilityArb = fc.string({
  unit: fc.oneof(
    { weight: 2, arbitrary: fc.constant(' ') },
    between(0xff10, 0xff19),
    between(0xff21, 0xff5a),
    between(0x2460, 0x2473),
    between(0x2160, 0x217f),
    between(0xfb00, 0xfb06),
    between(0x1d400, 0x1d433),
    between(0x3371, 0x33df),
    fc.constantFrom(...chars(0x00b2, 0x00b3, 0x00b9, 0x00bd, 0x2122, 0x2116, 0x212a, 0x212b, 0xfdfa)),
  ),
  minLength: 1,
  maxLength: 40,
  size: 'max',
})

/** One word far past every limit, alone or inside a sentence. */
const longWordArb = fc
  .tuple(
    fc.constantFrom('', 'a ', 'build '),
    fc.string({ unit: asciiAlphanumeric, minLength: 1, maxLength: 6, size: 'max' }),
    fc.integer({ min: 5, max: 200 }),
    fc.constantFrom('', ' app', '!'),
  )
  .map(([before, chunk, times, after]) => `${before}${chunk.repeat(times)}${after}`)

/** Unpaired surrogates among ordinary characters: a paste gone wrong. */
const brokenUnicodeArb = fc.string({
  unit: fc.oneof(fc.integer({ min: 0xd800, max: 0xdfff }).map((unit) => String.fromCharCode(unit)), fc.constantFrom('a', 'B', '7', ' ', '-')),
  maxLength: 40,
  size: 'max',
})

/** An example with one thing changed: no longer the example, so it is named from its words. */
const nearExampleArb = fc
  .tuple(fc.constantFrom(...EXAMPLE_IDEAS), fc.constantFrom('', 'So: ', 'x'), fc.constantFrom('!', ' Please.', ' 2', ' x'))
  .map(([example, before, after]) => `${before}${example.brief}${after}`)

const ideaArb = fc.oneof(
  { weight: 6, arbitrary: sentenceArb(0, 30) },
  { weight: 2, arbitrary: fc.string({ maxLength: 80, size: 'max' }) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary-ascii', maxLength: 80, size: 'max' }) },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: whiteSpaceArb },
  { weight: 1, arbitrary: asciiSymbolsArb },
  { weight: 1, arbitrary: symbolsArb },
  { weight: 2, arbitrary: nonLatinArb },
  { weight: 2, arbitrary: accentedLatinArb },
  { weight: 2, arbitrary: compatibilityArb },
  { weight: 2, arbitrary: longWordArb },
  { weight: 2, arbitrary: sentenceArb(100, 600) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 200, size: 'max' }) },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme', maxLength: 200, size: 'max' }) },
  { weight: 1, arbitrary: brokenUnicodeArb },
  { weight: 1, arbitrary: nearExampleArb },
)

// ---------------------------------------------------------------------------
// Existing names.

const lowerAlphanumeric = fc.constantFrom(...Array.from('abcdefghijklmnopqrstuvwxyz0123456789'))

/** Any valid mansion name. */
const mansionNameArb = fc
  .array(fc.string({ unit: lowerAlphanumeric, minLength: 1, maxLength: 8, size: 'max' }), { minLength: 1, maxLength: 5, size: 'max' })
  .map((groups) => groups.join('-').slice(0, NAME_LIMIT).replace(/-$/, ''))

/** A name of the full 40 characters. A hyphen goes only on an even position from 2 to 38: never first, last or doubled. */
const fullLengthNameArb = fc
  .tuple(fc.array(lowerAlphanumeric, { minLength: NAME_LIMIT, maxLength: NAME_LIMIT }), fc.array(fc.integer({ min: 1, max: 19 }), { maxLength: 6, size: 'max' }))
  .map(([letters, halves]) => {
    const name = [...letters]
    for (const half of halves) name[half * 2] = '-'
    return name.join('')
  })

/** The names an idea is most likely to want: the examples, the fallback, and their first successors. */
const LIKELY_NAMES = [...EXAMPLE_IDEAS.map(({ name }) => name), FALLBACK_MANSION_NAME, 'counter', 'list', 'weather-station'].flatMap((name) => [
  name,
  `${name}-2`,
  `${name}-3`,
])

const othersArb = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: mansionNameArb },
    { weight: 1, arbitrary: fullLengthNameArb },
    { weight: 2, arbitrary: fc.constantFrom(...LIKELY_NAMES) },
  ),
  { maxLength: 12, size: 'max' },
)

/**
 * Which of base, base-2, base-3, ... the house already holds. Either an
 * unbroken run from the base, so the next free name is past its end, or any
 * pattern, so the first gap must be found.
 */
const heldArb = fc.oneof(
  fc.integer({ min: 0, max: 14 }).map((count) => Array.from({ length: count }, () => true)),
  fc.array(fc.boolean(), { maxLength: 14, size: 'max' }),
)

function expectSameMembers(taken: ReadonlySet<string>, before: readonly string[]): void {
  expect([...taken]).toEqual(before)
}

describe('the mansion name of an idea', () => {
  // Feature: warden-guide-and-first-visit, Property 7: Every idea yields a new, valid mansion name
  it('Property 7: every idea yields a new, valid mansion name', () => {
    let collisions = 0
    let fallbacks = 0
    let fromWords = 0
    fc.assert(
      fc.property(
        ideaArb,
        othersArb,
        heldArb,
        fc.constantFrom(...EXAMPLE_IDEAS),
        whiteSpaceArb,
        whiteSpaceArb,
        (idea, others, held, example, lead, trail) => {
          // In an empty house the name is short, or is the fallback.
          const nobody: ReadonlySet<string> = new Set<string>()
          const base = mansionNameFromIdea(idea, nobody)
          expectValidAndNew(base, nobody)
          expect(base.length <= MAX_IDEA_NAME_LENGTH || base === FALLBACK_MANSION_NAME).toBe(true)
          expect(nobody.size).toBe(0)

          // In plain ASCII the name is made of the idea's own words, in order.
          if (isPlainAscii(idea)) {
            const words = asciiWords(idea)
            if (words.length === 0) {
              expect(base).toBe(FALLBACK_MANSION_NAME)
              fallbacks += 1
            } else {
              const parts = base.split('-')
              // A first word past the limit is cut, not dropped.
              const cutWord =
                parts.length === 1 &&
                base.length === MAX_IDEA_NAME_LENGTH &&
                words.some((word) => word.length > MAX_IDEA_NAME_LENGTH && word.startsWith(base))
              expect(cutWord || inOrder(parts, words)).toBe(true)
              fromWords += 1
            }
          }

          // A house that may already hold the base, its successors, and a 40-character name that starts like it.
          const taken = new Set(others)
          held.forEach((isHeld, index) => {
            if (isHeld) taken.add(index === 0 ? base : `${base}-${index + 1}`)
          })
          taken.add(`${base}-${'z'.repeat(NAME_LIMIT)}`.slice(0, NAME_LIMIT))
          const members = [...taken]
          if (taken.has(base)) collisions += 1

          const name = mansionNameFromIdea(idea, taken)
          expectValidAndNew(name, taken)
          expect(name).toBe(firstFree(base, taken))
          // The same inputs give the same name, whatever order the set was filled in, and the set is left alone.
          expect(mansionNameFromIdea(idea, taken)).toBe(name)
          expect(mansionNameFromIdea(idea, new Set([...members].reverse()))).toBe(name)
          expectSameMembers(taken, members)

          // An Example Idea keeps its own name while that name is free, with or without white space around it.
          const padded = `${lead}${example.brief}${trail}`
          const withoutIt = new Set(others.filter((other) => other !== example.name))
          expect(mansionNameFromIdea(example.brief, withoutIt)).toBe(example.name)
          expect(mansionNameFromIdea(padded, withoutIt)).toBe(example.name)
          // And gets a different, valid one when it is not.
          const withIt = new Set([...others, example.name])
          const withItMembers = [...withIt]
          const instead = mansionNameFromIdea(padded, withIt)
          expect(instead).not.toBe(example.name)
          expectValidAndNew(instead, withIt)
          expect(instead).toBe(firstFree(example.name, withIt))
          expectSameMembers(withIt, withItMembers)
        },
      ),
      { numRuns: 300 },
    )
    // Taken bases, ideas with nothing to name, and ideas named from their words were all exercised.
    expect(collisions).toBeGreaterThan(0)
    expect(fallbacks).toBeGreaterThan(0)
    expect(fromWords).toBeGreaterThan(0)
  })

  it('names each example idea after itself, and numbers the next one', () => {
    for (const { name, brief } of EXAMPLE_IDEAS) {
      expect(mansionNameFromIdea(brief, new Set())).toBe(name)
      expect(mansionNameFromIdea(`\n  ${brief}\t`, new Set(['attic']))).toBe(name)
      expect(mansionNameFromIdea(brief, new Set([name]))).toBe(`${name}-2`)
      expect(mansionNameFromIdea(brief, new Set([name, `${name}-2`, `${name}-3`]))).toBe(`${name}-4`)
      // A gap in the run is the first free name.
      expect(mansionNameFromIdea(brief, new Set([name, `${name}-3`]))).toBe(`${name}-2`)
    }
  })

  it('lower-cases, strips marks and joins the words with single hyphens', () => {
    expect(mansionNameFromIdea(`Cr${u(0xe8)}me   br${u(0xfb)}l${u(0xe9)}e!!`, new Set())).toBe('creme-brulee')
    expect(mansionNameFromIdea(`Zoe${u(0x308)} --- CHESS__clock`, new Set())).toBe('zoe-chess-clock')
  })

  it('keeps whole words within 24 characters and cuts a first word that is longer', () => {
    expect(MAX_IDEA_NAME_LENGTH).toBe(24)
    // "weather-station-alerts" is 22 long; one more word would pass 24.
    expect(mansionNameFromIdea('Weather station alerts dashboard', new Set())).toBe('weather-station-alerts')
    expect(mansionNameFromIdea('Supercalifragilisticexpialidocious', new Set())).toBe('supercalifragilisticexpi')
  })

  it('falls back when an idea holds no letter or digit', () => {
    expect(FALLBACK_MANSION_NAME).toBe('my-house')
    for (const idea of ['', '   ', '\n\t', '!!!', '--', '?']) {
      expect(mansionNameFromIdea(idea, new Set())).toBe('my-house')
      expect(mansionNameFromIdea(idea, new Set(['my-house']))).toBe('my-house-2')
      expect(mansionNameFromIdea(idea, new Set(['my-house', 'my-house-2']))).toBe('my-house-3')
    }
  })

  it('agrees with the module on what a mansion name is', () => {
    const accepted = ['a', 'z9', 'word-counter', 'to-do-list', 'a-b-c', '0', 'x'.repeat(40)]
    const refused = ['', '-', 'a-', '-a', 'a--b', 'A', 'word counter', `caf${u(0xe9)}`, 'a_b', 'x'.repeat(41)]
    for (const name of accepted) {
      expect(followsNameRule(name)).toBe(true)
      expect(isMansionName(name)).toBe(true)
    }
    for (const name of refused) {
      expect(followsNameRule(name)).toBe(false)
      expect(isMansionName(name)).toBe(false)
    }
  })
})
