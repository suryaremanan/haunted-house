# Implementation Plan: House UI and Accessibility

## Overview

Implement the final Haunted House presentation in React and TypeScript after verifying the actual upstream and host contracts. Begin with executable spikes for specs 2–5 composition, Crew theme/toast/badge hooks, and rendered reflow. Then build pure house projection, navigation, motion, Needs You, and interruption modules; extend the existing SDK seam and replay stand-in; add original SVG/CSS art; compose the approved Foyer and room panels into one accessible Mansion Shell; verify live/replay parity; and rebuild the committed ESM bundle. Do not create another workflow reducer, Ghost reducer, Door state store, approval path, chat-first screen, or MVP audio path.

## Tasks

- [ ] 1. Verify upstream, SDK, and rendered-layout contracts (MVP)
  - [x] 1.1 Build the HUI-S0 upstream composition harness
    - Create an executable characterization harness under `spikes/house-ui-upstream-contract/` that imports the implemented public seams from `mansion-lifecycle`, `seance-log-and-ghost-state`, `doors-and-guardrails`, and `room-ghosts`.
    - Prove one active-Mansion identity, one canonical GhostSnapshot source, one workflow/Door/waiting projection, one joined artifact/task projection, one replay fold, and existing exact decision callbacks; record only bounded synthetic field/type metadata in a scrubbed fixture.
    - Fail closed if an upstream module is absent, if two modules claim the same authoritative state, or if room success can appear before acknowledged terminal validation. Do not add a substitute reducer, store, approval function, or endpoint.
    - _Writes: `spikes/house-ui-upstream-contract/**`, `spikes/fixtures/house-ui-upstream-contract.json`_
    - _Requirements: 2.1, 2.2, 2.3, 2.9, 9.1, 9.2, 9.3, 9.8, 10.10_

  - [ ] 1.2 Build the HUI-S1 Crew theme, toast, and badge probe
    - Create a development-only probe under `spikes/house-ui-sdk-contract/` that runs inside an installed app page and captures the exact `useTheme`, `useNotify`, and `useNavBadge` call shapes, primitive field categories, light/dark update behavior, computed host CSS variable names, toast replacement behavior, zero/clear behavior, and unmount cleanup.
    - Add a local replay stand-in probe and prove the three hooks require no new Gateway API permission and open no replay transport.
    - Scrub secrets, tokens, absolute home paths, unrelated dashboard state, and raw stylesheets. If any required signature or cleanup behavior cannot be established, block its adapter integration rather than guessing.
    - _Writes: `spikes/house-ui-sdk-contract/**`, `spikes/fixtures/house-ui-sdk-contract.json`_
    - _Requirements: 5.4, 5.5, 8.6, 8.7, 9.5, 10.10_

  - [ ] 1.3 Build the HUI-S2 rendered reflow probe
    - Create an automated development-only harness under `spikes/house-ui-reflow/` that detects an existing repository-compatible headless browser runner or records that no runner is available.
    - When a runner is available, prove 320 CSS-pixel reflow without page horizontal overflow, 200-percent text enlargement with visible labels and controls, stable Room order across breakpoints, unclipped focus indicators, and no external art request.
    - If no runner is available, preserve the result and return to design before selecting a development-only browser dependency; do not substitute jsdom layout values for rendered evidence.
    - _Writes: `spikes/house-ui-reflow/**`, `spikes/fixtures/house-ui-reflow-contract.json`_
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 10.8_

