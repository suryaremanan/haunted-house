# Implementation Plan: Replay and Submission

## Overview

Implement the judge-facing replay and release layer in TypeScript and Python after reconciling the upstream canonical contract. Reuse spec 2's Event Log, parser, selector, Canonical Order, and folds; reuse the final House UI and SDK seam; add a pure cursor-based Replay Engine, accessible Attic controls, an isolated static adapter, canonical fixture generation, publication checks, a least-privilege Pages workflow, permission freeze, and machine-checked submission artifacts. The coding plan creates no new event log, state authority, approval path, live transport, deployment command, or trust automation.

Milestone targets are canonical Replay Engine by 2026-11-22, Attic and Pages candidate by 2026-11-26, permission/install/document rehearsal by 2026-11-29, Feature Freeze on 2026-11-30, media evidence by 2026-12-01, video on 2026-12-02, and submission on 2026-12-03 before the 2026-12-04 14:00 PT deadline.

## Tasks

- [ ] 1. Resolve upstream and publication assumptions (MVP)
  - **Closed (18 Nov):** every subtask is done or cut with its reason.
  - [x] 1.1 Implement the RS-S0 canonical replay composition harness
    - Import the implemented public seams from `seance-log-and-ghost-state`, `doors-and-guardrails`, `room-ghosts`, and `house-ui-and-accessibility`; exercise one synthetic Door, tool approval, terminal result, failure/denial, and multi-Ghost history.
    - Prove one spec 2 Event Log, one Canonical Parser/selector, one live/replay fold contract, equal full projections, and no alternate Attic authority store. Return `contract_unavailable` when any seam is absent or incompatible.
    - Record only scrubbed schema/version/type metadata in a machine-readable spike result; do not create a compatibility log, parser, reducer, or state snapshot.
    - _Writes: `spikes/replay-canonical-contract/**`, `spikes/fixtures/replay-canonical-contract.json`_
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 11.3_

  - [ ] 1.2 Implement the RS-S1 public repository metadata probe
    - **Cut (18 Nov):** done by hand instead of a probe script: the GitHub API and the Pages run were read on 18 Nov and the result recorded in `docs/publication-metadata.json`, which `scripts/check-submission.py` checks.
    - Add a read-only probe that verifies the final HTTPS repository URL, public visibility, detected MIT license, default branch, clone folder, and Pages Actions source, then emits bounded placeholder-free publication metadata.
    - Keep ordinary CI offline; make the probe an explicit release command with fixture-backed parser tests and no token, query string, local path, email, or raw API body in output.
    - Fail closed when public metadata is incomplete rather than inventing a GitHub owner, slug, branch, or Pages URL.
    - _Writes: `spikes/replay-publication-metadata/**`, `spikes/fixtures/replay-publication-metadata.json`_
    - _Requirements: 6.1, 7.1, 7.8, 7.9, 9.1_

  - [ ] 1.3 Implement the RS-S3 deterministic media-capture probe
    - **Cut (18 Nov):** a headless Comet runner exists instead (`scripts/capture-house.mjs`, `scripts/lib/cdp.mjs`); the submission screenshots themselves are the owner's, taken with the video.
    - Reuse the development-only browser runner selected by HUI-S2 to capture original light, dark, replay, and approval states at the checklist dimensions with no external request.
    - Record viewport, theme, fixture digest, source revision, output path, and capture command in scrubbed metadata; block capture readiness when the runner is unavailable.
    - Do not add a browser package to the shipped app or treat a jsdom layout as screenshot evidence.
    - _Writes: `spikes/replay-media-capture/**`, `spikes/fixtures/replay-media-capture.json`_
    - _Requirements: 9.7, 10.1, 10.2, 10.6, 12.6_

