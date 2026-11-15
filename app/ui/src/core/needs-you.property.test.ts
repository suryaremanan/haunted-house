import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  needsYouCountText,
  needsYouKey,
  needsYouTarget,
  selectNeedsYouItems,
  type GhostPresentation,
  type RecoveryActionView,
  type RoomPresentation,
  type WaitingItemView,
} from './house-projection'
import type { RoomId, RoomPhase } from './house-registry'
import { deepFreeze } from '../test/seance-arbitraries'

// Independent reference: Room order as a table, and the selection as a plain loop.
const ORDER: Readonly<Record<RoomId, number>> = { foyer: 0, study: 1, 'drafting-room': 2, workshop: 3, attic: 4, 'seance-room': 5 }
const PHASE: Readonly<Record<RoomId, RoomPhase>> = {
  foyer: 'navigation',
  study: 'requirements',
  'drafting-room': 'design',
  workshop: 'tasks-and-implementation',
  attic: 'replay',
  'seance-room': 'review',
}
const ROOM_IDS = Object.keys(ORDER) as RoomId[]

interface ReferenceItem {
  readonly key: string
  readonly kind: string
  readonly id: string
  readonly roomId: RoomId
}

function reference(rooms: readonly RoomPresentation[]): ReferenceItem[] {
  const sorted = rooms.map((room, index) => ({ room, index })).sort((a, b) => ORDER[a.room.roomId] - ORDER[b.room.roomId] || a.index - b.index)
  const out: ReferenceItem[] = []
  const taken = new Set<string>()
  const take = (kind: string, id: string, roomId: RoomId) => {
    const key = `${kind}\u0000${id}`
    if (taken.has(key)) return
    taken.add(key)
    out.push({ key, kind, id, roomId })
  }
  for (const { room } of sorted) {
    for (const item of room.waitingItems) if (item.status === 'pending' && item.actionAvailable) take(item.kind, item.id, room.roomId)
    for (const item of room.recoveryActions) if (item.available) take('failed-run-recovery', item.runId, room.roomId)
  }
  return out
}

// A small pool of ids, so the same proposal shows up twice, in two rooms, and under two kinds.
const idArb = fc.constantFrom('p1', 'p2', 'p3', 'p4', 'p5')
const waitingArb: fc.Arbitrary<WaitingItemView> = fc.record({
  kind: fc.constantFrom<WaitingItemView['kind']>('door-decision', 'tool-decision', 'risky-decision'),
  id: idArb,
  ghostId: fc.constantFrom<string | null>(null, 'archivist', 'tinker-1'),
  label: fc.constantFrom('The requirements door needs your decision.', 'Tinker 1 asks to run a command.'),
  status: fc.constantFrom<WaitingItemView['status']>('pending', 'pending', 'resolved'),
  actionAvailable: fc.constantFrom(true, true, true, false),
})
const recoveryArb: fc.Arbitrary<RecoveryActionView> = fc.record({
  runId: fc.constantFrom('run-1', 'run-2', 'run-3', 'p1'),
  ghostId: fc.constantFrom('archivist', 'tinker-1', 'tinker-2'),
  label: fc.constant('Tinker 1 failed. A fresh attempt can be started.'),
  // A failed run nobody can retry is state, not an action.
  available: fc.boolean(),
})
/** Ambient state: ghosts in any state, including blocked and failed with no action attached. */
const ghostArb: fc.Arbitrary<GhostPresentation> = fc.record({
  ghostId: fc.constantFrom('archivist', 'tinker-1', 'tinker-2', 'foreman'),
  name: fc.constant('A ghost'),
  state: fc.constantFrom<GhostPresentation['state']>('idle', 'working', 'waiting', 'blocked', 'failed', 'done'),
  reason: fc.constantFrom<string | null>(null, 'The run stalled.'),
  pendingText: fc.constantFrom<string | null>(null, '1 approval pending'),
})

const roomArb: fc.Arbitrary<RoomPresentation> = fc
  .tuple(
    fc.constantFrom(...ROOM_IDS),
    fc.array(waitingArb, { maxLength: 5 }),
    fc.array(recoveryArb, { maxLength: 3 }),
    fc.array(ghostArb, { maxLength: 3 }),
    fc.constantFrom<RoomPresentation['integrity']>('valid', 'valid', 'uncertain', 'corrupt', 'incompatible'),
    fc.boolean(),
  )
  .map(
    ([roomId, waitingItems, recoveryActions, ghosts, integrity, enabled]): RoomPresentation => ({
      roomId,
      name: roomId,
      phase: PHASE[roomId],
      door: 'sealed',
      ghost: ghosts[0]?.state ?? 'not_applicable',
      doors: [],
      ghosts,
      integrity,
      mutatingActionsEnabled: integrity === 'valid' && enabled,
      readOnly: false,
      locked: false,
      diagnostic: integrity === 'valid' ? null : 'Controls are off.',
      waitingItems,
      recoveryActions,
    }),
  )

