# Requirements Document

## Introduction

Room Ghosts adds the working agents behind Haunted House's Study, Drafting Room, and Workshop. The feature packages gateway-managed Crew custom agents and skills, runs every ghost through an app-owned Crew chat session rooted at the selected Mansion, writes Kiro-compatible spec artifacts, schedules up to three independent implementation tasks, and projects each run through the canonical contracts owned by the prerequisite specs.

The MVP includes the Archivist, Draughtsman, Foreman, Tinkers, room output panels, interactive tool approvals, bounded failure handling, and parallel Workshop scheduling. The Medium and Séance Room review loop are stretch scope. Crew `/api/spawn` and Kiro's native `/spec` command are excluded because spikes S6 and S7 established that only app-owned chat sessions expose app-resolvable approvals and that `/spec` is unavailable through Crew chat.

The dependency order is fixed: `crew-app-foundation`, then spec 2 (`seance-log-and-ghost-state`), then spec 4 (`doors-and-guardrails`), then this feature. Spec 2 owns the one `App_Event` schema, Canonical_Event_Writer, per-Mansion Sequence, Event_Log, backend Crew normalization, Ghost_Snapshot, and replay semantics. Spec 4 owns Phase_State_Machine, Door_Proposal, Approval_Ledger, MCP_Gate, Path_Guard, CrewChat, and Session_Reconciler while persisting domain records only through spec 2. Room Ghosts owns role behavior, artifact validation, task claims, and the terminal decision that appends `run_completed` or `run_failed` after an acknowledged `crew_turn_ended` fact. This feature creates no compatibility adapter, alternate log, reducer, Crew normalizer, approval matcher, or path gate.

## Glossary

