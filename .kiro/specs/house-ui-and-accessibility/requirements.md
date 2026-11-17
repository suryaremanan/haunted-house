# Requirements Document

## Introduction

The `house-ui-and-accessibility` feature delivers Haunted House's final spatial interface. Before a Mansion is open, the approved Foyer journey remains the project-selection surface. After a Mansion opens, an accessible cutaway house becomes the primary interface for requirements, design, implementation planning and work, and replay. The house presents authoritative room, Door, Ghost, and approval projections from the approved mansion lifecycle, séance log and ghost state, doors and guardrails, and room ghosts specifications. The house does not create a parallel workflow state or turn chat into the home screen.

The MVP includes the Foyer, Study, Drafting Room, Workshop, and Attic; original SVG and CSS art; keyboard and screen-reader navigation; light and dark Crew themes; reduced-motion controls; responsive reflow; and a bounded interruption policy. The Séance Room and opt-in sound are stretch scope. Sound remains absent and off in the MVP.

## Scope

| Scope | Included behavior |
|---|---|
| **MVP** | Existing Foyer before Mansion entry; cutaway Mansion after entry; Foyer, Study, Drafting Room, Workshop, and Attic room objects; optional locked Séance Room object; authoritative room, Door, and Ghost state; panels and secondary Crew session links; keyboard and screen-reader operation; one polite live region; Still House; Crew theme integration; responsive layout; bounded notifications and Needs You badge; live/replay parity; automated unit, DOM, accessibility, and property tests |
| **Stretch** | Enabled Séance Room review interface; original or CC0 opt-in sound with separate user consent; richer Attic search, filtering, export, and timeline controls |
| **Excluded** | A primary chat composer, inferred approvals, automatic phase advancement, jump scares, gore, flashing, parallax, screen shake, copyrighted characters, copyrighted music, cloud state, and a second room, Door, Ghost, or approval state store |

## Glossary

