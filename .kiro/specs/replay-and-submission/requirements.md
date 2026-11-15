# Requirements Document

## Introduction

The `replay-and-submission` feature completes the Haunted House judge experience. The Attic replays only the canonical append-only séance Event Log owned by `seance-log-and-ghost-state`, with deterministic playback controls and a final state equal to the live fold. The same Haunted House React tree builds as a static, read-only GitHub Pages site through the existing SDK stand-in, so a judge can inspect the product without Crew or a Crew account. The live path remains a public MIT-licensed Crew app with one documented install command and one explicit trust step.

This feature also defines the final judge-facing permission baseline, publication checks, submission documentation, asset provenance, milestone schedule, and release evidence. Unverified repository, Pages, upstream-contract, and media-capture facts are resolved by named spikes before dependent work. This specification creates planning artifacts only; implementation belongs to the task plan.

## Scope

| Scope | Included behavior |
|---|---|
| **MVP** | Canonical Event Log loading; deterministic timeline; play, pause, resume, 0.5×/1×/2× speed, restart, and seek; Attic diagnostics and accessibility; shared live/replay React tree; SDK stand-in; publication-safe fixture and build checks; GitHub Pages build/deploy/smoke workflow; public-repo install path; final permission freeze; submission documents, screenshots checklist, credits, and dated release checklist |
| **Stretch** | Event search, event-type filters, bookmark links, export, enabled Séance Room review UI, opt-in original or credited CC0 sound, additional decorative motion, and cosmetic polish |
| **Excluded** | Replay from saved snapshots, replay fallback to Crew or the Backend, cloud séance storage, replay mutation, auto-approval, automatic phase advancement, analytics, primary chat UI, remote art, copyrighted music, and proprietary or trademarked characters |

## Glossary

