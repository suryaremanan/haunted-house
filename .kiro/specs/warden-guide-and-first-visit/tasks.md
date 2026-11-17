# Implementation Plan: Warden Guide and First Visit

## Overview

Replace the Caretaker with the Warden and add the first visit, in React and TypeScript, without touching the backend, the manifest, the permission freeze or any workflow rule. Start by committing the room-first stage this builds on and by changing the steering Tone. Then build the pure core (the Word Book, the guide view, the stage layout, the first-visit helpers and the built view) with one fast-check test per correctness property. Then draw the Warden, give him his balloon, and make every option press an existing control. Then add Reveal, the Gate, the Idea Step, the remaining room rhythm and the Built Page. Finish with the walk, parity and accessibility tests, the rendered layout evidence, the rebuilt bundle and the documents.

The guide adds no reducer, command, approval path, endpoint, live region, toast, badge, sound, timer, storage use or dependency.

## Tasks

- [x] 1. Set the baseline and align steering (MVP)
  - [x] 1.1 Commit the room-first stage this feature builds on
    - Run `scripts/check-release.sh` on the working tree. When it exits 0, commit the walk-in room, the painted rooms, the synthesised sound and their tests as one commit. Change no source in this task.
    - _Writes: none (a commit of the existing working tree)_
    - _Requirements: 14.9_

  - [x] 1.2 Change the Tone and the documents that quote it
    - Set the Tone of `.kiro/steering/theme-and-accessibility.md` to "Menacing, never harmful" with the wording in the design, and add "Adult and exact. No baby talk." to Copy.
    - Add the Warden row to the metaphor table of `.kiro/steering/product.md`: a drawing, not an agent, with no authority.
    - Add dated change notes to `house-ui-and-accessibility/requirements.md` on 1.1 (the Gate precedes the Foyer on a first visit) and on Requirement 5 (tone), in the form already used there. Update the tone line of `docs/assets-checklist.md`.
    - _Writes: `.kiro/steering/theme-and-accessibility.md`, `.kiro/steering/product.md`, `.kiro/specs/house-ui-and-accessibility/requirements.md`, `docs/assets-checklist.md`_
    - _Requirements: 1.12, 1.13, 14.10_

- [x] 2. Write the Word Book (MVP)
  - [x] 2.1 Implement the dictionary module
    - Add `app/ui/src/core/house-words.ts` with the eleven terms of the design: plain word, Kiro word, exactly two sentences, and the Kiro file where one exists. Export `word(id, mode)`, `term(id)` and `TERMS`.
    - Keep it free of React, DOM, Crew SDK, network, filesystem, storage, timer and clock.
    - _Writes: `app/ui/src/core/house-words.ts`_
    - _Requirements: 7.1, 7.2, 7.3, 7.9_

  - [x]* 2.2 Write the property test for plain and Kiro words
    - At least 200 fast-check runs over every term and both modes, and over generated House Projections read by `guideView` with Kiro's words off (no Kiro word as a whole word in composed text) and on (each named term carries its Kiro word).
    - **Property 5: Plain words by default, Kiro's words on request**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
    - _Writes: `app/ui/src/core/house-words.property.test.ts`_

  - [x]* 2.3 Tie the Kiro words to the real controls
    - Assert each Kiro word equals the upstream word that owns it (`PHASE_NAMES`, the Approve and Reject names, the revision label) and each `file` equals the phase document name.
    - _Writes: `app/ui/src/core/house-words.test.ts`_
    - _Requirements: 7.9, 7.10_