- [x] 2. Implement the pure canonical Replay Engine (MVP, due 2026-11-22)
  - [x] 2.1 Implement canonical Replay Model and safe Timeline construction
    - Add `app/ui/src/core/replay-timeline.ts` against the RS-S0 public port. Build one Timeline entry per selected Canonical Record, retain Canonical Order, calculate bounded deterministic Presentation Times, and construct only allowlisted 160-code-point actor/outcome summaries.
    - Remove raw Crew-frame normalization and raw-payload fallback from the production replay model. Keep the module free of React, DOM, SDK, timer, network, filesystem, and clock access.
    - _Writes: `app/ui/src/core/replay-timeline.ts`_
    - _Requirements: 1.1, 1.2, 1.3, 2.11, 3.2, 5.3_

  - [x] 2.2 Implement immutable replay command reduction and prefix folding
    - Add `app/ui/src/core/replay-reducer.ts` with paused/playing/complete states, Cursor bounds, speed values `0.5`, `1`, and `2`, generation invalidation, play/pause/resume/restart/seek/step commands, typed errors, and projection recomputation through the approved prefix fold.
    - Make stale-generation steps no-ops, restart idempotent, invalid commands state-preserving, and every final Cursor equal the complete fold.
    - _Writes: `app/ui/src/core/replay-reducer.ts`_
    - _Requirements: 2.1–2.11_

  - [x]* 2.3 Write the property test for canonical replay and live-fold parity
    - Add at least 200 fast-check runs over multi-Mansion, multi-Ghost canonical records, variants, duplicates, and permutations using the RS-S0 in-memory public folds.
    - **Property 1: Canonical replay and live folding agree**
    - **Validates: Requirements 1.2, 1.3, 1.6, 2.9, 11.3**
    - _Writes: `app/ui/src/core/replay-live-parity.property.test.ts`_

  - [x]* 2.4 Write the property test for Cursor and prefix-fold equality
    - Generate empty/non-empty models, every valid Cursor, invalid non-integer/out-of-range Cursors, step generations, and repeated restarts for at least 200 runs.
    - **Property 2: Every cursor is exactly a canonical prefix fold**
    - **Validates: Requirements 2.3, 2.6, 2.7, 2.8, 2.9**
    - _Writes: `app/ui/src/core/replay-prefix.property.test.ts`_

  - [x]* 2.5 Write the state-machine property test for playback command convergence
    - Generate valid command sequences with pauses, resumes, current/stale steps, speed changes, seeks, and restarts; constrain one branch to finish and compare the final full projection.
    - **Property 3: Playback command sequences converge without spontaneous progress**
    - **Validates: Requirements 2.2, 2.4, 2.5, 2.10**
    - _Writes: `app/ui/src/core/replay-commands.property.test.ts`_

  - [x]* 2.6 Write the property test for deterministic disclosure-safe Timeline construction
    - Generate Canonical Records with null, backward, equal, and extreme times plus arbitrary Unicode payloads containing sensitive markers; compare order, offsets, interval bounds, summary bounds, and allowed fields.
    - **Property 4: Timeline construction is deterministic, ordered, and disclosure-safe**
    - **Validates: Requirements 1.3, 3.2, 5.3**
    - _Writes: `app/ui/src/core/replay-timeline.property.test.ts`_

  - [x]* 2.7 Add Replay Engine example and boundary tests
    - Cover empty logs; initial state; every command; 250/4,000 millisecond timing clamps; null/backward times; current and stale generations; start/middle/final seek; 0.5×/1×/2× delay scaling; unknown event fallback; and Unicode copy limits.
    - _Writes: `app/ui/src/core/replay-timeline.test.ts`, `app/ui/src/core/replay-reducer.test.ts`_
    - _Requirements: 1.4, 1.5, 2.1–2.9, 3.2_