- **House_UI**: The React and TypeScript user interface delivered by this feature.
- **Haunted_House**: The gateway-managed Kiro Crew App defined under `app/`.
- **Crew_Gateway**: Kiro Crew 0.12.1 or later, which hosts the App page and approved session services.
- **Backend**: The signed local Haunted House HTTP process established by `crew-app-foundation`.
- **Operator**: The local person using Haunted_House through the Crew dashboard or static Replay_Build.
- **MVP**: The required feature scope that must work without any stretch feature.
- **Stretch_Feature**: Optional functionality excluded from MVP completion.
- **Mansion**: One software project selected through the Foyer.
- **Mansion_Shell**: The authenticated in-app surface shown after the Operator opens a Mansion.
- **Foyer**: The approved mansion list, create, select, open, and return interface from `mansion-lifecycle`.
- **Cutaway_House**: The spatial Mansion illustration and its semantic navigation controls.
- **House_Map**: The ordered navigation list that represents the Cutaway_House to keyboard and assistive-technology users.
- **Room**: One visible spatial destination in the Cutaway_House.
- **Room_Order**: The stable order Foyer, Study, Drafting Room, Workshop, Attic, and optional Séance Room.
- **Room_Control**: The keyboard-operable control that opens one Room_Panel.
- **Room_Panel**: The focused detail surface for one Room, its artifact, authority, state, and actions.
- **Artifact**: A validated requirements, design, task-plan, implementation, or review work product presented by an approved upstream Room module.
- **Authority**: The approved paths, tools, decisions, and actions available to a Room or Ghost.
- **Session_Link**: A secondary control that opens an existing Crew session without creating a new chat.
- **Room_Projection**: The validated projection produced by the approved upstream specs for one Room.
- **House_Projection**: The validated presentation model that joins Mansion, workflow, Door, Ghost, waiting-item, artifact, and replay projections without adding authority.
- **Acknowledged_Projections**: Upstream projections built only from events accepted by each owning persistence and validation contract.
- **Projection_Integrity**: The upstream validity state `valid`, `uncertain`, `corrupt`, or `incompatible` used to gate mutation.
- **Canonical_Record**: A validated, redacted App event record from the approved séance-log schema.
- **House_Projection_Adapter**: The adapter that combines approved upstream projections into a House_Projection.
- **Phase**: The workflow phase represented by a Room, or `navigation` and `replay` for the Foyer and Attic.
- **Door**: The approval gate defined by `doors-and-guardrails`.
- **Door_State**: One upstream Door value: `sealed`, `waiting`, `open`, or `rejected`; `not_applicable` is presentation copy for a Room without a Door.
- **Door_Control**: The keyboard-operable control that opens Door details or the applicable decision panel.
- **Ghost**: A room agent defined by `room-ghosts`.
- **Ghost_State**: One upstream state defined by `seance-log-and-ghost-state`: `idle`, `working`, `waiting`, `blocked`, `failed`, or `done`; `not_applicable` is presentation copy for a Room without a Ghost.
- **Ghost_Control**: The keyboard-operable control that opens Ghost details without creating or approving work.
- **State_Cue**: A visible icon, Ghost pose, or Door shape paired with exact state text.
- **Waiting_Item**: An unresolved Door, tool, risky-action, or other explicit decision projected by the approved upstream specs.
- **Needs_You_Item**: A deduplicated Waiting_Item or failed Ghost recovery decision that currently exposes an Operator action.
- **Needs_You_Shortcut**: A visible keyboard-operable control that opens the first Room containing a Needs_You_Item in Room_Order.
- **Interruption_Event**: A canonical Ghost transition to `waiting`, `blocked`, or `failed`, identified by an upstream event or record identifier.
- **Interruption_Policy**: Pure decision logic that filters, deduplicates, groups, and summarizes Interruption_Events.
- **Interruption_Burst**: Distinct eligible Interruption_Events observed during one 10-second window beginning with the first event in the group.
- **Polite_Live_Region**: The single `aria-live="polite"` element used for interruption summaries.
- **Host_Toast**: A dashboard notification requested through Crew's `useNotify` hook.
- **Sidebar_Badge**: The Haunted_House navigation badge updated through Crew's `useNavBadge` hook.
- **Crew_Theme**: The reactive theme information exposed by Crew's `useTheme` hook and the host CSS variables verified by the SDK contract spike.
- **House_Palette**: Haunted House semantic color tokens derived from Crew_Theme values with tested light and dark fallback values.
- **Plain_CSS**: Standards-based CSS authored without a Tailwind dependency, directive, or generated utility runtime.
- **WCAG_2.2_AA**: The Web Content Accessibility Guidelines 2.2 Level AA thresholds applied by this feature.
- **Still_House**: An in-app setting that suppresses every non-essential animation.
- **Reduced_Motion_Preference**: The browser `prefers-reduced-motion: reduce` media preference.
- **Motion_Policy**: Pure decision logic that enables optional motion only when both Still_House and Reduced_Motion_Preference are inactive.
- **Low_Frequency_Motion**: A non-essential animation whose complete cycle lasts at least two seconds.
- **Responsive_House**: The Cutaway_House presentation that reflows without loss of content or operation from 320 CSS pixels through wider dashboard layouts.
- **Replay_Build**: The static build that renders the same House_UI from scrubbed fixtures and the canonical séance log without Crew Gateway or Backend access.
- **Attic**: The Room that presents the approved canonical replay projection and diagnostics.
- **Séance_Room**: The stretch Room for the optional review loop defined by `room-ghosts`.
- **Sound_Feature**: Stretch-only user-enabled original or CC0 audio feedback.
- **SDK_Contract_Spike**: An executable probe that verifies the installed Crew version's `useTheme`, `useNotify`, and `useNavBadge` signatures, values, cleanup behavior, and replay stand-ins before those hooks are integrated.
- **Accessibility_Test_Suite**: Automated semantic, keyboard, focus, contrast-token, reduced-motion, reflow-contract, and accessibility-rule tests for House_UI.

## Requirements

### Requirement 1: Spatial Mansion is the primary interface [MVP]

**User Story:** As an Operator, I want to navigate a spatial Mansion, so that I can understand agent work and authority without reading a chat transcript.

#### Acceptance Criteria

