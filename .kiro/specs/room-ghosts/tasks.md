# Implementation Plan: Room Ghosts

## Overview

Implement Room Ghosts after Spec 2 and Spec 4 public interfaces are complete. Begin with a conformance test that verifies, rather than adapts, those prerequisite seams. Then add only Room Ghosts-owned code: role prompts and skills, Ghost_Result and artifact validation, Task_Plan parsing, task-specific claim scheduling, cancellation/retry, output-first room panels, and the bounded stretch reviewer. Reuse Spec 2's canonical App_Event/Canonical_Event_Writer/Event_Log/Ghost_State stack and backend Crew normalization. Reuse Spec 4's Phase, Door, approval, MCP, path, CrewChat, and house UI boundaries. Do not add a compatibility layer, another log, writer, reducer, approval matcher, path gate, Crew normalizer, WebSocket owner, chat client, or `/api/spawn` fallback.

## Tasks

- [ ] 1. Resolve external contracts with executable spikes (MVP)
  - [ ] 1.1 Build the RG-C1 prerequisite conformance harness
    - Add characterization tests that import the completed Spec 2 App_Event, Canonical_Event_Writer, canonical read result, Event_Scope, Event_Log, Ghost_State_Reducer, and replay fold plus the completed Spec 4 Phase_State_Machine, WorkflowService, Door_Proposal, Approval_Ledger, MCP_Gate, CrewChat, and Session_Reconciler.
    - Prove one canonical replay source, raw Crew normalization only in Spec 2, shared run identity, Spec 4 compare-and-append authorization, compatible blocked reasons, and `run_completed` only after Room Ghosts artifact validation.
    - Fail closed on an absent or version-incompatible prerequisite. Do not create an adapter, substitute store, reducer, matcher, path gate, writer, or normalizer.
    - _Requirements: 9.5, 10.1–10.12, 15.9_

  - [ ] 1.2 Build the RG-S2 gateway-managed resource-loading probe
    - Add an opt-in automated probe app/session that determines the exact explicit `file://` and `skill://` forms for Mansion steering and installed app skills, confirms unsubscribe/tool visibility, and records a scrubbed machine-readable result.
    - Confirm each profile receives only the expected resource markers and exact spec 4 MCP selectors; use no implicit inheritance as the pass condition.
    - _Requirements: 2.1, 2.4, 2.5, 2.7, 15.5, 15.9_

  - [ ] 1.3 Build the RG-S3 owned-session cancellation probe
    - Add an opt-in automated test that creates a disposable app-owned session, starts a harmless waiting turn, invokes the app-token-scoped stop operation, and captures the unambiguous confirmation event while preserving already completed tool events.
    - Scrub credentials and absolute home paths; leave cancellation unavailable when no safe operation is verified.
    - _Requirements: 12.1, 12.2, 12.3, 15.6, 15.9_

  - [ ] 1.4 Build the RG-S4 existing-session navigation probe
    - Add an automated dashboard/SDK probe that opens an existing app-owned slot from an app page without creating another chat and records the stable SDK call or route contract.
    - _Requirements: 11.2, 11.3, 15.7, 15.9_

  - [ ] 1.5 Build the RG-S5 app-owned capacity probe
    - Start no more than three harmless Haunted House turns, capture scrubbed retryable refusal/status/event shapes when Crew applies pressure, distinguish terminal errors, and close accepted disposable slots.
    - _Requirements: 8.3, 8.6, 8.7, 15.8, 15.9_

