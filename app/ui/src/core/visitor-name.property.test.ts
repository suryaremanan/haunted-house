// Property 6: A visitor's name is bounded and inert
//
// For all strings, `visitorName` returns one line of at most 40 code points
// with no control character, and normalising its result again changes
// nothing; `greeting` is exactly "Come in, <name>." around the normalised name
// when it is not empty and is the nameless greeting when it is.
//
// **Validates: Requirements 9.4, 9.5, 9.6**
//
// "No control character" is held to its widest reading: nothing of Unicode
// general category C (control, format, unpaired surrogate, private use,
// unassigned), and no white space but single spaces between words.
//
// The reference reads the raw text one code point at a time and sorts each
// into white space, general category C, or kept. It shares no code with the
// module. Every character below is written by code point, so this file stays
// plain ASCII and nothing invisible hides in it.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MAX_VISITOR_NAME_CODE_POINTS, NAMELESS_GREETING, greeting, visitorName } from './first-visit'

/** Requirement 9.5, stated here rather than imported. */
const LIMIT = 40

function chars(...codePoints: number[]): string[] {
  return codePoints.map((codePoint) => String.fromCodePoint(codePoint))
}

/** Every ECMAScript WhiteSpace and LineTerminator code point. */
const WHITE_SPACE = chars(
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
)
/** C0, DEL and C1 controls, NEL among them. */
const CONTROLS = chars(0x0000, 0x0001, 0x0007, 0x0008, 0x001b, 0x001f, 0x007f, 0x0080, 0x0085, 0x009f)
/** Soft hyphen, Mongolian vowel separator, zero-width space, word joiner. */
const ZERO_WIDTH = chars(0x00ad, 0x180e, 0x200b, 0x2060)
/**
 * The zero-width non-joiner and joiner. Some scripts and emoji are written
 * with one between two letters, so a name keeps it there and nowhere else.
 */
const JOINERS = chars(0x200c, 0x200d)
/** Letters that draw nothing: Hangul fillers and the blank braille pattern. They count as spaces. */
const BLANK_LETTERS = chars(0x115f, 0x1160, 0x3164, 0xffa0, 0x2800)
/** Marks, embeddings, overrides and isolates: what turns shown text around. */
const BIDI = chars(0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069)
/** Private use, noncharacters and tag characters. */
const PRIVATE_USE_AND_NONCHARACTERS = chars(
  0xe000, 0xf8ff, 0xfdd0, 0xfffe, 0xffff, 0x1fffe, 0xe0001, 0xe0041, 0xf0000, 0x10fffd, 0x10ffff,
)
/** Removed wherever they stand and whatever stands beside them. */
const NEVER_KEPT = [...WHITE_SPACE, ...CONTROLS, ...ZERO_WIDTH, ...BIDI, ...PRIVATE_USE_AND_NONCHARACTERS, ...BLANK_LETTERS]
/**
 * Surrogates are removed only while unpaired: a high one directly before a low
 * one is a character outside the BMP, and may be a letter.
 */
const HIGH_SURROGATES = chars(0xd800, 0xdb7f, 0xdbff)
const LOW_SURROGATES = chars(0xdc00, 0xdfff)
/** Nothing in this list may reach the page. */
const SEPARATORS = [...NEVER_KEPT, ...HIGH_SURROGATES, ...LOW_SURROGATES]

/**
 * Characters a name keeps: letters, digits, punctuation, markup characters, an
 * accented letter, three combining or invisible marks that are not category C
 * (acute, grapheme joiner, variation selector 16), a CJK letter, a ghost emoji
 * and a letter outside the BMP.
 */
const KEPT = chars(
  0x41, 0x61, 0x7a, 0x30, 0x39, 0x2d, 0x27, 0x2e, 0x21, 0x3c, 0x3e, 0x26,
  0xe9, 0x0301, 0x034f, 0xfe0f, 0x4e2d, 0x1f47b, 0x1d49c,
)

