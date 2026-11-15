# Implementation Plan: Doors and Guardrails

## Overview

Implement Spec 4 only after `seance-log-and-ghost-state` exposes its canonical App_Event, Canonical_Event_Writer, compare-and-append, canonical read result, backend Crew ingest, Ghost_Snapshot, and replay fold. Build Spec 4 domain payloads and pure folds over acknowledged canonical records; then add path and approval guards, app-owned Crew REST sessions, the room MCP module, signed workflow routes, and decision UI. Do not create a Spec 4 event schema, Event_ID algorithm, Sequence allocator, hash chain, log file, log store, parser, Crew WebSocket, Crew normalizer, Ghost reducer, or replay ordering implementation.

## Tasks

- [ ] 1. Verify runtime security contracts (MVP)
  - [ ] 1.1 Build the S9 app-MCP launch and identity spike
    - Verify app-relative MCP launch, process cwd/environment, per-profile tool visibility, and an unforgeable binding among app-owned slot, Ghost, Mansion, and Room.
    - Save scrubbed results under `spikes/`; fail unless mutation tools derive trusted context without model-supplied authority.
    - _Requirements: 6.1, 6.2, 6.9, 11.1, 11.2, 11.7_

  - [ ] 1.2 Build the S10 approved-process confinement spike
    - Exercise allowed/denied project access, credential paths, network, process escape, symlinks, and hard links from an approved structured command.
    - Disable command and git actions when confinement cannot be proven; keep guarded delete independent.
    - _Requirements: 3.9, 5.3, 5.6, 11.7_

- [ ] 2. Define Spec 4 domain payloads over the Spec 2 writer (MVP)
  - [ ] 2.1 Implement typed domain payload models and builders
    - Add `core/guardrail_events.py` with the `doors_and_guardrails` domain identifier, allowed workflow/Door/approval/action/denial/outcome kinds, exact payload validators, bounded content-free fields, and App_Event_Candidate builders.
    - Accept acknowledged Spec 2 Event_ID and Sequence as read-only metadata; assign no canonical writer field.
    - _Requirements: 2.2, 2.3, 3.1–3.3, 5.8, 6.7, 10.1–10.3, 10.7, 10.8_

  - [ ] 2.2 Write the property test for safe domain payload construction
    - **Property 16: Domain payload builders exclude sensitive or content-bearing fields**
    - Generate document bodies, raw/encoded credentials, capabilities, tool data, errors, DTOs, and result values for at least 100 Hypothesis examples.
    - **Validates: Requirements 10.3, 10.7, 11.8**

  - [ ] 2.3 Add the Spec 2 writer port and canonical domain reader
    - Inject the completed `CanonicalEventWriter` interface into Spec 4 services; filter selected canonical records by domain and validate payloads before folding.
    - Use `append_candidates` and `compare_and_append`; expose no Event_Log path, file handle, Sequence assignment, hash calculation, or direct storage adapter.
    - _Requirements: 1.2, 2.2–2.6, 3.1–3.8, 8.1, 8.7, 10.1, 10.2, 10.4, 10.5, 10.8_

  - [ ] 2.4 Add cross-spec writer and ownership tests
    - Use the real Spec 2 in-memory/file writer to prove domain candidate round trips, Projection_Version from highest Sequence, stale compare conflicts, restart reads, and no alternate durable file.
    - Add a structural test rejecting `seance.py`, `seance_store.py`, `seance.jsonl`, Spec 4 event/hash serializers, direct log opens, and Spec 4 Crew mapping tables.
    - _Requirements: 2.6, 3.5, 3.6, 10.1–10.8, 12.3_

