// Holds the Sound Feature for one open Mansion (Spec 6 Requirement 9). Sound
// starts off on every visit and is never remembered. The engine is created
// only inside the press that turns it on, and closed when it is turned off or
// the Mansion closes. While it is on, a change of the house or of the open
// surface plays its cue; while it is off, nothing audio exists at all.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createHouseSound, type HouseSound } from '../adapters/house-sound'
import type { HouseProjection } from '../core/house-projection'
import { heartbeatBpm, type FrightLevel } from '../core/dread'
import { soundCuesBetween, type SoundCue } from '../core/sound-cues'

export interface HouseSoundState {
  readonly on: boolean
  /** False when the browser cannot make sound; the control then says so. */
  readonly available: boolean
  readonly toggle: () => void
}

/** Cues of one change are spread out so each can be heard. */
export const CUE_GAP_MS = 420

export function useHouseSound(
  projection: HouseProjection,
  openKey: string | null,
  create: () => HouseSound | null = createHouseSound,
  fright: FrightLevel = 'calm',
): HouseSoundState {
  const [on, setOn] = useState(false)
  const [available, setAvailable] = useState(true)
  const engine = useRef<HouseSound | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const stop = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
    engine.current?.close()
    engine.current = null
  }, [])
  useEffect(() => stop, [stop])

  const playAll = useCallback((cues: readonly SoundCue[]) => {
    cues.forEach((cue, index) => {
      if (index === 0) engine.current?.play(cue)
      else timers.current.push(setTimeout(() => engine.current?.play(cue), index * CUE_GAP_MS))
    })
  }, [])

  const toggle = useCallback(() => {
    if (engine.current !== null) {
      stop()
      setOn(false)
      return
    }
    const made = create()
    if (made === null) {
      setAvailable(false)
      return
    }
    engine.current = made
    setOn(true)
    // The Operator hears at once what was turned on.
    made.play('panel-open')
  }, [create, stop])

  const previous = useRef<HouseProjection | null>(null)
  useEffect(() => {
    const before = previous.current
    previous.current = projection
    if (engine.current !== null) playAll(soundCuesBetween(before, projection))
  }, [projection, playAll])

  const openBefore = useRef(openKey)
  useEffect(() => {
    const before = openBefore.current
    openBefore.current = openKey
    if (engine.current === null || before === openKey) return
    playAll([openKey === null ? 'panel-close' : 'panel-open'])
  }, [openKey, playAll])

  // Dread: the drone while the house is not Calm; the heartbeat while something waits on the Visitor.
  const waiting = projection.needsYou.length
  useEffect(() => {
    engine.current?.setDread?.({ drone: fright !== 'calm', heartbeatBpm: fright === 'calm' ? null : heartbeatBpm(waiting) })
  }, [on, fright, waiting])

  return { on, available, toggle }
}