- [x] 3. Build the guide as a pure reading of the house (MVP)
  - [x] 3.1 Extend the guide module
    - Extend `app/ui/src/core/house-guide.ts` with `guideView`, `wardenPose` and `landingRoom`; keep the precedence of `guideText` exactly. Write every sentence as a template with Word Book slots; compose the door sentence here and quote the upstream risky-action and tool-prompt sentences unchanged.
    - Produce options as press plans (`map`, `control`, `fill`, `every`, `shell`) following the option table of the design: at most four Primary Options, the full list, the approved verbs, a consequence for each, bounded lengths, the ready-made change requests, and no `start`, `decide` or `ask` option where the room's mutation is off or the house is a recording.
    - Offer a `decide` option only when the open surface shows that decision.
    - _Writes: `app/ui/src/core/house-guide.ts`_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 4.2, 4.3, 4.6, 4.8, 4.9, 6.5, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 11.9, 11.10, 11.11, 11.12, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 13.1, 13.2_

  - [x] 3.2 Implement the stage layout table
    - Add `app/ui/src/core/guide-layout.ts` with the press areas now inline in `RoomStage.tsx`, the ghost slots, `GUIDE_RESERVE`, the ghost and Warden size constants, and `workingObjects`.
    - _Writes: `app/ui/src/core/guide-layout.ts`_
    - _Requirements: 1.6, 5.6, 5.7, 8.4, 8.8_

  - [x] 3.3 Add the new core modules to the purity check
    - Extend `HOUSE_UI_CORE` in `app/ui/scripts-tests/house-ui-upstream-contract.test.ts` with `house-guide.ts`, `house-words.ts`, `guide-layout.ts`, `first-visit.ts` and `house-built.ts`.
    - _Writes: `app/ui/scripts-tests/house-ui-upstream-contract.test.ts`_
    - _Requirements: 14.4_

  - [x]* 3.4 Write the property test for the balloon grammar
    - **Property 1: The balloon grammar is total and bounded**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9, 3.11**
    - _Writes: `app/ui/src/core/house-guide-grammar.property.test.ts`_

  - [x]* 3.5 Write the property test for precedence and pose
    - Compare with a reference table written independently of the module.
    - **Property 2: The most pressing thing comes first, in words and in pose**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3.2, 11.3, 12.1, 12.4, 12.5**
    - _Writes: `app/ui/src/core/house-guide-order.property.test.ts`_

  - [x]* 3.6 Write the property test for authority
    - Generate every integrity value, read-only, locked and replay houses, every open surface, and pending and resolved items.
    - **Property 3: The guide never offers more than the house allows**
    - **Validates: Requirements 4.2, 4.3, 4.6, 4.8, 6.5, 11.2, 11.4, 11.5, 11.9, 11.10, 11.11, 12.2, 12.3**
    - _Writes: `app/ui/src/core/house-guide-authority.property.test.ts`_

  - [x]* 3.7 Write the property test for live and replay parity
    - Build the House Projection twice from the upstream arbitraries of `test/workflow-arbitraries.ts`.
    - **Property 4: Live and replay say the same thing**
    - **Validates: Requirements 3.10, 14.1, 14.2**
    - _Writes: `app/ui/src/core/house-guide-parity.property.test.ts`_

  - [x]* 3.8 Write the property test for the stage layout
    - **Property 10: The guide never covers a working object**
    - **Validates: Requirements 1.6, 5.6, 5.7, 8.4**
    - _Writes: `app/ui/src/core/guide-layout.property.test.ts`_

  - [x]* 3.9 Write the property test for the landing room
    - **Property 9: The landing room is where the work is**
    - **Validates: Requirements 10.8, 11.1**
    - _Writes: `app/ui/src/core/landing-room.property.test.ts`_

  - [x]* 3.10 Write the example tests of the guide
    - One readable vector per row of the status and option tables. Assert the start option is offered exactly when `startView` offers an enabled start with no command in flight. Assert the verb and banned-phrase lists.
    - _Writes: `app/ui/src/core/house-guide.test.ts`_
    - _Requirements: 3.2, 3.4, 3.9, 11.2, 11.4, 11.5, 12.1_