/** Any finite collection, in any order, possibly naming a room twice. */
const roomsArb = fc.array(roomArb, { maxLength: 8 })

describe('Needs You selection', () => {
  // Feature: house-ui-and-accessibility, Property 4: Needs You selection is exact, unique, and ordered
  // Validates: Requirements 3.7, 3.8, 8.7, 8.8, 8.9, 8.10
  it('Property 4: Needs You selection is exact, unique, and ordered', () => {
    fc.assert(
      fc.property(roomsArb, fc.nat(), (rooms, pick) => {
        deepFreeze(rooms)
        const items = selectNeedsYouItems(rooms)
        const expected = reference(rooms)

        // Exact and ordered: Room order, then the order upstream gave.
        expect(items.map((item) => [item.kind, item.id, item.roomId])).toEqual(expected.map((item) => [item.kind, item.id, item.roomId]))
        for (let index = 1; index < items.length; index += 1) {
          expect(ORDER[items[index].roomId]).toBeGreaterThanOrEqual(ORDER[items[index - 1].roomId])
        }

        // Unique by (kind, authoritative id); every item is an available action.
        expect(new Set(items.map(needsYouKey)).size).toBe(items.length)
        for (const item of items) expect(item.actionAvailable).toBe(true)

        // Nothing ambient: every item traces back to a pending decision or an offered recovery.
        for (const item of items) {
          const room = rooms.filter((candidate) => candidate.roomId === item.roomId)
          const fromDecision = room.some((candidate) =>
            candidate.waitingItems.some((waiting) => waiting.kind === item.kind && waiting.id === item.id && waiting.status === 'pending' && waiting.actionAvailable),
          )
          const fromRecovery =
            item.kind === 'failed-run-recovery' &&
            room.some((candidate) => candidate.recoveryActions.some((recovery) => recovery.runId === item.id && recovery.available))
          expect(fromDecision || fromRecovery).toBe(true)
        }
        // Ghost state alone (blocked, failed, waiting) adds nothing.
        const withoutActions = rooms.map((room) => ({ ...room, waitingItems: [], recoveryActions: [] }))
        expect(selectNeedsYouItems(withoutActions)).toEqual([])

        // The count is the length; the shortcut opens the first item's room, or nothing.
        expect(needsYouCountText(items)).toBe(items.length === 0 ? 'Nothing needs you' : items.length === 1 ? '1 thing needs you' : `${items.length} things need you`)
        expect(needsYouTarget(items)).toBe(items.length === 0 ? null : expected[0].roomId)

        // Resolving one action removes exactly that item and keeps the rest in order.
        if (items.length > 0) {
          const gone = items[pick % items.length]
          const resolved = rooms.map((room) => ({
            ...room,
            waitingItems: room.waitingItems.map((waiting) =>
              waiting.kind === gone.kind && waiting.id === gone.id ? { ...waiting, status: 'resolved' as const } : waiting,
            ),
            recoveryActions: room.recoveryActions.filter((recovery) => !(gone.kind === 'failed-run-recovery' && recovery.runId === gone.id)),
          }))
          const after = selectNeedsYouItems(resolved)
          expect(after.map(needsYouKey)).toEqual(items.filter((item) => item !== gone).map(needsYouKey))
          expect(after.length).toBe(items.length - 1)
        }

        // The order rooms arrive in does not matter when each room appears once.
        const once = rooms.filter((room, index) => rooms.findIndex((other) => other.roomId === room.roomId) === index)
        expect(selectNeedsYouItems([...once].reverse())).toEqual(selectNeedsYouItems(once))
      }),
      { numRuns: 300 },
    )
  })

  it('counts a decision once when two rooms report it and keeps the first room in Room order', () => {
    const waiting: WaitingItemView = { kind: 'risky-decision', id: 'risky:1', ghostId: 'tinker-1', label: 'Tinker 1 asks to run a command.', status: 'pending', actionAvailable: true }
    const room = (roomId: RoomId, overrides: Partial<RoomPresentation>): RoomPresentation => ({
      roomId,
      name: roomId,
      phase: PHASE[roomId],
      door: 'sealed',
      ghost: 'not_applicable',
      doors: [],
      ghosts: [],
      integrity: 'valid',
      mutatingActionsEnabled: true,
      readOnly: false,
      locked: false,
      diagnostic: null,
      waitingItems: [],
      recoveryActions: [],
      ...overrides,
    })
    const items = selectNeedsYouItems([room('workshop', { waitingItems: [waiting] }), room('study', { waitingItems: [waiting] })])
    expect(items).toEqual([{ id: 'risky:1', kind: 'risky-decision', roomId: 'study', ghostId: 'tinker-1', label: waiting.label, actionAvailable: true }])
    expect(needsYouTarget(items)).toBe('study')
    expect(needsYouTarget([])).toBeNull()
  })
})