- [x] 2. Implement pure house interaction and policy modules (MVP)
  - [x] 2.1 Implement the static room registry and arrow navigation
    - Add `app/ui/src/core/house-registry.ts` with typed Room identifiers, names, phases, MVP/stretch scope, stable Room order, fixed geometric neighbors, visible-room filtering, and total `nextRoom` behavior.
    - Keep the module free of React, DOM, Crew SDK, network, filesystem, and clock access; responsive layout must not enter navigation decisions.
    - _Writes: `app/ui/src/core/house-registry.ts`_
    - _Requirements: 1.3, 1.4, 1.5, 3.2, 3.3, 6.4_

  - [x] 2.2 Implement authoritative House projection, labels, and Needs You selection
    - Add `app/ui/src/core/house-projection.ts` against the exact HUI-S0 contract. Preserve upstream Door and Ghost enums, use `not_applicable` only for registry entities without those concepts, and disable mutation with bounded diagnostics for uncertain, corrupt, incompatible, or malformed inputs.
    - Implement `roomAccessibleName` and `selectNeedsYouItems`; deduplicate authoritative actions, include actionable failed-run recovery, exclude ambient/non-actionable blocked state, and order results by Room order then upstream action order.
    - _Writes: `app/ui/src/core/house-projection.ts`_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.8, 3.7, 3.8, 4.2, 8.7, 8.8, 8.9, 8.10_

  - [x] 2.3 Implement the pure Motion Policy
    - Add `app/ui/src/core/motion-policy.ts` with `none` and `low-frequency` as the complete output set; either Still House or reduced motion must select `none`.
    - Keep media-query observation and React state outside the core function.
    - _Writes: `app/ui/src/core/motion-policy.ts`_
    - _Requirements: 7.2, 7.3, 7.5, 7.8_

  - [x] 2.4 Implement the pure Interruption Policy
    - Add `app/ui/src/core/interruption-policy.ts` with canonical event-ID deduplication, waiting/blocked/failed eligibility, routine-event rejection, injected observation time, trailing 10-second burst state, deterministic Room-ordered Ghost grouping, latest-state summaries, event-ID evidence, and a 240-code-point copy limit.
    - Export pure reduce and flush functions; read no clock, start no timer, call no host hook, and include no tool input, artifact content, path, or raw model text in a summary.
    - _Writes: `app/ui/src/core/interruption-policy.ts`_
    - _Requirements: 4.5, 4.6, 4.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.11_

  - [x]* 2.5 Write the property test for authoritative House projection
    - Add at least 200 fast-check runs with a small independent reference mapper and the exact feature/property comment.
    - **Property 1: House projection preserves authority and fails closed**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.8**
    - _Writes: `app/ui/src/core/house-projection.property.test.ts`_

  - [x]* 2.6 Write the property test for complete room labels
    - Generate every room, Phase, Door state, Ghost state, not-applicable combination, and bounded Unicode names; assert exact labelled fields without visual implementation terms.
    - **Property 2: Every room label states the complete nonvisual model**
    - **Validates: Requirements 4.2**
    - _Writes: `app/ui/src/core/room-label.property.test.ts`_

  - [x]* 2.7 Write the property test for arrow navigation
    - Generate non-empty visible room sets, all four directions, locked/hidden Séance options, and every responsive mode; compare with the fixed reference graph for at least 200 runs.
    - **Property 3: Arrow navigation is valid, bounded, and layout-independent**
    - **Validates: Requirements 3.2, 3.3, 6.4**
    - _Writes: `app/ui/src/core/house-navigation.property.test.ts`_

  - [x]* 2.8 Write the property test for Needs You selection
    - Generate duplicate and resolved proposals, waiting items, failed runs with and without recovery, blocked non-actions, and arbitrary source order for at least 200 runs.
    - **Property 4: Needs You selection is exact, unique, and ordered**
    - **Validates: Requirements 3.7, 3.8, 8.7, 8.8, 8.9, 8.10**
    - _Writes: `app/ui/src/core/needs-you.property.test.ts`_

  - [x]* 2.9 Write the property test for Motion Policy suppression
    - Exercise the complete input truth table inside at least 200 generated/repeated cases and assert deterministic output.
    - **Property 5: Either motion preference suppresses optional motion**
    - **Validates: Requirements 7.2, 7.3, 7.5**
    - _Writes: `app/ui/src/core/motion-policy.property.test.ts`_

  - [x]* 2.10 Write the state-machine property test for Interruption Policy
    - Generate canonical and routine event sequences, duplicate IDs, multiple Ghosts, Unicode labels, summary overflow, and flush times around 9,999, 10,000, and 10,001 milliseconds for at least 200 runs; compare with an independent burst reference model.
    - **Property 6: Interruption filtering, deduplication, and burst summaries follow the reference policy**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
    - _Writes: `app/ui/src/core/interruption-policy.property.test.ts`_