- [ ] 2. Implement artifact codecs and validators (MVP)
  - [ ] 2.1 Implement the Ghost_Result codec
    - Create `app/backend/haunted_house/core/ghost_result.py` with frozen schema-version-1 models, strict duplicate/unknown-key rejection, bounded safe strings, normalized Mansion-relative artifact paths, lowercase hashes, run/task identity checks, and canonical sorted-key UTF-8 JSON.
    - _Requirements: 9.6, 9.7, 13.1, 13.2, 13.3, 13.4_

  - [ ]* 2.2 Write the property test for Ghost_Result serialization
    - **Property 2: Ghost_Result serialization round trip**
    - Generate every valid status and artifact combination for at least 100 Hypothesis examples with the required feature/property tag.
    - **Validates: Requirements 13.1, 13.3, 13.4**

  - [ ] 2.3 Implement the Task_Plan parser, validator, and printer
    - Create `app/backend/haunted_house/core/task_plan.py` for Kiro checkbox syntax, decimal leaf IDs, optional markers, `_Writes:` Path_Claims, `_Requirements:` references, and the fenced JSON Task Dependency Graph.
    - Validate contiguous waves, exact incomplete-leaf assignment, requirement coverage, normalized claims, and conservative same-wave conflicts; render one semantic canonical form.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 13.5, 13.6, 13.7, 13.8_

  - [ ]* 2.4 Write the property test for Task_Plan serialization
    - **Property 3: Task_Plan serialization round trip**
    - Generate valid ordered plans for at least 100 Hypothesis examples with the required feature/property tag.
    - **Validates: Requirements 7.2, 7.3, 7.4, 13.5, 13.6, 13.7**

  - [ ]* 2.5 Write the property test for invalid graphs and claims
    - **Property 4: Invalid task graphs and conflicting waves are rejected**
    - Mutate generated valid plans one fault at a time and assert the finding identifies the task, wave, claim, or uncovered requirement.
    - **Validates: Requirements 7.4, 7.5, 7.6, 7.7, 13.8**

  - [ ] 2.6 Implement requirements, design, and task artifact validation
    - Create `app/backend/haunted_house/core/artifact_validation.py` with required-heading, EARS, glossary, design-section, property-traceability, assumption/spike, task-grammar, and requirements-coverage checks plus stable bounded Finding codes.
    - Keep validation pure and use no native Kiro `/spec` operation.
    - _Requirements: 5.2, 5.3, 5.5, 6.2, 6.3, 6.4, 6.5, 7.8_

  - [ ]* 2.7 Write artifact validator unit and generated-input tests
    - Cover all six EARS patterns, ambiguous criteria, undefined terms, missing sections, malformed property references, native `/spec` instructions, Unicode, empty documents, and bounded findings.
    - _Requirements: 5.2, 5.3, 5.5, 6.2, 6.3, 6.4, 6.5, 7.8, 15.2_

- [ ] 3. Build bounded role prompts (MVP)
  - [ ] 3.1 Implement typed phase, revision, Tinker, and Medium prompt construction
    - Create `app/backend/haunted_house/core/prompts.py`; delimit user/model text as data; enforce byte and field limits, one objective, one Selected_Task, exact requirements, approved upstream hashes, Path_Claim, expected revisions, exact spec 4 tool names, and the Ghost_Result schema.
    - Reject authority-bearing or traversing input and state that `/spec`, `/api/spawn`, direct built-in mutation, unrelated work, and extra final prose are outside the assignment.
    - _Requirements: 3.4, 3.7, 5.1, 5.7, 6.1, 6.7, 7.1, 9.1, 14.1_

  - [ ]* 3.2 Write the property test for prompt confinement
    - **Property 5: Rendered prompts cannot widen a run**
    - Generate prompt-looking briefs, feedback, paths, claims, and one-task contexts for at least 100 Hypothesis examples.
    - **Validates: Requirements 3.4, 3.7, 9.1**

  - [ ]* 3.3 Write golden and boundary tests for every role prompt
    - Cover Markdown fences, Unicode, controls, traversal, oversized text, duplicate task IDs, unknown requirements, upstream hashes, exact tools, and final response grammar.
    - _Requirements: 3.4, 3.7, 5.1, 5.4, 6.1, 6.4, 7.1, 9.1, 14.1, 15.2_