1. WHILE no Mansion is open, THE House_UI SHALL present the approved Foyer as the primary application content. (Changed Nov 17 at the owner's request: on a first visit the Gate of `warden-guide-and-first-visit` comes before the Foyer.)
2. WHEN the Foyer opens a Mansion, THE Mansion_Shell SHALL present the room the Operator stands in, then that room's details, then the Cutaway_House, before status feeds in document order. (Changed Nov 16 at the owner's request: the walk-in room comes first; the Cutaway_House is the map below it.)
3. THE Cutaway_House SHALL contain visible Room objects for the Foyer, Study, Drafting Room, Workshop, and Attic.
4. WHERE the Séance Room stretch interface is disabled, THE Cutaway_House SHALL present the Séance_Room as a labelled locked Room or omit the Séance_Room according to one build-time setting.
5. WHERE the Séance Room stretch interface is enabled, THE Cutaway_House SHALL present the Séance_Room after the Attic in Room_Order.
6. WHEN the Operator activates a Room_Control, THE House_UI SHALL open the corresponding Room_Panel.
7. WHEN the Operator opens the Foyer Room_Panel from an active Mansion, THE Foyer SHALL identify the active Mansion and provide the approved return-to-mansion-selection action.
8. WHEN the Operator opens the Attic Room_Panel, THE Attic SHALL present the canonical replay projection and any replay-integrity diagnostic from the approved séance-log contract.
9. THE Room_Panel SHALL present artifacts, current state, authority, and actions before any Session_Link.
10. THE House_UI SHALL present no inline chat composer as the Mansion_Shell's primary interface.

### Requirement 2: Authoritative room, Door, and Ghost state [MVP]

**User Story:** As an Operator, I want every Room to reflect the approved workflow projections, so that the house cannot imply authority or progress that the backend did not record.

#### Acceptance Criteria

1. WHEN the House_Projection_Adapter receives valid upstream projections, THE House_Projection_Adapter SHALL derive every Room_Projection from the approved mansion, workflow, Door, Ghost, waiting-item, artifact, and replay contracts.
2. THE House_Projection_Adapter SHALL preserve every upstream Door_State without promoting or inferring a different Door_State.
3. THE House_Projection_Adapter SHALL preserve every upstream Ghost_State without promoting or inferring a different Ghost_State.
4. IF an upstream Projection_Integrity is `uncertain`, `corrupt`, or `incompatible`, or the projection is malformed, THEN THE House_Projection_Adapter SHALL mark the affected Room unavailable for mutation and provide a text diagnostic.
5. WHEN the House_UI renders a Door_State, THE House_UI SHALL display the exact Door_State text and a distinct Door State_Cue.
6. WHEN the House_UI renders a Ghost_State, THE House_UI SHALL display the exact Ghost_State text and a distinct Ghost State_Cue.
7. THE House_UI SHALL use color only as a supplementary State_Cue.
8. WHEN a Room has no Door or Ghost, THE House_UI SHALL label the corresponding state as `not applicable` rather than inventing a workflow state.
9. WHEN the Operator opens a Room, THE House_UI SHALL preserve every Door, approval, and phase-start rule defined by the approved upstream specs.
10. WHEN the Operator views a Room, THE House_UI SHALL treat navigation and viewing as non-decision actions.

### Requirement 3: Complete keyboard operation and focus management [MVP]

**User Story:** As a keyboard Operator, I want predictable navigation through the house, so that every room and decision remains operable without a pointer.

#### Acceptance Criteria

1. THE House_UI SHALL place every interactive Room_Control, Ghost_Control, Door_Control, panel control, and approval control in a logical Tab sequence.
2. WHEN focus is on a Room_Control and the Operator presses an Arrow key, THE House_Map SHALL move focus to the geometrically adjacent Room_Control defined by the fixed navigation map.
3. IF no Room_Control exists in the requested Arrow-key direction, THEN THE House_Map SHALL keep focus on the current Room_Control.
4. WHEN focus is on a Room_Control and the Operator presses Enter, THE House_UI SHALL open the corresponding Room_Panel.
5. WHEN the Operator closes a Room_Panel with Escape, THE House_UI SHALL restore focus to the control that opened the Room_Panel.
6. WHEN the Operator closes a nested decision surface with Escape, THE House_UI SHALL restore focus to the control that opened the nested decision surface.
7. WHEN one or more Needs_You_Items exist, THE Needs_You_Shortcut SHALL display the Needs_You_Item count and open the first affected Room in Room_Order.
8. WHEN no Needs_You_Item exists, THE Needs_You_Shortcut SHALL display a zero count and perform no navigation action.
9. THE House_UI SHALL render a visible focus indicator for every focusable control.
10. THE House_UI SHALL keep disabled mutation controls programmatically identifiable with the reason for the disabled state.