- [x] 3. Extend the verified SDK seam and host effects (MVP)
  - [x] 3.1 Add HUI-S1-proven theme, notification, and badge wrappers
    - Extend only `app/ui/src/adapters/sdk.ts` and `app-sdk.d.ts` with the exact scrubbed HUI-S1 hook contracts; normalize theme values behind a local HostThemeSnapshot instead of exporting undocumented raw objects.
    - Extend `sdk-shim/index.ts` with matching no-network hook interfaces. Production replay effects are inert; test instances may record synthetic notification and badge calls.
    - Keep `sdk.ts` as the sole production importer of `@kirocrew/app-sdk` and add no manifest API permission.
    - _Writes: `app/ui/src/adapters/sdk.ts`, `app/ui/src/adapters/app-sdk.d.ts`, `app/ui/src/adapters/sdk-shim/index.ts`_
    - _Requirements: 5.4, 5.5, 8.6, 8.7, 9.5, 10.10_

  - [x] 3.2 Implement the Host Effects adapter
    - Add `app/ui/src/adapters/host-effects.ts` to map one pure summary to the HUI-S1-proven `useNotify` operation, set the host badge from `projection.needsYou.length`, clear the badge on unmount, and expose the normalized reactive theme.
    - Use one timer owned by the adapter for trailing burst flush, cancel it on unmount, keep the in-page live announcement functional when a host effect fails, and avoid unbounded retry.
    - _Writes: `app/ui/src/adapters/host-effects.ts`_
    - _Requirements: 4.4, 4.5, 8.5, 8.6, 8.7, 8.9, 9.5_

  - [x]* 3.3 Add SDK seam, shim, host-effect, and cleanup tests
    - Extend the AST import-boundary test, verify declarations/wrappers against the HUI-S1 fixture, exercise light/dark updates without shell remount, and assert exact toast/badge calls, failure containment, timer cleanup, badge clearing, and zero replay transport.
    - _Writes: `app/ui/src/adapters/sdk-boundary.test.ts`, `app/ui/src/adapters/sdk-shim/index.test.ts`, `app/ui/src/adapters/host-effects.test.tsx`_
    - _Requirements: 4.4, 4.5, 5.4, 8.6, 8.7, 8.9, 9.5, 10.10_

- [x] 4. Build the original visual system (MVP)
  - [x] 4.1 Implement semantic fallback palettes and inline house CSS
    - Add `app/ui/src/components/house-palette.ts` with light/dark fallback tokens and the complete 4.5:1 text and 3:1 component/focus contrast-pair matrix.
    - Add `app/ui/src/components/house-styles.ts` with HUI-S1-verified Crew variables, fallbacks, wide/compact/linear layouts, long-content wrapping, visible focus rules, state shape/border cues, and motion gated by both `data-motion` and `prefers-reduced-motion`.
    - Keep every optional animation cycle at least two seconds; add no parallax, pointer tracking, perspective movement, shake, or rapid flash; emit no required standalone CSS artifact.
    - _Writes: `app/ui/src/components/house-palette.ts`, `app/ui/src/components/house-styles.ts`_
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.1, 6.2, 6.3, 6.5, 6.6, 7.2, 7.3, 7.5, 7.6, 7.7_

  - [x] 4.2 Create original decorative house, room, Door, and Ghost SVG
    - Add repository-authored inline SVG primitives in `app/ui/src/components/house-art.tsx` for the cutaway frame, roof, floors, stairs, Foyer, Study, Drafting Room, Workshop, Attic, optional Séance Room, friendly Ghost silhouettes/poses, Doors, candles, dust, and furniture.
    - Mark all art `aria-hidden="true"` and `focusable="false"`; use no SVG image, external use, script, animation element, raster data URI, remote URL, copied character, gore, jump scare, audio, or copyrighted mark.
    - _Writes: `app/ui/src/components/house-art.tsx`_
    - _Requirements: 1.3, 1.4, 1.5, 2.5, 2.6, 2.7, 5.1, 5.2, 5.3, 5.8_

  - [x]* 4.3 Add palette, CSS, art-origin, and prohibited-feature tests
    - Calculate every fallback contrast pair using WCAG relative luminance; inspect CSS for required breakpoints, wrapping/focus/motion gates and forbidden effects; inspect SVG/source/bundle inputs for inaccessible or external art and all MVP audio APIs/assets.
    - Assert no Tailwind dependency, directive, or runtime import and no required separate stylesheet.
    - _Writes: `app/ui/src/components/house-palette.test.ts`, `app/ui/src/components/house-styles.test.ts`, `app/ui/src/components/house-art.test.tsx`_
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7, 5.8, 5.9, 6.1, 6.2, 6.6, 7.5, 7.6, 7.7, 8.11, 10.7, 10.8, 11.1_