- [ ] 3. Implement deterministic phases and Door decisions (MVP)
  - [ ] 3.1 Implement the pure Phase_State_Machine
    - Add `core/workflow.py` with four phases, fixed predecessor edges, states, initial projection, domain-record validation, explicit start commands, revision-required flow, and valid-prefix domain behavior over Sequence-ordered App_Events.
    - Ignore other domains, preserve preceding valid domain state on invalid transition, and set Projection_Version to highest canonical Sequence observed.
    - _Requirements: 1.1–1.9, 10.2, 12.1_

  - [ ]* 3.2 Write the property test for phase order and explicit advancement
    - **Property 1: Phase order and explicit advancement always hold**
    - **Validates: Requirements 1.1, 1.3–1.8, 12.1**

  - [ ]* 3.3 Write the property test for canonical domain folding
    - **Property 2: Workflow folding is deterministic over canonical Sequence**
    - Generate other-domain records, invalid transitions, and repeated folds.
    - **Validates: Requirements 1.2, 1.9, 10.2**

  - [ ] 3.4 Implement exact Door proposal and decision rules
    - Add Artifact_Revision, Door_Proposal, supersession, first-wins exact decision, candidate construction, and separate successor start behavior.
    - Submit decisions through compare-and-append against Projection_Version.
    - _Requirements: 2.1–2.6, 6.6, 8.3, 8.5_

  - [ ]* 3.5 Write the property test for current Door revisions
    - **Property 3: A Door decision applies only to the current artifact revision**
    - Mutate proposal, phase, path, revision, digest, and Projection_Version.
    - **Validates: Requirements 2.1–2.5, 6.6, 8.3, 8.5**

  - [ ]* 3.6 Write the property test for first-wins Door decisions
    - **Property 4: The first exact Door decision wins**
    - Model competing compare-and-append decisions.
    - **Validates: Requirements 2.6**

- [ ] 4. Implement Action_Descriptor and Approval_Ledger folds (MVP)
  - [ ] 4.1 Implement action canonicalization and ledger projection
    - Add `core/approvals.py` with schema-versioned structured descriptors, path intents, stable canonical bytes/digests, proposal states, decision references, and a fold over acknowledged Spec 4 domain records.
    - Reject shell strings, caller environments, floats, controls, unsupported actions, and values that cannot be displayed exactly.
    - _Requirements: 3.1–3.4, 3.7, 9.3, 9.4_

  - [ ]* 4.2 Write the property test for action canonicalization
    - **Property 5: Action canonicalization is stable and complete**
    - **Validates: Requirements 3.1, 3.4**

  - [ ] 4.3 Implement exact authorization, consumption decisions, and Crew correlation
    - Build exact proposal authorization, failed-attempt retention, `(slot, mid, tool, proposal, digest)` correlation, and consumption candidates carrying expected Projection_Version.
    - Treat `approval_id` only as Crew response data. Require writer acknowledgment before execution.
    - _Requirements: 3.2–3.8, 4.1, 4.2, 4.5, 4.6, 6.8, 11.5, 11.6_

  - [ ]* 4.4 Write the property test for exact approval
    - **Property 6: A risky action never runs without one exact approval**
    - **Validates: Requirements 3.2–3.4, 3.7, 3.9, 6.8**

  - [ ]* 4.5 Write the state-machine property test for one-time consumption
    - **Property 7: A risky approval is consumed at most once**
    - Generate competing claims, compare conflicts, failures, and retries.
    - **Validates: Requirements 3.5, 3.6, 3.8**

  - [ ]* 4.6 Write the property test for exact Crew permission correlation
    - **Property 8: Crew permission correlation requires message identity and exact action**
    - Reuse `approval_id` across slots and `mid` values.
    - **Validates: Requirements 4.1, 4.2, 4.5, 4.6**

- [ ] 5. Implement Room_Policy and guarded filesystem access (MVP)
  - [ ] 5.1 Implement pure path parsing and Room_Policy evaluation
    - Add component-based relative parsing, access kinds, fixed room allowlists, protected-path denials, deny-overrides behavior, and path-evidence decisions.
    - Tinkers cannot write `.kiro/specs/**`; approval cannot widen policy.
    - _Requirements: 3.9, 5.2, 5.3, 5.7, 5.9, 6.3–6.5, 6.8, 11.5_

  - [ ]* 5.2 Write the property test for room-confined access
    - **Property 9: Ghost access remains inside Effective_Room_Policy**
    - **Validates: Requirements 3.9, 5.3, 5.7, 5.9, 6.3–6.5, 6.8, 11.5, 11.6**

  - [ ]* 5.3 Write the property test for traversal rejection
    - **Property 10: Traversal-shaped paths are rejected before access**
    - **Validates: Requirements 5.2**

  - [ ] 5.4 Implement descriptor-relative guarded filesystem operations
    - Add `adapters/guarded_filesystem.py` with no-follow traversal, canonical containment, regular-file and hard-link checks, anchored reads, same-directory atomic replacement, guarded unlink, and empty-directory removal.
    - Submit prepared/completed/recovered content-free domain candidates through the Spec 2 writer; never write audit data directly.
    - _Requirements: 5.1, 5.3–5.8, 6.6, 6.7_

  - [ ]* 5.5 Add filesystem race and recovery tests
    - Cover inward/outward symlinks, hard links, devices/FIFOs, non-empty directories, path replacement races, all spec-write fault points, denial without target access, and canonical evidence acknowledgments.
    - _Requirements: 5.1, 5.3–5.8, 6.7_

