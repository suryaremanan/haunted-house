// Property 5 of the Warden guide (Spec 8, warden-guide-and-first-visit).
//
// For all terms, `word(id, 'plain')` is the plain word and
// `word(id, 'with-kiro')` is the plain word followed by the Kiro word in
// brackets; every term has exactly two sentences; and for all House
// Projections and contexts with Kiro's words off, no text the guide composes
// contains a Kiro word of the book as a whole word, while with Kiro's words on
// each term the guide names carries its Kiro word.
//
// **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
//
// The references are written here and not read from the module: the book as
// design.md lists it, a sentence counter, a whole-word matcher that searches
// the Kiro words as plain strings, and a template filler that joins pieces.
// `note` is the room's own upstream sentence, not guide copy, so it is not read.
//
// The status line quotes the house's own sentences unchanged: a locked room's
// text, a waiting item's label and the reason of a failed or held ghost. Those
// are the house's words, not the guide's, and a reason code the house has no
// fixed copy for is shown as its own words ("Tasks unreadable"). The view
// names what it quoted (`quotes`), so the quoted part is taken out before the
// status is searched; everything around it is the guide's and must be plain.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { guideCaseArb } from '../test/guide-arbitraries'
import { guideView, type GuideContext, type GuideView } from './house-guide'
import type { HouseProjection } from './house-projection'
import { TERMS, TERM_IDS, namesKiroWord, term, termsIn, word, write, type TermId, type WordMode } from './house-words'

const RUNS = 300
const MODES: readonly WordMode[] = ['plain', 'with-kiro']

/** The Word Book as design.md lists it: term, everyday word, Kiro's word. */
const BOOK: ReadonlyArray<readonly [id: TermId, plain: string, kiro: string]> = [
  ['plan', 'plan', 'spec'],
  ['requirements', 'what it must do', 'requirements'],
  ['design', 'how it will work', 'design'],
  ['tasks', 'to-do list', 'tasks'],
  ['build', 'the build', 'implementation'],
  ['ghost', 'ghost', 'agent'],
  ['approve', 'open the door', 'approve'],
  ['reject', 'keep the door shut', 'reject'],
  ['revise', 'ask for a change', 'revision request'],
  ['steering', 'house rules', 'steering'],
  ['wall', 'wall', 'path limit'],
]

function bookRow(id: TermId): readonly [id: TermId, plain: string, kiro: string] {
  const row = BOOK.find(([candidate]) => candidate === id)
  if (row === undefined) throw new Error(`design.md lists no term ${id}`)
  return row
}

/** The word a mode shows, from the table above: the everyday word, or Kiro's in brackets after it. */
function expectedWord(id: TermId, mode: WordMode): string {
  const [, plain, kiro] = bookRow(id)
  return mode === 'plain' ? plain : `${plain} (${kiro})`
}

/**
 * Sentences in a text: each ends with a full stop, `!` or `?` that a space or
 * the end of the text follows. The dot inside `tasks.md` ends nothing.
 */
function sentenceCount(text: string): number {
  let count = 0
  for (let index = 0; index < text.length; index += 1) {
    if (!'.!?'.includes(text[index])) continue
    const next: string | undefined = text[index + 1]
    if (next === undefined || /\s/.test(next)) count += 1
  }
  return count
}