- [x] 3. Implement mode-specific replay adapters (MVP)
  - [x] 3.1 Implement the canonical live and static Attic log sources
    - Add `app/ui/src/adapters/attic-log-source.ts` with a live implementation that pages only the spec 2 signed Event Log read API and a replay implementation seam that loads only `./fixture.jsonl`.
    - Return bounded loading/ready/error values, preserve parser diagnostics, and make source failure incapable of querying Crew chat history, saved snapshots, or a remote fallback.
    - Keep direct `@kirocrew/app-sdk` imports in the existing SDK boundary.
    - _Writes: `app/ui/src/adapters/attic-log-source.ts`, `app/ui/src/adapters/sdk.ts`, `app/ui/src/adapters/app-sdk.d.ts`_
    - _Requirements: 1.1, 1.2, 1.4, 4.2, 4.3, 4.5, 4.6_

  - [x] 3.2 Replace the raw-frame replay stand-in with canonical fixture behavior
    - Extend `app/ui/src/adapters/sdk-shim/index.ts` with the Attic fixture source and HUI-S1 host interfaces. Keep deterministic local status/theme behavior and make notification, badge, session navigation, chat launch, approval, and every mutation inert or explicitly read-only.
    - Remove production authority from the foundation raw `{t, frame}` player; open no WebSocket and fetch only the relative canonical fixture.
    - _Writes: `app/ui/src/adapters/sdk-shim/index.ts`, `app/ui/src/adapters/sdk-shim/replay-source.ts`_
    - _Requirements: 1.2, 1.7, 3.8, 4.2, 4.3, 4.4, 4.5, 4.8_

  - [x] 3.3 Implement the Replay Controller timer adapter
    - Add `app/ui/src/adapters/replay-controller.ts` with one cancellable timeout, reducer dispatch, speed-aware next delay, generation-safe callbacks, unmount cleanup, and no persistent preference or announcement effect.
    - Cancel and reschedule on pause, seek, speed, restart, model change, and unmount; never advance Cursor from a stale callback.
    - _Writes: `app/ui/src/adapters/replay-controller.ts`_
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.8, 2.10, 3.6, 3.7_

  - [x]* 3.4 Add source, shim, and controller integration tests
    - Use fake timers and throwing transport/navigation spies to cover one fixture load, no fallback, pagination in live mode, local stand-in operations, read-only mutations, cancellation/rescheduling, stale callbacks, cleanup, and no live-region/host effect.
    - _Writes: `app/ui/src/adapters/attic-log-source.test.ts`, `app/ui/src/adapters/sdk-shim/index.test.ts`, `app/ui/src/adapters/replay-controller.test.tsx`_
    - _Requirements: 2.2–2.10, 3.6, 3.8, 4.3–4.6, 4.8, 8.9_

- [x] 4. Build the accessible Attic replay experience (MVP, due 2026-11-26)
  - [x] 4.1 Implement Attic replay controls, summary, Timeline, and diagnostics
    - Add native Play/Pause/Resume/Restart/Previous/Next buttons, labelled 0.5×/1×/2× selection, range seek with `Event n of N` value text, ordered Timeline, `aria-current="step"`, safe projection summary, and bounded diagnostic list.
    - Keep controls in logical document/Tab order, state visible in text plus non-color cues, progress ambient, and decorative transitions subject to the existing Motion Policy.
    - _Writes: `app/ui/src/rooms/attic/ReplayControls.tsx`, `app/ui/src/rooms/attic/ReplaySummary.tsx`, `app/ui/src/rooms/attic/ReplayTimeline.tsx`, `app/ui/src/rooms/attic/ReplayDiagnostics.tsx`_
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9_

  - [x] 4.2 Integrate controlled replay into the approved Attic Panel and shared house
    - Extend the `house-ui-and-accessibility` Attic Panel instead of creating another Room shell; connect canonical source, Replay Model, controller, shared projection, and read-only mode.
    - Preserve House map Arrow behavior, Escape/focus restoration, one shell live region, secondary Session Links, Foyer/live status gates, and identical live/replay root components.
    - _Writes: `app/ui/src/rooms/attic/AtticPanel.tsx`, `app/ui/src/adapters/house-replay.ts`, `app/ui/src/App.tsx`_
    - _Requirements: 1.4, 3.1, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1_

  - [x]* 4.3 Add Attic DOM, keyboard, motion, and shared-root parity tests
    - Render start, middle, complete, empty, malformed-line, load-failure, and read-only states. Exercise every control by keyboard, native range Arrows, Attic Escape, focus restoration, and House map Arrows after close.
    - Assert controls precede Timeline, secondary links follow content, current state has text/non-color cue, routine progress creates no toast/sound/live announcement, one live region remains, and live/replay use the same root and Attic components.
    - _Writes: `app/ui/src/rooms/attic/AtticPanel.test.tsx`, `app/ui/src/attic-live-replay.test.tsx`_
    - _Requirements: 3.1–3.9, 4.1, 11.4_