- [x] 5. Implement the accessible Mansion Shell and House Map (MVP)
  - [x] 5.1 Implement the House Map and separate room, Ghost, and Door controls
    - Add `HouseMap.tsx` and `RoomHotspots.tsx` as one `nav` landmark with one ordered list in Room order. Render native non-nested controls for each Room and applicable Ghost/Door, fixed visible/accessibility state copy, and original decorative art.
    - Implement arrow behavior only on Room controls through `nextRoom`; preserve ordinary Tab order for Room, Ghost, Door, and decision controls; use `aria-disabled` for focusable explanatory locked/unavailable surfaces.
    - _Writes: `app/ui/src/components/HouseMap.tsx`, `app/ui/src/components/RoomHotspots.tsx`_
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.9, 3.10, 4.1, 4.2, 4.3, 5.3, 5.8, 6.4_

  - [x] 5.2 Implement the toolbar, Still House, and Needs You shortcut
    - Add `HouseToolbar.tsx` with active Mansion identity, visible Needs You count, first-target open/focus behavior, zero-count no-op state, labelled Still House toggle, reactive reduced-motion observation, and compact system-status disclosure.
    - Derive motion only through Motion Policy and Needs You only through House projection; do not persist the toggle or create state authority.
    - _Writes: `app/ui/src/components/HouseToolbar.tsx`, `app/ui/src/components/use-reduced-motion.ts`_
    - _Requirements: 3.7, 3.8, 3.9, 5.4, 7.1, 7.2, 7.3, 7.4, 7.8, 8.7, 8.9_

  - [x] 5.3 Implement panel hosting, nested focus restoration, and the one live announcer
    - Add `RoomPanelHost.tsx` with labelled dialog/region modes, one surface stack, opener refs plus stable opener keys, Enter/open behavior, Escape close behavior, nested restoration, stale-opener fallback, and closed-content removal.
    - Add `LiveAnnouncer.tsx` as the only shell live region. Move active-Mansion foundation status announcements through the shared announcer and prohibit live-region roles inside room modules.
    - _Writes: `app/ui/src/components/RoomPanelHost.tsx`, `app/ui/src/components/LiveAnnouncer.tsx`_
    - _Requirements: 1.6, 3.4, 3.5, 3.6, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 5.4 Compose the Mansion Shell as the primary open-Mansion surface
    - Add `MansionShell.tsx` with House styles, toolbar, House Map, panel host, one announcer, host effects, motion state, and semantic main structure. Place the spatial map before room detail, status feeds, and Session Links.
    - Accept only HouseProjection and typed upstream callbacks; expose no generic approval, raw path, chat composer, parallel state reducer, or second live region.
    - _Writes: `app/ui/src/components/MansionShell.tsx`_
    - _Requirements: 1.2, 1.9, 1.10, 2.9, 2.10, 4.4, 6.4, 7.8, 8.6, 8.7_

  - [x]* 5.5 Add House Map semantics, state-cue, and keyboard tests
    - Cover exact Room order; hidden/locked/enabled Séance variants; every Door/Ghost state; text plus icon/pose/shape; one navigation list; complete accessible labels; hidden art; Tab; all Arrow directions; Enter; disabled reasons; and zero mutation calls from viewing.
    - _Writes: `app/ui/src/components/HouseMap.test.tsx`, `app/ui/src/components/RoomHotspots.test.tsx`_
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.5, 2.6, 2.7, 2.8, 2.10, 3.1, 3.2, 3.3, 3.4, 3.9, 3.10, 4.1, 4.2, 4.3_

  - [x]* 5.6 Add panel, toolbar, focus, motion, and announcer tests
    - Cover panel/dialog semantics, open focus, room and nested Escape restoration, opener replacement, closed accessibility tree, Needs You first/zero behavior, Still House, runtime matchMedia changes without remount, one live region, ambient preservation, identical toast/live summary, and timer cleanup.
    - _Writes: `app/ui/src/components/MansionShell.test.tsx`, `app/ui/src/components/RoomPanelHost.test.tsx`, `app/ui/src/components/HouseToolbar.test.tsx`, `app/ui/src/components/LiveAnnouncer.test.tsx`_
    - _Requirements: 3.5, 3.6, 3.7, 3.8, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 7.1, 7.2, 7.3, 7.4, 7.8, 8.6, 8.7, 8.9_