- [x] 4. Model the first visit and the built page (MVP)
  - [x] 4.1 Implement the first-visit helpers
    - Add `app/ui/src/core/first-visit.ts`: `visitReducer`, `visitorName`, `greeting`, `mansionNameFromIdea`, `EXAMPLE_IDEAS` and `hallGuide`. The reducer starts no request; only `mansion_opened` reaches the mansion.
    - _Writes: `app/ui/src/core/first-visit.ts`_
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 9.9, 9.10, 10.1, 10.4, 10.10, 10.11, 10.12_

  - [x] 4.2 Implement the built view
    - Add `app/ui/src/core/house-built.ts` with `builtView`: a row only for a phase whose door is open, in phase order, with the Word Book's words and the real path; finished tasks only; the folder; the fixed steps; the replay sentence.
    - _Writes: `app/ui/src/core/house-built.ts`_
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.8, 13.9_

  - [x]* 4.3 Write the property test for the visitor's name
    - **Property 6: A visitor's name is bounded and inert**
    - **Validates: Requirements 9.4, 9.5, 9.6**
    - _Writes: `app/ui/src/core/visitor-name.property.test.ts`_

  - [x]* 4.4 Write the property test for the mansion name of an idea
    - **Property 7: Every idea yields a new, valid mansion name**
    - **Validates: Requirements 10.4**
    - _Writes: `app/ui/src/core/idea-name.property.test.ts`_

  - [x]* 4.5 Write the property test for the visit
    - Event sequences up to 40 long, live and replay.
    - **Property 8: The visit never moves without a press**
    - **Validates: Requirements 9.1, 9.3, 9.9, 9.10**
    - _Writes: `app/ui/src/core/visit-flow.property.test.ts`_

  - [x]* 4.6 Write the property test for the built view
    - **Property 11: The built page lists exactly what was approved**
    - **Validates: Requirements 13.2, 13.3, 13.4, 13.8, 13.9**
    - _Writes: `app/ui/src/core/house-built.property.test.ts`_

  - [x]* 4.7 Write the example tests of the first visit
    - The three example ideas are valid briefs with valid names; greeting vectors; hall guide vectors for a first-time visitor, a returning visitor and the Replay Build.
    - _Writes: `app/ui/src/core/first-visit.test.ts`_
    - _Requirements: 9.6, 10.1, 10.10, 10.11_

- [x] 5. Checkpoint: the core says the right things
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Draw the Warden (MVP)
  - [x] 6.1 Replace the Caretaker art
    - Add `WardenArt` with its five poses to `app/ui/src/components/room-paint.tsx` and remove `CaretakerArt`. Use the scene palette classes only; add any new scene token to both palettes in `house-palette.ts`.
    - In the style sheets, size the Warden from `WARDEN_WIDTH` of `core/guide-layout.ts`, give him no animation and no transition, and remove the Caretaker's loop, his stand and his text.
    - _Writes: `app/ui/src/components/room-paint.tsx`, `app/ui/src/components/room-paint-styles.ts`, `app/ui/src/components/house-palette.ts`, `app/ui/src/components/house-stage-styles.ts`, `app/ui/src/components/house-stage-art.tsx`, `app/ui/src/core/house-guide.ts`_
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 1.10, 1.11, 1.12, 1.13_

  - [x]* 6.2 Add art and style contract tests
    - Five distinct poses; hidden from assistive technology; no image, external use, script, animation element or raster data; palette classes only; no animation and no transition on the Warden; the width equals the layout constant; no Caretaker name is left in source.
    - _Writes: `app/ui/src/components/warden-art.test.tsx`_
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.7, 1.9, 1.10, 1.11_