- **Haunted_House**: The gateway-managed Kiro Crew App defined under `app/`.
- **Operator**: The local person using Haunted_House through Crew.
- **Judge**: A person evaluating Haunted_House through Static_Replay or Live_App installation.
- **Mansion**: One software project selected through the Foyer.
- **Attic**: The spatial Room that presents Event_Log replay, controls, timeline, and diagnostics.
- **Room**: A spatial destination in the shared Haunted House interface.
- **Canonical_Record**: One validated, redacted version-1 `App_Event` record defined by `seance-log-and-ghost-state`.
- **Event_Log**: The canonical append-only JSON Lines sequence of Canonical_Record values owned by `seance-log-and-ghost-state`.
- **Canonical_Parser**: The spec 2 parser that returns supported Canonical_Record values and line diagnostics from an Event_Log.
- **Canonical_Order**: The deterministic selected-event order produced by the spec 2 Event_Selector.
- **Live_Fold**: The approved upstream fold over acknowledged Canonical_Record values used by live Haunted_House.
- **Replay_Fold**: The fold over Canonical_Record values read from an Event_Log with no external state.
- **Replay_Projection**: The complete visible Mansion, workflow, Door, Ghost, waiting-item, artifact, and diagnostic state produced by approved upstream replay folds.
- **Replay_Engine**: The pure TypeScript component that converts parsed selected Canonical_Record values and Replay_Commands into Replay_State and Replay_Projection values.
- **Replay_Command**: One of `play`, `pause`, `resume`, `set_speed`, `seek`, or `restart`.
- **Replay_State**: Playback status, speed, Cursor, event count, deterministic timeline, diagnostics, and current Replay_Projection.
- **Cursor**: An integer from zero through the number of selected Canonical_Record values; the Cursor equals the count of records in the current replay prefix.
- **Timeline**: The ordered list containing one safe summary for every selected Canonical_Record in Canonical_Order.
- **Presentation_Time**: A deterministic non-decreasing millisecond offset derived only from Canonical_Record fields and fixed replay timing rules.
- **Playback_Speed**: One of `0.5`, `1`, or `2`, used only to scale the delay before the next replay step.
- **Replay_Controller**: The React adapter that supplies timer and user-command effects to the Replay_Engine.
- **Shared_UI**: The React root, Mansion shell, House map, Room panels, and Attic components used by both live and replay builds.
- **Replay_Adapter**: The fixture-backed SDK stand-in and replay data adapter that replace live Crew SDK effects.
- **Static_Replay**: The static GitHub Pages build of Shared_UI and Replay_Adapter.
- **Replay_Fixture**: The checked-in, scrubbed Event_Log used by Static_Replay.
- **Publication_Gate**: The automated checks that validate Replay_Fixture, Static_Replay output, documentation, assets, and release metadata before publication.
- **Gateway_Request**: An HTTP, WebSocket, XMLHttpRequest, EventSource, navigation, or SDK call to Crew_Gateway or Backend.
- **Crew_Gateway**: Kiro Crew version 0.12.1 or later, which hosts the Live_App.
- **Backend**: The signed local Haunted House HTTP process established by `crew-app-foundation`.
- **Live_App**: Haunted_House installed into and enabled through Crew_Gateway.
- **Public_Repository**: The public Git repository that contains the MIT `LICENSE`, Haunted_House source, committed live UI bundle, specifications, documentation, and install script.
- **Install_Command**: The single README command that installs or updates Live_App from a clone of Public_Repository.
- **Trust_Step**: The one-time manual Crew dashboard action that trusts and enables Haunted_House after installation.
- **Final_Permission_Baseline**: The exact normalized judge-facing `app/app.json` permission object and its recorded digest.
- **Permission_Inventory**: A generated inventory of every Gateway route, subscribed event, session-approval action, storage declaration, and app resource used by shipped code.
- **Judge_Facing_Version**: The application version first presented to judges after Final_Permission_Baseline is recorded.
- **Normal_CI**: The existing `.github/workflows/ci.yml` push and pull-request workflow with Python, UI, and repository checks.
- **Pages_Workflow**: The separate GitHub Actions workflow that builds, audits, uploads, and deploys Static_Replay.
- **Pages_Smoke_Test**: A bounded automated check that loads the deployed page and its required local assets without Crew credentials.
- **Submission_Document_Set**: `README.md`, `docs/writeup.md`, `docs/kiro-coverage.md`, `docs/demo-script.md`, `docs/credits.md`, `docs/assets-checklist.md`, and `docs/submission-checklist.md`.
- **Kiro_Coverage_Table**: A reusable table mapping Haunted_House features to Kiro capabilities, repository evidence, demo evidence, and completion state.
- **Demo_Script**: A time-coded judge walkthrough whose planned duration is less than three minutes.
- **Asset_Provenance**: The creator, source, license, and modification record for each distributed visual or audio asset.
- **Original_Asset**: An asset authored for Haunted_House without copied characters, marks, music, or artwork.
- **CC0_Asset**: A third-party asset distributed under a verified CC0 or equivalently permissive public-domain dedication and recorded in `docs/credits.md`.
- **Prohibited_Asset**: A Microsoft or Bob name, logo, character, artwork, sound, copyrighted music track, unlicensed third-party asset, gore asset, jump-scare asset, or remote runtime art asset.
- **Submission_Plan**: The dated milestones and checklists for feature freeze, screenshots, video, and submission.
- **Feature_Freeze**: The point after which only defect fixes, accessibility fixes, security fixes, evidence updates, and submission packaging may enter the Judge_Facing_Version.
- **Spike**: A bounded executable investigation that records a scrubbed machine-readable result and blocks dependent work when the pass condition fails.
- **MVP**: The required judge-facing feature set listed in Scope.
- **Stretch_Feature**: Optional work listed in Scope that cannot block MVP completion.

## Requirements

### Requirement 1: Replay only the canonical séance Event Log [MVP]

**User Story:** As a Judge, I want the Attic to reconstruct Haunted House from the canonical séance record, so that replay demonstrates the same state model used live.

#### Acceptance Criteria

1. WHEN the Attic loads an Event_Log, THE Replay_Engine SHALL obtain Canonical_Record values and diagnostics through the Canonical_Parser defined by `seance-log-and-ghost-state`.
2. THE Replay_Engine SHALL derive Replay_Projection solely from Canonical_Record values, Canonical_Order, and approved upstream replay folds.
3. WHEN an Event_Log contains duplicate or permuted Canonical_Record values, THE Replay_Engine SHALL use the spec 2 Event_Selector before constructing Timeline or Replay_Projection.
4. WHEN an Event_Log contains malformed or unsupported lines, THE Attic SHALL display line-specific diagnostics and replay every valid supported Canonical_Record returned by the Canonical_Parser.
5. WHEN an Event_Log contains no valid supported Canonical_Record, THE Replay_Engine SHALL produce an empty Replay_Projection and a Cursor of zero.
6. WHEN Live_Fold and Replay_Fold receive the same selected Canonical_Record values, THE Replay_Fold SHALL produce a Replay_Projection equivalent to the Live_Fold projection.
7. IF the implemented upstream specs expose more than one canonical log or incompatible replay fold, THEN THE replay contract Spike SHALL block Attic integration without creating another log, parser, selector, reducer, or state store.

