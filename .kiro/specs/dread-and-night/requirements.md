# Requirements Document

## Introduction

The `dread-and-night` feature makes Haunted House frightening by dread and scale, never by shock, and makes every frightening thing tell the Visitor something true.

Today the house is bright and friendly. This feature turns the page into night and lets light carry state: a room is dark and moonlit when nothing happens in it, a candle burns where a ghost is working, light leaks under a sealed door when work waits behind it, and on the house map a lit window means work, a dark one means idle and a red glow means something is held. The Warden grows with what he holds. The ghosts lose their cuteness but keep their own silhouettes and text labels. Sealed doors carry a chain and a wax seal. Cobwebs thicken on rooms nobody has touched in a long time. The replay scrubber becomes a séance board.

A Fright setting with three levels (Calm, Eerie, Dread) chooses how much of this the Visitor sees. Calm is the house as it was before this feature. Still House and the browser's reduced-motion preference override every level and stop all non-essential motion.

It is presentation only. It adds no workflow state, approval path, backend route, manifest permission, storage contract or runtime dependency, and `docs/permission-freeze.json` is unchanged. Every effect is derived from the House_Projection the house already folds, so live and replay show the same effects for the same log.

## Scope

| Scope | Included behavior |
|---|---|
| **MVP** | Night page; room light from state; light leak under a waiting door; map windows lit, dark or red; the Warden's stance from what waits; his colder lines; ghosts reshaped per state; chained and sealed doors; cobwebs from neglect; fog, dust and rain at Eerie and Dread; the séance-board scrubber; the Fright setting; synthesised wind, drone and heartbeat behind the existing Sound toggle; the steering update; property, DOM and rendered checks |
| **Not now** | New rooms; moving rooms or furniture; recorded audio; per-ghost voices; keeping the Fright level after the page closes |
| **Excluded** | Gore; jump scares; screams; sudden loud sound; anything that flashes more than three times a second; screen shake; any effect that covers a control, a label or the balloon; state shown by light or colour alone; any third-party name, character, art or sound |

## Glossary

Terms of `house-ui-and-accessibility` and `warden-guide-and-first-visit` keep their meaning: **House_UI**, **House_Projection**, **Room**, **Door**, **Ghost**, **Needs_You_Item**, **Motion_Policy**, **Still_House**, **Warden**, **Balloon**, **Pose**, **Replay_Build**, **Visitor**.

- **Fright_Level**: One of `calm`, `eerie`, `dread`. Default `eerie`.
- **Room_Light**: One of `moonlit` (nothing happens), `candle` (a ghost works), `leak` (work waits behind a sealed Door). Derived from the House_Projection.
- **Window_Glow**: One of `dark`, `lit`, `held`, the map's window for a Room.
- **Warden_Stance**: How far the Warden steps forward: `edge` when nothing waits, `forward` when something needs the Visitor, `holding` when a ghost is held.
- **Neglect**: How long nobody has worked in a Room, read from what the Room holds now: none where work happens or waits, most where no ghost has ever been. Thickens cobwebs.
- **Atmosphere**: Fog, dust and rain. Decoration with no state of its own; never above a control.
- **Seance_Board**: The replay scrubber drawn as a board, with a planchette thumb and one mark per recorded event.
- **Dread_Effects**: The pure value that says, for one Fright_Level and one Motion_Policy, which effects are drawn and which move.

## Requirements

### Requirement 1: Night is the page

**User Story:** As a Visitor, I want the whole page to be night, so that the house reads as one place and its light means something.

#### Acceptance Criteria

1. THE House_UI SHALL draw the page behind the house, the heading, the replay bar and the Gate as night: a dark sky with no pale background anywhere, at every Fright_Level and in light and dark colour schemes.
2. WHILE the Fright_Level is `calm`, THE House_UI SHALL keep the room paintings as they were before this feature.
3. THE House_UI SHALL keep every text at a contrast of at least 4.5:1 against what is behind it and every focus ring and control boundary at least 3:1.

### Requirement 2: Light is the status display

**User Story:** As a Visitor, I want light to show where work is happening, waiting or idle, so that I can read the house at a glance.

#### Acceptance Criteria

1. WHEN no ghost of a Room is working and no Door of it is waiting, THE House_UI SHALL draw the Room dark and lit only by moonlight.
2. WHEN a ghost of a Room is working, THE House_UI SHALL draw a pool of candlelight in that Room.
3. WHEN a Door of a Room is waiting for the Visitor's decision, THE House_UI SHALL draw light leaking under that Door.
4. THE House_Map SHALL draw each Room's window lit when a ghost there works, dark when nothing happens, and with a red glow when something there is held for the Visitor.
5. THE House_UI SHALL also state each of these in text: the Room's existing label names its ghost state and Door state, and the map window carries the same words, so no state is shown by light or colour alone.