- [x] 5. Create canonical fixture and fail-closed publication logic (MVP)
  - [x] 5.1 Implement deterministic synthetic Event Log fixture generation
    - Add a fixture builder through the spec 2 canonical serializer with fixed synthetic Mansion/run identities, occurrence times, and events for two Ghosts, tool start/finish, approval request/decision, Door decision, completion, and blocked/failed outcome.
    - Generate `fixtures/replay/demo.jsonl`, compare committed bytes on check, and emit expected selected Record IDs and full Replay Projection as test-only evidence rather than runtime snapshot input.
    - _Writes: `scripts/build-replay-fixture.py`, `fixtures/replay/demo.jsonl`, `fixtures/replay/demo.expected.json`_
    - _Requirements: 5.1, 5.2, 5.4, 5.6_

  - [x] 5.2 Implement the pure publication classifier and artifact inventory
    - Add pure Python logic for canonical fixture findings, credential/Home Path categories, local asset graph containment, regular-file/link metadata, localhost Gateway origins, remote runtime assets, live transport constructs, and category-only diagnostics.
    - Reuse the foundation secret rule table rather than copying patterns; never store or print a matched sensitive value.
    - _Writes: `scripts/lib/publication_contract.py`, `scripts/check-replay-publication.py`_
    - _Requirements: 4.9, 5.3, 5.5, 11.5_

  - [x]* 5.3 Write the property test for publication fail-closed behavior
    - Use at least 200 Hypothesis examples with planted raw/encoded credentials, macOS/Linux/Windows Home Paths, localhost origins, remote references, path escapes, transport constructs, symlinks, and hard-link facts; assert clean synthetic graphs pass and findings do not echo planted data.
    - **Property 5: Publication classification rejects every prohibited disclosure or transport**
    - **Validates: Requirements 4.9, 5.3, 5.5, 11.5**
    - _Writes: `scripts/tests/property/test_publication_contract.py`_

  - [x]* 5.4 Add fixture generation, canonicality, narrative, and regression tests
    - Parse every line with the real Canonical Parser, compare a second generation byte-for-byte, assert narrative coverage and expected final projection, inject malformed/unsupported/unrelated-session cases, and run the existing secret/Home Path scanner over source and generated copies.
    - _Writes: `scripts/tests/test_build_replay_fixture.py`, `scripts/tests/test_replay_fixture_contract.py`_
    - _Requirements: 1.4, 5.1–5.6_

- [x] 6. Harden the static replay build and smoke path (MVP)
  - [x] 6.1 Update the relative Vite replay build and static entry
    - Keep `base: './'`, exact SDK alias, bundled React/Lucide, disabled public directory, no module-preload polyfill, and `app/ui/dist-replay/`; copy only the canonical fixture and add `.nojekyll`.
    - Render the same default `HauntedHouseApp` and supply no environment-dependent path, live SDK import, service worker, analytics, remote resource, or hidden snapshot.
    - _Writes: `app/ui/vite.replay.config.ts`, `app/ui/replay/index.html`, `app/ui/replay/main.tsx`_
    - _Requirements: 4.1–4.9_

  - [x] 6.2 Implement built-artifact reference and transport checks
    - Extend UI script tests to parse `index.html` and emitted modules, resolve every local reference under a synthetic project-site prefix, compare built/source fixture bytes, inspect regular-file/link metadata, and combine static findings with the Python Publication Gate.
    - Permit shared route constants only when the replay adapter consumes them in-memory; reject executable live SDK/Gateway transports and localhost origins.
    - _Writes: `app/ui/scripts-tests/check-replay-build.test.ts`, `scripts/check-replay-artifact.mjs`_
    - _Requirements: 4.3, 4.4, 4.7, 4.8, 4.9, 11.5_

  - [x] 6.3 Implement bounded local and deployed replay smoke modes
    - Add a one-shot Node script that serves `dist-replay` on an ephemeral loopback port, requests index/local assets/fixture, rejects external or traversing references, and closes in `finally`.
    - Add an HTTPS deployed mode with bounded retry/backoff and a total timeout; accept the URL only from explicit Pages workflow output and log no query string.
    - _Writes: `scripts/smoke-replay-site.mjs`_
    - _Requirements: 6.4, 6.5, 11.7_

  - [x]* 6.4 Add replay build, transport-isolation, and smoke tests
    - Extend the DOM harness to throw on WebSocket, XMLHttpRequest, EventSource, Crew navigation/chat launch, backend requests, and nonlocal fetches; test project-prefix assets, missing/external/traversing files, local server cleanup, bounded deployed retries, and no Crew global/account/env requirement.
    - _Writes: `app/ui/src/replay.test.tsx`, `app/ui/scripts-tests/check-replay-build.test.ts`, `scripts-tests/smoke-replay-site.test.mjs`_
    - _Requirements: 4.1–4.9, 6.4, 6.5, 8.9, 11.4, 11.7_