### Requirement 2: Deterministic playback controls [MVP]

**User Story:** As a Judge, I want to control the replay timeline, so that I can inspect a specific event and still reach a reproducible final state.

#### Acceptance Criteria

1. WHEN Replay_Fixture is loaded, THE Replay_Engine SHALL initialize Replay_State as `paused` with Cursor zero and Playback_Speed `1`.
2. WHEN the Judge issues `play` or `resume` before the final Cursor, THE Replay_Engine SHALL enter `playing` without changing the current Replay_Projection.
3. WHEN the Replay_Controller receives the next scheduled replay step while Replay_State is `playing`, THE Replay_Engine SHALL advance Cursor by exactly one and fold the corresponding Canonical_Order prefix.
4. WHEN the Judge issues `pause`, THE Replay_Engine SHALL enter `paused` and preserve Cursor and Replay_Projection until another Replay_Command changes the state.
5. WHEN the Judge selects a Playback_Speed, THE Replay_Engine SHALL accept exactly `0.5`, `1`, or `2` and apply the selected value to subsequent replay-step delays.
6. WHEN the Judge seeks to Cursor `n`, THE Replay_Engine SHALL produce the same Replay_Projection as a fresh Replay_Fold over the first `n` selected Canonical_Record values.
7. IF a seek target is not an integer from zero through the selected record count, THEN THE Replay_Engine SHALL return a command error and preserve Replay_State.
8. WHEN the Judge issues `restart`, THE Replay_Engine SHALL return to paused Cursor zero while preserving the loaded Timeline and diagnostics.
9. WHEN Cursor reaches the selected record count, THE Replay_Engine SHALL enter `complete` and expose the Replay_Fold over every selected Canonical_Record.
10. WHEN any finite valid Replay_Command sequence reaches the final Cursor, THE Replay_Engine SHALL produce the same final Replay_Projection regardless of pauses, speed changes, restarts, or intermediate seeks.
11. THE Replay_Engine SHALL read no browser clock, network API, filesystem API, Crew SDK, or mutable external state.

### Requirement 3: Accessible Attic replay interface [MVP]

**User Story:** As a Judge, I want an accessible Attic timeline with visible controls and state, so that I can understand the run without reading raw JSON or using a pointer.

#### Acceptance Criteria

1. WHEN the Operator opens the Attic Room, THE Attic SHALL present playback controls, current Cursor, total event count, current Replay_Projection summary, Timeline, and diagnostics before any secondary link.
2. WHEN the Attic renders a Timeline entry, THE Attic SHALL display bounded safe text for event position, Event_Type, Ghost or system actor, and outcome without displaying raw payload content.
3. WHEN the Cursor changes, THE Attic SHALL identify the current Timeline entry with text and a non-color visual cue.
4. THE Attic SHALL provide keyboard-operable Play, Pause, Resume, Restart, Playback_Speed, seek, previous-event, and next-event controls with programmatic names.
5. WHEN focus enters the Timeline, THE Attic SHALL provide a logical Tab order and native Arrow-key seek behavior without overriding the House map Arrow-key contract.
6. WHILE replay advances normally, THE Attic SHALL update playback progress in place without a toast, sound, or new polite-live-region announcement.
7. WHILE Still House or reduced motion is active, THE Attic SHALL suppress non-essential transition animation while preserving playback state changes and every control.
8. WHILE Static_Replay is active, THE Attic SHALL label mutation and Session_Link actions as read-only and perform no live action.
9. IF replay parsing or playback fails, THEN THE Attic SHALL preserve the last valid Replay_Projection, display bounded diagnostic text, and expose Restart when restart is valid.

### Requirement 4: One shared UI with an isolated static adapter [MVP]

**User Story:** As a Judge without Crew, I want the real Haunted House interface as a static site, so that I can evaluate the product without an account or local gateway.

#### Acceptance Criteria