/** What makes a neighbour part of the same word: a letter, a digit, an underscore or `$`. */
function joinsWord(character: string | undefined): boolean {
  if (character === undefined || character === '') return false
  return (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character === '_' || character === '$'
}

/** Folds A to Z only, so the text keeps its length and positions. */
function lowerAscii(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

/** The Kiro words of the book a text holds as whole words, in any case. Plain string search, no pattern. */
function kiroWordsIn(text: string): string[] {
  const haystack = lowerAscii(text)
  return TERMS.map((entry) => entry.kiro).filter((kiro) => {
    const needle = lowerAscii(kiro)
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
      if (!joinsWord(haystack[at - 1]) && !joinsWord(haystack[at + needle.length])) return true
    }
    return false
  })
}

function viewOf(house: HouseProjection, context: GuideContext, words: WordMode): GuideView {
  const view = guideView(house, { ...context, words })
  if (view === null) throw new Error(`the ${house.mode} house shows no guide for ${context.roomId}`)
  return view
}

/** Every option of a view, the primary ones and the full list. */
function optionsOf(view: GuideView): GuideView['everything'] {
  return [...view.options, ...view.everything]
}

/** The status line with the house's quoted sentences taken out: what the guide itself wrote. */
function ownStatus(view: GuideView): string {
  return view.quotes.reduce((status, quote) => status.split(quote).join(' '), view.status)
}

/** Every text the guide composes in a view. `note` and the quoted sentences are the house's and are left out. */
function composedTexts(view: GuideView): string[] {
  return [ownStatus(view), view.question, view.poseLabel, ...optionsOf(view).flatMap((option) => [option.label, option.consequence])]
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ---------------------------------------------------------------------------
// Templates: literal pieces joined by slots.

type Slot = { readonly kind: 'term'; readonly id: TermId; readonly capital: boolean } | { readonly kind: 'unknown'; readonly name: string }

/** Letters and spaces only, so a literal piece can hold no brace. */
const literalArb = fc.stringMatching(/^[A-Za-z ]{0,10}$/)
const slotArb: fc.Arbitrary<Slot> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ kind: fc.constant('term' as const), id: fc.constantFrom(...TERM_IDS), capital: fc.boolean() }) },
  // A slot that names no term: it stays as written and is not listed.
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('unknown' as const), name: fc.constantFrom('door', 'word', 'Kiro', 'x', 'termless') }) },
)
const templateArb = fc.record({ pieces: fc.array(fc.tuple(literalArb, slotArb), { maxLength: 8 }), tail: literalArb })

function slotAsWritten(slot: Slot): string {
  return slot.kind === 'unknown' ? `{${slot.name}}` : `{${slot.capital ? capital(slot.id) : slot.id}}`
}

function slotFilled(slot: Slot, mode: WordMode): string {
  if (slot.kind === 'unknown') return slotAsWritten(slot)
  const shown = expectedWord(slot.id, mode)
  return slot.capital ? capital(shown) : shown
}

// ---------------------------------------------------------------------------
// Texts with one Kiro word and chosen neighbours.

/** Neighbours that cannot spell a Kiro word between them. The first five join a word; the rest end one. */
const NEIGHBOURS = ['x', 'Q', '7', '_', '$', ' ', '.', ',', '(', ')', '-', "'", ':'] as const
const fillerArb = fc.array(fc.constantFrom(...NEIGHBOURS), { maxLength: 4 }).map((characters) => characters.join(''))
const casedKiroArb = fc.constantFrom(...TERMS.map((entry) => entry.kiro)).chain((kiro) =>
  fc.array(fc.boolean(), { minLength: kiro.length, maxLength: kiro.length }).map((upper) =>
    Array.from(kiro)
      .map((character, index) => (upper[index] ? character.toUpperCase() : character))
      .join(''),
  ),
)