- **Haunted_House**: The Crew app that owns room phases, phase doors, orchestration, and the séance log.
- **Gateway**: Kiro Crew 0.12.1 or later, which registers App resources and runs chat sessions.
- **Manifest**: `app/app.json`, which declares the App's agents, skills, backend, UI, API permissions, and session-approval capability.
- **Mansion**: One software project folder selected through the Foyer and located under a Crew-allowed workspace root.
- **Spec_Name**: A kebab-case identifier for one feature spec inside a Mansion.
- **Spec_Directory**: `<Mansion>/.kiro/specs/<Spec_Name>/`.
- **Room**: A spatial phase surface in Haunted_House.
- **Room_Ghost**: A gateway-managed custom agent assigned to one Room and constrained by one Agent_Profile.
- **Agent_Profile**: A JSON custom-agent definition under `app/agents/` that declares prompt, tools, V3 permissions, compatibility fields, and resources.
- **Room_Skill**: A skill under `app/skills/` with a `SKILL.md` file and explicit use by an Agent_Profile.
- **Archivist**: The Study Room_Ghost that creates and revises EARS requirements.
- **Draughtsman**: The Drafting Room Room_Ghost that creates and revises technical designs and correctness properties.
- **Foreman**: The Workshop Room_Ghost that creates and revises executable implementation plans.
- **Tinker**: A Workshop Room_Ghost that implements one Selected_Task in an isolated Ghost_Run.
- **Medium**: The stretch-scope Séance Room_Ghost that reviews implemented work and returns bounded findings.
- **Ghost_Orchestrator**: Backend application service that creates Crew sessions, dispatches turns, handles approvals, validates outcomes, and schedules Tinkers.
- **App_Owned_Session**: A Crew chat slot created by Haunted_House, assigned a Room_Ghost, and therefore eligible for App-resolved tool approvals.
- **Ghost_Run**: One attempt by one Room_Ghost in one App_Owned_Session for one phase or Selected_Task.
- **Ghost_Result**: Versioned JSON completion envelope returned by a Room_Ghost after a turn.
- **Session_Link**: A Crew dashboard navigation target that opens the App_Owned_Session for inspection.
- **Tool_Approval**: A pending Crew permission message identified by both `meta.mid` and `meta.approval_id`.
- **Approval_Ledger**: Spec 4 service that records explicit approval decisions and matches risky actions to valid decisions.
- **Risky_Action**: A shell command, delete, git write, or write outside the active room or task path claim.
- **Room_Tool_Gateway**: Room Ghosts name for the spec 4 MCP_Gate, Path_Guard, guarded filesystem, and Approval_Ledger boundary used by ghost tools.
- **MCP_Gate**: Spec 4 custom app MCP server that exposes exact room tools and delegates every path or risky action to trusted guards.
- **Task_Claim_Gate**: Room Ghosts extension that narrows the Tinker Room_Policy to one active File_Ownership_Claim before the MCP_Gate evaluates an operation.
- **Door**: Spec 4 Door_Proposal and Phase_State_Machine gate that controls entry to a phase and opens only after an explicit user decision.
- **Canonical_Event**: Room Ghosts name for a spec 2 App_Event acknowledged by the Canonical_Event_Writer.
- **App_Event_Candidate**: A domain fact submitted to the spec 2 Canonical_Event_Writer for redaction, identity, Sequence assignment, and append.
- **Crew_Turn_Ended**: The canonical spec 2 `crew_turn_ended` transport fact normalized from `chat_done`; it has no terminal Ghost_State effect.
- **Event_Scope**: Spec 2 run identity containing Mansion, ghost, session slot, run ID, and Run_Sequence.
- **Canonical_Event_Writer**: Spec 2's sole backend persistence interface for the one Event_Log.
- **Séance_Log**: Product name for the single canonical spec 2 Event_Log used by every live and replay projection.
- **Ghost_Snapshot**: Spec 2 projection containing the selected Run, Ghost_State, pending approvals, open tools, latest Event_ID, and optional reason.
- **Ghost_State**: Spec 2 projection state: `idle`, `working`, `waiting`, `blocked`, `failed`, or `done`.
- **Room_Projection**: State derived from Canonical_Events for one Room, including current Ghost_State, artifact, pending approval, failure, and Session_Link.
- **Phase_Artifact**: `requirements.md`, `design.md`, or `tasks.md` under the Spec_Directory.
- **Artifact_Validator**: Deterministic validator for EARS requirements, design traceability, implementation-task syntax, and Ghost_Result structure.
- **Ghost_Result_Codec**: Parser and canonical JSON printer for Ghost_Result values.
- **Task_Plan_Codec**: Parser and Kiro-compatible Markdown printer for task-plan values.
- **Profile_Validator**: Deterministic validator for Agent_Profile, Room_Skill, and manifest authority contracts.
- **Room_Panel**: Artifact-first UI panel for one Room and the current Room_Projection.
- **Test_Suite**: Automated pytest, Hypothesis, Vitest, fast-check, DOM, contract, and integration checks for Room Ghosts.
- **Live_Crew_Integration_Test**: Opt-in automated test against an installed local Gateway and a disposable Mansion.
- **Live_Profile_Probe**: Opt-in automated check of resource loading and denied tools for installed Agent_Profiles.
- **Cancellation_Spike**: Automated discovery check for the app-token-scoped cancellation request and confirmation event.
- **Session_Link_Spike**: Automated discovery check for opening an existing App_Owned_Session from the App UI.
- **Capacity_Spike**: Automated discovery check for Gateway backpressure during parallel app-owned turns.
- **Room_Ghosts_Implementation**: Application code and tests produced by executing this specification's task plan.
- **Task_Plan_Grammar**: The Kiro-compatible Markdown grammar comprising checkbox task headings, decimal leaf task identifiers, requirement references, optional task markers, path claims, and a JSON Task Dependency Graph.
- **Task_Dependency_Graph**: A valid JSON object in `tasks.md` that assigns every incomplete decimal leaf task to exactly one contiguous execution wave.
- **Selected_Task**: An incomplete leaf task selected by the user or scheduler for implementation.
- **Path_Claim**: A normalized set of Mansion-relative file paths or conservative glob patterns that one Selected_Task may write.
- **File_Ownership_Claim**: A temporary exclusive claim over a Path_Claim for the duration of a Ghost_Run.
- **Capacity_Limit**: The smaller of three Tinkers and the work Crew currently accepts without backpressure.
- **Backpressure**: A Gateway refusal or local capacity condition that keeps a Ghost_Run queued without losing task state.
- **Review_Cycle**: One Medium review followed by zero or more returned Tinker fixes and a new verdict.

## Requirements

### Requirement 1: Package gateway-managed room resources

**User Story:** As an operator, I want Crew to install the room ghosts and skills with the App, so that each phase uses a visible and reviewable agent configuration.

#### Acceptance Criteria