### Requirement 3: The Warden grows with what he holds

**User Story:** As a Visitor, I want the Warden's size and stance to show how much needs me, so that I feel the weight of a waiting decision without being startled.

#### Acceptance Criteria

1. WHEN nothing needs the Visitor, THE Warden SHALL stand small and still at the edge of the apron.
2. WHEN something needs the Visitor, THE Warden SHALL step forward, his lantern eyes SHALL brighten and his shadow SHALL stretch across the floor toward the Room.
3. WHEN a ghost is held (a risky action waits), THE Warden SHALL hold that ghost on his chain.
4. WHEN the Visitor refuses a held action, THE House_UI SHALL show the ghost back in its Room; WHEN the Visitor releases it, THE Warden's chain SHALL hang empty.
5. THE Warden's Status_Line for a held ghost SHALL be colder and stay literal, for example "I have Tinker 2. It wants to run a command. Nothing runs until you say."
6. THE Warden's stance SHALL be the same in live and replay for the same log.

### Requirement 4: Ghosts lose the cuteness

**User Story:** As a Visitor, I want ghosts that look like ghosts, so that the house is frightening, while I can still tell each state apart.

#### Acceptance Criteria

1. THE House_UI SHALL draw ghosts with hollow eyes, torn hems and longer shapes, with no smiles.
2. THE House_UI SHALL keep a distinct silhouette per Ghost_State: working drifts and writes, waiting turns and stares out, blocked strains against a chain, failed leaves a scorched outline, done fades to a faint glow, idle hangs still.
3. Each ghost SHALL keep its text label.

### Requirement 5: The house itself

**User Story:** As a Visitor, I want the house to look old and watched, and each sign of age to mean something.

#### Acceptance Criteria

1. A sealed Door SHALL carry a chain and a wax seal; an open Door SHALL show the seal broken and the chain fallen.
2. THE House_UI SHALL draw cobwebs on a Room in proportion to its Neglect, in three steps.
3. WHILE the Fright_Level is `eerie` or `dread`, THE House_UI SHALL draw ground fog and dust; WHILE it is `dread`, rain on the windows.
4. THE replay scrubber SHALL be drawn as a Seance_Board: the thumb a planchette, the recorded events marks along the board, keeping the native range input, its label and its value text.
5. AT the Gate, THE knocker's eyes SHALL follow the pointer while motion is allowed, and the door SHALL shudder once on a knock.
6. No Atmosphere SHALL lie above a control, a label or the Balloon, and Atmosphere SHALL not receive pointer input.

### Requirement 6: Fright and stillness

**User Story:** As a Visitor, I want to choose how frightening the house is, and to be sure stillness always wins.

#### Acceptance Criteria

1. THE House_UI SHALL offer one Fright setting with `Calm`, `Eerie` and `Dread`, default `Eerie`, as a labelled control on the guide settings group, reachable by keyboard.
2. WHILE Still_House is on or the browser prefers reduced motion, THE House_UI SHALL stop all non-essential motion at every Fright_Level.
3. THE House_UI SHALL animate only `transform` and `opacity`, nothing faster than once every two seconds except the single knock shudder, and nothing that flashes more than three times a second.
4. THE Fright setting SHALL not change any text, control, request or announcement.

### Requirement 7: Sound

**User Story:** As a Visitor who turns sound on, I want the house to sound like a house at night, and a heartbeat that tells me something waits.

#### Acceptance Criteria

1. Sound SHALL stay off by default and on every visit until the Visitor presses Sound.
2. WHILE sound is on and the Fright_Level is not `calm`, THE House_UI SHALL play a quiet synthesised wind and low drone.
3. WHILE sound is on and something needs the Visitor, THE House_UI SHALL play a slow heartbeat whose rate rises with the number of things waiting, never above 90 beats a minute, and stops when nothing waits.
4. No sound SHALL start loud: every sound rises from silence over at least half a second.

### Requirement 8: Steering and tests

#### Acceptance Criteria

1. `.kiro/steering/theme-and-accessibility.md` SHALL describe the night palette, the light-as-status rule, the Fright setting and the new sounds.
2. Each correctness property of the design SHALL have a fast-check test of at least 200 runs.
3. The rendered look SHALL be checked in a real browser at 1280×720, 1024, 768 and 390 wide, at each Fright_Level, with Still House on and off.