- [ ] 6. Checkpoint: verify domain, approval, and path core
  - Ensure all completed core tests pass; ask the user if a requirement or safety decision needs revision.

- [ ] 7. Implement approved risky-action adapters (MVP)
  - [ ] 7.1 Implement guarded delete and action-runner interface
    - Compare-and-append exact consumption before dispatch; implement one-file and empty-directory delete through GuardedFilesystem; append redacted success/failure domain candidates through Spec 2.
    - _Requirements: 3.4–3.9, 5.1, 6.8, 10.1_

  - [ ] 7.2 Implement structured command and git confinement from S10
    - Implement allowlisted exact argv, fixed environment, guarded cwd/path intents, timeout, output bounds, no network, no shell parser, and only `git add`/`git commit`.
    - Return `confinement_unavailable` without a process when S10 does not pass.
    - _Requirements: 3.4, 3.8, 3.9, 5.3, 5.6, 6.8, 11.7, 11.8_

  - [ ]* 7.3 Add action-runner integration tests
    - Assert acknowledged consumption precedes every side effect, descriptor matching, output redaction, timeout handling, denied access, unsupported git operations, and fail-closed confinement.
    - _Requirements: 3.4–3.9, 6.8, 10.1, 11.7, 11.8_

- [ ] 8. Add app-owned Crew REST sessions and canonical event consumption (MVP)
  - [ ] 8.1 Extend GatewayClient with typed chat routes
    - Implement create slot, set project, set normal mode, send turn, get session, and exact approve/reject operations with validated dynamic values and bounded errors.
    - Add no spawn/global approval route and no WebSocket client.
    - _Requirements: 4.3, 4.4, 7.1–7.5, 11.4, 11.8_

  - [ ] 8.2 Implement Session_Reconciler over canonical events
    - Consume acknowledged Spec 2 tool/approval events, request Spec 2 history reconciliation for unresolved registered slots, correlate exact proposals, append external decision/ignored-resolution domain candidates, and clear uncertainty only after canonical catch-up.
    - Do not parse raw Crew frames or assign canonical writer fields.
    - _Requirements: 4.1–4.8, 7.6–7.8, 10.1_

  - [ ] 8.3 Implement the three-session Workshop cap
    - Add a pure scheduler projection for queued starts, completions, failures, stops, and explicit retries; count starting and working sessions; use no spawn fallback.
    - _Requirements: 7.2, 7.9_

  - [ ]* 8.4 Write the property test for concurrency
    - **Property 11: Implementation concurrency never exceeds three**
    - **Validates: Requirements 7.9**

  - [ ]* 8.5 Add fake-Gateway and raw-ingest integration tests
    - Assert S6 REST order/bodies, interactive mode, token refresh, exact resolution fields, history catch-up, repeated approval IDs, first-answer conflicts, and no backend WebSocket.
    - Feed raw S6 frames through Spec 2 ingest once and pass only acknowledged canonical events to Session_Reconciler.
    - _Requirements: 4.1–4.8, 7.1–7.10_

- [ ] 9. Wire workflow, approval, session, and domain replay services (MVP)
  - [ ] 9.1 Implement Mansion resolution and WorkflowService
    - Add canonical Mansion resolution, phase reservations, Crew setup, Spec 5 validated output submission, exact Door/risky decisions, consume-before-execute, and stable redacted errors.
    - Use one Spec 2 writer port for API, MCP, and external Crew decisions.
    - _Requirements: 1.3–1.8, 2.1–2.6, 3.2, 3.3, 3.5, 3.8, 8.2, 8.6, 8.7_

  - [ ] 9.2 Implement incremental and replay domain projections
    - Fold only selected canonical App_Events, propagate Spec 2 integrity/valid-prefix data, derive Projection_Version from highest Sequence, and produce workflow, Door, waiting, proposal, approval, consumption, and outcome projections.
    - _Requirements: 8.1, 10.2, 10.4–10.6_

  - [ ]* 9.3 Write the property test for Spec 4 replay parity
    - **Property 15: Spec 4 live and replay projections agree**
    - **Validates: Requirements 10.4, 10.5, 10.6**

  - [ ]* 9.4 Add service, restart, and recovery integration tests
    - Cover failed reservations, prepared writes, consumed actions without outcomes, late resolutions, writer failures, restart reads, and allowed/denied/failed canonical evidence chains.
    - _Requirements: 5.8, 6.7, 8.7, 10.1, 10.4, 10.5, 10.7_