1. THE Manifest SHALL declare `resources` as `gateway` and `lifecycle` as `gateway`.
2. THE Manifest SHALL declare Agent_Profile paths for the Archivist, Draughtsman, Foreman, and Tinker.
3. WHERE the Séance Room is enabled, THE Manifest SHALL declare the Medium Agent_Profile path.
4. THE Manifest SHALL declare every Room_Skill directory referenced by an Agent_Profile.
5. THE Manifest SHALL declare `/api/chat` and `/api/chat/*` in `permissions.api`.
6. THE Manifest SHALL declare `permissions.sessionApproval` as `true`.
7. THE Manifest SHALL NOT declare `/api/spawn` or `/api/spawn/*` in `permissions.api`.
8. THE Manifest SHALL NOT contain an `autoApprove` field.

### Requirement 2: Constrain custom agent authority

**User Story:** As an operator, I want each ghost's authority encoded in the Agent_Profile, so that room boundaries remain visible and enforceable.

#### Acceptance Criteria

1. THE Agent_Profile SHALL declare only the built-in read tools and Room_Tool_Gateway tools required by the assigned Room_Ghost.
2. THE Agent_Profile SHALL declare V3 `permissions.rules` for every exposed filesystem, shell, MCP, and subagent capability.
3. THE Agent_Profile SHALL declare an empty `allowedTools` compatibility field.
4. THE Agent_Profile SHALL declare explicit `file://` steering resources and `skill://` Room_Skill resources.
5. THE Agent_Profile SHALL set `includeMcpJson` to `false` and `includePowers` to `false`.
6. THE Agent_Profile SHALL omit every `autoApprove` field.
7. THE Agent_Profile SHALL deny built-in file-write, shell, and subagent capabilities that bypass the Room_Tool_Gateway.
8. WHEN the Profile_Validator loads an Agent_Profile, THE Profile_Validator SHALL reject undeclared tools, missing resources, broad wildcard grants, and write-capable compatibility grants.

### Requirement 3: Start ghosts in app-owned interactive sessions

**User Story:** As a developer, I want every ghost run to have a Crew session rooted at the Mansion, so that I can inspect the work and answer tool approvals from Haunted House.

#### Acceptance Criteria

1. WHEN a permitted room run starts, THE Ghost_Orchestrator SHALL create an App_Owned_Session with the selected Room_Ghost and temporary memory mode.
2. WHEN the Gateway creates an App_Owned_Session, THE Ghost_Orchestrator SHALL set the session project to the canonical Mansion path before sending the task.
3. WHEN the session project is set, THE Ghost_Orchestrator SHALL set the session mode to interactive normal mode before sending the task.
4. WHEN the session mode is set, THE Ghost_Orchestrator SHALL send a bounded phase or task prompt through Crew chat.
5. THE Ghost_Orchestrator SHALL persist a one-to-one mapping among Ghost_Run, App_Owned_Session slot, Mansion, Room_Ghost, and attempt number.
6. THE Ghost_Orchestrator SHALL NOT call `/api/spawn` for a Room_Ghost.
7. THE Ghost_Orchestrator SHALL NOT send a Kiro `/spec` command to an App_Owned_Session.
8. IF any session setup step fails, THEN THE Ghost_Orchestrator SHALL stop setup before sending the task and record the Ghost_Run as failed or blocked with a stable reason code.

### Requirement 4: Resolve tool approvals explicitly

**User Story:** As a developer, I want Haunted House to show and resolve a ghost's pending tool call, so that no risky action proceeds without my decision.

#### Acceptance Criteria

1. WHEN an App_Owned_Session exposes a permission message, THE Ghost_Orchestrator SHALL record a pending Tool_Approval keyed by `meta.mid`.
2. WHEN a Tool_Approval becomes pending, THE Ghost_Orchestrator SHALL publish the tool name, redacted tool input, Room_Ghost, Room, and Ghost_Run to the Room_Projection.
3. WHEN a user approves a Tool_Approval, THE Ghost_Orchestrator SHALL submit `approved`, `meta.approval_id`, and `meta.mid` to the owning App_Owned_Session.
4. WHEN a user rejects a Tool_Approval, THE Ghost_Orchestrator SHALL submit `rejected`, `meta.approval_id`, and `meta.mid` to the owning App_Owned_Session.
5. IF two Tool_Approvals reuse one `meta.approval_id`, THEN THE Ghost_Orchestrator SHALL resolve only the Tool_Approval whose `meta.mid` matches the user decision.
6. IF Crew or another owner surface resolves a Tool_Approval first, THEN THE Ghost_Orchestrator SHALL treat the later decision as an idempotent stale decision.
7. WHILE a Tool_Approval lacks an explicit decision, THE Room_Ghost SHALL remain in the `waiting` Ghost_State.
8. THE Ghost_Orchestrator SHALL NOT create an automatic approval decision.