- [x] 6. Compose approved Room panels into the house (MVP)
  - [x] 6.1 Integrate the active-Mansion Foyer panel
    - Add the in-house Foyer panel adapter around the approved mansion-lifecycle Foyer/Mansion Shell seam. Show active Mansion and Project Spec identity and route Return through the existing Foyer action with focus restoration.
    - Keep the pre-Mansion Foyer implementation authoritative; add no create/list/open reducer here.
    - _Writes: `app/ui/src/rooms/foyer/ActiveMansionFoyerPanel.tsx`_
    - _Requirements: 1.1, 1.7, 2.1, 2.9, 9.8_

  - [x] 6.2 Integrate Study and Drafting Room artifact-first panels
    - Add thin composition modules that place approved requirements/design artifacts, state, authority, findings, and actions before secondary Session Links and reuse exact existing Door/approval callbacks.
    - Add no inline composer, duplicate revision state, generic approval callback, or new live region.
    - _Writes: `app/ui/src/rooms/study/StudyHousePanel.tsx`, `app/ui/src/rooms/drafting-room/DraftingHousePanel.tsx`_
    - _Requirements: 1.9, 1.10, 2.1, 2.2, 2.3, 2.9, 2.10, 4.7_

  - [x] 6.3 Integrate the Workshop task and implementation panel
    - Compose the approved task board, Foreman/Tinker projections, queue/claim state, exact Door and recovery controls, allowed scope, and secondary Session Links behind one Workshop room surface.
    - Preserve the upstream three-Tinker limit and task authority; add no scheduler or task-state store.
    - _Writes: `app/ui/src/rooms/workshop/WorkshopHousePanel.tsx`_
    - _Requirements: 1.9, 1.10, 2.1, 2.2, 2.3, 2.9, 2.10_

  - [x] 6.4 Implement the Attic canonical replay panel
    - Add `AtticPanel.tsx` using only the approved canonical replay projection: valid record count, current replay-derived history, and safe integrity diagnostic with valid-prefix behavior.
    - Keep search, filtering, export, and rich timeline controls absent from MVP; never request live data as replay fallback.
    - _Writes: `app/ui/src/rooms/attic/AtticPanel.tsx`_
    - _Requirements: 1.8, 2.1, 9.2, 9.7_

  - [x] 6.5 Implement locked and enabled Séance Room composition
    - Add `LockedSeancePanel.tsx` with plain stretch copy and no mutation. Add `SeanceHousePanel.tsx` as a typed composition over the approved bounded review projection, activated only by the build-time stretch setting.
    - Keep the locked Room focusable for explanation, preserve Room order, and add no independent review state or automatic return action.
    - _Writes: `app/ui/src/rooms/seance-room/LockedSeancePanel.tsx`, `app/ui/src/rooms/seance-room/SeanceHousePanel.tsx`_
    - _Requirements: 1.4, 1.5, 2.1, 2.9, 11.5, 11.6, 11.7_

  - [x]* 6.6 Add room-composition DOM and authority tests
    - Render every room with representative ready, working, waiting, blocked, failed, done, uncertain, corrupt, and replay states. Assert artifact-first order, exact active Mansion identity, valid-prefix Attic diagnostic, secondary Session Links, no composer/live region duplication, and zero decisions from view/open/close.
    - Exercise existing exact phase, Door, tool, recovery, and return callbacks only through their visible controls.
    - _Writes: `app/ui/src/rooms/house-panels.test.tsx`_
    - _Requirements: 1.7, 1.8, 1.9, 1.10, 2.4, 2.9, 2.10, 4.4, 9.6, 9.7, 11.5, 11.6_