- [ ] 10. Implement and bind the room-scoped MCP server (MVP)
  - [ ] 10.1 Implement the bounded stdio protocol adapter
    - Add strict initialize/tools-list/tools-call support, exact profile catalogs, redacted errors, and no protocol stdout noise.
    - _Requirements: 6.1, 6.2, 6.9, 11.7, 11.8_

  - [ ] 10.2 Bind trusted session context and writer access from S9
    - Implement the verified app-relative launch and unforgeable identity binding; expose no mutation when identity is absent/stale/mismatched.
    - Reach the Canonical_Event_Writer through the capability-bound backend interface; never open an Event_Log or expose the capability to the model.
    - _Requirements: 6.2, 6.9, 10.8, 11.7, 11.8_

  - [ ] 10.3 Implement room file and phase-output tools
    - Implement list/read, guarded Tinker writes, phase-specific spec writes, and output submission with expected revisions and canonical domain evidence.
    - _Requirements: 5.1, 5.8, 6.2–6.7, 9.4, 10.1_

  - [ ] 10.4 Implement risky proposal and approved execution tools
    - Implement exact displayable descriptors, proposal append, ledger/path checks, compare-and-append consumption, guarded dispatch, redacted results, and waiting responses without self-approval.
    - _Requirements: 3.1–3.9, 6.8, 9.3, 9.4, 11.5, 11.6_

  - [ ]* 10.5 Add MCP protocol, identity, writer, and authority tests
    - Spawn the stdio server and test exact tools, malformed input, absent/forged context, stale revisions, out-of-room requests, secondary-allow bypass, action matching, canonical writer calls, and no direct log access.
    - _Requirements: 5.1, 6.2–6.9, 10.8, 11.5–11.8_

- [ ] 11. Add the signed workflow and decision API (MVP)
  - [ ] 11.1 Implement strict request parsers and projection DTOs
    - Parse Mansion, Phase, command ID, Projection_Version, Artifact_Revision, Action_Digest, and bounded reasons/assignments; reject unknown fields before candidate construction.
    - _Requirements: 8.2–8.6_

  - [ ]* 11.2 Write the property test for invalid or stale commands
    - **Property 12: Invalid or stale workflow commands append no domain record**
    - **Validates: Requirements 8.2–8.6**

  - [ ] 11.3 Implement workflow, Door, and risky-decision routes
    - Add current workflow, phase start, Door approve/reject, and risky approve/reject routes behind foundation signatures.
    - Return acknowledged Event_ID/Sequence and updated projection; reuse Spec 2 event/integrity endpoints instead of adding audit verification.
    - _Requirements: 8.1–8.8, 10.8_

  - [ ]* 11.4 Add signed endpoint integration tests
    - Cover success, stale 409, invalid 400, missing 404, canonical-integrity 423, Crew 502/504, duplicate command idempotence, and invalid signatures reaching no service.
    - _Requirements: 8.1, 8.5–8.8_

- [ ] 12. Declare least-privilege app resources (MVP)
  - [ ] 12.1 Update the manifest with final S9 MCP and Crew permissions
    - Declare gateway-managed MCP/agents/skills; exact version/chat/own-backend paths; `sessionApproval: true`; and consumed advisory events.
    - Keep spawn/global approval paths, backend WebSocket additions, and every `autoApprove` absent.
    - _Requirements: 6.1, 7.2–7.4, 11.3, 11.4_

  - [ ] 12.2 Create baseline Archivist, Draughtsman, Foreman, and Tinker profiles
    - Add exact room MCP selectors, explicit resources, V3 deny rules, disabled inherited MCP, no built-in mutation/web/subagents, and empty legacy approval fields.
    - _Requirements: 5.9, 6.1–6.5, 11.1–11.3_

  - [ ]* 12.3 Add manifest and profile policy tests
    - Compare manifest paths with route templates; assert exact resources/tools, no spawn/global approval/backend-WS route, no wildcard or auto approval, and S9 launch fields.
    - _Requirements: 6.1, 6.2, 7.2–7.4, 11.1–11.4_