### Requirement 5: Create EARS requirements in the Study

**User Story:** As a developer, I want the Archivist to turn a feature idea into EARS requirements, so that the next room starts from testable behavior.

#### Acceptance Criteria

1. WHEN the Study Door permits entry, THE Archivist SHALL create `<Spec_Directory>/requirements.md` from the feature brief and Mansion steering.
2. THE Archivist SHALL format every acceptance criterion with exactly one EARS pattern.
3. THE Archivist SHALL define every system name and technical term in the requirements glossary before acceptance-criterion use.
4. THE Archivist SHALL include user stories, unwanted events, boundary conditions, and MVP or stretch labels that follow from the feature brief.
5. WHEN the Archivist reports completion, THE Artifact_Validator SHALL validate EARS syntax, required headings, glossary coverage, and criterion numbering before marking the Ghost_Run `done`.
6. IF requirements validation fails, THEN THE Ghost_Orchestrator SHALL keep the Study Door sealed and return deterministic findings to the Archivist.
7. WHEN the user requests a requirements revision before Door approval, THE Ghost_Orchestrator SHALL send the revision request to the same App_Owned_Session and keep the Study Door sealed.
8. WHEN the user explicitly approves valid requirements, THE Door SHALL record the approval through the phase-door contract.

### Requirement 6: Create a traceable design in the Drafting Room

**User Story:** As a developer, I want the Draughtsman to design the approved feature and its correctness properties, so that implementation choices remain traceable to requirements.

#### Acceptance Criteria

1. WHEN the Drafting Room Door permits entry, THE Draughtsman SHALL create `<Spec_Directory>/design.md` from approved requirements, Mansion steering, and relevant source files.
2. THE Draughtsman SHALL include Overview, Architecture, Components and Interfaces, Data Models, Error Handling, and Testing Strategy sections.
3. WHERE one or more acceptance criteria are suitable for property-based testing, THE Draughtsman SHALL include a Correctness Properties section with universal statements and requirement references.
4. THE Draughtsman SHALL distinguish verified facts, design decisions, and assumptions that require spikes.
5. WHEN the Draughtsman reports completion, THE Artifact_Validator SHALL validate required sections, requirement coverage, property numbering, and traceability before marking the Ghost_Run `done`.
6. IF design validation fails, THEN THE Ghost_Orchestrator SHALL keep the Drafting Room Door sealed and return deterministic findings to the Draughtsman.
7. WHEN the user requests a design revision before Door approval, THE Ghost_Orchestrator SHALL send the revision request to the same App_Owned_Session and keep the Drafting Room Door sealed.
8. WHEN the user explicitly approves a valid design, THE Door SHALL record the approval through the phase-door contract.

### Requirement 7: Create an executable Workshop task plan

**User Story:** As a developer, I want the Foreman to turn the approved design into dependency-aware tasks, so that Tinkers can work safely in parallel.

#### Acceptance Criteria

1. WHEN the Workshop planning Door permits entry, THE Foreman SHALL create `<Spec_Directory>/tasks.md` from approved requirements and design.
2. THE Foreman SHALL assign a unique decimal identifier, checkbox, Path_Claim, and granular requirement references to every leaf implementation task.
3. THE Foreman SHALL mark test-only subtasks as optional with the Kiro `*` checkbox convention.
4. THE Foreman SHALL include a valid JSON Task_Dependency_Graph with contiguous wave identifiers beginning at zero.
5. THE Foreman SHALL place every incomplete decimal leaf task in exactly one Task_Dependency_Graph wave.
6. THE Foreman SHALL place leaf tasks with overlapping or indeterminate Path_Claims in different waves.
7. THE Foreman SHALL cover every acceptance criterion with at least one implementation or automated-test task.
8. WHEN the Foreman reports completion, THE Artifact_Validator SHALL validate the Task_Plan_Grammar and requirement coverage before marking the Ghost_Run `done`.
9. IF task-plan validation fails, THEN THE Ghost_Orchestrator SHALL keep Workshop implementation locked and return deterministic findings to the Foreman.
10. WHEN the user explicitly approves a valid task plan, THE Door SHALL record the approval through the phase-door contract.