- [x] 7. Wire live and replay application flows (MVP)
  - [x] 7.1 Replace the open-Mansion placeholder with House UI
    - Update `App.tsx` to retain the foundation backend/gateway loading, error, Retry, and single-live-region behavior; mount the approved Foyer before Mansion entry and MansionShell after a validated open result.
    - Add the HUI-S0-backed House Projection adapter in `app/ui/src/adapters/house-projection.ts`; subscribe only to acknowledged upstream projections and preserve the same default root component.
    - _Writes: `app/ui/src/App.tsx`, `app/ui/src/adapters/house-projection.ts`_
    - _Requirements: 1.1, 1.2, 2.1, 2.4, 9.1, 9.8_

  - [x] 7.2 Extend canonical replay composition for the complete house
    - Extend `sdk-shim` and add `app/ui/src/adapters/house-replay.ts` so the canonical scrubbed fixture supplies Mansion, workflow, Ghost, room, and Attic projections through the same House Projection function and components.
    - Disable mutation and Session Links with visible read-only copy; keep fixture fetch as the sole request and create no Gateway/backend fallback.
    - _Writes: `app/ui/src/adapters/sdk-shim/index.ts`, `app/ui/src/adapters/house-replay.ts`_
    - _Requirements: 8.11, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 7.3 Wire interruption and badge effects at the shell level
    - Connect acknowledged canonical Ghost transitions to Interruption Policy, manage the one resettable flush timer through Host Effects, update the one Live Announcer with the exact summary, and update the host badge immediately from current Needs You items.
    - Start no timer or effect for idle, working, done, routine progress, streaming chunks, or tool activity; clear timer and badge on unmount.
    - _Writes: `app/ui/src/components/MansionShell.tsx`, `app/ui/src/adapters/host-effects.ts`_
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11_

  - [x]* 7.4 Add live/replay projection and transport-parity tests
    - Extend the foundation replay DOM harness to render the same root, Foyer, Mansion Shell, House Map, controls, panels, and Attic from equivalent acknowledged live records and the canonical fixture; compare Room order, state text, labels, Needs You count, and diagnostic output.
    - Throw on WebSocket, XMLHttpRequest, EventSource, and every replay fetch except `./fixture.jsonl`; hold live acknowledgments and prove unacknowledged data cannot update House UI.
    - _Writes: `app/ui/src/replay.test.tsx`, `app/ui/src/house-live-replay.test.tsx`_
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 10.9_

  - [x]* 7.5 Add interruption, badge, and ambient-state DOM tests
    - Drive canonical transitions through the integrated shell with fake timers. Assert one merged Host toast and one identical live announcement per burst, duplicate suppression, no ambient effects, actionable-only badge counts, immediate resolution removal, non-actionable blocked exclusion, and unmount cleanup.
    - _Writes: `app/ui/src/house-interruptions.test.tsx`_
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 10.4_

