# Design Document: Dread and Night

## Overview

One pure module, `app/ui/src/core/dread.ts`, reads the House_Projection (and the Motion_Policy and the Fright_Level) and returns what to draw: each Room's light, each map window's glow, the Warden's stance, each Room's cobweb step, and the Dread_Effects. Components draw those values with SVG and CSS. No component decides a state from anything else, so live and replay draw the same thing for the same log.

The look changes in three layers:

1. **Night palette.** The page, the heading, the replay bar and the Gate move onto a night sky in both colour schemes. Text tokens are re-chosen against it.
2. **State light.** Each Room's painting is wrapped in a light layer: a moonlit wash, a candle pool or a door-leak glow. The map's windows take the same three values plus `held`.
3. **Atmosphere.** Fog, dust and rain are drawn under the controls layer, never over it, and only move when the Motion_Policy allows.

## The effect table

Every effect, the state it shows, and how it reads with motion off. "Text" names where the same state is written down.

| Effect | State it shows | With motion off | Text that says the same |
|---|---|---|---|
| Moonlit room (blue wash, no candle) | No ghost of the room works and no door waits | Same, still | Room label: "Ghost: idle/done", "Door: sealed/open" |
| Candle pool on the floor | A ghost of the room is working | The pool is drawn, its flicker stops | Ghost label "Working"; room label "Ghost: working" |
| Light leaking under a door | That door waits for your decision | The leak is drawn, its pulse stops | Door label "Waiting for you"; Needs-you count |
| Map window lit / dark / red glow | Work / idle / something held | Same colours, no flicker | Map room label; `data-glow` text in the window's title |
| Warden small at the edge | Nothing needs you | Same | Pose label "The Warden is watching." |
| Warden forward, eyes bright, long shadow | Something needs you | Same pose, no step animation | Pose label names it; balloon Status_Line |
| Ghost hanging from the Warden's chain | A ghost is held (a risky action waits) | Same | Pose label "The Warden is holding Tinker 2." |
| Chain empty after release; ghost back in room after refusal | The decision was made | Same | The room's proposal shows "Released" or "Refused" |
| Hollow-eyed ghost per state silhouette | Ghost_State | Same silhouettes, no drift | Ghost text label |
| Chain and wax seal on a door; broken seal | Door sealed / open | Same | Door label |
| Cobwebs, three steps | How long since anything happened in the room | Same | None needed: no decision depends on it |
| Fog, dust, rain | Nothing (atmosphere only, at Eerie and Dread) | Drawn still at Eerie/Dread, absent at Calm | None needed |
| Séance-board scrubber, planchette thumb, event marks | Replay position and where events fall | Same | The range's label and value text "Event 64 of 91" |
| Knocker eyes follow the pointer; one shudder on knock | That the Gate is listening; that you knocked | Eyes fixed ahead, no shudder | Balloon Status_Line |
| Heartbeat (sound on) | Something waits on you; faster as more wait | Sound is not motion: still plays if sound is on | Needs-you count |
| Wind and drone (sound on) | Nothing (atmosphere, Eerie and Dread) | Plays if sound is on | None needed |

## Architecture

```
HouseProjection ─┐
Motion_Policy ───┼─▶ core/dread.ts ─▶ RoomLight, WindowGlow, WardenStance, cobwebs, DreadEffects
Fright_Level ────┘                         │
                                           ▼
             RoomStage / HouseMap / WardenArt / SpectreArt / Atmosphere / ReplayBar
```

The Fright_Level is held in the shell beside Still House (in memory, like every other setting). It is set as `data-fright` on the House_UI root and on the Gate, so CSS can choose the palette depth; `data-motion` already carries the Motion_Policy.

## Components and Interfaces

`core/dread.ts` (pure: no React, DOM, SDK, network, storage, timer or clock):