- [x] 7. Give the Warden his balloon (MVP)
  - [x] 7.1 Mark the real controls
    - Add a `data-guide-control` attribute to the existing start, approve, reject, revision, task, retry and playback controls. Change no label, name, handler or order.
    - _Writes: `app/ui/src/rooms/house/RoomPanel.tsx`, `app/ui/src/rooms/house/DecisionButtons.tsx`, `app/ui/src/rooms/house/DoorPanel.tsx`, `app/ui/src/rooms/house/RiskyActionPanel.tsx`, `app/ui/src/rooms/house/RevisionRequest.tsx`, `app/ui/src/rooms/workshop/WorkshopTaskBoard.tsx`, `app/ui/src/components/RunRecoveryControls.tsx`, `app/ui/src/rooms/attic/ReplayBar.tsx`, `app/ui/src/rooms/attic/ReplayControls.tsx`_
    - _Requirements: 4.1, 7.10_

  - [x] 7.2 Implement the balloon and the press runner
    - Add `app/ui/src/components/GuideBalloon.tsx`: status line (focusable), "What is this?" per named term, the question, the Primary Options with their consequence as description, "Something else…" with the full list and the Word Book, and "Step back". Every option carries `data-guide-option`.
    - Add `app/ui/src/components/use-guide-press.ts`: run a press plan one press per commit; stop at a missing or disabled control and report the room's reason; drop a plan when the projection changes. Import no adapter and build no command.
    - _Writes: `app/ui/src/components/GuideBalloon.tsx`, `app/ui/src/components/use-guide-press.ts`_
    - _Requirements: 3.1, 3.5, 3.6, 4.1, 4.2, 4.4, 4.5, 4.7, 4.9, 5.1, 5.5, 5.9, 7.5, 7.7, 7.8_

  - [x] 7.3 Put the Warden on the stage
    - In `RoomStage.tsx`, render the Warden, his pose label, the balloon and the guide's settings group ("House map", "Show Kiro's words", "Show me what I can press", each with `aria-pressed`) in the apron; read press areas from `core/guide-layout.ts`; show "Call the Warden" in the stepped-back pose.
    - In `MansionShell.tsx`, take the guide settings from the page, use `landingRoom` for the room on show, pass the open surface and the task in hand to `guideView`, move focus to the status line when the options change, and say a changed setting once through the one live region.
    - Hold the three guide settings in `App.tsx` and pass them through `rooms/house/House.tsx`.
    - Add `stageFit` to `core/guide-layout.ts` and `components/use-stage-metrics.ts`: measure the page above the room and the toolbar's height for the style sheet, and take the wide layout that gives the larger room. Lay the open sheet and the house map under the toolbar and clear of the Guide Reserve.
    - _Writes: `app/ui/src/components/RoomStage.tsx`, `app/ui/src/components/MansionShell.tsx`, `app/ui/src/components/use-stage-metrics.ts`, `app/ui/src/components/house-stage-styles.ts`, `app/ui/src/core/guide-layout.ts`, `app/ui/src/rooms/house/House.tsx`, `app/ui/src/App.tsx`_
    - _Requirements: 1.1, 1.6, 1.8, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.7, 6.8, 6.9, 7.6, 7.11, 11.1_

  - [x]* 7.4 Add balloon tests and rewrite the Caretaker's
    - Add `guide-balloon.test.tsx` for the order of the five parts, descriptions, in-place disclosures, Kiro's words, "Step back" and "Call the Warden", and focus after the list changes.
    - Add `guide-shell.test.tsx` for the press runner in the shell (real controls pressed, decision focus, refusals, one press per commit), Quiet Mode, the settings and the Escape order, and `stage-layout.test.tsx` for the measuring hook and the sheet facts.
    - Rewrite the Caretaker assertions in the files below for the Warden. Keep every assertion about map controls, focus return, parity and authority.
    - _Writes: `app/ui/src/components/guide-balloon.test.tsx`, `app/ui/src/components/guide-shell.test.tsx`, `app/ui/src/components/stage-layout.test.tsx`, `app/ui/src/components/house-stage.test.tsx`, `app/ui/src/house-keyboard.test.tsx`, `app/ui/src/replay-foyer.test.tsx`, `app/ui/src/test/shell-kit.tsx`_
    - _Requirements: 3.1, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 6.7, 6.8, 7.6, 7.7, 14.9_

  - [x]* 7.5 Extend the interruption tests
    - A changing balloon leaves the live region as it was; the guide calls no toast, badge or sound; one live region in a mansion; Quiet Mode changes no summary; the guide starts no timer.
    - _Writes: `app/ui/src/house-interruptions.test.tsx`_
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.9, 6.6_

  - [x]* 7.6 Write the property test for the stage fit
    - **Property 12: The stage fits its window**
    - **Validates: Requirements 5.6, 5.8**
    - _Writes: `app/ui/src/core/stage-fit.property.test.ts`_

- [x] 8. Reveal what can be pressed (MVP)
  - [x] 8.1 Implement the object labels, the key and the Escape order
    - Add `app/ui/src/components/ObjectLabels.tsx`: nothing with Reveal Mode off; with it on, one button per working object in reading order, with visible text, a full accessible name and the object's own press plan.
    - Toggle on `?` unless the event target is an input, a textarea or editable content. Escape closes the top surface, then the map sheet, then Reveal Mode, and only then leaves the Mansion.
    - _Writes: `app/ui/src/components/ObjectLabels.tsx`, `app/ui/src/components/RoomStage.tsx`, `app/ui/src/components/MansionShell.tsx`, `app/ui/src/components/house-stage-styles.ts`_
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

  - [x]* 8.2 Add reveal tests
    - _Writes: `app/ui/src/components/object-labels.test.tsx`_
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