- [ ] 8. Complete automated accessibility and reflow verification (MVP)
  - [x]* 8.1 Add automated accessibility-rule coverage
    - Add `axe-core` as a development-only dependency and an `house-accessibility.test.tsx` fixture matrix for every major Room, Door, Ghost, panel, light/dark, locked, unavailable, read-only, and reduced-motion state.
    - Assert zero applicable violations, exactly one live region, labelled native controls, valid landmark/list/dialog structure, no nested controls, no duplicate IDs, and no hidden focusable art.
    - _Writes: `app/ui/package.json`, `app/ui/bun.lock`, `app/ui/src/house-accessibility.test.tsx`, `app/ui/src/house-accessibility.axe.test.tsx`, `app/ui/src/test/axe-audit.ts`_
    - _Requirements: 3.1, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.8, 4.9, 10.4, 10.6_
    - _Done: axe-core 4.14 (dev only) runs over the Foyer, the shell fixture matrix (every room, Door and ghost state, light and dark, locked, hidden, unavailable, read-only, reduced motion, Still House, dialog), the House with each room, Door, ghost and risky-action panel and the Attic open, and the static replay entry; zero violations. Layout and colour rules are off in jsdom (`test/axe-audit.ts`). Fixed: document headings deeper than level 6 (`aria-level` 7+) are capped at 6._

  - [x]* 8.2 Add the complete keyboard and focus matrix
    - Add one DOM suite that tabs through all interactive room, Ghost, Door, panel, and decision controls in reading order; exercises every Arrow edge/no-edge, Enter, room Escape, nested Escape, stale opener fallback, Needs You first target, and zero-target no-op.
    - Run the matrix with motion enabled, Still House, and reduced motion to prove keyboard behavior has no animation dependency.
    - _Writes: `app/ui/src/house-keyboard.test.tsx`_
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 7.8, 10.5_

  - [ ]* 8.3 Implement HUI-S2 browser reflow acceptance tests
    - Use only the development-only runner proven by HUI-S2. Test 320 CSS-pixel overflow, 200-percent text, wide/compact/linear transitions, stable semantic order, visible decision controls, unclipped focus indicators, and no external asset request.
    - Keep browser tooling outside the shipped bundle and fail rather than skip required reflow cases in CI.
    - _Writes: `app/ui/browser-tests/house-reflow.test.ts`, `app/ui/browser-tests/browser-test.config.ts`_
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.8_

  - [x]* 8.4 Add source, CSS, bundle, and MVP-scope regression tests
    - Add static checks for original inline art constraints, plain CSS, fallback contrast, no standalone required stylesheet, no remote art, no prohibited motion, no sound API/assets/controls, no primary composer, and no review mutation when stretch is disabled.
    - Assert the app manifest gains no API path from this feature and the built module keeps only approved host bare imports.
    - _Writes: `app/ui/scripts-tests/check-house-ui-contract.test.ts`_
    - _Requirements: 1.10, 5.1, 5.2, 5.6, 5.7, 5.9, 7.5, 7.6, 7.7, 8.11, 10.7, 10.8, 11.1, 11.5, 11.7_

- [ ] 9. Add isolated stretch interfaces (stretch)
  - [x]* 9.1 Wire the enabled Séance Room to the bounded review projection
    - Behind the existing disabled-by-default build setting, connect `SeanceHousePanel` to the approved `room-ghosts` review projection and exact decision callbacks. Keep all MVP room projections, order, keyboard behavior, motion, and interruption policy unchanged.
    - _Writes: `app/ui/src/rooms/seance-room/SeanceHousePanel.tsx`, `app/ui/src/components/MansionShell.tsx`_
    - _Requirements: 1.5, 11.5, 11.6, 11.7_

  - [x]* 9.2 Implement opt-in stretch sound without an MVP audio path
    - Done differently, at the owner's request (Nov 16): sound is synthesised with the Web Audio API, so there are no assets to allowlist. It lives in `app/ui/src/adapters/house-sound.ts`, `core/sound-cues.ts` and `components/use-house-sound.ts`, is off on every visit, and creates no audio resource before the Operator presses Sound.
    - Add an isolated `sound-feature.ts` module only in a stretch entry that initializes off for each browser session, creates no audio resource before explicit Operator activation, accepts only assets present in an approved machine-readable original/CC0 provenance allowlist, and never changes visual/live interruption eligibility.
    - Leave the module and all audio assets absent from the default MVP import graph and bundle.
    - _Writes: `app/ui/src/stretch/sound-feature.ts`, `app/ui/src/stretch/sound-assets.ts`_
    - _Requirements: 8.11, 11.1, 11.2, 11.3, 11.4, 11.7_

  - [x]* 9.3 Add stretch sound isolation and consent tests
    - Covered by `core/sound-cues.test.ts`, `components/use-house-sound.test.tsx`, the UI contract tests and `scripts/tests/test_asset_contract.py`.
    - Assert a new session is off, no Audio/AudioContext/load/play occurs before explicit activation, only allowlisted provenance entries can load, interruptions remain silent while off, and the default MVP module graph contains no sound module or asset.
    - _Writes: `app/ui/src/stretch/sound-feature.test.ts`_
    - _Requirements: 8.11, 11.1, 11.2, 11.3, 11.4, 11.7_

  - [x]* 9.4 Add enabled/disabled Séance Room isolation tests
    - Compare the same MVP fixture with stretch disabled, locked, and enabled. Assert only the Séance surface changes; disabled mode has no review mutation, enabled mode delegates to upstream bounded review, and no setting changes other room states or controls.
    - _Writes: `app/ui/src/rooms/seance-room/SeanceHousePanel.test.tsx`_
    - _Requirements: 1.4, 1.5, 11.5, 11.6, 11.7_