- [ ] 4. Specialize gateway-managed room agents and skills (MVP)
  - [ ] 4.1 Implement specialized Agent_Profile and Room_Skill validation
    - Add Room Ghosts role contracts to `app/backend/haunted_house/core/profile_contracts.py`: exact spec 4 tool selectors, V3 effects, explicit RG-S2 resources, empty `allowedTools`, disabled inherited MCP/Powers, manifest referential integrity, and recursive `autoApprove` rejection.
    - _Requirements: 1.2, 1.3, 1.4, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 4.2 Write the property test for unsafe role-profile mutations
    - **Property 1: Unsafe role-profile mutations are rejected**
    - Generate one authority/resource mutation from every valid role for at least 100 Hypothesis examples.
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**

  - [ ] 4.3 Complete the five focused Room_Skills
    - Specialize `ears-requirements`, `correctness-design`, `executable-tasks`, `scoped-implementation`, and stretch `bounded-review` with valid Agent Skills frontmatter, deterministic checklists, artifact grammar, bounded repair behavior, exact Ghost_Result examples, and no authority-bearing instructions.
    - Build on the spec 4 skill/profile files rather than creating parallel role resources.
    - _Requirements: 1.3, 1.4, 5.2, 5.3, 5.4, 6.2, 6.3, 6.4, 7.2, 7.3, 7.4, 9.2, 14.1, 14.2_

  - [ ] 4.4 Complete the Archivist, Draughtsman, Foreman, Tinker, and Medium profiles
    - Specialize the spec 4 runtime profiles with role prompts and exact output contracts; use only S9/RG-S2-proven MCP selectors/resources, V3 rules, empty `allowedTools`, `includeMcpJson: false`, `includePowers: false`, and no `autoApprove`.
    - Add the Medium as disabled-by-default stretch scope; expose no built-in write, shell, web, or subagent selector.
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.6, 3.7, 9.2_

  - [ ] 4.5 Reconcile the final manifest resource catalog
    - Extend the spec 4 manifest result only as needed for the Medium and final role/skill paths; preserve gateway lifecycle/resources, exact MCP registration, `/api/version`, `/api/chat`, `/api/chat/*`, own-backend paths, consumed events, and `sessionApproval: true`.
    - Keep spawn/global-approval paths, broad API prefixes, and `autoApprove` absent.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 4.6 Write and run profile, skill, manifest, and RG-S2 contract tests
    - Resolve every resource, validate frontmatter/folder names, compare manifest references and Gateway routes, snapshot visible authority, confirm installed resource markers and tool visibility, and verify denied built-in/out-of-room attempts.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.8, 15.1, 15.5_

- [ ] 5. Integrate validated terminal outcomes with the canonical log (MVP)
  - [ ] 5.2 Implement the validated terminal gate
    - Create `app/backend/haunted_house/services/terminal_gate.py` to require an acknowledged canonical `crew_turn_ended`, correlate bounded CrewChat final text, parse Ghost_Result, match run/task identity, inspect artifacts through Spec 4 guards, verify revisions/hashes, run Artifact_Validator, and call Spec 4 output submission.
    - Only after every check succeeds, append one house-origin `run_completed` candidate through the Spec 2 Canonical_Event_Writer. Otherwise append one supported redacted `run_failed` or `run_blocked` candidate and leave Door/task state unchanged.
    - Make settlement idempotent by logical run-terminal identity; never accept or normalize a raw `chat_done` frame.
    - _Requirements: 5.5, 5.6, 6.5, 6.6, 7.8, 7.9, 9.6, 9.7, 10.3, 10.9–10.12, 13.1, 13.2_

  - [ ]* 5.3 Write the property test for validated completion
    - **Property 6: Completion requires a canonical turn end and valid matching artifact**
    - Generate canonical turn-end facts, role/task results, identities, scopes, hashes, validator outcomes, and Spec 4 output decisions for at least 100 Hypothesis examples.
    - **Validates: Requirements 5.5, 5.6, 6.5, 6.6, 7.8, 7.9, 9.6, 9.7, 10.9, 10.10, 10.11, 13.2**

  - [ ]* 5.4 Write the property test for one canonical validated terminal fact
    - **Property 11: Canonical room integration has one validated terminal fact**
    - Generate duplicate raw delivery, canonical redelivery, interleaved turn/result/artifact arrival, and live/replay joins for at least 100 in-memory examples.
    - **Validates: Requirements 10.1–10.12**

  - [ ]* 5.5 Write cross-spec terminal and restart integration tests
    - Use the real Spec 2 writer/folds and Spec 4 in-memory services to cover valid artifact, malformed result, stale hash, Door rejection, duplicate raw `chat_done`, duplicate canonical `crew_turn_ended`, reconnect, backend restart, Record_ID deduplication, and no transient successful room projection.
    - Assert raw fixture frames enter only Spec 2 ingest and Room Ghosts opens no Event_Log.
    - _Requirements: 5.5, 5.6, 6.5, 6.6, 7.8, 7.9, 10.2–10.12_

