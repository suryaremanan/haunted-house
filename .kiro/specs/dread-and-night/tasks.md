# Implementation Plan: Dread and Night

## Overview

Make the house frightening by dread and scale, with every effect read from the House_Projection. Start with the pure `core/dread.ts` and its five property tests, then the night palette, then state light, the Warden's stance, the ghosts, the doors and atmosphere, the séance board, the Fright control and the sounds. Finish with the rendered check in a real browser and the steering update.

Nothing here adds a request, a route, a permission, a storage use or a dependency.

## Tasks

- [x] 1. Write the pure core (MVP)
  - [x] 1.1 Implement `core/dread.ts`
    - `FRIGHT_LEVELS`, `DEFAULT_FRIGHT`, `roomLight`, `windowGlow`, `wardenStance`, `cobwebStep`, `dreadEffects`, `heartbeatBpm`, as in the design. Pure.
    - _Writes: `app/ui/src/core/dread.ts`_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.2, 6.2, 7.3_
  - [x]* 1.2 Property tests for Properties 1 to 5
    - _Writes: `app/ui/src/core/dread.property.test.ts`_
    - _Requirements: 8.2_

- [x] 2. Night is the page (MVP)
  - [x] 2.1 Night palette for the page, heading, replay bar and Gate, in both colour schemes; contrast checked against the palette test
    - _Writes: `app/ui/replay/index.html`, `app/ui/src/components/house-palette.ts`, `app/ui/src/components/house-styles.ts`, `app/ui/src/rooms/attic/attic-styles.ts`, `app/ui/src/rooms/foyer/first-visit-styles.ts`_
    - _Requirements: 1.1, 1.3_

- [x] 3. Light is the status display (MVP)
  - [x] 3.1 Room light layer (`data-light`) over each painting: moonlit wash, candle pool, door leak
  - [x] 3.2 Map windows carry `data-glow` and a text title
    - _Writes: `app/ui/src/components/RoomStage.tsx`, `app/ui/src/components/room-paint.tsx`, `app/ui/src/components/HouseMap.tsx`, `app/ui/src/components/house-stage-styles.ts`_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. The Warden grows with what he holds (MVP)
  - [x] 4.1 `data-stance` on the keeper; scale, eye brightness and floor shadow by stance; the held ghost on the chain. After a refusal or a release the ghost is shown where it now is (back in its room, or gone from the chain); the drag and the flight are not animated
  - [x] 4.2 Colder, literal held lines in `core/house-guide.ts`, same in live and replay
    - _Writes: `app/ui/src/components/RoomStage.tsx`, `app/ui/src/components/room-paint.tsx`, `app/ui/src/core/house-guide.ts`_
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. Ghosts, doors and the house (MVP)
  - [x] 5.1 Hollow-eyed, torn-hem ghosts with one silhouette per state
  - [x] 5.2 Chain and wax seal on sealed doors, broken on open doors
  - [x] 5.3 Cobwebs by neglect; fog, dust and rain by Fright level, under every control
  - [x] 5.4 Knocker eyes follow the pointer. The door shudder on a knock is cut: a whole-door shudder at the Gate is screen shake, which this feature's limits forbid, and the knocker is gone once the hall opens
    - _Writes: `app/ui/src/components/room-paint.tsx`, `app/ui/src/components/room-paint-styles.ts`, `app/ui/src/components/Atmosphere.tsx`_
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.5, 5.6_

- [x] 6. The séance board (MVP)
  - [x] 6.1 Restyle the replay range as a board with a planchette thumb and event marks; keep the native input, label and value text
    - _Writes: `app/ui/src/rooms/attic/ReplayBar.tsx`, `app/ui/src/rooms/attic/attic-styles.ts`_
    - _Requirements: 5.4_

- [x] 7. Fright and sound (MVP)
  - [x] 7.1 The Fright control (Calm, Eerie, Dread; default Eerie) in the guide settings; `data-fright` on the root
  - [x] 7.2 Wind, drone and heartbeat in `adapters/house-sound.ts`, behind the Sound toggle, rising from silence
    - _Writes: `app/ui/src/components/MansionShell.tsx`, `app/ui/src/components/RoomStage.tsx`, `app/ui/src/adapters/house-sound.ts`, `app/ui/src/components/use-house-sound.ts`_
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4_

- [x] 8. Check it by looking (MVP)
  - [x] 8.1 Render the static replay in headless Comet at the four sizes, three levels, Still House on and off; record `spikes/fixtures/dread-render.json`; fix what is seen
  - [x] 8.2 Update `.kiro/steering/theme-and-accessibility.md`
    - _Writes: `scripts/capture-house.mjs`, `spikes/fixtures/dread-render.json`, `.kiro/steering/theme-and-accessibility.md`_
    - _Requirements: 1.3, 8.1, 8.3_
