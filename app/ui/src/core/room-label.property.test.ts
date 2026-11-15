import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MAX_NAME_CODE_POINTS, roomAccessibleName, roomStateFields } from './house-projection'
import {
  HOUSE_ROOM_IDS,
  PRESENTATION_DOOR_STATES,
  PRESENTATION_GHOST_STATES,
  ROOM_PHASES,
  type PresentationDoorState,
  type PresentationGhostState,
  type RoomPhase,
} from './house-registry'

// Independent reference: the words of every field, written out here.
const PHASE_WORDS: Readonly<Record<RoomPhase, string>> = {
  navigation: 'navigation',
  requirements: 'requirements',
  design: 'design',
  'tasks-and-implementation': 'tasks and implementation',
  replay: 'replay',
  review: 'review',
}
const DOOR_WORDS: Readonly<Record<PresentationDoorState, string>> = {
  sealed: 'sealed',
  waiting: 'waiting',
  open: 'open',
  rejected: 'rejected',
  not_applicable: 'not applicable',
  unavailable: 'unavailable',
}
const GHOST_WORDS: Readonly<Record<PresentationGhostState, string>> = {
  idle: 'idle',
  working: 'working',
  waiting: 'waiting',
  blocked: 'blocked',
  failed: 'failed',
  done: 'done',
  not_applicable: 'not applicable',
  unavailable: 'unavailable',
}

/** Words that would describe how a state looks instead of what it is. */
const VISUAL_TERMS = /\b(icon|svg|pose|silhouette|red|green|amber|orange|yellow|blue|purple|grey|gray|dashed|dotted|border|color|colour)\b|#[0-9a-f]{3,8}\b|undefined|null|NaN|\[object|not_applicable/i

/** Single code points from several scripts, so a name's length in code points is easy to reason about. */
const LETTERS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ', 'é', 'ß', 'ø', 'ж', 'λ', '間', '書', '室', 'ش', 'क', '👻', '🕯', '̈']
const wordArb = fc.array(fc.constantFrom(...LETTERS), { minLength: 1, maxLength: 7 }).map((letters) => letters.join(''))
const gapArb = fc.constantFrom(' ', '  ', '\n', '\t', ' \r\n ', '\u0007')

/** A room name as upstream might spell it: words with stray whitespace and control characters between and around them. */
const nameArb = fc
  .tuple(fc.array(wordArb, { minLength: 1, maxLength: 5 }), fc.array(gapArb, { minLength: 6, maxLength: 6 }))
  .map(([words, gaps]) => ({
    raw: gaps[5] + words.map((word, index) => (index === 0 ? word : gaps[index - 1] + word)).join('') + gaps[4],
    clean: words.join(' '),
  }))

const roomArb = fc.record({
  roomId: fc.constantFrom(...HOUSE_ROOM_IDS),
  phase: fc.constantFrom(...ROOM_PHASES),
  door: fc.constantFrom(...PRESENTATION_DOOR_STATES),
  ghost: fc.constantFrom(...PRESENTATION_GHOST_STATES),
  name: nameArb,
})

function count(text: string, part: string): number {
  return text.split(part).length - 1
}

describe('room labels', () => {
  // Feature: house-ui-and-accessibility, Property 2: Every room label states the complete nonvisual model
  // Validates: Requirements 4.2
  it('Property 2: every room label states the complete nonvisual model', () => {
    const doorsSeen = new Set<string>()
    const ghostsSeen = new Set<string>()
    fc.assert(
      fc.property(roomArb, ({ roomId, phase, door, ghost, name }) => {
        doorsSeen.add(door)
        ghostsSeen.add(ghost)
        const label = roomAccessibleName({ roomId, name: name.raw, phase, door, ghost })

        // Exactly the fixed sentence: name, phase, Door state, Ghost state.
        expect(label).toBe(`${name.clean}. Phase: ${PHASE_WORDS[phase]}. Door: ${DOOR_WORDS[door]}. Ghost: ${GHOST_WORDS[ghost]}.`)

        // Each labelled field appears once and is never empty.
        for (const field of ['Phase: ', 'Door: ', 'Ghost: ']) expect(count(label, field)).toBe(1)
        expect(label).not.toMatch(/: \./)
        expect(label.startsWith(`${name.clean}. `)).toBe(true)

        // Nothing beyond the name describes appearance or leaks a raw value.
        const fixedPart = label.slice(name.clean.length)
        expect(fixedPart).not.toMatch(VISUAL_TERMS)
        // One line, bounded.
        expect(label).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
        expect(Array.from(label).length).toBeLessThanOrEqual(MAX_NAME_CODE_POINTS + 80)

        // What is shown uses the same words as what is read.
        expect(roomStateFields({ phase, door, ghost })).toEqual([
          { label: 'Phase', value: PHASE_WORDS[phase] },
          { label: 'Door', value: DOOR_WORDS[door] },
          { label: 'Ghost', value: GHOST_WORDS[ghost] },
        ])
      }),
      { numRuns: 300 },
    )
    // Every Door and Ghost state, including both presentation words, was labelled.
    expect(doorsSeen.size).toBe(PRESENTATION_DOOR_STATES.length)
    expect(ghostsSeen.size).toBe(PRESENTATION_GHOST_STATES.length)
  })

  it('covers every room, phase and state combination with the registry names', () => {
    for (const door of PRESENTATION_DOOR_STATES) {
      for (const ghost of PRESENTATION_GHOST_STATES) {
        expect(roomAccessibleName({ roomId: 'study', name: 'Study', phase: 'requirements', door, ghost })).toBe(
          `Study. Phase: requirements. Door: ${DOOR_WORDS[door]}. Ghost: ${GHOST_WORDS[ghost]}.`,
        )
      }
    }
    expect(roomAccessibleName({ roomId: 'foyer', name: 'Foyer', phase: 'navigation', door: 'not_applicable', ghost: 'not_applicable' })).toBe(
      'Foyer. Phase: navigation. Door: not applicable. Ghost: not applicable.',
    )
    expect(roomAccessibleName({ roomId: 'workshop', name: 'Workshop', phase: 'tasks-and-implementation', door: 'sealed', ghost: 'failed' })).toBe(
      'Workshop. Phase: tasks and implementation. Door: sealed. Ghost: failed.',
    )
  })

  it('bounds a long name and falls back to the registry name for an empty one', () => {
    const long = roomAccessibleName({ roomId: 'attic', name: 'x'.repeat(500), phase: 'replay', door: 'not_applicable', ghost: 'not_applicable' })
    expect(long.startsWith(`${'x'.repeat(MAX_NAME_CODE_POINTS - 1)}…. Phase: replay.`)).toBe(true)
    expect(roomAccessibleName({ roomId: 'attic', name: ' \n ', phase: 'replay', door: 'not_applicable', ghost: 'not_applicable' })).toBe(
      'Attic. Phase: replay. Door: not applicable. Ghost: not applicable.',
    )
    // A name that ends in a full stop does not double it.
    expect(roomAccessibleName({ roomId: 'attic', name: 'Attic.', phase: 'replay', door: 'not_applicable', ghost: 'not_applicable' })).toBe(
      'Attic. Phase: replay. Door: not applicable. Ghost: not applicable.',
    )
  })
})