### Requirement 8: Schedule independent Tinkers with bounded concurrency

**User Story:** As a developer, I want independent implementation tasks to run in parallel, so that the Workshop finishes faster without file conflicts.

#### Acceptance Criteria

1. WHEN Workshop implementation is unlocked, THE Ghost_Orchestrator SHALL derive ready Selected_Tasks from approved Task_Dependency_Graph waves and completed dependencies.
2. WHILE fewer than three Tinkers are active, THE Ghost_Orchestrator SHALL dispatch ready Selected_Tasks with pairwise disjoint File_Ownership_Claims.
3. WHILE three Tinkers are active, THE Ghost_Orchestrator SHALL keep additional ready Selected_Tasks queued.
4. THE Ghost_Orchestrator SHALL treat an indeterminate Path_Claim overlap as a conflict.
5. WHEN a Tinker reaches a terminal outcome, THE Ghost_Orchestrator SHALL release the Tinker's File_Ownership_Claim before scheduling another Selected_Task.
6. IF Crew refuses a new turn because of capacity or pressure, THEN THE Ghost_Orchestrator SHALL retain the Selected_Task in a backpressured queue without incrementing the task attempt.
7. WHEN capacity becomes available after backpressure, THE Ghost_Orchestrator SHALL retry dispatch in dependency order with a bounded delay.
8. THE Ghost_Orchestrator SHALL NOT dispatch an already completed task or two concurrent tasks with overlapping File_Ownership_Claims.

### Requirement 9: Execute one task per Tinker run

**User Story:** As a developer, I want each Tinker to own one small task and a declared write set, so that implementation remains reviewable and reversible.

#### Acceptance Criteria

1. WHEN a Tinker Ghost_Run starts, THE Ghost_Orchestrator SHALL provide one Selected_Task, approved requirements, approved design, dependency results, Path_Claim, and expected file revisions.
2. THE Tinker SHALL perform file mutations and command execution only through the Room_Tool_Gateway.
3. WHEN the Tinker requests a file mutation, THE Task_Claim_Gate SHALL narrow the Tinker Room_Policy to the active File_Ownership_Claim before the MCP_Gate enforces the expected file revision.
4. IF a requested file revision is stale, THEN THE MCP_Gate SHALL preserve current file bytes and return a conflict result.
5. WHEN the Tinker requests a Risky_Action, THE Room_Tool_Gateway SHALL require a matching unconsumed Approval_Ledger event before execution.
6. WHEN a Tinker returns a successful Ghost_Result, THE Ghost_Orchestrator SHALL validate claimed artifacts and task-specific completion evidence before marking the Selected_Task complete.
7. IF a Tinker returns a failed, blocked, malformed, or cancelled Ghost_Result, THEN THE Ghost_Orchestrator SHALL keep the Selected_Task incomplete.
8. WHEN several Tinkers complete concurrently, THE Ghost_Orchestrator SHALL serialize task-checkbox updates through one Task_Plan writer.

### Requirement 10: Connect runs to the one canonical event contract

**User Story:** As a developer, I want every ghost action represented by the house's existing event model, so that live state, authorization, and replay agree.

#### Acceptance Criteria

1. WHEN a Ghost_Run is requested, starts, waits, blocks, retries, or is cancelled, THE Ghost_Orchestrator SHALL submit the corresponding house-origin App_Event_Candidate through the spec 2 Canonical_Event_Writer.
2. WHEN the browser observes a Crew frame for an App_Owned_Session, THE browser SHALL send the raw Crew envelope to the spec 2 ingest endpoint and Room Ghosts SHALL NOT normalize or persist the frame independently.
3. WHEN spec 2 acknowledges a Crew tool, approval, message, error, or turn-ended App_Event, THE Ghost_Orchestrator SHALL associate the App_Event with the owning Ghost_Run without normalizing the source frame again.
4. WHEN the Ghost_Orchestrator receives duplicate acknowledged App_Events, THE Ghost_Orchestrator SHALL apply each Record_ID at most once.
5. THE Ghost_Orchestrator SHALL derive Room_Projection and Ghost_State from spec 2 Ghost_Snapshots and spec 4 workflow projections rather than an independent room-state store.
6. THE Ghost_Orchestrator SHALL query the spec 4 Phase_State_Machine and Door_Proposal boundary before starting Study, Drafting Room, Workshop planning, Workshop implementation, or Séance Room work.
7. WHEN replay consumes the Séance_Log, THE Room_Projection SHALL expose the same Ghost_State, artifact readiness, approval state, and terminal outcome as live projection.
8. IF the required spec 2 or spec 4 public interface is unavailable or version-incompatible, THEN THE Ghost_Orchestrator SHALL refuse the affected run and expose `contract_unavailable`.
9. WHEN spec 2 acknowledges `crew_turn_ended`, THE Ghost_Orchestrator SHALL keep the Ghost_Run non-terminal until Artifact_Validator evaluates the matching Ghost_Result and expected artifact.
10. WHEN Artifact_Validator accepts the matching Ghost_Result and artifact, THE Ghost_Orchestrator SHALL append one house-origin `run_completed` App_Event_Candidate through the Canonical_Event_Writer.
11. IF Artifact_Validator rejects the matching Ghost_Result or artifact after `crew_turn_ended`, THEN THE Ghost_Orchestrator SHALL append one redacted `run_failed` or supported `run_blocked` App_Event_Candidate through the Canonical_Event_Writer.
12. THE Ghost_Orchestrator SHALL expose only acknowledged redacted App_Events to projections and SHALL NOT persist raw Crew envelopes, model output, or document content outside spec 2.

