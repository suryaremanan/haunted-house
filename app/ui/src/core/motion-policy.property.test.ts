import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EFFECTIVE_MOTIONS, motionState, reducedMotionFrom, resolveMotionPolicy, type MotionInputs } from './motion-policy'

/** Independent reference: the truth table written out, not computed. */
const TRUTH_TABLE: ReadonlyArray<readonly [boolean, boolean, 'none' | 'low-frequency']> = [
  [false, false, 'low-frequency'],
  [false, true, 'none'],
  [true, false, 'none'],
  [true, true, 'none'],
]

function expected(inputs: MotionInputs): 'none' | 'low-frequency' {
  return TRUTH_TABLE.find(([still, reduced]) => still === inputs.stillHouse && reduced === inputs.prefersReducedMotion)![2]
}

describe('motion policy', () => {
  // Feature: house-ui-and-accessibility, Property 5: Either motion preference suppresses optional motion
  // Validates: Requirements 7.2, 7.3, 7.5
  it('Property 5: either motion preference suppresses optional motion', () => {
    const covered = new Set<string>()
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.integer({ min: 1, max: 5 }), (stillHouse, prefersReducedMotion, repeats) => {
        const inputs: MotionInputs = { stillHouse, prefersReducedMotion }
        covered.add(`${stillHouse}:${prefersReducedMotion}`)
        const result = resolveMotionPolicy(inputs)
        // No other value is possible.
        expect(EFFECTIVE_MOTIONS).toContain(result)
        expect(result).toBe(expected(inputs))
        // Either suppression signal alone is enough; motion needs both off.
        if (stillHouse || prefersReducedMotion) expect(result).toBe('none')
        expect(result === 'low-frequency').toBe(!stillHouse && !prefersReducedMotion)
        // Deterministic: repeated calls and fresh input objects agree, and the input is not changed.
        for (let call = 0; call < repeats; call += 1) {
          expect(resolveMotionPolicy({ stillHouse, prefersReducedMotion })).toBe(result)
        }
        expect(inputs).toEqual({ stillHouse, prefersReducedMotion })
        expect(motionState(inputs)).toEqual({ stillHouse, prefersReducedMotion, effective: result })
      }),
      { numRuns: 200 },
    )
    // The complete truth table was exercised.
    expect(covered.size).toBe(4)
  })

  it('covers the four combinations exactly', () => {
    for (const [stillHouse, prefersReducedMotion, effective] of TRUTH_TABLE) {
      expect(resolveMotionPolicy({ stillHouse, prefersReducedMotion })).toBe(effective)
    }
  })

  it('treats an unreadable media query as a request for stillness', () => {
    expect(reducedMotionFrom(null)).toBe(true)
    expect(reducedMotionFrom(undefined)).toBe(true)
    expect(reducedMotionFrom(true)).toBe(true)
    expect(reducedMotionFrom(false)).toBe(false)
    expect(resolveMotionPolicy({ stillHouse: false, prefersReducedMotion: reducedMotionFrom(null) })).toBe('none')
  })

  it('fails closed on a value that is not a boolean', () => {
    const odd = { stillHouse: undefined, prefersReducedMotion: false } as unknown as MotionInputs
    expect(resolveMotionPolicy(odd)).toBe('none')
  })
})