- [x] 9. Build the Gate and the idea step (MVP)
  - [x] 9.1 Implement the Gate
    - Add `app/ui/src/rooms/foyer/Gate.tsx` and `HallGuide.tsx`: the front-door painting as the exterior, the Warden beside his balloon, "Who is knocking?" as the label of one name field, and one "Knock" button that the painted knocker forwards to. Enter in the field knocks. The name goes to `visitorName` and nowhere else.
    - _Writes: `app/ui/src/rooms/foyer/Gate.tsx`, `app/ui/src/rooms/foyer/HallGuide.tsx`, `app/ui/src/rooms/foyer/first-visit-styles.ts`, `app/ui/src/components/guide-balloon-styles.ts`, `app/ui/src/components/house-stage-styles.ts`, `app/ui/src/components/room-paint.tsx`_
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 9.11, 9.12_

  - [x] 9.2 Implement the Idea Step and wire the visit
    - Add `app/ui/src/rooms/foyer/IdeaStep.tsx` and `use-idea-step.ts`: three example buttons that fill one textarea, the derived name, the existing brief counter and errors, and "Build this", which calls the Foyer controller's `create` and then `open`.
    - In `App.tsx`, hold the visit state with `visitReducer`: Gate, hall or mansion; the hall balloon from `hallGuide` with the greeting, "Go back into …", "Build something new" and "Step outside". In `Foyer.tsx`, hand the guide the hall's own list, open and create-then-open, keep the hall put away while the Gate is on show, and say each refusal once. Keep the existing list and create form in the hall.
    - _Writes: `app/ui/src/rooms/foyer/IdeaStep.tsx`, `app/ui/src/rooms/foyer/use-idea-step.ts`, `app/ui/src/rooms/foyer/Foyer.tsx`, `app/ui/src/App.tsx`, `app/ui/src/core/first-visit.ts`_
    - _Requirements: 9.6, 9.9, 9.10, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13_

  - [x]* 9.3 Add Gate and Idea Step tests and update the first-screen tests
    - Gate: one decision, empty name accepted, the name reaches no request, no Gate while the backend is unreachable. Idea Step: examples fill the field, create then open and nothing else, failures keep the text.
    - Add `first-visit.test.tsx`: the whole page with only the host client mocked, so each choice is seen to end in one of the Foyer's own requests or in none.
    - Give the page-level tests that start at the Gate one knock (`test/first-visit-kit.ts`). Keep their assertions; where a test asserted the first screen, it asserts the Gate first.
    - _Writes: `app/ui/src/rooms/foyer/Gate.test.tsx`, `app/ui/src/rooms/foyer/IdeaStep.test.tsx`, `app/ui/src/rooms/foyer/HallGuide.test.tsx`, `app/ui/src/first-visit.test.tsx`, `app/ui/src/test/first-visit-kit.ts`, `app/ui/src/App.foyer.test.tsx`, `app/ui/src/App.live.test.tsx`, `app/ui/src/replay-foyer.test.tsx`, `app/ui/src/attic-live-replay.test.tsx`, `app/ui/src/house-live-replay.test.tsx`, `app/ui/src/replay-submission.integration.test.tsx`, `app/ui/src/house-accessibility.axe.test.tsx`, `app/ui/scripts-tests/check-house-ui-contract.test.ts`_
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7, 9.8, 9.11, 9.12, 10.2, 10.5, 10.6, 10.7, 10.9, 14.9_