const WHITE_SPACE_SET: ReadonlySet<string> = new Set(WHITE_SPACE)
const BLANK_SET: ReadonlySet<string> = new Set(BLANK_LETTERS)
const JOINER_SET: ReadonlySet<string> = new Set(JOINERS)
/** General category C, one subcategory at a time: control, format, surrogate, private use, unassigned. */
const CATEGORY_OTHER = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]$/u

function isSeparator(char: string): boolean {
  if (JOINER_SET.has(char)) return false
  return WHITE_SPACE_SET.has(char) || BLANK_SET.has(char) || CATEGORY_OTHER.test(char)
}

/** A word without the joiners at its two ends: a joiner is kept only between two other characters. */
function withoutEdgeJoiners(word: string): string {
  const points = Array.from(word)
  while (points.length > 0 && JOINER_SET.has(points[0])) points.shift()
  while (points.length > 0 && JOINER_SET.has(points[points.length - 1])) points.pop()
  return points.join('')
}

/**
 * The words of a raw name: the longest runs of code points that are neither
 * white space, a blank letter, nor category C (the two joiners aside), each
 * without joiners at its ends. A run of joiners alone is no word.
 */
function wordsOf(raw: string): string[] {
  const words: string[] = []
  let word = ''
  // A string iterates by code point, and an unpaired surrogate comes out alone.
  for (const char of raw) {
    if (!isSeparator(char)) {
      word += char
    } else if (word !== '') {
      words.push(word)
      word = ''
    }
  }
  if (word !== '') words.push(word)
  return words.map(withoutEdgeJoiners).filter((kept) => kept !== '')
}

/** Independent reference: the words on one line, cut at 40 code points, with no space or joiner left at the cut. */
function referenceName(raw: string): string {
  const line = Array.from(wordsOf(raw).join(' ')).slice(0, LIMIT)
  while (line.length > 0 && (line[line.length - 1] === ' ' || JOINER_SET.has(line[line.length - 1]))) line.pop()
  return line.join('')
}

/** One line of at most 40 code points, nothing of category C but a joiner inside a word, single spaces between words only. */
function expectBoundedAndInert(name: string): void {
  expect(Array.from(name).length).toBeLessThanOrEqual(LIMIT)
  for (const char of name) expect(CATEGORY_OTHER.test(char) && !JOINER_SET.has(char), `U+${(char.codePointAt(0) ?? 0).toString(16)}`).toBe(false)
  for (const char of name) expect(BLANK_SET.has(char)).toBe(false)
  if (name === '') return
  for (const word of name.split(' ')) {
    // An empty piece would be a leading, trailing or doubled space.
    expect(word).not.toBe('')
    // And no white space other than U+0020 anywhere.
    expect(/\s/.test(word)).toBe(false)
    // A joiner never stands at the edge of a word.
    expect(withoutEdgeJoiners(word)).toBe(word)
  }
}

const anySurrogate = fc.integer({ min: 0xd800, max: 0xdfff }).map((unit) => String.fromCharCode(unit))

/** Mostly what a name must not keep, with enough ordinary characters between to leave words. */
const hostileUnit = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...SEPARATORS) },
  { weight: 1, arbitrary: anySurrogate },
  { weight: 4, arbitrary: fc.constantFrom(...KEPT) },
)

/** A run of one character that ends near the limit, then a separator, then more: the cut lands on or beside a space. */
const nearTheLimitArb = fc
  .tuple(
    fc.constantFrom(...chars(0x61, 0x4e2d, 0x1f47b)),
    fc.integer({ min: 36, max: 44 }),
    fc.constantFrom('', ...SEPARATORS),
    fc.string({ unit: hostileUnit, maxLength: 12, size: 'max' }),
  )
  .map(([unit, count, separator, tail]) => `${unit.repeat(count)}${separator}${tail}`)

/** Thousands of code points: a repeated hostile chunk, or one long run of arbitrary code points. */
const veryLongArb = fc.oneof(
  fc
    .tuple(fc.string({ unit: hostileUnit, minLength: 1, maxLength: 40, size: 'max' }), fc.integer({ min: 50, max: 400 }))
    .map(([chunk, times]) => chunk.repeat(times)),
  fc.string({ unit: 'binary', minLength: 500, maxLength: 3000, size: 'max' }),
)