### Requirement 4: Screen-reader structure and announcements [MVP]

**User Story:** As a screen-reader Operator, I want the Mansion exposed as meaningful navigation, so that the spatial metaphor has an equivalent nonvisual structure.

#### Acceptance Criteria

1. THE House_Map SHALL expose the Cutaway_House as a navigation landmark containing one ordered list in Room_Order.
2. WHEN the House_UI renders a Room_Control, THE Room_Control SHALL have an accessible name containing the Room name, Phase, Door_State, and Ghost_State.
3. WHEN the House_UI renders a decorative house, Door, Ghost, dust, candle, or furniture graphic, THE House_UI SHALL hide the decorative graphic from the accessibility tree.
4. THE House_UI SHALL contain exactly one Polite_Live_Region.
5. WHEN the Interruption_Policy emits an interruption summary, THE Polite_Live_Region SHALL announce that summary once.
6. WHEN state changes to `idle`, `working`, or `done`, THE Polite_Live_Region SHALL preserve the previous announcement until the Interruption_Policy emits another summary.
7. WHEN routine progress, streaming text, or tool activity changes, THE House_UI SHALL update the applicable Room in place without changing the Polite_Live_Region.
8. WHEN a Room_Panel opens, THE Room_Panel SHALL expose a labelled dialog or region with a heading that names the Room.
9. WHEN a Room_Panel closes, THE House_UI SHALL remove the closed panel content from the accessibility tree.

### Requirement 5: Original visual system, menacing but never harmful [MVP]

**User Story:** As an Operator, I want a distinctive but calm house, so that agent state is memorable without horror effects or borrowed characters.

#### Acceptance Criteria