- [ ] 13. Build UI projection logic and live adapters (MVP)
  - [ ] 13.1 Implement strict WorkflowProjection parsing and UI state
    - Parse complete backend projections and acknowledged Spec 2 Ghost_Snapshots, detect Sequence/version gaps, disable malformed/uncertain authority, and represent every phase, Door, and proposal outcome.
    - Do not consume raw Crew envelopes or implement a browser approval fold.
    - _Requirements: 4.8, 8.1, 9.1–9.4, 9.7, 9.9, 10.4_

  - [ ]* 13.2 Write the property test that UI activity cannot approve
    - **Property 13: Non-decision UI activity cannot approve a proposal**
    - **Validates: Requirements 9.9**

  - [ ] 13.3 Implement Needs You and notification coalescing
    - Add pure selectors and a 10-second per-Ghost coalescer for waiting, blocked, and failed transitions only.
    - _Requirements: 9.5, 9.6_

  - [ ]* 13.4 Write the notification property test
    - **Property 14: Waiting notifications obey the interruption window**
    - **Validates: Requirements 9.5, 9.6**

  - [ ] 13.5 Implement signed workflow adapter and canonical refresh
    - Add projection reads, phase starts, exact decisions, conflict refresh, Spec 2 canonical-event refresh triggers, and low-frequency polling only while waiting or uncertain.
    - _Requirements: 4.8, 8.1–8.5, 8.7, 9.5–9.7_

- [ ] 14. Build accessible house, Door, and waiting panels (MVP)
  - [ ] 14.1 Implement the spatial House Map and room shells
    - Add accessible Study, Drafting Room, and Workshop navigation with phase, Door, and Ghost text/icons, Arrow/Enter/Escape behavior, focus restoration, Crew variables, and plain CSS.
    - _Requirements: 9.1, 9.8_

  - [ ] 14.2 Implement exact Door and risky-action panels
    - Show document path/revision, complete action descriptor/scope, digest prefix, one-attempt wording, separate Approve/Reject, and disabled approval for incomplete displays.
    - _Requirements: 2.4, 3.4, 4.8, 9.2–9.4, 9.7, 9.9_

  - [ ] 14.3 Wire waiting, blocked, failed, and resolved state
    - Add one polite live region, Needs You badge, bounded notifications, explicit starts, uncertainty/integrity blocking, reduced motion, and text-plus-icon state.
    - _Requirements: 4.8, 9.1, 9.5–9.9, 11.7_

  - [ ]* 14.4 Add DOM, accessibility, and keyboard tests
    - Cover all states, exact proposal details, external resolutions, stale refresh, badge/live region/toasts, keyboard/focus, reduced motion, and no decisions from viewing or `chat_done`.
    - _Requirements: 4.8, 9.1–9.9_

- [ ] 15. Extend replay through the Spec 2 canonical fixture (MVP)
  - [ ] 15.1 Implement Spec 4 replay projection adapter
    - Read only Spec 2 canonical replay records, fold Spec 4 domain payloads, propagate valid-prefix diagnostics, render the same house, and make no live request.
    - _Requirements: 10.4–10.6_

  - [ ]* 15.2 Add replay parity, integrity, and no-network tests
    - Compare backend and TypeScript projections for the same canonical fixture; assert diagnostics come from Spec 2 and no Spec 4 event parser/hash verifier/log file exists.
    - _Requirements: 10.4–10.8_

  - [ ] 15.3 Build and verify the live ESM bundle
    - Build `app/ui/dist/index.mjs`, run host-import checks, and verify replay still uses the SDK stand-in.
    - _Requirements: 9.1–9.3, 9.5, 10.6_

