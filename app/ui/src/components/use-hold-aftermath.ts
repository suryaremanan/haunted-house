// What happened to the ghost the Warden was holding (dread-and-night 3.4), as
// a moment the stage plays once: refused, he drags it back to its room;
// released, the chain drops and it flees. The decision itself comes from the
// projection (core/dread.ts, holdAftermath); this hook only remembers the
// house it saw last and clears the moment when it has played. With motion off
// nothing is played: the ghost is simply where it now is.
import { useEffect, useRef, useState } from 'react'
import { heldProposals, newlyDecided } from '../core/dread'
import type { DecidedHold, HouseProjection } from '../core/house-projection'

/** How long the moment stays on the stage, in milliseconds: the longest of its two animations. */
export const AFTERMATH_MS = 2_400

export function useHoldAftermath(projection: HouseProjection, moves: boolean): DecidedHold | null {
  // Every action this stage has seen held, and every one already played: a house that passes through a loading
  // moment between "held" and "decided" still plays the moment once.
  const seenHeld = useRef(new Set<string>())
  const played = useRef(new Set<string>())
  const [moment, setMoment] = useState<DecidedHold | null>(null)
  useEffect(() => {
    const happened = newlyDecided(seenHeld.current, played.current, projection)
    for (const id of heldProposals(projection)) seenHeld.current.add(id)
    if (happened === null) return
    played.current.add(happened.proposalId)
    if (moves) setMoment(happened)
  }, [projection, moves])
  // The moment clears itself once played, whatever the house does meanwhile.
  useEffect(() => {
    if (moment === null) return
    const timer = setTimeout(() => setMoment(null), AFTERMATH_MS)
    return () => clearTimeout(timer)
  }, [moment])
  return moment
}
