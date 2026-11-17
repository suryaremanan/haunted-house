// Sound cues (the Sound Feature, Spec 6 Requirement 9): which short sounds a
// change of the house calls for. Sound only repeats what the house already
// shows and says; nothing is ever told by sound alone.
//
// Pure: it compares two House Projections. Playing belongs to the adapter.
// No React, DOM, audio, SDK, or clock.
import type { HouseProjection } from './house-projection'

export const SOUND_CUES = [
  'door-open',
  'door-knock',
  'door-seal',
  'door-slam',
  'ghost-wake',
  'ghost-done',
  'ghost-fail',
  'needs-you',
  'panel-open',
  'panel-close',
] as const
export type SoundCue = (typeof SOUND_CUES)[number]

/** At most this many cues answer one change, so a replay jump cannot become a wall of noise. */
export const MAX_CUES_PER_CHANGE = 3

const DOOR_CUE: Readonly<Record<string, SoundCue | undefined>> = {
  open: 'door-open',
  waiting: 'door-knock',
  rejected: 'door-slam',
  sealed: 'door-seal',
}

const GHOST_CUE: Readonly<Record<string, SoundCue | undefined>> = {
  working: 'ghost-wake',
  done: 'ghost-done',
  failed: 'ghost-fail',
}

/**
 * The cues for going from one projection to the next, most telling first:
 * Doors, then ghosts, then one bell when more now needs the Operator. A first
 * projection, or one of another Mansion, is silent: nothing changed in front
 * of the Operator. Each cue appears once.
 */
export function soundCuesBetween(previous: HouseProjection | null, next: HouseProjection): readonly SoundCue[] {
  if (previous === null || previous.mansionName !== next.mansionName) return []
  const cues: SoundCue[] = []
  const add = (cue: SoundCue | undefined) => {
    if (cue !== undefined && !cues.includes(cue)) cues.push(cue)
  }
  const before = new Map(previous.rooms.map((room) => [room.roomId, room]))
  for (const room of next.rooms) {
    const old = before.get(room.roomId)
    if (old === undefined) continue
    for (const door of room.doors) {
      const was = old.doors.find((item) => item.phase === door.phase)
      // A Door seen for the first time is not a change of that Door.
      if (was !== undefined && was.state !== door.state) add(DOOR_CUE[door.state])
    }
  }
  for (const room of next.rooms) {
    const old = before.get(room.roomId)
    if (old === undefined) continue
    for (const ghost of room.ghosts) {
      const was = old.ghosts.find((item) => item.ghostId === ghost.ghostId)
      // A ghost that has just appeared at work has woken up.
      if (was === undefined ? ghost.state === 'working' : was.state !== ghost.state) add(GHOST_CUE[ghost.state])
    }
  }
  if (next.needsYou.length > previous.needsYou.length) add('needs-you')
  return cues.slice(0, MAX_CUES_PER_CHANGE)
}