### Requirement 11: Present spatial room output before chat

**User Story:** As a developer, I want each room panel to show work products and authority at a glance, so that I do not need to read a transcript to understand progress.

#### Acceptance Criteria

1. WHEN a user opens the Study, Drafting Room, or Workshop panel, THE Room_Panel SHALL show the current Phase_Artifact, Ghost_State text, state icon, Door state, and allowed write scope.
2. WHEN an App_Owned_Session exists for the displayed Ghost_Run, THE Room_Panel SHALL provide a Session_Link labeled with the Room_Ghost and run status.
3. THE Room_Panel SHALL present the Session_Link as a secondary action after the Phase_Artifact and status summary.
4. THE Room_Panel SHALL NOT present an inline chat composer as the primary room interface.
5. WHEN a Tool_Approval is pending, THE Room_Panel SHALL provide keyboard-operable approve and reject controls with the redacted tool input.
6. WHEN Ghost_State changes to `waiting`, `blocked`, or `failed`, THE Room_Panel SHALL notify through the existing interruption-budget boundary once per Ghost_Run event.
7. WHILE Ghost_State is `working`, THE Room_Panel SHALL display progress in place without a toast or sound.
8. THE Room_Panel SHALL expose every state with text and an icon rather than color alone.
9. THE Room_Panel SHALL return focus to the invoking room object when the panel closes.

### Requirement 12: Cancel, fail, and retry without losing history

**User Story:** As a developer, I want bounded recovery controls, so that a failed or unwanted run does not corrupt the plan or loop forever.

#### Acceptance Criteria

1. WHEN a user cancels an active Ghost_Run, THE Ghost_Orchestrator SHALL request cancellation from the owning App_Owned_Session and submit a house-origin `ghost_progressed` App_Event_Candidate with progress kind `cancel_requested`.
2. WHEN Crew confirms cancellation, THE Ghost_Orchestrator SHALL submit a house-origin `run_blocked` App_Event_Candidate with reason `cancelled`, preserve acknowledged tool App_Events, and release the File_Ownership_Claim.
3. IF cancellation cannot be confirmed within 30 seconds, THEN THE Ghost_Orchestrator SHALL mark the Ghost_Run blocked with reason `cancel_unconfirmed` and retain the File_Ownership_Claim.
4. WHEN Crew reports `chat_error`, a closed turn without a valid Ghost_Result, or an exhausted turn budget, THE Ghost_Orchestrator SHALL mark the Ghost_Run failed with a stable reason code.
5. WHEN a user retries a failed or cancelled Ghost_Run within the configured attempt limit, THE Ghost_Orchestrator SHALL create a fresh App_Owned_Session and increment the attempt number once.
6. IF a Ghost_Run reaches three attempts, THEN THE Ghost_Orchestrator SHALL refuse another automatic retry and require a new explicit user decision.
7. WHILE a Ghost_Run is failed, cancelled, or blocked, THE Ghost_Orchestrator SHALL keep dependent Selected_Tasks undispatched.
8. THE Ghost_Orchestrator SHALL preserve every prior attempt in the Séance_Log.

### Requirement 13: Parse and validate machine-readable contracts