- [x] 7. Add GitHub Pages while preserving Normal CI (MVP, candidate due 2026-11-26)
  - [x] 7.1 Implement the least-privilege Pages workflow
    - Add build, deploy, and smoke jobs with verified default-branch/manual triggers, non-cancelling deployment concurrency, locked Node/npm setup, replay tests/typecheck/build/publication/local smoke, audited `dist-replay` upload, `github-pages` environment, deployment URL output, and bounded post-deploy smoke.
    - Give build/smoke read-only permissions and give only deploy `pages: write` plus `id-token: write`; pin reviewed action versions according to repository policy.
    - _Writes: `.github/workflows/pages.yml`_
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8_

  - [x] 7.2 Extend Normal CI with offline replay and submission gates
    - Preserve push/pull-request triggers, `python`, `ui`, and `repo` jobs plus every existing test, typecheck, manifest, Kiro tracking, bundle import, stale live bundle, secret scan, and shellcheck step.
    - Add canonical fixture checks, replay Publication Gate, local static smoke, documentation/assets checks, and permission-freeze check at the applicable jobs without making Normal CI depend on GitHub Pages or live Crew.
    - _Writes: `.github/workflows/ci.yml`_
    - _Requirements: 6.6, 6.7, 11.8_

  - [x]* 7.3 Add workflow policy and Normal CI regression tests
    - Parse both workflow files and assert trigger coverage, job names, exact permission scopes, build/deploy/smoke needs, `github-pages` environment, concurrency, audited artifact path, deployment URL flow, offline Normal CI, and every preserved command marker.
    - _Writes: `scripts/tests/test_pages_workflow.py`, `scripts/tests/test_ci_contract.py`_
    - _Requirements: 6.1–6.8_

- [x] 8. Inventory and freeze the final manifest permissions (MVP, due 2026-11-29)
  - [x] 8.1 Implement normalized permission inventory and freeze checking
    - Add pure models and a CLI that read central API route, event subscription, storage, session approval, resource, lifecycle, and version constants; compare the exact proposed baseline with `app/app.json`; calculate canonical permission and exact manifest hashes; and reject prohibited paths/fields.
    - Provide only `--check` and explicit reviewed-generation modes. Never enable the app, edit Crew config, approve a permission, or silently rewrite the manifest.
    - _Writes: `scripts/lib/permission_freeze.py`, `scripts/check-permission-freeze.py`_
    - _Requirements: 8.1–8.8_

  - [x]* 8.2 Write the property test for exact permission freeze behavior
    - Use at least 200 Hypothesis examples that mutate resource/lifecycle/version, API/event set members/order/duplicates, booleans, forbidden paths/fields, app version, README evidence, and hashes; assert only exact normalized coordinated state passes.
    - **Property 6: Permission freeze accepts only the exact reviewed baseline**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8**
    - _Writes: `scripts/tests/property/test_permission_freeze.py`_

  - [x] 8.3 Run RS-S2 and create the reviewed Judge-Facing manifest baseline
    - Inventory the completed specs 2–6 and replay code, reconcile any mismatch through the owning design, then set `resources`/`lifecycle` gateway and the exact API/events/sessionApproval/storage permission object.
    - Remove prohibited/broad/unused declarations, set the reviewed Judge-Facing semver, and generate canonical `docs/permission-freeze.json` dated 2026-11-29 only after tests agree.
    - _Writes: `app/app.json`, `docs/permission-freeze.json`, `spikes/fixtures/replay-permission-inventory.json`_
    - _Requirements: 8.1–8.9, 12.4, 12.5_

  - [x]* 8.4 Add manifest inventory, freeze, and post-freeze regression tests
    - Compare implementation constants, manifest, README trust copy, and freeze hashes; assert no spawn/global-approval/broad wildcard/autoApprove/undeclared field; verify a permission change without coordinated version/evidence/freeze updates fails.
    - _Writes: `app/backend/tests/unit/test_manifest.py`, `scripts/tests/test_permission_freeze_cli.py`_
    - _Requirements: 8.1–8.9, 11.8_