1. WHEN Static_Replay renders, THE Replay_Adapter SHALL render the same Shared_UI root, Mansion shell, House map, Room panels, and Attic components used by Live_App.
2. WHEN the replay build runs, THE build SHALL replace the live SDK backing module with Replay_Adapter through the existing SDK boundary.
3. THE Static_Replay SHALL use Replay_Fixture and local build assets as the complete runtime data source.
4. THE Static_Replay SHALL make no Gateway_Request.
5. WHEN Static_Replay needs Replay_Fixture, THE Replay_Adapter SHALL request only the relative URL `./fixture.jsonl`.
6. IF Replay_Fixture cannot be loaded, THEN THE Static_Replay SHALL display a replay diagnostic without requesting Crew_Gateway, Backend, or a remote fallback.
7. THE Static_Replay SHALL use relative asset URLs that work beneath a GitHub Pages project-site base path.
8. THE Static_Replay SHALL require no Crew account, Crew token, application secret, environment variable, or runtime configuration value.
9. THE Static_Replay build output SHALL contain no credential, absolute Home_Path, localhost Gateway origin, remote runtime asset URL, or executable live Gateway transport.

### Requirement 5: Publication-safe replay fixture [MVP]

**User Story:** As a maintainer, I want the published replay fixture to be canonical and scrubbed, so that the public demo reveals no credential or local identity.

#### Acceptance Criteria

1. THE Replay_Fixture SHALL contain only Canonical_Record values accepted by the supported spec 2 Canonical_Parser.
2. THE Replay_Fixture SHALL represent a synthetic demo Mansion with at least two Ghosts, one tool call, one approval request and decision, one Door decision, one completion, and one blocked or failed outcome.
3. THE Replay_Fixture SHALL contain no Known_Secret, credential-shaped value, absolute Home_Path, raw authorization value, raw document body, or user-specific identifier.
4. WHEN the fixture validator reads Replay_Fixture, THE fixture validator SHALL verify canonical bytes, supported schema, unique Record_ID handling, redaction rules, and the expected final Replay_Projection.
5. IF any generated or edited replay fixture contains a prohibited sensitive value, THEN THE Publication_Gate SHALL fail before a replay build or publication artifact is accepted.
6. THE Replay_Fixture SHALL come from synthetic demo data or a scrubbed demo Mansion and SHALL contain no event from an unrelated Crew session.

### Requirement 6: GitHub Pages publication without weakening CI [MVP]

**User Story:** As a Judge, I want a stable public replay URL, so that I can evaluate Haunted House without installing Crew.

#### Acceptance Criteria

1. THE Pages_Workflow SHALL run for a push to the Public_Repository default branch and for an explicit manual dispatch.
2. WHEN the Pages_Workflow builds Static_Replay, THE Pages_Workflow SHALL install locked UI dependencies, run replay-focused automated checks, build `app/ui/dist-replay/`, run Publication_Gate, and upload only the audited static directory.
3. THE Pages_Workflow SHALL grant `contents: read` to build work and grant `pages: write` plus `id-token: write` only to the deployment job.
4. WHEN the Pages deployment finishes, THE Pages_Smoke_Test SHALL request the deployed page and required local Replay_Fixture within a bounded retry period.
5. IF the replay build, Publication_Gate, Pages deployment, or Pages_Smoke_Test fails, THEN THE Pages_Workflow SHALL report failure and withhold a readiness claim.
6. THE Normal_CI SHALL preserve the existing push and pull-request triggers, Python job, UI job, repository job, manifest test, Kiro tracking check, stale-bundle check, bundle import check, and secret scan.
7. WHEN replay or submission source changes, THE Normal_CI SHALL run replay build, replay transport-isolation, fixture-redaction, documentation-contract, and local static-site smoke checks.
8. THE Pages_Workflow SHALL use a `github-pages` deployment environment and prevent two concurrent Pages deployments from publishing out of order.

### Requirement 7: One-command live judge installation [MVP]

**User Story:** As a Judge with Crew, I want a short reviewable install path, so that I can run the live app without changing Crew security settings through a script.

#### Acceptance Criteria

1. THE Public_Repository SHALL be publicly readable and SHALL contain the MIT `LICENSE`, source, committed `app/ui/dist/index.mjs`, `.kiro/` evidence, and Submission_Document_Set.
2. THE README SHALL state that Live_App requires Kiro Crew 0.12.1 or later, Node.js, npm, git, curl, and a running Crew_Gateway.
3. THE README SHALL present one Install_Command that invokes `scripts/install-local.sh` from a clone of Public_Repository.
4. WHEN Install_Command runs on a supported prepared host, THE Install_Command SHALL build and install or update Haunted_House through the existing install script.
5. THE Install_Command SHALL preserve Crew trust, approval, permission, and security settings.
6. WHEN Install_Command finishes, THE README and install script SHALL direct the Judge to Apps, Library, Haunted House, Enable, and the one-time Trust_Step.
7. WHEN an installation prerequisite is missing or Crew_Gateway is unavailable, THE install path SHALL name the missing prerequisite or unavailable service and stop before installation changes.
8. THE README SHALL place the Static_Replay link before the Live_App installation path and identify Static_Replay as read-only.
9. IF the Public_Repository URL, default branch, Pages URL, or clone-folder name is unverified, THEN THE repository publication Spike SHALL block final README command and link claims.