- [ ] 6. Add dependency scheduling and task-specific authority (MVP)
  - [ ] 6.1 Implement Task_Claim models and conservative overlap
    - Create `app/backend/haunted_house/core/task_claims.py` with trusted run/task/claim identity, normalized paths, exact-path and conservative-glob overlap, active/released states, and canonical acquisition/release candidate builders.
    - _Requirements: 7.6, 8.2, 8.4, 8.5, 8.8, 9.3_

  - [ ] 6.2 Implement dependency-aware Workshop scheduling
    - Create `app/backend/haunted_house/core/workshop_scheduler.py` over TaskPlan, selected tasks, outcomes, active claims, and spec 4 session-cap state; choose only the lowest eligible wave in document order with at most three pairwise-disjoint claims.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8, 12.7_

  - [ ]* 6.3 Write the property test for safe ready dispatch
    - **Property 7: Scheduler dispatches only safe ready work**
    - Compare generated plans/outcomes/claims/capacities with a small reference scheduler for at least 100 Hypothesis examples.
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.8, 12.7**

  - [ ] 6.4 Implement deterministic backpressure transitions
    - Add `1, 2, 4, 8, 15` second retry delays, no attempt increment on capacity refusal, reset after accepted dispatch/active completion, and `capacity_unavailable` after five uninterrupted verified Crew refusals.
    - _Requirements: 8.6, 8.7_

  - [ ]* 6.5 Write the property test for backpressure preservation
    - **Property 8: Backpressure preserves task identity and attempt**
    - Generate refusal/capacity-release sequences for at least 100 Hypothesis examples.
    - **Validates: Requirements 8.6, 8.7**

  - [ ] 6.6 Extend the spec 4 room tool service with Task_Claim_Gate
    - Derive `(run_id, task_id, claim_id)` from trusted S9 session context, reject model-selected or stale claims, verify every path/access against the claim before spec 4 RoomPolicy/MCP_Gate/Path_Guard/Approval_Ledger, and require an expected digest for Tinker writes.
    - An allow from Task_Claim_Gate must never override a spec 4 denial; Tinkers remain unable to write `.kiro/specs/**` directly.
    - _Requirements: 8.2, 8.4, 8.8, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 6.7 Write the property test that task claims only narrow authority
    - **Property 9: A task claim can only narrow Tinker authority**
    - Generate RoomPolicies, claims, paths, access kinds, and trusted/mismatched identities for at least 100 Hypothesis examples.
    - **Validates: Requirements 8.2, 8.4, 8.8, 9.2, 9.3, 9.5**

  - [ ] 6.8 Implement the serialized Task_Plan checkbox writer
    - Use Spec 2 compare-and-append to serialize completion intent, re-read `tasks.md`, verify the expected digest, check only a validated successful task, preserve unrelated content, write through Spec 4 guarded replacement, append terminal evidence, then release the claim once.
    - _Requirements: 8.5, 9.6, 9.7, 9.8, 10.1_

  - [ ]* 6.9 Write the property test for completion confluence
    - **Property 10: Parallel task completion is confluent**
    - Apply generated distinct completion sets in permutations for at least 100 Hypothesis examples.
    - **Validates: Requirements 8.5, 9.8**

  - [ ]* 6.10 Write MCP and scheduler integration tests
    - Use spec 4's real MCP subprocess and in-memory/canonical store to test three disjoint tasks plus a queued fourth, overlapping serialization, forged/stale claims, stale file digests, risky action approval, capacity backpressure, concurrent completion, and exact-once claim release.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ] 7. Implement role-run, recovery, and review services (MVP, with stretch review)
  - [ ] 7.1 Implement GhostRunBinding and role-run coordination
    - Create `app/backend/haunted_house/services/room_ghost_service.py` that invokes Spec 4 WorkflowService/CrewChat for explicit phase starts, appends the matching `run_started` candidate through the Spec 2 writer, renders one role prompt, consumes acknowledged Record_ID values once, and joins Ghost_Snapshot with WorkflowProjection without an independent state store.
    - Consume raw Crew activity only after Spec 2 returns canonical App_Events.
    - _Requirements: 3.1–3.8, 5.1, 6.1, 7.1, 10.1–10.8, 10.12_

  - [ ] 7.2 Implement same-session pre-approval revision feedback
    - Validate bounded feedback, preserve sealed/current Door semantics, reuse the active Archivist/Draughtsman session before approval, build a revision prompt, and route the new artifact through terminal validation and spec 4 supersession.
    - _Requirements: 5.6, 5.7, 6.6, 6.7_

  - [ ] 7.3 Implement Workshop orchestration
    - Parse the approved plan, select tasks, acquire durable claims, start fresh Tinker sessions through spec 4 CrewChat, pass one-task prompts/expected revisions, classify RG-S5 capacity, validate results, write checkboxes, release terminal claims, and block dependents after non-success.
    - _Requirements: 7.9, 7.10, 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 8.8, 9.1, 9.6, 9.7, 9.8, 12.7_

  - [ ] 7.4 Implement cancellation and explicit retry
    - Use RG-S3's owned-session cancellation contract, submit canonical cancel-requested/confirmed/unconfirmed facts, preserve prior events, release a claim only on confirmed terminal outcome, create a fresh slot/Run_Sequence for explicit retry, and enforce three attempts.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [ ]* 7.5 Write the property test for bounded cancellation and retry
    - **Property 12: Cancellation and retry stay bounded**
    - Generate histories, confirmation timing, prior events, claims, and attempts for at least 100 Hypothesis examples.
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.5, 12.6, 12.8**

  - [ ]* 7.6 Implement the Medium and bounded Review_Cycle (stretch)
    - Add strict verdict/finding parsing, review only after Workshop completion, one explicit repair-task proposal per finding, normal claim scheduling for approved repairs, pass termination, disabled-state absence, and blocked state after the third non-pass.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [ ]* 7.7 Write the property test for bounded review termination (stretch)
    - **Property 13: The review loop terminates within three cycles**
    - Generate verdict/finding sequences for at least 100 Hypothesis examples.
    - **Validates: Requirements 14.3, 14.4, 14.5, 14.6**