- [x] 10. Produce the installable live and replay artifacts (MVP)
  - [x] 10.1 Run all checks and rebuild the committed ESM bundle
    - Run UI unit, property, DOM, accessibility, keyboard, reflow, live/replay, source-contract, and SDK-boundary tests in non-watch mode; run TypeScript checking, the Python regression suite, manifest checks, secret/home-path scans, and `.kiro` tracking checks. Return any failure to the task that owns the affected source before continuing.
    - Build `app/ui/dist/index.mjs`, run the host-module import check, build replay output, verify a second build leaves the committed live bundle unchanged, and verify the MVP bundle contains no sound path, remote art, Tailwind, extra SDK importer, or unapproved API path.
    - Preserve foundation plus specs 2–5 behavior and make no source change from this bundle-only task.
    - _Writes: `app/ui/dist/**`_
    - _Requirements: 1.1, 1.2, 1.3, 1.10, 2.9, 4.4, 5.1, 5.2, 5.9, 7.8, 8.11, 9.3, 9.4, 9.5, 9.8, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 11.1, 11.5, 11.7_

- [ ] 11. Checkpoint: verify pure policy and host contracts
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Final checkpoint: verify the complete accessible house
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` follow Kiro's optional test/stretch task convention. The six property tests, accessibility checks, keyboard checks, and reflow evidence remain required before Requirements 6 and 10 or the complete MVP can be claimed.
- Every property test runs at least 200 cases and includes `Feature: house-ui-and-accessibility, Property N: <property title>`.
- HUI-S0 is a hard composition gate. This feature consumes upstream public projections and callbacks; it does not repair a missing upstream feature by adding duplicate state or authority.
- HUI-S1 is a hard gate for `useTheme`, `useNotify`, and `useNavBadge`. `kiro-docs/crew__apps__sdk.md` names those hooks but does not define the operational details needed for safe toast merging and cleanup.
- HUI-S2 is a hard gate for claiming 320-pixel reflow and 200-percent text behavior. jsdom layout values are not accepted as rendered evidence.
- The SDK facts used by this plan are documented in `kiro-docs/crew__apps__sdk.md`; app loading and enforced API-scope facts are documented in `kiro-docs/crew__apps.md` and `kiro-docs/crew__apps__manifest.md`. Verified discrepancies and runtime behavior remain recorded in `.kiro/steering/tech.md`.
- Tasks add no backend route, manifest API path, workflow reducer, Ghost reducer, Door store, approval matcher, chat composer, Tailwind dependency, remote art, or MVP audio import.
- Original house/Ghost SVG and functional HTML controls remain separate. State always has exact text plus icon, pose, shape, or border treatment.
- No task commits, pushes, deploys, changes Crew trust, changes security settings, or modifies a Mansion project.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.2", "1.3"]
    },
    {
      "id": 1,
      "tasks": ["2.1", "2.3", "2.4", "3.1", "4.1", "4.2"]
    },
    {
      "id": 2,
      "tasks": ["2.2", "2.7", "2.9", "2.10", "3.2", "4.3", "5.1", "5.2", "5.3"]
    },
    {
      "id": 3,
      "tasks": ["2.5", "2.6", "2.8", "3.3", "5.4", "5.5", "5.6", "6.1", "6.2", "6.3", "6.4", "6.5"]
    },
    {
      "id": 4,
      "tasks": ["6.6", "7.1", "7.2", "8.1", "8.2", "9.1", "9.2"]
    },
    {
      "id": 5,
      "tasks": ["7.3", "7.4", "7.5", "8.3", "8.4", "9.3", "9.4"]
    },
    {
      "id": 6,
      "tasks": ["10.1"]
    }
  ]
}
```