### Requirement 8: Final judge-facing permission freeze [MVP]

**User Story:** As a Judge, I want a stable least-privilege permission list before installation, so that the trust prompt matches the reviewed release.

#### Acceptance Criteria

1. THE Final_Permission_Baseline SHALL set `resources` and `lifecycle` to `gateway` and preserve `minKiroCrewVersion` `0.12.1` or later.
2. THE Final_Permission_Baseline SHALL contain exactly `/api/version`, `/api/chat`, `/api/chat/*`, and `/apps/haunted-house/api/*` in `permissions.api`.
3. THE Final_Permission_Baseline SHALL set `permissions.sessionApproval` to `true` and `permissions.storage` to `true`.
4. THE Final_Permission_Baseline SHALL contain exactly the implemented canonical-ingestion event names in `permissions.events` and SHALL match the shared supported-event constant.
5. THE Final_Permission_Baseline SHALL omit `/api/spawn`, `/api/spawn/*`, `/api/approvals`, `/api/approvals/*`, broad wildcard API paths, `autoApprove`, and undeclared permission fields.
6. WHEN Permission_Inventory and the manifest agree after all MVP application code is present, THE permission-freeze check SHALL record the normalized permission digest and Judge_Facing_Version.
7. IF Permission_Inventory and the manifest disagree, THEN THE permission-freeze check SHALL fail before Judge_Facing_Version is published.
8. IF a permission changes after the freeze, THEN THE release checks SHALL require a version change, updated README trust copy, updated permission evidence, and an explicit new freeze record.
9. WHEN Static_Replay builds, THE replay build SHALL consume no Final_Permission_Baseline capability.

### Requirement 9: Complete submission document set [MVP]

**User Story:** As a Judge, I want concise evidence and a guided demo, so that I can understand the idea, Kiro usage, safety model, and run path in less than three minutes.

#### Acceptance Criteria

1. THE README SHALL state the product concept, spatial authority model, Static_Replay link, Live_App requirements, Install_Command, Trust_Step, test commands, repository map, license, and links to every Submission_Document_Set member.
2. THE `docs/writeup.md` document SHALL explain the problem, spatial solution, architecture, canonical replay, guardrails, accessibility, original work, implementation trade-offs, and MVP or stretch boundary.
3. THE `docs/writeup.md` document SHALL credit Crew's built-in Spec Builder and Agent Worlds by name as related work without claiming ownership of either built-in app.
4. THE `docs/kiro-coverage.md` document SHALL contain a reusable Kiro_Coverage_Table with columns for feature, Kiro capability, implementation evidence, test evidence, demo evidence, scope, and completion state.
5. THE Demo_Script SHALL contain elapsed-time markers, operator actions, expected visible results, a Static_Replay path, an optional Live_App path, an authority or approval moment, an Attic replay moment, and a planned duration below 180 seconds.
6. THE `docs/credits.md` document SHALL identify every distributed visual and audio asset as Original_Asset or CC0_Asset and SHALL provide source and license links for every CC0_Asset.
7. THE `docs/assets-checklist.md` document SHALL track icon, light and dark screenshots, replay screenshot, permission or approval screenshot, optional hero images, video thumbnail, dimensions, theme, provenance, alt text, and completion.
8. THE `docs/submission-checklist.md` document SHALL track repository visibility, license detection, links, permission freeze, clean install, trust step, Pages smoke, CI, tests, screenshots, video, credits, secret scan, Feature_Freeze, and final submission.
9. WHEN the documentation contract test runs, THE documentation contract test SHALL validate required files, headings, internal links, commands, date milestones, demo duration, and checklist entries.
10. IF a documentation link, command, asset path, or required evidence path is absent, THEN THE Publication_Gate SHALL fail and name the source file and missing target.

### Requirement 10: Original and attributable presentation assets [MVP]