describe("the Word Book: plain words, with Kiro's beside them on request", () => {
  // Feature: warden-guide-and-first-visit, Property 5: Plain words by default, Kiro's words on request
  it("Property 5: plain words by default, Kiro's words on request", () => {
    // Every term in both modes. The book is small, so this is exhaustive.
    expect([...TERM_IDS]).toEqual(BOOK.map(([id]) => id))
    expect(TERMS.map((entry) => [entry.id, entry.plain, entry.kiro])).toEqual(BOOK.map((row) => [...row]))
    for (const id of TERM_IDS) {
      const entry = term(id)
      expect(entry.id).toBe(id)
      // The term's own plain word, then Kiro's in brackets after it.
      expect(word(id, 'plain'), id).toBe(entry.plain)
      expect(word(id, 'with-kiro'), id).toBe(`${entry.plain} (${entry.kiro})`)
      // And the words design.md lists for it.
      for (const mode of MODES) expect(word(id, mode), `${id} in ${mode}`).toBe(expectedWord(id, mode))

      // Exactly two sentences: one in each half, two in the whole.
      expect(entry.about, id).toHaveLength(2)
      for (const sentence of entry.about) {
        expect(sentence.trim(), id).toBe(sentence)
        expect(sentenceCount(sentence), `${id}: ${sentence}`).toBe(1)
        expect('.!?', `${id}: ${sentence}`).toContain(sentence.charAt(sentence.length - 1))
      }
      expect(sentenceCount(entry.about.join(' ')), id).toBe(2)
    }

    // Generated houses, live and as a recording of the same facts, read in one of their rooms with one of its surfaces on top.
    const named = new Set<TermId>()
    fc.assert(
      fc.property(guideCaseArb, ({ live, replay, context }) => {
        for (const house of [live, replay]) {
          // Kiro's words off: nothing the guide composes holds one.
          const plain = viewOf(house, context, 'plain')
          for (const text of composedTexts(plain)) {
            expect(kiroWordsIn(text), `${house.mode}, plain: ${text}`).toEqual([])
            expect(namesKiroWord(text), `${house.mode}, plain: ${text}`).toBe(false)
          }
          expect(new Set(plain.terms).size).toBe(plain.terms.length)
          for (const id of plain.terms) {
            const [, plainWord] = bookRow(id)
            expect(lowerAscii(plain.status), `${house.mode}, plain: ${id}`).toContain(lowerAscii(plainWord))
          }

          // Kiro's words on: each term the status names carries Kiro's word in brackets, right after the plain one.
          const withKiro = viewOf(house, context, 'with-kiro')
          expect(withKiro.terms).toEqual(plain.terms)
          for (const id of withKiro.terms) {
            named.add(id)
            const [, plainWord, kiroWord] = bookRow(id)
            expect(lowerAscii(withKiro.status), `${house.mode}, with Kiro's words: ${id}`).toContain(lowerAscii(`${plainWord} (${kiroWord})`))
            expect(kiroWordsIn(withKiro.status), `${house.mode}, with Kiro's words: ${id}`).toContain(kiroWord)
          }
          // And the other way round: every term the status says this way is one the view lists.
          const said = BOOK.filter(([, plainWord, kiroWord]) => lowerAscii(withKiro.status).includes(lowerAscii(`${plainWord} (${kiroWord})`))).map(([id]) => id)
          expect([...withKiro.terms].sort(), `${house.mode}, with Kiro's words: ${withKiro.status}`).toEqual(said.sort())
          // A label stays plain in both modes: Kiro's word is shown beside it, from the option's term.
          for (const option of optionsOf(withKiro)) {
            expect(kiroWordsIn(option.label), `${house.mode}, with Kiro's words: ${option.label}`).toEqual([])
            expect(option.term === null || BOOK.some(([id]) => id === option.term), option.id).toBe(true)
          }
          // The matcher of the book and the one written here agree on everything the guide wrote.
          for (const text of composedTexts(withKiro)) expect(namesKiroWord(text), text).toBe(kiroWordsIn(text).length > 0)
        }
      }),
      { numRuns: RUNS },
    )
    // The second half was not empty: some status named a term.
    expect(named.size).toBeGreaterThan(0)
  })

  it('fills a template with the words termsIn lists, in the order they first appear', () => {
    fc.assert(
      fc.property(templateArb, ({ pieces, tail }) => {
        const template = `${pieces.map(([literal, slot]) => literal + slotAsWritten(slot)).join('')}${tail}`
        const filled = (mode: WordMode) => `${pieces.map(([literal, slot]) => literal + slotFilled(slot, mode)).join('')}${tail}`

        // The distinct terms, in the order they first appear. A Set keeps insertion order.
        const terms = [...new Set(pieces.flatMap(([, slot]) => (slot.kind === 'term' ? [slot.id] : [])))]
        expect(termsIn(template)).toEqual(terms)

        expect(write(template, 'plain')).toBe(filled('plain'))
        expect(write(template, 'with-kiro')).toBe(filled('with-kiro'))
        // A filled text names no term, so filling it again changes nothing.
        expect(termsIn(write(template, 'plain'))).toEqual([])
        expect(write(write(template, 'plain'), 'with-kiro')).toBe(filled('plain'))
      }),
      { numRuns: RUNS },
    )
  })

  it('spots a Kiro word exactly when it stands as a whole word', () => {
    fc.assert(
      fc.property(fillerArb, casedKiroArb, fillerArb, (before, kiro, after) => {
        const text = `${before}${kiro}${after}`
        // Whole: no letter, digit, underscore or `$` directly before or after it.
        const whole = !joinsWord(before.charAt(before.length - 1)) && !joinsWord(after.charAt(0))
        expect(kiroWordsIn(text).length > 0, text).toBe(whole)
        expect(namesKiroWord(text), text).toBe(whole)
      }),
      { numRuns: RUNS },
    )
  })
})