- [ ] 8. Expose only Room Ghosts-owned backend commands (MVP)
  - [ ] 8.1 Implement typed Room Ghosts request handlers
    - Add joined room-projection, bounded feedback, Workshop start/selection, run cancel, and explicit retry handlers with strict body/name/ID/version validation and stable 200/202/400/404/409/503 responses.
    - Reuse spec 4 phase-start, Door, risky-decision, workflow, and audit routes; add no second approval endpoint.
    - _Requirements: 3.8, 5.7, 6.7, 7.10, 8.1, 10.4, 11.1, 12.1, 12.5_

  - [ ] 8.2 Wire Room Ghosts services into existing backend lifecycle
    - Extend the established service container and `server.py` cleanup contexts with terminal correlation, scheduler timers, canonical projections, and cancellation tasks while preserving foundation proxy verification, loopback binding, app-token/redaction behavior, Spec 2 raw ingest/writer, and Spec 4 adapters.
    - Add no Event_Log writer, raw Crew normalizer, or backend WebSocket.
    - _Requirements: 3.1, 3.5, 10.1–10.12, 12.8_

  - [ ]* 8.3 Write signed route and lifecycle integration tests
    - Cover invalid input, sealed/stale Doors through spec 4, unavailable canonical contracts, accepted async work, feedback, cancel timeout, retry limit, restart reconciliation, and redacted responses; verify no duplicate approval or state endpoint.
    - _Requirements: 3.8, 5.6, 6.6, 7.9, 10.5, 10.7, 10.8, 10.9, 12.3, 12.4, 12.5, 12.6, 15.2_