1. THE Cutaway_House SHALL use original repository-authored SVG shapes and CSS for house, Room, Door, object, and Ghost artwork.
2. THE House_UI SHALL load no remote art, embedded third-party raster art, trademarked character, gore image, jump-scare image, or copyrighted music asset.
3. THE House_UI SHALL use candlelight, dust, creaky-door, and tall still-figure motifs without hiding functional labels. (Changed Nov 17 at the owner's request: the tone is menacing, never harmful, as `warden-guide-and-first-visit` sets out; the menace is aimed at Ghosts that stray, never at the Operator.)
4. WHEN Crew_Theme changes while House_UI is mounted, THE House_UI SHALL update House_Palette tokens without remounting the Mansion_Shell.
5. IF a Crew_Theme token is absent, THEN THE House_Palette SHALL use the tested fallback value for the active light or dark mode.
6. THE House_Palette SHALL provide text-to-background contrast of at least 4.5:1 for normal text.
7. THE House_Palette SHALL provide component-boundary and focus-indicator contrast of at least 3:1 against adjacent colors.
8. THE House_UI SHALL distinguish every interactive state with text, shape, border, icon, or pose in addition to color.
9. THE House_UI SHALL use Plain_CSS without a Tailwind runtime or build dependency.

### Requirement 6: Responsive spatial layout [MVP]

**User Story:** As an Operator using different dashboard sizes, I want the house to reflow while preserving its meaning, so that every room remains reachable and readable.

#### Acceptance Criteria

1. WHILE the available inline viewport is at least 900 CSS pixels, THE Responsive_House SHALL present the Room objects in a two-dimensional cutaway arrangement.
2. WHILE the available inline viewport is below 900 CSS pixels, THE Responsive_House SHALL preserve Room_Order in a compact spatial arrangement or ordered single-column layout.
3. WHILE the available inline viewport is 320 CSS pixels, THE Responsive_House SHALL present every Room label and control without page-level horizontal scrolling.
4. WHEN Responsive_House changes layout, THE House_Map SHALL preserve semantic Room_Order and the fixed keyboard navigation map.
5. WHEN text is enlarged to 200 percent, THE House_UI SHALL keep state text and decision controls visible without clipping.
6. THE Room_Panel SHALL constrain long paths, artifact names, and status copy through wrapping rather than horizontal page overflow.

### Requirement 7: Still House and safe motion [MVP]

**User Story:** As a motion-sensitive Operator, I want animation under my control, so that the Mansion remains comfortable to use.

#### Acceptance Criteria

1. THE House_UI SHALL provide a labelled Still_House toggle within the Mansion_Shell.
2. WHILE Still_House is active, THE Motion_Policy SHALL disable every non-essential animation and transition.
3. WHILE Reduced_Motion_Preference is active, THE Motion_Policy SHALL disable every non-essential animation and transition regardless of the Still_House toggle value.
4. WHEN Reduced_Motion_Preference changes while House_UI is mounted, THE House_UI SHALL apply the new Motion_Policy without remounting the Mansion_Shell.
5. WHERE optional motion is enabled, THE Motion_Policy SHALL permit only Low_Frequency_Motion.
6. THE House_UI SHALL contain no parallax, viewport shake, screen shake, or motion that tracks pointer position.
7. THE House_UI SHALL contain no visual effect that flashes more than three times in any one-second period.
8. THE House_UI SHALL keep reading, navigation, state recognition, and approval operation complete when optional motion is disabled.

### Requirement 8: Bounded interruption policy [MVP]

**User Story:** As an Operator, I want interruptions only when attention is useful, so that ambient agent activity does not compete with my work.

#### Acceptance Criteria

1. WHEN a canonical Ghost transition enters `waiting`, `blocked`, or `failed`, THE Interruption_Policy SHALL accept one Interruption_Event for the transition.
2. WHEN a canonical Ghost transition enters `idle`, `working`, or `done`, THE Interruption_Policy SHALL emit no Host_Toast or live-region summary.
3. WHEN routine progress, streaming text, or tool activity occurs without a transition to `waiting`, `blocked`, or `failed`, THE Interruption_Policy SHALL emit no Host_Toast or live-region summary.
4. WHEN the Interruption_Policy receives an Interruption_Event identifier already observed during the mounted UI session, THE Interruption_Policy SHALL emit no duplicate interruption.
5. WHEN one or more distinct Interruption_Events occur within one Interruption_Burst, THE Interruption_Policy SHALL emit one bounded summary containing the affected Ghost names and states.
6. WHEN an Interruption_Burst closes, THE House_UI SHALL send the same summary to one Host_Toast and the Polite_Live_Region no later than 10 seconds after the last event accepted into the burst.
7. WHEN the House_Projection changes, THE Sidebar_Badge SHALL equal the number of current deduplicated Needs_You_Items.
8. WHEN a blocked Ghost exposes no Operator action, THE Sidebar_Badge SHALL exclude the blocked Ghost.
9. WHEN a Needs_You_Item resolves, THE Sidebar_Badge SHALL remove the resolved item on the next House_Projection.
10. THE Sidebar_Badge SHALL exclude routine progress, active tool calls, `idle`, `working`, `blocked` without an Operator action, and `done` state.
11. WHILE the Sound_Feature is disabled, THE Interruption_Policy SHALL produce no audio effect.

### Requirement 9: Live, replay, and upstream composition [MVP]

**User Story:** As a judge, I want the same house in live and replay modes, so that the static demonstration proves the real projection and interaction model.

#### Acceptance Criteria

1. WHEN live mode renders an open Mansion, THE House_UI SHALL derive House_Projection from Acknowledged_Projections.
2. WHEN Replay_Build renders, THE House_UI SHALL derive House_Projection from the canonical scrubbed séance fixture and approved replay folds.
3. WHEN equivalent Canonical_Records drive live and replay modes, THE House_UI SHALL render equivalent Room_Order, Door_State, Ghost_State, Needs_You_Item count, and accessible Room labels.
4. THE Replay_Build SHALL render the same Mansion_Shell, Cutaway_House, House_Map, Room_Control, Ghost_Control, Door_Control, Room_Panel, Session_Link, and Attic components as live mode.
5. THE Replay_Build SHALL make no request to Crew_Gateway or Backend.
6. WHILE Replay_Build is active, THE House_UI SHALL disable mutation and Session_Link controls with visible read-only copy.
7. IF the canonical replay fixture contains a diagnostic, THEN THE Attic SHALL display the valid replay prefix and the diagnostic without inventing later state.
8. WHEN the Backend or an upstream projection is unavailable in live mode, THE House_UI SHALL preserve the foundation status and retry path instead of fabricating House_Projection.

### Requirement 10: Automated accessibility and behavior verification [MVP]

**User Story:** As a maintainer, I want automated coverage for the house's interaction and interruption rules, so that visual changes do not silently remove access or create noise.

#### Acceptance Criteria

1. THE Accessibility_Test_Suite SHALL run unit tests for House_Projection mapping, Room labels, Needs_You_Item selection, keyboard navigation, Motion_Policy, and Interruption_Policy.
2. THE Accessibility_Test_Suite SHALL run property-based tests for Interruption_Policy filtering, deduplication, burst grouping, and bounded summary behavior over generated event sequences.
3. THE Accessibility_Test_Suite SHALL run property-based tests for House_Projection state preservation and Needs_You_Item counting over generated valid upstream projections.
4. THE Accessibility_Test_Suite SHALL run DOM tests for Room_Order, navigation-list semantics, complete accessible Room labels, text-plus-icon state, one Polite_Live_Region, and panel semantics.
5. THE Accessibility_Test_Suite SHALL run keyboard DOM tests for Tab order, every Arrow direction, Enter, Escape, nested focus restoration, and Needs_You_Shortcut behavior.
6. THE Accessibility_Test_Suite SHALL run automated accessibility-rule checks against each major Room, Door, Ghost, panel, light-theme, dark-theme, and reduced-motion fixture state.
7. THE Accessibility_Test_Suite SHALL verify fallback House_Palette contrast ratios against WCAG_2.2_AA thresholds.
8. THE Accessibility_Test_Suite SHALL verify CSS contracts for 320-pixel reflow, 200-percent text enlargement, reduced motion, Still_House, no parallax, no shake, and no rapid flashing animation.
9. THE Accessibility_Test_Suite SHALL run live/replay DOM parity tests that fail on a Replay_Build Gateway or Backend request.
10. WHEN the SDK_Contract_Spike finds a hook contract different from the design assumption, THE House_UI SHALL update the SDK adapter contract and its tests before integrating the affected hook.

### Requirement 11: MVP and stretch boundary

**User Story:** As a hackathon developer, I want optional atmosphere and review work separated from the accessible house, so that the MVP remains complete without stretch features.

#### Acceptance Criteria

1. THE House_UI SHALL ship no audio asset; the Sound_Feature SHALL synthesise every sound in the browser from one audio adapter, behind one sound control. (Changed Nov 16 at the owner's request: sound moved from stretch into the house as an opt-in feature.)
2. WHERE the Sound_Feature is enabled, THE Sound_Feature SHALL initialize in the off state for every new browser session.
3. WHERE the Sound_Feature is enabled, THE Sound_Feature SHALL begin audio playback only after an explicit Operator action enables sound.
4. WHERE the Sound_Feature is enabled, THE Sound_Feature SHALL use only original or CC0 credited audio assets.
5. WHERE the Séance Room stretch interface is disabled, THE House_UI SHALL expose no review mutation control.
6. WHERE the Séance Room stretch interface is enabled, THE Séance_Room SHALL consume the bounded review state and decisions defined by `room-ghosts` without changing MVP Room behavior.
7. THE House_UI SHALL keep Foyer, Study, Drafting Room, Workshop, Attic, keyboard access, screen-reader structure, Still_House, contrast, responsive layout, and Interruption_Policy independent of every stretch feature.
