// Dread and night (Spec 9, dread-and-night): what the house draws, read from
// the House Projection, so that every frightening thing tells the Visitor
// something true. Light is status: a room is moonlit when nothing happens in
// it, a candle burns where a ghost works, light leaks under a door that waits.
// The Warden grows with what he holds. Cobwebs lie where nobody has been.
//
// Pure: no React, DOM, SDK, network, storage, timer or clock.
import type { HouseProjection, NeedsYouItem, RoomPresentation } from './house-projection'
import type { EffectiveMotion } from './motion-policy'

export const FRIGHT_LEVELS = ['calm', 'eerie', 'dread'] as const
export type FrightLevel = (typeof FRIGHT_LEVELS)[number]
export const DEFAULT_FRIGHT: FrightLevel = 'eerie'
export const FRIGHT_TEXT: Readonly<Record<FrightLevel, string>> = { calm: 'Calm', eerie: 'Eerie', dread: 'Dread' }

/** The level after `level`, wrapping: Calm, Eerie, Dread, Calm. */
export function nextFright(level: FrightLevel): FrightLevel {
  return FRIGHT_LEVELS[(FRIGHT_LEVELS.indexOf(level) + 1) % FRIGHT_LEVELS.length]
}

export type RoomLight = 'moonlit' | 'candle' | 'leak'

/** `leak` when a Door of the room waits, else `candle` when a ghost works there, else `moonlit`. */
export function roomLight(room: RoomPresentation): RoomLight {
  if (room.doors.some((door) => door.state === 'waiting')) return 'leak'
  if (room.ghosts.some((ghost) => ghost.state === 'working')) return 'candle'
  return 'moonlit'
}

export const ROOM_LIGHT_TEXT: Readonly<Record<RoomLight, string>> = {
  moonlit: 'Dark: nothing is happening here.',
  candle: 'Candlelit: a ghost is working here.',
  leak: 'Light under the door: a door here waits for you.',
}

export type WindowGlow = 'dark' | 'lit' | 'held'

/** `held` when this room holds a risky action for the Visitor, `lit` when a ghost there works or waits, else `dark`. */
export function windowGlow(room: RoomPresentation, needsYou: readonly NeedsYouItem[]): WindowGlow {
  if (needsYou.some((item) => item.roomId === room.roomId && item.kind === 'risky-decision')) return 'held'
  if (room.ghosts.some((ghost) => ghost.state === 'working' || ghost.state === 'waiting')) return 'lit'
  return 'dark'
}

export const WINDOW_GLOW_TEXT: Readonly<Record<WindowGlow, string>> = {
  dark: 'Window dark: idle.',
  lit: 'Window lit: work is happening.',
  held: 'Window glowing red: something is held for you.',
}

export interface WardenStance {
  readonly stance: 'edge' | 'forward' | 'holding'
  /** The ghost on his chain while a risky action waits. */
  readonly heldGhostId: string | null
}

/** Small at the edge when nothing waits; forward when something does; holding a ghost while a risky action waits. */
export function wardenStance(projection: HouseProjection): WardenStance {
  const held = projection.needsYou.find((item) => item.kind === 'risky-decision' && item.ghostId !== null)
  if (held !== undefined) return { stance: 'holding', heldGhostId: held.ghostId }
  if (projection.needsYou.length > 0) return { stance: 'forward', heldGhostId: null }
  return { stance: 'edge', heldGhostId: null }
}

/**
 * How thick the cobwebs are: 0 where something is happening or waits, 2 where
 * ghosts have been but all are idle, 3 where no ghost has ever been, 1 where
 * the work is over (done, blocked or failed and nothing waits).
 */
export function cobwebStep(room: RoomPresentation): 0 | 1 | 2 | 3 {
  if (room.doors.some((door) => door.state === 'waiting')) return 0
  if (room.ghosts.some((ghost) => ghost.state === 'working' || ghost.state === 'waiting')) return 0
  if (room.ghosts.length === 0) return 3
  if (room.ghosts.every((ghost) => ghost.state === 'idle')) return 2
  return 1
}

export interface DreadEffects {
  /** The night palette. On at every level. */
  readonly night: boolean
  /** Moonlight, candle pools and door leaks. */
  readonly stateLight: boolean
  readonly fog: boolean
  readonly dust: boolean
  readonly rain: boolean
  /** Whether any optional effect may move. */
  readonly moves: boolean
}

/** Calm is the old house under a night sky; Eerie adds state light, fog and dust; Dread adds rain. Stillness always wins. */
export function dreadEffects(level: FrightLevel, motion: EffectiveMotion): DreadEffects {
  const eerie = level !== 'calm'
  return {
    night: true,
    stateLight: eerie,
    fog: eerie,
    dust: eerie,
    rain: level === 'dread',
    moves: eerie && motion === 'low-frequency',
  }
}

export const HEARTBEAT_MIN_BPM = 48
export const HEARTBEAT_MAX_BPM = 90

/** No heartbeat when nothing waits; a slow one that quickens with each thing waiting, never above 90 a minute. */
export function heartbeatBpm(waiting: number): number | null {
  if (!Number.isFinite(waiting) || waiting < 1) return null
  return Math.min(HEARTBEAT_MAX_BPM, HEARTBEAT_MIN_BPM + 12 * (Math.floor(waiting) - 1))
}