- [x] 10. Finish the rhythm, the catch and the built page (MVP)
  - [x] 10.1 Wire the remaining press plans
    - The task in hand for "Ask for a change": the ready-made texts fill the existing field through its own input event, and "Send this change" presses the existing send button. The Workshop's "Build every task that is ready" ticks each allowed task, then presses the board's start. Retry, the catch's "Allow it once" and "Refuse it", and the Attic's play.
    - Write the keys of the controls each choice presses on its button (`data-presses`, from `pressedControls` in `core/house-guide.ts`).
    - _Writes: `app/ui/src/components/GuideBalloon.tsx`, `app/ui/src/components/use-guide-press.ts`, `app/ui/src/components/MansionShell.tsx`, `app/ui/src/components/RoomStage.tsx`, `app/ui/src/core/house-guide.ts`_
    - _Requirements: 4.7, 11.6, 11.7, 11.9, 11.10, 12.2, 12.3, 13.1_

  - [x] 10.2 Implement the Built Page
    - Add `app/ui/src/rooms/foyer/BuiltPage.tsx` and show it inside `ActiveMansionFoyerPanel.tsx` when the house is built. `House.tsx` fills its input from the joined room documents, the task board rows and the mansion's display path. Show the folder and the fixed steps; no link unless WG-S1 proved one.
    - _Writes: `app/ui/src/rooms/foyer/BuiltPage.tsx`, `app/ui/src/rooms/foyer/ActiveMansionFoyerPanel.tsx`, `app/ui/src/rooms/house/House.tsx`, `app/ui/src/rooms/house/panel-styles.ts`_
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_

  - [x]* 10.3 Add the rhythm and built page tests
    - For each row of the option table: the option clicks the one existing control; a decision option is absent until its surface is open; focus lands on the proposal heading; a missing or disabled control leaves the house unchanged and shows the reason; a second Enter decides nothing.
    - _Writes: `app/ui/src/rooms/house/guide-rhythm.test.tsx`, `app/ui/src/rooms/foyer/BuiltPage.test.tsx`_
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.7, 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 12.1, 12.2, 12.3, 12.4, 12.5, 13.3, 13.7, 13.9_

- [x] 11. Prove the walk, the parity and the access (MVP)
  - [x]* 11.1 Add the first-visit walk
    - Against a fake backend behind the mocked host client: Gate, knock, an idea, "Build this", the Study, the Archivist's start, a waiting door, "Go to the door", "Open the door". Once with pointer presses, once with the keyboard alone; every pressed element carries `data-guide-option`, and the two requests that go out are the panels' own. In the same file, with Quiet Mode on, find and reach by hand the control behind every option of the fixture matrix.
    - _Writes: `app/ui/src/first-visit-walk.test.tsx`_
    - _Requirements: 6.5, 14.7, 14.8_

  - [x]* 11.2 Add the replay guide tests
    - The static replay shows the Gate, the Warden and the balloon, Quiet Mode, the labels and the Word Book, and requests the recording only; at the start, in the middle and at the end of the recording no option starts, decides or asks. His words and pose equal the live ones for the canonical fixture in every room (`house-live-replay.test.tsx`).
    - _Writes: `app/ui/src/replay-guide.test.tsx`, `app/ui/src/house-live-replay.test.tsx`_
    - _Requirements: 3.10, 10.10, 14.1, 14.2_

  - [x]* 11.3 Extend the accessibility matrix
    - The Gate, the Idea Step, each pose, Quiet Mode, Reveal Mode, the Word Book list and the Built Page, in light, dark and reduced-motion states, with zero violations.
    - _Writes: `app/ui/src/house-accessibility.axe.test.tsx`_
    - _Requirements: 14.6_

  - [x]* 11.4 Extend the source contract
    - Scan the guide's source for a Word Book word typed outside the book. Confirm the unchanged rules still hold: one text field inside a Mansion, no loop under two seconds, no third-party name, no browser storage, no new API path.
    - Confirm each of the twelve properties has exactly one fast-check test that carries its feature comment and runs at least 200 cases.
    - _Writes: `app/ui/scripts-tests/check-house-ui-contract.test.ts`_
    - _Requirements: 7.3, 14.3, 14.5, 14.11_

  - [x] 11.5 Record the rendered layout (WG-S2)
    - With headless Comet at 1280, 1440, 900, 1920 and 320 CSS pixels, measure that the Warden is at least twice a ghost's height, that the balloon and the Warden touch no working object, label, open sheet or map sheet, that the room and the guide fit one window, and that nothing scrolls sideways. Keep numbers only.
    - The first runs found four faults: the labels of the stacked layout lying under the room, two Door labels covering each other, two labels touching on a small room, and a pressed setting two pixels taller than an unpressed one. Fix what the run finds, hold the first with a style test, and record the numbers of the repeated run.
    - _Writes: `spikes/warden-guide-layout/**`, `spikes/fixtures/warden-guide-layout.json`, `app/ui/src/components/house-stage-styles.ts`, `app/ui/src/components/guide-balloon-styles.ts`, `app/ui/src/components/ObjectLabels.tsx`, `app/ui/src/components/stage-layout.test.tsx`_
    - _Requirements: 1.6, 5.6, 5.7, 5.8_

  - [ ]* 11.6 Probe a Kiro folder link (WG-S1, optional)
    - Find out whether the installed Kiro opens a folder from a link. Record the result. Add the link to the Built Page only on proof.
    - Not run. The Built Page shows the folder and the steps, and no link.
    - _Writes: `spikes/warden-guide-kiro-link/**`, `spikes/fixtures/warden-guide-kiro-link.json`_
    - _Requirements: 13.6_

