// Feature: warden-guide-and-first-visit, Property 4: Live and replay say the same thing
//
// For all upstream house inputs, building the House Projection in live mode and
// in replay mode and reading both with the same context gives the same status
// line, the same pose and the same pose label; and the replay options are the
// live options with every `start`, `decide` and `ask` option removed and the
// playback options added.
//
// **Validates: Requirements 3.10, 14.1, 14.2**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { guideCaseArb, surfacesOf } from '../test/guide-arbitraries'
import { deepFreeze } from '../test/seance-arbitraries'
import { MUTATING_OPTION_KINDS, guideView, type GuideContext, type GuideOption, type GuideView } from './house-guide'
import type { HouseProjection } from './house-projection'

const RUNS = 300
// Each run reads every room of the house with every surface on top, live and as a recording; the whole suite may run beside it.
const TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Independent reference, written here from the design: what a recording leaves
// out of the live options and what it adds to them.

/** The kinds of option that change the Mansion. A recording offers none of them. */
const CHANGES_THE_HOUSE: readonly string[] = ['start', 'decide', 'ask']
/** The two options of the replay bar. Only a recording has them. */
const PLAYBACK_IDS: readonly string[] = ['replay-toggle', 'replay-restart']

const changesTheHouse = (option: GuideOption): boolean => CHANGES_THE_HOUSE.includes(option.kind)
const isPlayback = (option: GuideOption): boolean => PLAYBACK_IDS.includes(option.id)

/** The generated context, then its settings in every room with every surface that can be on top there. */
function contextsOf(house: HouseProjection, context: GuideContext): GuideContext[] {
  const contexts: GuideContext[] = [context]
  for (const room of house.rooms) {
    for (const surface of surfacesOf(house, room.roomId)) contexts.push({ ...context, roomId: room.roomId, surface })
  }
  return contexts
}

function viewOf(house: HouseProjection, context: GuideContext): GuideView {
  const view = guideView(house, context)
  if (view === null) throw new Error(`no guide view for the visible room ${context.roomId} of the ${house.mode} house`)
  return view
}

describe('the Warden in a live house and in its recording', () => {
  // Feature: warden-guide-and-first-visit, Property 4: Live and replay say the same thing
  it(
    'Property 4: Live and replay say the same thing',
    () => {
      const kindsLeftOut = new Set<string>()
      let unchanged = 0

      // The kinds the design names are the kinds the module treats as changing the house.
      expect([...MUTATING_OPTION_KINDS].sort()).toEqual([...CHANGES_THE_HOUSE].sort())

      fc.assert(
        fc.property(guideCaseArb, ({ live, replay, context }) => {
          deepFreeze(live)
          deepFreeze(replay)
          // The same facts, once live and once as a recording of them.
          expect(live.mode).toBe('live')
          expect(replay.mode).toBe('replay')
          expect(replay.rooms.map((room) => room.roomId)).toEqual(live.rooms.map((room) => room.roomId))

          for (const here of contextsOf(live, context)) {
            deepFreeze(here)
            const where = `${here.roomId}, ${here.surface === null ? 'no surface' : `${here.surface.kind} surface`}`
            const inLive = viewOf(live, here)
            const inReplay = viewOf(replay, here)

            // The same words, the same pose and its label, the same neighbours.
            expect(inReplay.status, where).toBe(inLive.status)
            expect(inReplay.statusKind, where).toBe(inLive.statusKind)
            expect(inReplay.terms, where).toEqual(inLive.terms)
            expect(inReplay.question, where).toBe(inLive.question)
            expect(inReplay.pose, where).toBe(inLive.pose)
            expect(inReplay.poseLabel, where).toBe(inLive.poseLabel)
            expect(inReplay.previous, where).toEqual(inLive.previous)
            expect(inReplay.next, where).toEqual(inLive.next)

            // The recording's options are the live ones without what changes the house, in the same order,
            // with the same labels, consequences, kinds and steps.
            const liveKept = inLive.everything.filter((option) => !changesTheHouse(option))
            const replayKept = inReplay.everything.filter((option) => !isPlayback(option))
            expect(replayKept.map((option) => option.id), where).toEqual(liveKept.map((option) => option.id))
            expect(replayKept, where).toEqual(liveKept)

            // The recording adds both playback options, once each, and offers nothing that changes the house.
            expect(inReplay.everything.filter(isPlayback).map((option) => option.id).sort(), where).toEqual([...PLAYBACK_IDS].sort())
            expect(inReplay.everything.filter(changesTheHouse), where).toEqual([])
            // The live house has no playback option of the replay bar.
            expect(inLive.everything.filter(isPlayback), where).toEqual([])

            const leftOut = inLive.everything.filter(changesTheHouse)
            for (const option of leftOut) kindsLeftOut.add(option.kind)
            if (leftOut.length === 0) unchanged += 1
          }
        }),
        { numRuns: RUNS },
      )

      // Live rooms offered every kind of change for the recording to leave out, and some offered none; the comparison is not vacuous.
      expect([...kindsLeftOut].sort()).toEqual([...CHANGES_THE_HOUSE].sort())
      expect(unchanged).toBeGreaterThan(0)
    },
    TIMEOUT_MS,
  )
})