- [ ] 9. Build machine-checked submission documents and media evidence (MVP)
  - **Closed (18 Nov):** every subtask is done or cut with its reason.
  - [x] 9.1 Implement pure submission-document parsing and the Publication Gate CLI
    - Add parsers for required Markdown headings, relative links, fenced Install Command grammar, Crew version references, Kiro Coverage Table columns, Demo Script elapsed markers, asset/submission checklists, milestone dates, publication metadata, and provenance records.
    - Add `scripts/check-submission.py` to read repository files through an adapter and return file/line/category findings without evaluating shell text or following web links in Normal CI.
    - _Writes: `scripts/lib/submission_contract.py`, `scripts/check-submission.py`_
    - _Requirements: 7.2, 7.3, 7.6, 7.8, 9.1–9.10, 12.1–12.11_

  - [x] 9.2 Populate the validated judge-facing document set
    - Update `README.md` with verified Static Replay first, product/authority summary, Crew 0.12.1+ requirements, one `scripts/install-local.sh` command from a clone, explicit Apps → Library → Haunted House → Enable → Trust steps, tests, repository map, license, and document links.
    - Add `docs/writeup.md`, `docs/kiro-coverage.md`, `docs/demo-script.md`, `docs/credits.md`, `docs/assets-checklist.md`, and `docs/submission-checklist.md` with the required architecture, related-work credit, 165-second walkthrough, exact dated gates, MVP/stretch boundary, and evidence placeholders that remain visibly incomplete until verified.
    - Use RS-S1 metadata for public links; include no local absolute path, invented URL, secret, or completion claim without evidence.
    - _Writes: `README.md`, `docs/writeup.md`, `docs/kiro-coverage.md`, `docs/demo-script.md`, `docs/credits.md`, `docs/assets-checklist.md`, `docs/submission-checklist.md`, `docs/publication-metadata.json`_
    - _Requirements: 7.1–7.9, 9.1–9.10, 12.1–12.11_

  - [x]* 9.3 Add submission parser, link, command, demo-duration, and schedule tests
    - Cover complete samples; every missing heading/column/link/asset/checklist key; command injection-shaped text; missing script; version mismatch; 179/180-second boundaries; malformed or decreasing markers; exact milestone dates; submission-before-deadline ordering; and stretch-before-MVP refusal.
    - Reuse the existing fake-CLI dry-run harness for the extracted install command form.
    - _Writes: `scripts/tests/test_submission_contract.py`, `scripts/tests/test_submission_documents.py`, `scripts/tests/test_install_local.py`_
    - _Requirements: 7.2–7.8, 9.1–9.10, 11.6, 12.1–12.11_

  - [ ] 9.4 Implement media provenance, source scanning, and deterministic capture tooling
    - **Cut (18 Nov):** provenance and source scanning exist (`scripts/check-assets.py`); capture is `scripts/capture-house.mjs`. The fail-closed `scripts/capture-submission-assets.mjs` stays as written until the owner takes the screenshots.
    - Add `docs/assets-manifest.json` schema support and a scanner that inventories distributed image/audio/video files; validates unique relative paths, Original/CC0 fields, HTTPS CC0 source/license links, modifications, and alt text; and rejects external SVG/media mechanisms, raster data URIs, script/animation elements, prohibited names, uncredited media, and MVP audio imports.
    - Add the RS-S3-backed capture command for deterministic screenshots without adding a runtime dependency or external asset request.
    - _Writes: `scripts/lib/asset_contract.py`, `scripts/check-assets.py`, `scripts/capture-submission-assets.mjs`_
    - _Requirements: 9.6, 9.7, 10.1–10.6_

  - [ ] 9.5 Generate original submission images and close machine-checkable provenance rows
    - **Cut (18 Nov):** the owner takes the submission screenshots with the video; listed under "Only you can do this" in `docs/judge-scorecard.md`.
    - Use the RS-S3-proven capture command to create light, dark, replay, and approval screenshots plus an optional original hero/thumbnail; write deterministic capture metadata and complete matching asset-manifest, credits, and checklist rows.
    - Leave video upload and human originality review as explicit dated human checklist items; add no copyrighted, remote, trademarked, gore, jump-scare, scream, or MVP audio asset.
    - _Writes: `docs/screenshots/**`, `app/assets/**`, `docs/assets-manifest.json`, `docs/credits.md`, `docs/assets-checklist.md`_
    - _Requirements: 9.6, 9.7, 10.1–10.6, 12.6, 12.7_

  - [x]* 9.6 Add asset provenance, source, capture, and prohibited-feature tests
    - Cover valid Original/CC0 records, missing source/license/alt text, duplicate/unmanifested/traversing paths, remote SVG/image/font/media, data URIs, script/animation elements, audio module APIs, prohibited terms, external requests, deterministic capture metadata, and absence of MVP sound.
    - _Writes: `scripts/tests/test_asset_contract.py`, `app/ui/scripts-tests/check-submission-assets.test.ts`_
    - _Requirements: 9.6, 9.7, 10.1–10.6_