- [x] 12. Ship it (MVP)
  - [x] 12.1 Rebuild the bundle and run the release gate
    - Build `app/ui/dist/index.mjs` and the replay, run `scripts/check-release.sh` to exit 0, and install the app locally with `scripts/install-local.sh`.
    - Done on 2026-11-17: the gate passed on the committed tree, and `scripts/install-local.sh` updated the app in the local gateway (4 agents and 4 skills registered). The dashboard needs the owner's sign-in, so the installed page was not opened; that is task 13.
    - _Writes: `app/ui/dist/**`_
    - _Requirements: 14.2, 14.3, 14.9_

  - [x] 12.2 Bring the documents up to date
    - The write-up, the demo script, the credits, the Kiro coverage page (this spec and its twelve properties), the assets checklist (one originality line for the Warden) and the README's first-run paragraph.
    - _Writes: `docs/writeup.md`, `docs/demo-script.md`, `docs/credits.md`, `docs/kiro-coverage.md`, `docs/assets-checklist.md`, `README.md`_
    - _Requirements: 14.10, 14.11_

- [ ] 13. Final checkpoint: the owner walks the first visit
  - In Crew and in the static replay. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` follow Kiro's optional test task convention. In this spec they are all required except 11.6: every correctness property has its fast-check test before the feature is called done.
- Every property test runs at least 200 cases and includes `Feature: warden-guide-and-first-visit, Property N: <property title>`.
- Commits are small: one for each of tasks 1.1, 1.2, 2, 3 and 4, one for tasks 6 to 8 (the Warden's art, his balloon and the labels compile only together), one for task 9 with the Built Page of 10.2, one for the tests of tasks 10 and 11, and one for task 12. `scripts/check-release.sh` must exit 0 before each. The gate rejects a stale bundle, so a commit that changes UI source also carries the rebuilt `app/ui/dist/index.mjs`.
- WG-S2 is a hard gate for claiming the size and non-overlap requirements. jsdom layout values are not accepted as rendered evidence. Comet is the only browser used.
- WG-S1 is optional. Without it the Built Page shows the folder and the steps and no link.
- The guide presses existing controls and sends nothing. No task adds a backend route, a manifest permission, a workflow or ghost reducer, an approval path, a live region, a toast, a badge, a sound, a timer, a storage call or a dependency, and no task touches `docs/permission-freeze.json`.
- Existing controls keep their names. Only the tests listed in the design's "Tests that change" table are edited.
- Parts of the page-level test updates of task 9 were drafted by parallel helper agents and reviewed and finished by hand; a leftover probe and debug lines were removed before the commit.
- A full walk with real ghosts spends credits and is the owner's step in task 13. Crew is on the Claude backend with a patched adapter for recording; switching back to `kas` is a separate owner step and is not part of this spec.
- No task pushes, deploys, changes Crew trust, changes security settings or modifies a Mansion project.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1"]
    },
    {
      "id": 1,
      "tasks": ["1.2", "2.1", "3.2"]
    },
    {
      "id": 2,
      "tasks": ["2.3", "3.1", "3.8", "4.1", "4.2", "6.1"]
    },
    {
      "id": 3,
      "tasks": ["2.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.9", "3.10", "4.3", "4.4", "4.5", "4.6", "4.7", "6.2", "7.1"]
    },
    {
      "id": 4,
      "tasks": ["7.2"]
    },
    {
      "id": 5,
      "tasks": ["7.3", "9.1"]
    },
    {
      "id": 6,
      "tasks": ["7.4", "7.5", "7.6", "8.1", "9.2", "10.2"]
    },
    {
      "id": 7,
      "tasks": ["8.2", "9.3", "10.1", "11.4"]
    },
    {
      "id": 8,
      "tasks": ["10.3", "11.1", "11.2", "11.3", "11.5", "11.6"]
    },
    {
      "id": 9,
      "tasks": ["12.1"]
    },
    {
      "id": 10,
      "tasks": ["12.2"]
    }
  ]
}
```