```ts
export const FRIGHT_LEVELS = ['calm', 'eerie', 'dread'] as const
export type FrightLevel = (typeof FRIGHT_LEVELS)[number]
export const DEFAULT_FRIGHT: FrightLevel = 'eerie'

export type RoomLight = 'moonlit' | 'candle' | 'leak'
export function roomLight(room: RoomPresentation): RoomLight
export type WindowGlow = 'dark' | 'lit' | 'held'
export function windowGlow(room: RoomPresentation, needsYou: readonly NeedsYouItem[]): WindowGlow
export interface WardenStance { stance: 'edge' | 'forward' | 'holding'; heldGhostId: string | null }
export function wardenStance(projection: HouseProjection): WardenStance
export function cobwebStep(room: RoomPresentation, version: number): 0 | 1 | 2 | 3
export interface DreadEffects { night: boolean; stateLight: boolean; fog: boolean; dust: boolean; rain: boolean; moves: boolean }
export function dreadEffects(level: FrightLevel, motion: EffectiveMotion): DreadEffects
export function heartbeatBpm(waiting: number): number | null
```

`roomLight` gives `leak` when any Door of the room is `waiting`, else `candle` when any ghost is `working`, else `moonlit`. A waiting door outranks a working ghost because it needs the Visitor.

`windowGlow` gives `held` when a Needs_You_Item of that room is a risky action, `lit` when a ghost there works or waits, else `dark`.

`wardenStance` gives `holding` with the ghost of the first waiting risky action, `forward` when anything else needs the Visitor, else `edge`.

`cobwebStep` uses the room's last activity sequence (the highest sequence of a record about one of its ghosts or doors, already on the Room presentation as `lastSequence`) against the projection version: fewer than 10 records since: 0; fewer than 30: 1; fewer than 60: 2; else 3. A room with no activity at all is step 3.

`dreadEffects`: at `calm` nothing but night; at `eerie` night, state light, fog and dust; at `dread` all of them and rain. `moves` is true only when the Motion_Policy is `low-frequency`.

`heartbeatBpm`: `null` for 0; otherwise `min(90, 48 + 12 × (waiting − 1))`.

## Correctness Properties

### Property 1: Light tells the truth

For every Room presentation, `roomLight` is `leak` exactly when a Door of the room waits, `candle` exactly when no Door waits and a ghost works, and `moonlit` otherwise; and `windowGlow` is `held` only when the room holds a risky Needs_You_Item.

**Validates: Requirements 2.1 to 2.4**

### Property 2: Stillness always wins

For every Fright_Level, `dreadEffects(level, 'none').moves` is false; and `dreadEffects('calm', motion)` draws no state light, fog, dust or rain.

**Validates: Requirements 1.2, 6.2**

### Property 3: The Warden grows only with what waits

For every House_Projection, `wardenStance` is `edge` exactly when nothing needs the Visitor, `holding` exactly when a risky action waits, and `heldGhostId` names a ghost of that action.

**Validates: Requirements 3.1 to 3.3**

### Property 4: The heartbeat is bounded and monotone

`heartbeatBpm(0)` is null; for every n ≥ 1 it is between 48 and 90 and never lower than for n − 1.

**Validates: Requirement 7.3**

### Property 5: Cobwebs only thicken with neglect

For a fixed room, `cobwebStep` never decreases as the projection version grows, and is 0 right after activity.

**Validates: Requirement 5.2**

## Error Handling

Every function is total. An unknown door or ghost state reads as nothing happening (`moonlit`, `dark`, `edge`). Sound that cannot start stays silent, as today.

## Testing Strategy

- One fast-check test per property, 200 runs each, in `core/dread.property.test.ts`.
- DOM tests: the stage carries `data-light`, the map windows `data-glow` and a title, the Warden `data-stance`; the Fright control cycles three values and is keyboard reachable; Calm keeps the paintings' old markup.
- The existing style test checks only `transform` and `opacity` animate, and no animation is shorter than two seconds except the knock shudder.
- Rendered check in headless Comet over the static replay, recorded in `spikes/fixtures/dread-render.json`: the Gate, each room at the held moment and at the end, the map, at 1280×720, 1024×768, 768×1024 and 390×844, at each Fright_Level, with Still House on and off: no horizontal scroll, no failed request, atmosphere under every control (hit-test at each control's centre returns the control).

## Design Decisions and Rationale

- **Light from the projection, not from time.** A candle that flickers on a timer would claim work that is not happening.
- **Calm is the old house.** It keeps a known-good look for anyone who wants no dread, and keeps the existing tests meaningful.
- **No persistence.** The Fright level is held like Still House, in memory, so this feature adds no storage contract.