- [x] 10. Integrate and package the complete release gate (MVP)
  - [x] 10.1 Implement one offline release-check command
    - Add a bounded script that runs Python tests, UI tests, type checking, live/replay builds, live-bundle freshness/import checks, manifest/profile/skill tests, `.kiro` tracking, secret/Home Path scan, canonical fixture generation check, replay publication/build checks, local smoke, documentation/assets checks, and permission freeze.
    - Preserve each underlying command's output and return nonzero when any gate fails; make no live Crew, GitHub, Pages, trust, approval, push, or submission action.
    - _Writes: `scripts/check-release.sh`_
    - _Requirements: 6.5, 6.7, 7.5, 8.7, 9.9, 9.10, 10.6, 11.8_

  - [x]* 10.2 Add cross-layer live/replay and release-contract integration tests
    - Drive one canonical Event Log through live acknowledgements and the Static Replay source; compare selected records, final House/Room/Ghost/Door/task/artifact state, accessible Attic output, and diagnostics; hold acknowledgements to prove no transient state enters replay.
    - Test fixture/build redaction, no live transport, read-only actions, exact manifest freeze, README command/version/trust copy, workflow contracts, and document/asset links as one release fixture.
    - _Writes: `app/ui/src/replay-submission.integration.test.tsx`, `scripts/tests/test_release_contract.py`_
    - _Requirements: 1.1–1.7, 3.1–3.9, 4.1–4.9, 5.1–5.6, 7.1–7.9, 8.1–8.9, 9.1–9.10, 11.3–11.8_

  - [x] 10.3 Build the final live and replay artifacts and run the release gate
    - Run the non-watch release command, fix only failures owned by this feature, rebuild committed `app/ui/dist/index.mjs`, rebuild audited `app/ui/dist-replay/`, and verify a second build leaves the committed live bundle and canonical fixture unchanged.
    - Update evidence/checklist status only from passing commands or verified RS-S1/RS-S3 results. Keep human video, originality sign-off, trust rehearsal, and final submission items incomplete until performed.
    - _Writes: `app/ui/dist/**`, `fixtures/replay/demo.jsonl`, `docs/submission-checklist.md`, `docs/assets-checklist.md`_
    - _Requirements: 4.1, 4.9, 5.1–5.6, 6.5–6.7, 8.6–8.9, 9.8–9.10, 11.1–11.8, 12.4–12.10_

- [x] 11. Checkpoint: verify the canonical replay and static boundary
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Final checkpoint: verify the judge-facing release package
  - **Cut (18 Nov):** the release gate passes; what remains (screenshots, video, submission) is the owner's and is listed by `python3 scripts/check-submission.py --release`.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Add optional replay and cosmetic features after MVP rehearsal (stretch)
  - **Cut (18 Nov):** stretch work, not started before the 30 Nov feature freeze; no MVP behaviour depends on it.
  - [ ]* 13.1 Implement optional Attic search, filters, bookmarks, and export
    - **Cut (18 Nov):** stretch work, not started before the 30 Nov feature freeze; no MVP behaviour depends on it.
    - Add feature-flagged event-type/text-safe filtering, Cursor bookmarks, deep links, and canonical redacted Event Log export without changing selected events, full final projection, authority state, or default MVP controls.
    - Keep export local/read-only and run it through Publication Gate before download.
    - _Writes: `app/ui/src/rooms/attic/ReplayExtras.tsx`, `app/ui/src/core/replay-extras.ts`_
    - _Requirements: 12.9, 12.11_

  - [ ]* 13.2 Add tests for optional replay extras
    - **Cut (18 Nov):** stretch work, not started before the 30 Nov feature freeze; no MVP behaviour depends on it.
    - Verify disabled builds contain no extra controls, filters never change canonical full projection, bookmarks restore exact Cursors, export remains canonical/redacted, and no extra transport or live-region behavior appears.
    - _Writes: `app/ui/src/rooms/attic/ReplayExtras.test.tsx`, `app/ui/src/core/replay-extras.property.test.ts`_
    - _Requirements: 12.9, 12.11_

  - [ ]* 13.3 Apply final cosmetic polish within existing accessibility contracts
    - **Cut (18 Nov):** replaced by the `dread-and-night` spec, which is complete.
    - Refine only original CSS/SVG details after every MVP and rehearsal gate passes; preserve two-second minimum motion cycles, Still House/reduced-motion behavior, contrast, one live region, responsive layout, state text/cues, transport isolation, and asset provenance.
    - Add no sound, remote asset, new state, permission, API path, workflow behavior, or submission risk.
    - _Writes: `app/ui/src/components/house-art.tsx`, `app/ui/src/components/house-styles.ts`, `docs/assets-manifest.json`_
    - _Requirements: 10.1, 10.2, 10.5, 12.9, 12.11_