- [ ] 9. Build artifact-first room panels on the existing house (MVP, with stretch Séance panel)
  - [ ] 9.1 Implement strict joined RoomProjection parsing and API hooks
    - Add `app/ui/src/core/room-projection.ts` and `app/ui/src/adapters/room-ghosts-api.ts` to join spec 2 Ghost_Snapshot with spec 4 WorkflowProjection plus artifact/task state, detect version/integrity mismatches, and call only feedback, Workshop, cancel, retry, and RG-S4 existing-slot navigation operations.
    - Keep direct `@kirocrew/app-sdk` imports in the existing SDK adapter.
    - _Requirements: 10.4, 10.6, 11.1, 11.2, 11.5, 12.1, 12.5_

  - [ ] 9.2 Implement shared artifact, output, Session_Link, and recovery components
    - Create accessible plain-CSS components for rendered/safe-text artifacts, deterministic findings, current digest, Ghost_State text/icon, visible write scope, attempt/outcome summary, secondary existing-session link, and state-gated Cancel/Retry.
    - Add no chat composer, notification coalescer, approval inference, or duplicate Door/Risky decision panel.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.8, 11.9, 12.1, 12.5, 12.6_

  - [ ] 9.3 Extend the existing Study and Drafting Room panels
    - Place requirements/design output before status, reuse spec 4 Door/Waiting controls, show validation findings/authority, support revision/start actions from valid phase state, and place Session_Link secondarily.
    - _Requirements: 5.1, 5.6, 5.7, 5.8, 6.1, 6.6, 6.7, 6.8, 11.1, 11.2, 11.3_

  - [ ] 9.4 Extend the existing Workshop with a task board
    - Render tasks, waves, optional markers, requirement refs, Path_Claims, queue/active/backpressure/failure states, active Tinker count, selection/start controls, and one secondary Session_Link per run.
    - _Requirements: 7.1, 7.9, 7.10, 8.1, 8.2, 8.3, 8.6, 9.7, 11.1, 11.2, 11.3_

  - [ ]* 9.5 Implement the Séance Room output panel (stretch)
    - Render Review_Cycle, Medium verdict, traced findings, explicit repair proposals, blocked-after-three state, and Medium Session_Link using the same artifact-first patterns and spec 4 return-decision controls.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [ ] 9.6 Wire panels into spec 4 HouseMap and spec 2 replay
    - Preserve spec 4 keyboard, focus, Needs You, notification, approval, Door, reduced-motion, and Still house behavior; feed output panels from canonical joined projections and disable mutations/session navigation in replay.
    - _Requirements: 10.6, 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

  - [ ]* 9.7 Write room DOM and accessibility tests
    - Cover every Ghost/Door state, artifact-first document order, no composer, existing approval controls, redacted tool input, Session_Link identity, cancel/retry, task-board concurrency, focus restoration, text-plus-icon status, reduced motion, and replay-disabled actions.
    - _Requirements: 4.2, 4.3, 4.4, 4.6, 4.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 15.2_

- [ ] 10. Verify integrated role and Workshop behavior (MVP)
  - [ ] 10.1 Extend shared fake Gateway and canonical conformance harnesses
    - Add role prompts/results, canonical `crew_turn_ended`, slot history, RG-S3 cancellation, RG-S4 navigation stubs, RG-S5 pressure outcomes, task-claim context, and call recording that removes token queries.
    - Send raw Crew fixture frames through Spec 2 ingest exactly once and build on Spec 4 REST/MCP harnesses without adding another Crew transport or normalizer.
    - _Requirements: 3.1–3.3, 4.1, 4.3, 4.4, 4.5, 8.6, 9.3, 10.2, 10.3, 10.9–10.12, 12.1, 15.2_

  - [ ]* 10.2 Write automated Study, Drafting, and planning flow tests
    - Exercise exact app-owned setup order, sealed/open Doors, valid/invalid artifacts, same-session revision, explicit artifact approval, canonical terminal state, and absence of `/api/spawn` or `/spec`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 4.8, 5.1, 5.5, 5.6, 5.7, 5.8, 6.1, 6.5, 6.6, 6.7, 6.8, 7.1, 7.8, 7.9, 7.10_

  - [ ]* 10.3 Write automated parallel Workshop tests
    - Exercise three disjoint tasks plus a queued fourth, overlapping/unknown claim serialization, capacity backpressure, forged claim denial, stale writes, risky approval via spec 4, concurrent completions, failed dependents, and exact-once claim release.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 10.4 Write automated cancellation, retry, and Session_Link tests
    - Cover confirmed/unconfirmed cancellation, preserved tool history, retained/released claims, fresh retry slots, attempt exhaustion, existing-slot navigation, and no replacement chat.
    - _Requirements: 11.2, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [ ]* 10.5 Write the opt-in live Crew role test
    - In a disposable demo Mansion, run one harmless role session, confirm explicit resources/tools, approve one safe MCP write through the app, deny one bypass, validate the artifact, and observe one canonical terminal outcome; scrub all fixture output.
    - _Requirements: 1.2, 1.4, 2.4, 2.7, 3.1, 3.2, 3.3, 4.3, 4.4, 10.1, 10.6, 15.4, 15.5_

  - [ ]* 10.6 Write canonical replay and UI integration tests
    - Drive joined live/replay RoomProjection from one scrubbed Spec 2 Event_Log, assert equal Ghost/task/artifact outcomes, include Spec 4 Door/approval domain records, and fail on replay Gateway/backend requests or fixture secrets/home paths.
    - Assert one raw-ingest owner, one canonical writer, and no successful room state before the validated terminal event.
    - _Requirements: 10.1–10.12, 11.1, 11.6, 15.2_