/** Any string a visitor, a paste or a script could put in the field. */
const rawArb = fc.oneof(
  // Every code point except unpaired surrogates, most of them unassigned or private use.
  { weight: 3, arbitrary: fc.string({ unit: 'binary', maxLength: 100, size: 'max' }) },
  // Printable text of every script, combining sequences included.
  { weight: 2, arbitrary: fc.string({ unit: 'grapheme', maxLength: 100, size: 'max' }) },
  { weight: 1, arbitrary: fc.string({ maxLength: 100, size: 'max' }) },
  { weight: 5, arbitrary: fc.string({ unit: hostileUnit, maxLength: 100, size: 'max' }) },
  { weight: 2, arbitrary: nearTheLimitArb },
  { weight: 2, arbitrary: veryLongArb },
)

const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u

/**
 * Letters and digits of several scripts: Latin with marks and strokes, Greek,
 * Cyrillic, Hebrew, Arabic, Devanagari, kana, CJK, Hangul, three letters
 * outside the BMP, and two digits that are not ASCII.
 */
const SCRIPT_SAMPLES = chars(
  0xe9, 0xf1, 0xdf, 0xf8, 0x141, 0x3b1, 0x3a9, 0x414, 0x44f, 0x5d0, 0x627, 0x905, 0x3042, 0x30a2,
  0x4e2d, 0x6587, 0xd55c, 0x1d49c, 0x10400, 0x20000, 0x663, 0x96b,
)

const cleanUnit = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...Array.from('ADLZadeghilnortvy0123456789')) },
  { weight: 3, arbitrary: fc.constantFrom(...SCRIPT_SAMPLES) },
  // Any letter or decimal digit the engine knows, except the few letters that draw nothing: those count as spaces, so a clean name has none.
  { weight: 2, arbitrary: fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }).filter((char) => LETTER_OR_DIGIT.test(char) && !BLANK_SET.has(char)) },
)

/** Whole words joined by single spaces for as long as the line stays within the limit. */
function fitWords(words: readonly string[]): string {
  let line = ''
  for (const word of words) {
    const longer = line === '' ? word : `${line} ${word}`
    if (Array.from(longer).length > LIMIT) break
    line = longer
  }
  return line
}

/** A name with nothing to remove: letters, digits and single spaces, trimmed, at most 40 code points. */
const cleanNameArb = fc.oneof(
  fc
    .array(fc.array(cleanUnit, { minLength: 1, maxLength: 9, size: 'max' }), { minLength: 1, maxLength: 8, size: 'max' })
    .map((words) => fitWords(words.map((units) => units.join('')))),
  // Exactly at the limit. A space goes only on an even position from 2 to 38: never first, last or doubled.
  fc
    .tuple(fc.array(cleanUnit, { minLength: LIMIT, maxLength: LIMIT }), fc.array(fc.integer({ min: 1, max: 19 }), { maxLength: 5, size: 'max' }))
    .map(([units, halves]) => {
      const line = [...units]
      for (const half of halves) line[half * 2] = ' '
      return line.join('')
    }),
)

/**
 * Nothing but white space, or nothing but characters a name may not keep. The
 * empty string is one of them. High and low surrogates are never mixed here,
 * so none of them can pair up into a character.
 */
const blankArb = fc.oneof(
  fc.string({ unit: fc.constantFrom(...WHITE_SPACE), maxLength: 30, size: 'max' }),
  fc.string({ unit: fc.constantFrom(...NEVER_KEPT, ...HIGH_SURROGATES), maxLength: 30, size: 'max' }),
  fc.string({ unit: fc.constantFrom(...NEVER_KEPT, ...LOW_SURROGATES), maxLength: 30, size: 'max' }),
)