- [ ] 16. Integrate the guarded workflow end to end (MVP)
  - [ ] 16.1 Wire phase starts, app-owned sessions, MCP tools, Doors, risky approvals, and canonical replay
    - Connect service lifecycle without a Spec 4 WebSocket; route raw browser events through Spec 2 and every domain candidate through its writer.
    - Exercise requirements start/output/approval, design start/output/approval, tasks start/output/approval, and implementation start without automatic advancement.
    - _Requirements: 1.3–1.7, 2.1–2.3, 3.2, 3.5, 4.3, 5.1, 6.8, 7.1, 7.6–7.9, 8.1, 10.1, 12.1–12.3_

  - [ ]* 16.2 Add full guarded-workflow integration tests
    - Use fake Crew and real MCP to verify phase refusal, exact Door approval, app/external Session_Approval, one-time action, out-of-room denial, bypassed-hook denial, canonical catch-up, and complete canonical evidence.
    - _Requirements: 1.4, 1.7, 2.4, 2.6, 3.4–3.7, 3.9, 4.5, 4.6, 5.3, 5.8, 6.9, 7.8, 10.7, 11.5–11.8_

  - [ ]* 16.3 Add safety regression fixtures
    - Add scrubbed canonical traces proving phase order, exact approval before risky execution, and no project access outside Effective_Room_Policy; replay through Spec 2 and Spec 4 folds.
    - _Requirements: 1.4, 1.7, 3.4, 3.7, 3.9, 5.3, 5.7, 10.4, 10.7_

- [ ] 17. Final checkpoint: verify Spec 4 and dependency boundaries
  - Run all tests and builds; ask the user if a requirement or security decision needs revision.

- [ ] 18. Add the explicit Séance Room return loop (stretch)
  - [ ]* 18.1 Implement optional review and return-proposal transitions
    - Add disabled-by-default review domain kinds; permit review only after implementation output readiness and create a pending return proposal without starting a Phase.
    - _Requirements: 12.4–12.6_

  - [ ]* 18.2 Write the stretch-boundary property test
    - **Property 17: Stretch review cannot bypass an explicit return decision**
    - **Validates: Requirements 12.4–12.6**

  - [ ]* 18.3 Add feature-flagged Séance Room controls
    - Render exact review/return decisions only when enabled; reuse authority, keyboard, waiting, and canonical event paths.
    - _Requirements: 12.4–12.6_

  - [ ]* 18.4 Add stretch UI and integration tests
    - Verify disabled absence, no automatic restart after failure, and separate start after approved return.
    - _Requirements: 12.4–12.6_

## Notes

- Tasks marked `*` follow Kiro's optional test/stretch syntax. The verification plan still requires one test for every correctness property before claiming its requirement.
- Each property test runs at least 100 generated examples and includes `Feature: doors-and-guardrails, Property N: <title>`.
- S9 blocks mutation tools until trusted identity is proven. S10 controls command/git availability and never weakens path confinement.
- Spec 2 is a hard prerequisite. Spec 4 creates no alternate log, hash chain, parser, Sequence, Crew normalizer, backend WebSocket, Ghost reducer, or audit route.
- Spec 5 is the next dependency and owns artifact validation plus `run_completed`/`run_failed` settlement after canonical `crew_turn_ended`.
- No task uses `/api/spawn`, native `/spec`, wildcard approval, commits, pushes, deploys, or changes Crew trust.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "5.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.1", "4.1", "5.2", "5.3", "12.1", "12.2"] },
    { "id": 2, "tasks": ["2.4", "3.2", "3.3", "3.4", "4.2", "4.3", "5.4", "7.1", "8.1", "8.3", "12.3"] },
    { "id": 3, "tasks": ["3.5", "3.6", "4.4", "4.5", "4.6", "5.5", "7.2", "8.2", "8.4", "10.1", "11.1"] },
    { "id": 4, "tasks": ["7.3", "8.5", "9.1", "9.2", "10.2", "11.2", "13.1", "13.3"] },
    { "id": 5, "tasks": ["9.3", "9.4", "10.3", "10.4", "11.3", "13.2", "13.4", "13.5", "15.1"] },
    { "id": 6, "tasks": ["10.5", "11.4", "14.1", "14.2", "16.1", "18.1"] },
    { "id": 7, "tasks": ["14.3", "15.2", "16.2", "16.3", "18.2", "18.3"] },
    { "id": 8, "tasks": ["14.4", "18.4"] },
    { "id": 9, "tasks": ["15.3"] }
  ]
}
```
