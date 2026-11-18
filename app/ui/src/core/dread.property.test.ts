// Properties 1 to 5 of dread-and-night: every frightening effect is read from
// the House Projection and tells the truth; stillness always wins.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { FRIGHT_LEVELS, HEARTBEAT_MAX_BPM, HEARTBEAT_MIN_BPM, cobwebStep, dreadEffects, heartbeatBpm, holdAftermath, roomLight, wardenStance, windowGlow } from './dread'
import { EFFECTIVE_MOTIONS } from './motion-policy'
import { houseOfCase, upstreamCaseArb } from '../test/guide-arbitraries'

const RUNS = { numRuns: 200 }
const houseArb = fc.tuple(upstreamCaseArb, fc.constantFrom('live' as const, 'replay' as const)).map(([upstream, mode]) => houseOfCase(upstream, mode))

describe('dread-and-night properties', () => {
  it('Property 1: light tells the truth', () => {
    fc.assert(
      fc.property(houseArb, (house) => {
        for (const room of house.rooms) {
          const waits = room.doors.some((door) => door.state === 'waiting')
          const works = room.ghosts.some((ghost) => ghost.state === 'working')
          expect(roomLight(room)).toBe(waits ? 'leak' : works ? 'candle' : 'moonlit')
          const glow = windowGlow(room, house.needsYou)
          const risky = house.needsYou.some((item) => item.roomId === room.roomId && item.kind === 'risky-decision')
          expect(glow === 'held').toBe(risky)
          if (glow === 'dark') expect(room.ghosts.some((ghost) => ghost.state === 'working' || ghost.state === 'waiting')).toBe(false)
        }
      }),
      RUNS,
    )
  })

  it('Property 2: stillness always wins, and Calm draws no dread', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FRIGHT_LEVELS), fc.constantFrom(...EFFECTIVE_MOTIONS), (level, motion) => {
        expect(dreadEffects(level, 'none').moves).toBe(false)
        const calm = dreadEffects('calm', motion)
        expect([calm.stateLight, calm.fog, calm.dust, calm.rain, calm.moves]).toEqual([false, false, false, false, false])
        expect(dreadEffects(level, motion).night).toBe(true)
      }),
      RUNS,
    )
  })

  it('Property 3: the Warden grows only with what waits', () => {
    fc.assert(
      fc.property(houseArb, (house) => {
        const { stance, heldGhostId } = wardenStance(house)
        expect(stance === 'edge').toBe(house.needsYou.length === 0)
        const risky = house.needsYou.filter((item) => item.kind === 'risky-decision' && item.ghostId !== null)
        expect(stance === 'holding').toBe(risky.length > 0)
        if (stance === 'holding') expect(risky.map((item) => item.ghostId)).toContain(heldGhostId)
        else expect(heldGhostId).toBeNull()
      }),
      RUNS,
    )
  })

  it('Property 4: the heartbeat is bounded and only quickens', () => {
    expect(heartbeatBpm(0)).toBeNull()
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), (waiting) => {
        const bpm = heartbeatBpm(waiting)!
        expect(bpm).toBeGreaterThanOrEqual(HEARTBEAT_MIN_BPM)
        expect(bpm).toBeLessThanOrEqual(HEARTBEAT_MAX_BPM)
        expect(bpm).toBeGreaterThanOrEqual(heartbeatBpm(waiting - 1) ?? 0)
      }),
      RUNS,
    )
  })

  it('Property 5: cobwebs never lie where something happens or waits, and are thickest where nobody has been', () => {
    fc.assert(
      fc.property(houseArb, (house) => {
        for (const room of house.rooms) {
          const step = cobwebStep(room)
          const active = room.doors.some((door) => door.state === 'waiting') || room.ghosts.some((ghost) => ghost.state === 'working' || ghost.state === 'waiting')
          if (active) expect(step).toBe(0)
          if (!active && room.ghosts.length === 0) expect(step).toBe(3)
        }
      }),
      RUNS,
    )
  })

  it('Property 6: a ghost is dragged back or flees only when the very action it was held for was decided', () => {
    fc.assert(
      fc.property(houseArb, houseArb, (before, after) => {
        expect(holdAftermath(null, after)).toBeNull()
        const result = holdAftermath(before, after)
        const held = before.needsYou.filter((item) => item.kind === 'risky-decision').map((item) => item.id.slice(item.id.indexOf(':') + 1))
        if (result === null) {
          expect((after.decided ?? []).some((decided) => held.includes(decided.proposalId))).toBe(false)
        } else {
          expect(held).toContain(result.proposalId)
          expect(after.decided).toContainEqual(result)
        }
      }),
      RUNS,
    )
  })
})