**User Story:** As a developer, I want deterministic contract parsing around model output, so that malformed replies cannot advance a phase or task.

#### Acceptance Criteria

1. WHEN a Room_Ghost finishes a turn, THE Artifact_Validator SHALL parse the final response as one Ghost_Result JSON object that conforms to schema version 1.
2. IF Ghost_Result JSON is malformed or contains an unknown status, THEN THE Artifact_Validator SHALL return a deterministic validation error without changing a Door or task checkbox.
3. THE Ghost_Result_Codec SHALL encode every valid Ghost_Result as canonical UTF-8 JSON with sorted keys and no secret-bearing fields.
4. THE Ghost_Result_Codec SHALL preserve every valid Ghost_Result across a print-then-parse round trip.
5. WHEN the Workshop loads `tasks.md`, THE Artifact_Validator SHALL parse the Task_Plan_Grammar into ordered leaf tasks, requirement references, Path_Claims, and Task_Dependency_Graph waves.
6. THE Task_Plan_Codec SHALL render every valid parsed task plan as Kiro-compatible Markdown.
7. THE Task_Plan_Codec SHALL preserve every valid task plan across a print-then-parse round trip.
8. IF a task-plan graph contains a missing, duplicate, non-leaf, or multiply assigned task identifier, THEN THE Artifact_Validator SHALL reject the task plan with the offending identifier.

### Requirement 14: Run a bounded Séance review loop as stretch scope

**User Story:** As a developer, I want an optional independent review loop, so that failed checks return to the correct implementation task without unbounded churn.

#### Acceptance Criteria

1. WHERE the Séance Room is enabled and Workshop tasks are complete, THE Medium SHALL review the approved requirements, design, task results, changed files, and automated-test evidence.
2. WHERE the Séance Room is enabled, THE Medium SHALL return a structured verdict of `pass`, `changes_requested`, or `blocked` with requirement and file references.
3. WHEN the Medium returns `changes_requested`, THE Ghost_Orchestrator SHALL map each finding to one incomplete repair task with a non-overlapping Path_Claim.
4. WHILE the Review_Cycle count is below three, THE Ghost_Orchestrator SHALL dispatch approved repair tasks through the normal Tinker scheduler.
5. IF the Medium returns `pass`, THEN THE Ghost_Orchestrator SHALL mark the Séance Room `done` without opening another review cycle.
6. IF three Review_Cycles finish without a `pass` verdict, THEN THE Ghost_Orchestrator SHALL mark the Séance Room `blocked` and require a user decision.
7. WHERE the Séance Room is disabled, THE Ghost_Orchestrator SHALL complete MVP Workshop operation without creating a Medium session.

### Requirement 15: Verify prompts, profiles, artifacts, and live Crew integration

**User Story:** As the maintainer, I want automated and live contract checks, so that agent behavior fails safely when Crew or an artifact format changes.

#### Acceptance Criteria

1. THE Test_Suite SHALL validate every Agent_Profile and Room_Skill against the declared role, resource, tool, permission, and output contracts.
2. THE Test_Suite SHALL validate representative valid and invalid requirements, design, tasks, Ghost_Result, scheduling, approval, cancellation, and retry cases.
3. THE Test_Suite SHALL run property-based tests for deterministic codecs, approval matching, event deduplication, task readiness, concurrency, and Path_Claim conflict rules.
4. WHEN the Live_Crew_Integration_Test runs, THE Live_Crew_Integration_Test SHALL create an App_Owned_Session, set the Mansion project, set interactive normal mode, send a harmless prompt, resolve one tool approval through the App, and observe a terminal chat event.
5. WHEN the Live_Profile_Probe runs, THE Live_Profile_Probe SHALL confirm that each Agent_Profile receives the declared steering and Room_Skill resources and cannot call a denied built-in tool.
6. WHEN the Cancellation_Spike runs, THE Cancellation_Spike SHALL discover and record the app-token-scoped Crew operation and event that confirm turn cancellation.
7. WHEN the Session_Link_Spike runs, THE Session_Link_Spike SHALL discover and record the Crew dashboard route or SDK operation that opens an existing App_Owned_Session.
8. WHEN the Capacity_Spike runs, THE Capacity_Spike SHALL record the Gateway statuses and events produced when parallel app-owned turns exceed available capacity.
9. IF a spike contradicts a design assumption, THEN THE Room_Ghosts_Implementation SHALL update the adapter contract and tests before implementing dependent components.
