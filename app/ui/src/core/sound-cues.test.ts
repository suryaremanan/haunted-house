// Sound cues are a pure function of two House Projections (the Sound Feature).
import { describe, expect, it } from 'vitest'
import type { HouseProjection, RoomPresentation } from './house-projection'
import { quietHouse, waitingHouse } from '../test/shell-kit'
import { MAX_CUES_PER_CHANGE, SOUND_CUES, soundCuesBetween } from './sound-cues'

type Change = (room: RoomPresentation) => RoomPresentation

function change(house: HouseProjection, roomId: string, edit: Change): HouseProjection {
  return { ...house, rooms: house.rooms.map((room) => (room.roomId === roomId ? edit(room) : room)) }
}

const door = (state: string): Change => (room) => ({ ...room, doors: room.doors.map((item, index) => (index === 0 ? ({ ...item, state } as typeof item) : item)) })
const ghosts = (state: string): Change => (room) => ({ ...room, ghosts: room.ghosts.map((item) => ({ ...item, state }) as typeof item) })

describe('soundCuesBetween', () => {
  const house = waitingHouse()
  const withDoor = house.rooms.find((room) => room.doors.length > 0)!
  const withGhost = house.rooms.find((room) => room.ghosts.length > 0)!

  it('is silent for a first projection, an unchanged one, and another Mansion', () => {
    expect(soundCuesBetween(null, house)).toEqual([])
    expect(soundCuesBetween(house, house)).toEqual([])
    expect(soundCuesBetween({ ...house, mansionName: 'elsewhere' }, change(house, withDoor.roomId, door('open')))).toEqual([])
  })

  it('names the cue of each Door state a Door moves into', () => {
    const cases = { open: 'door-open', waiting: 'door-knock', rejected: 'door-slam', sealed: 'door-seal' } as const
    for (const [state, cue] of Object.entries(cases)) {
      const other = state === 'open' ? 'sealed' : 'open'
      expect(soundCuesBetween(change(house, withDoor.roomId, door(other)), change(house, withDoor.roomId, door(state)))).toEqual([cue])
    }
  })

  it('names the cue of a ghost that starts work, finishes or fails, and none for one that rests', () => {
    const from = change(house, withGhost.roomId, ghosts('idle'))
    expect(soundCuesBetween(from, change(house, withGhost.roomId, ghosts('working')))).toEqual(['ghost-wake'])
    expect(soundCuesBetween(from, change(house, withGhost.roomId, ghosts('done')))).toEqual(['ghost-done'])
    expect(soundCuesBetween(from, change(house, withGhost.roomId, ghosts('failed')))).toEqual(['ghost-fail'])
    expect(soundCuesBetween(change(house, withGhost.roomId, ghosts('working')), from)).toEqual([])
  })

  it('rings once when more needs the Operator, and never when less does', () => {
    const quiet = { ...quietHouse(), mansionName: house.mansionName, rooms: house.rooms }
    expect(soundCuesBetween(quiet, house)).toEqual(['needs-you'])
    expect(soundCuesBetween(house, quiet)).toEqual([])
  })

  it('answers one change with at most three distinct cues, Doors first', () => {
    let next = house
    for (const room of house.rooms) next = change(change(next, room.roomId, door('open')), room.roomId, ghosts('failed'))
    let before = house
    for (const room of house.rooms) before = change(change(before, room.roomId, door('sealed')), room.roomId, ghosts('idle'))
    const cues = soundCuesBetween(before, next)
    expect(cues.length).toBeLessThanOrEqual(MAX_CUES_PER_CHANGE)
    expect(new Set(cues).size).toBe(cues.length)
    expect(cues[0]).toBe('door-open')
    for (const cue of cues) expect(SOUND_CUES).toContain(cue)
  })
})