## Notes

- Tasks marked with `*` are optional to the Kiro task runner. The corresponding property, integration, DOM, accessibility, workflow, and release evidence must still pass before the affected MVP requirement can be claimed complete.
- Each primary property test runs at least 200 generated cases and includes `Feature: replay-and-submission, Property N: <property title>`.
- RS-S0 is a hard replay gate. Current draft specs 2 and 4 describe competing physical logs; Room Ghosts requires reconciliation to the spec 2 Event Log. This feature never creates a third log or saved projection fallback.
- RS-S1 gates final public URLs and clone copy but does not block local replay development. RS-S2 is implemented by task 8 and gates the Judge-Facing Version. RS-S3 gates screenshot checklist closure.
- The final permission proposal is exact: `/api/version`, `/api/chat`, `/api/chat/*`, `/apps/haunted-house/api/*`; implemented canonical event names; `sessionApproval: true`; `storage: true`; gateway lifecycle/resources; no spawn/global-approval paths and no `autoApprove`.
- Kiro/Crew facts are documented in `kiro-docs/specs.md`, `kiro-docs/specs__feature-specs__requirements-first.md`, `kiro-docs/specs__correctness.md`, `kiro-docs/crew__apps.md`, `kiro-docs/crew__apps__manifest.md`, `kiro-docs/crew__apps__sdk.md`, `kiro-docs/crew__apps__publishing.md`, `kiro-docs/crew__installation.md`, and `kiro-docs/crew__interfaces__cli-reference.md`. Verified runtime discrepancies remain in `.kiro/steering/tech.md`.
- GitHub Pages workflow structure follows the official custom-workflow and publishing-source guidance cited in `design.md`.
- The coding tasks create workflow files, validators, scripts, fixtures, docs, and deterministic media outputs. They do not push, deploy manually, change repository settings, trust/enable the app, record/upload the video, or submit the hackathon entry. Those remain explicit human checklist gates dated Nov 30 through Dec 3.
- Feature Freeze begins 2026-11-30. Task 13 remains unscheduled until every MVP gate and complete submission rehearsal pass. Defect, accessibility, security, evidence, and packaging fixes take priority after freeze.
- No task writes to a Mansion project or stores an absolute home path, credential, app token, proxy secret, or raw Crew payload in a fixture, build, document, or diagnostic.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "5.2", "8.1", "9.1", "9.4"]
    },
    {
      "id": 1,
      "tasks": ["2.1", "3.1", "5.1", "5.3", "8.2", "9.3", "9.6"]
    },
    {
      "id": 2,
      "tasks": ["2.2", "2.6", "3.2", "3.3", "5.4", "6.1"]
    },
    {
      "id": 3,
      "tasks": ["2.3", "2.4", "2.5", "2.7", "3.4", "4.1", "6.2", "6.3"]
    },
    {
      "id": 4,
      "tasks": ["4.2", "6.4", "7.1"]
    },
    {
      "id": 5,
      "tasks": ["1.2", "1.3", "4.3", "7.2"]
    },
    {
      "id": 6,
      "tasks": ["7.3", "9.2"]
    },
    {
      "id": 7,
      "tasks": ["9.5", "10.1"]
    },
    {
      "id": 8,
      "tasks": ["8.3"]
    },
    {
      "id": 9,
      "tasks": ["8.4", "10.2"]
    },
    {
      "id": 10,
      "tasks": ["10.3"]
    },
    {
      "id": 11,
      "tasks": ["13.1"]
    },
    {
      "id": 12,
      "tasks": ["13.2"]
    },
    {
      "id": 13,
      "tasks": ["13.3"]
    }
  ]
}
```