**User Story:** As a maintainer, I want a legally clear visual and audio package, so that the submission contains no borrowed character or uncredited media.

#### Acceptance Criteria

1. THE Judge_Facing_Version SHALL use only Original_Asset values for house, Room, Door, object, Ghost, icon, and hero artwork.
2. THE Judge_Facing_Version SHALL contain no Prohibited_Asset.
3. WHEN a CC0_Asset is included for an allowed non-art supplemental purpose or Stretch_Feature, THE Asset_Provenance SHALL record creator, source URL, license URL, local path, and modification note.
4. WHERE the Sound_Feature stretch work is enabled, THE Sound_Feature SHALL initialize off and use only Original_Asset or credited CC0_Asset audio after explicit Operator activation.
5. THE MVP SHALL contain no audio asset, audio playback path, copyrighted music, remote runtime asset, gore, jump scare, scream, parallax, or screen shake.
6. WHEN the asset contract test runs, THE asset contract test SHALL reject external SVG images, remote runtime asset URLs, raster data URIs, prohibited trademark terms, uncredited media files, and distributed files absent from Asset_Provenance.

### Requirement 11: Automated replay and release evidence [MVP]

**User Story:** As a maintainer, I want machine-checkable replay and submission evidence, so that the judge-facing release cannot drift from the approved contracts.

#### Acceptance Criteria

1. THE Test_Suite SHALL include one property-based test for every Correctness Property in the approved `replay-and-submission` design.
2. WHEN property-based tests run, THE Test_Suite SHALL execute at least 200 generated cases per replay property with the required feature and property annotation.
3. WHEN replay reaches the final Cursor, THE Test_Suite SHALL compare the complete Replay_Projection with Live_Fold output for the same Canonical_Record collection.
4. WHEN Static_Replay is rendered in the DOM harness, THE Test_Suite SHALL fail on WebSocket, XMLHttpRequest, EventSource, Crew navigation, Backend request, or any fetch other than `./fixture.jsonl` and local build assets.
5. WHEN Replay_Fixture or Static_Replay output is checked, THE Test_Suite SHALL fail on credentials, absolute Home_Paths, localhost Gateway origins, remote runtime assets, or executable live Gateway transports.
6. WHEN README Install_Command is checked, THE Test_Suite SHALL verify the referenced script exists, the documented minimum Crew version matches the manifest and install script, and the existing dry-run install harness accepts the command form.
7. WHEN the Pages static artifact is checked locally, THE Test_Suite SHALL load `index.html`, every referenced local asset, and `fixture.jsonl` through a bounded ephemeral HTTP smoke harness.
8. WHEN release validation runs, THE Test_Suite SHALL run Normal_CI checks, replay properties, DOM parity, publication checks, manifest freeze checks, documentation checks, asset checks, and Pages smoke checks without contacting a live Crew_Gateway.

### Requirement 12: Dated MVP-first submission plan [MVP]

**User Story:** As a hackathon developer, I want dated gates and deferred cosmetics, so that the complete safe demo ships before the deadline.

#### Acceptance Criteria

1. THE Submission_Plan SHALL record 2026-11-15 as the planning current date.
2. THE Submission_Plan SHALL schedule canonical contract reconciliation and Replay_Engine completion no later than 2026-11-22.
3. THE Submission_Plan SHALL schedule Attic UI, replay isolation, and a public Pages candidate no later than 2026-11-26.
4. THE Submission_Plan SHALL schedule permission freeze, clean live install rehearsal, submission-document draft, and replay smoke evidence no later than 2026-11-29.
5. THE Feature_Freeze SHALL begin on 2026-11-30.
6. THE Submission_Plan SHALL schedule final screenshots, credits, accessibility evidence, and checklist closure no later than 2026-12-01.
7. THE Submission_Plan SHALL schedule final video recording and upload on 2026-12-02.
8. THE Submission_Plan SHALL schedule final submission on 2026-12-03 before the 2026-12-04 14:00 Pacific Time deadline.
9. WHILE any MVP acceptance criterion or release gate is incomplete, THE Submission_Plan SHALL keep every Stretch_Feature unscheduled or queued after MVP work.
10. WHEN Feature_Freeze begins, THE Submission_Plan SHALL admit only defect, accessibility, security, evidence, and submission-packaging changes to Judge_Facing_Version.
11. WHERE time remains after every MVP gate passes, THE Submission_Plan SHALL schedule cosmetic polish and other Stretch_Feature work after the complete submission rehearsal.