describe("the visitor's name", () => {
  // Feature: warden-guide-and-first-visit, Property 6: A visitor's name is bounded and inert
  it("Property 6: a visitor's name is bounded and inert", () => {
    let cut = 0
    let whole = 0
    fc.assert(
      fc.property(rawArb, cleanNameArb, blankArb, (raw, clean, blank) => {
        const name = visitorName(raw)
        expectBoundedAndInert(name)
        // The same words in the same order, and nothing else.
        expect(name).toBe(referenceName(raw))
        // Normalising a normalised name changes nothing, and the same text always gives the same name.
        expect(visitorName(name)).toBe(name)
        expect(visitorName(raw)).toBe(name)
        if (Array.from(wordsOf(raw).join(' ')).length > LIMIT) cut += 1
        else whole += 1

        // The greeting holds the name once, in a fixed frame, or is the nameless one.
        expect(greeting(name)).toBe(name === '' ? NAMELESS_GREETING : `Come in, ${name}.`)

        // A name that is already clean is returned as it was given, and is greeted by it.
        expectBoundedAndInert(clean)
        expect(clean).not.toBe('')
        expect(visitorName(clean)).toBe(clean)
        expect(greeting(visitorName(clean))).toBe(`Come in, ${clean}.`)

        // An empty name is accepted (Requirement 9.4), and white space alone is no name.
        expect(visitorName(blank)).toBe('')
        expect(greeting(visitorName(blank))).toBe(NAMELESS_GREETING)
      }),
      { numRuns: 300 },
    )
    // Raw text on both sides of the limit was exercised.
    expect(cut).toBeGreaterThan(0)
    expect(whole).toBeGreaterThan(0)
  })

  it('keeps the words of a name on one line', () => {
    expect(visitorName('')).toBe('')
    expect(visitorName(' \n\t ')).toBe('')
    expect(visitorName('Ada')).toBe('Ada')
    expect(visitorName('  Ada \t Lovelace\r\n')).toBe('Ada Lovelace')
    // NUL, a right-to-left override with its pop, and a surrogate at each end with no partner.
    const [nul, override, pop, high, low] = chars(0x0000, 0x202e, 0x202c, 0xd800, 0xdfff)
    expect(visitorName(`Ada${nul}Lovelace`)).toBe('Ada Lovelace')
    // The override cannot turn the greeting around.
    expect(visitorName(`${override}adA${pop}`)).toBe('adA')
    expect(visitorName(`${high}Ada${low}`)).toBe('Ada')
  })

  it('lets no white space but a single space, and no category C character, through', () => {
    for (const hostile of SEPARATORS) {
      const where = `U+${(hostile.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`
      expect(visitorName(`${hostile}Ada${hostile}${hostile}Lovelace${hostile}`), where).toBe('Ada Lovelace')
    }
    // A joiner is kept between two letters, and dropped at the edges and on its own.
    for (const joiner of JOINERS) {
      expect(visitorName(`${joiner}Ada${joiner}${joiner}Lovelace${joiner}`)).toBe(`Ada${joiner}${joiner}Lovelace`)
      expect(visitorName(`Ada ${joiner} Lovelace${joiner}`)).toBe('Ada Lovelace')
      expect(visitorName(`${joiner}${joiner}`)).toBe('')
    }
  })

  it('counts code points, not UTF-16 units, and leaves no space at the cut', () => {
    const ghost = String.fromCodePoint(0x1f47b)
    expect(MAX_VISITOR_NAME_CODE_POINTS).toBe(LIMIT)
    expect(visitorName('a'.repeat(41))).toBe('a'.repeat(40))
    expect(visitorName(ghost.repeat(41))).toBe(ghost.repeat(40))
    expect(visitorName(`${'a'.repeat(38)} bcd`)).toBe(`${'a'.repeat(38)} b`)
    expect(visitorName(`${'a'.repeat(39)} bcd`)).toBe('a'.repeat(39))
    expect(visitorName(`${'a'.repeat(40)} bcd`)).toBe('a'.repeat(40))
  })

  it('samples only letters and digits as clean, and only separators as hostile', () => {
    for (const sample of SCRIPT_SAMPLES) expect(LETTER_OR_DIGIT.test(sample)).toBe(true)
    for (const hostile of SEPARATORS) expect(isSeparator(hostile)).toBe(true)
    for (const kept of KEPT) expect(isSeparator(kept)).toBe(false)
  })
})