- [ ] 11. Produce the installable UI artifact (MVP)
  - [ ] 11.1 Run all checks and build the committed ESM bundle
    - Run the non-watch Python/UI suites, type check, manifest/profile/skill/secret/fixture checks, build `app/ui/dist/index.mjs`, run the host-module import checker and replay build, and verify a second build leaves `app/ui/dist` unchanged.
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 15.1, 15.2, 15.3_

- [ ] 12. Checkpoint: verify canonical and authority contracts
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Final checkpoint: verify the complete Room Ghosts feature
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional in Kiro's task runner. They include property, unit, DOM, integration, live-environment, and stretch tasks. Security/canonical contract spikes and MVP implementation tasks remain required.
- Each Room Ghosts property has one property-based test, runs at least 100 generated examples, and includes `Feature: room-ghosts, Property N: <property title>`.
- RG-C1 is a hard prerequisite conformance test. Specs 2 and 4 already define the resolved ownership model; Room Ghosts must not adapt or reimplement their writer, log, normalization, fold, approval, path, or CrewChat interfaces.
- Spec 4 S9 still blocks mutation tools until trusted app-owned-session identity is proven. Spec 4 S10 controls command/git availability. Room Ghosts does not weaken either result.
- Runtime ghosts use app-owned `/api/chat` sessions only. No task adds `/api/spawn`, native `/spec`, Autopilot, `autoApprove`, or direct built-in write/shell/web/subagent access.
- Exact reference filenames are listed in `design.md`. Tasks do not commit, push, deploy, change Crew trust, or modify security settings.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": [
        "1.1",
        "1.2",
        "1.3",
        "1.4",
        "1.5",
        "2.1",
        "2.3",
        "2.6",
        "3.1",
        "4.1",
        "6.1",
        "6.4",
        "10.1"
      ]
    },
    {
      "id": 1,
      "tasks": [
        "2.2",
        "2.4",
        "2.5",
        "2.7",
        "3.2",
        "3.3",
        "4.2",
        "4.3",
        "6.2"
      ]
    },
    {
      "id": 2,
      "tasks": [
        "4.4",
        "5.2",
        "6.3",
        "6.5",
        "6.6",
        "7.1",
        "7.6"
      ]
    },
    {
      "id": 3,
      "tasks": [
        "4.5",
        "4.6",
        "5.3",
        "5.4",
        "5.5",
        "6.7",
        "6.8",
        "7.2",
        "7.3",
        "7.4",
        "7.7"
      ]
    },
    {
      "id": 4,
      "tasks": [
        "6.9",
        "6.10",
        "7.5",
        "8.1",
        "9.1"
      ]
    },
    {
      "id": 5,
      "tasks": [
        "8.2",
        "9.2"
      ]
    },
    {
      "id": 6,
      "tasks": [
        "8.3",
        "9.3",
        "9.4",
        "9.5",
        "9.6"
      ]
    },
    {
      "id": 7,
      "tasks": [
        "9.7"
      ]
    },
    {
      "id": 8,
      "tasks": [
        "10.2",
        "10.3",
        "10.4",
        "10.5",
        "10.6"
      ]
    },
    {
      "id": 9,
      "tasks": [
        "11.1"
      ]
    }
  ]
}
```
