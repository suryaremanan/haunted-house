# Requirements Document

## Introduction

This feature adds the authority boundary for Haunted House's approval-gated workflow. It controls phase order, binds every decision to one exact proposal, confines project access to each room, coordinates app-owned Crew chat sessions, and records every accepted workflow, Door, approval, action, and guardrail fact as a domain payload inside the canonical `App_Event` owned by `seance-log-and-ghost-state`.

`seance-log-and-ghost-state` is a hard prerequisite. This feature does not define an event envelope, event identifier algorithm, Sequence allocator, hash chain, log file, parser, Crew-frame normalizer, ghost reducer, or replay ordering rule. It appends through the prerequisite's `Canonical_Event_Writer` and folds its own state from acknowledged canonical events. `room-ghosts` depends on this feature and owns artifact validation and successful run settlement.

The MVP covers requirements, design, tasks, and implementation phases. The review loop remains stretch scope.

## Glossary

- **Haunted_House**: The Kiro Crew app that owns phase and Door behavior.
- **UI**: The Haunted House React dashboard page used by the Operator.
- **Proxy_Signature**: The gateway-generated `X-KiroCrew-Proxy` authentication header verified by foundation middleware.
- **App_Event**: The single canonical persisted event envelope owned by `seance-log-and-ghost-state`.
- **Domain_Event_Payload**: An App_Event payload with domain `doors_and_guardrails`, a domain record kind, entity identifier, and JSON-compatible data.
- **Canonical_Event_Writer**: The spec 2 interface that validates, redacts, deduplicates, sequences, optionally hash-links, and appends canonical events.
- **Canonical_Read_Result**: The ordered canonical App_Events, highest Sequence, valid-prefix boundary, and integrity diagnostics returned by spec 2.
- **Projection_Version**: The highest spec 2 Sequence folded into a workflow projection.
- **Session_Capability**: An unforgeable, non-model-visible value binding an MCP process to one App_Owned_Session.
- **Mansion**: One software project under the configured Mansion root.
- **Room**: A spatial workflow phase with one Room_Policy.
- **Phase**: One member of `requirements`, `design`, `tasks`, or `implementation`.
- **Predecessor_Phase**: The Phase immediately before another Phase.
- **Phase_State_Machine**: The deterministic pure fold that derives Phase and Door state from ordered spec 4 Domain_Event_Payload values.
- **Phase_Start_Command**: An explicit operator request to start one Phase.
- **Phase_Output**: The current file produced by a Phase.
- **Artifact_Revision**: A SHA-256 digest and monotonically increasing revision number for a Phase_Output.
- **Door**: The explicit approval gate between Phases.
- **Door_Proposal**: A pending request bound to one Phase, Spec_Document path, Artifact_Revision, and proposal identifier.
- **Operator**: The authenticated dashboard owner.
- **Ghost**: A custom agent assigned to one Room and run in an App_Owned_Session.
- **Room_Policy**: A Room's read, write, and risky-action allowlist.
- **Effective_Room_Policy**: The Room_Policy after protected-path denials; approval cannot widen it.
- **Project_Path**: A path resolving inside a Mansion.
- **Protected_Path**: A Project_Path reserved for control data, another Phase, credentials, or ungranted repository metadata.
- **Path_Guard**: Trusted code that validates and performs project filesystem operations independently of prompts.
- **MCP_Gate**: The custom app MCP server exposing room-scoped tools and approved risky actions.
- **Spec_Document**: `.kiro/specs/<spec-name>/requirements.md`, `design.md`, or `tasks.md`.
- **Risky_Action**: A supported command, delete, git mutation, or other state-changing operation requiring exact approval.
- **Action_Descriptor**: Canonical validated JSON containing a Risky_Action kind and every execution-relevant argument.
- **Action_Digest**: The SHA-256 digest of an Action_Descriptor.
- **Approval_Record**: A spec 4 domain payload recording a proposal decision, actor, and exact Artifact_Revision or Action_Digest.
- **Action_Record**: A spec 4 domain payload recording proposal, consumption, denial, execution, or outcome for one Risky_Action.
- **Approval_Ledger**: The pure projection of approval state folded from acknowledged spec 4 domain records in canonical Sequence order.
- **Consumed_Approval**: An approved Risky_Action authorization claimed for one execution attempt.
- **Crew_Gateway**: The local Kiro Crew gateway, version 0.12.1 or later.
- **App_Owned_Session**: A Crew chat slot created by Haunted_House and bound to one Ghost and Mansion.
- **Session_Approval**: Crew's permission prompt for a tool call in an App_Owned_Session.
- **Pending_Permission_Message**: A Crew chat message containing `approval_id`, `mid`, tool name, and tool input.
- **Session_Reconciler**: The service that correlates canonical Crew approval facts and bounded Crew session history with spec 4 proposals; it does not normalize or persist raw Crew envelopes.
- **Waiting_State**: A state requiring an Operator decision for a Door_Proposal, Risky_Action proposal, or Session_Approval.
- **Séance_Log**: The single canonical spec 2 Event_Log for one Mansion.
- **Replay_Projection**: The spec 4 workflow, Door, approval, and audit projection folded from canonical App_Events.
- **MVP**: Required Study, Drafting Room, Workshop, and Attic replay behavior.
- **Stretch_Feature**: Optional behavior excluded from MVP completion.

## Requirements

### Requirement 1: Deterministic phase order

**User Story:** As an operator, I want each spec phase behind the preceding Door, so that no ghost can skip ahead.

#### Acceptance Criteria

1. THE Phase_State_Machine SHALL recognize the order `requirements`, `design`, `tasks`, `implementation`.
2. WHEN the same Canonical_Read_Result is folded more than once, THE Phase_State_Machine SHALL produce equal Phase and Door states.
3. WHEN an allowed Phase_Start_Command is accepted, THE Phase_State_Machine SHALL mark the named Phase `working` only after its canonical start record is acknowledged.
4. IF a Phase_Start_Command names a Phase whose Predecessor_Phase Door is not `open`, THEN THE Phase_State_Machine SHALL reject the command without changing state.
5. WHEN a Ghost marks the current Phase_Output ready through the validated upstream output boundary, THE Phase_State_Machine SHALL mark the Phase `waiting` and keep successors unstarted.
6. WHEN the Operator approves the current Door_Proposal, THE Phase_State_Machine SHALL mark the Door `open` and the successor Phase `ready`.
7. WHEN a Door becomes `open`, THE Phase_State_Machine SHALL require a separate Phase_Start_Command before the successor becomes `working`.
8. WHEN the Operator rejects the current Door_Proposal, THE Phase_State_Machine SHALL mark the current Phase `revision_required` and keep successor Doors sealed.
9. IF a domain record is invalid for the current state, THEN THE Phase_State_Machine SHALL return a transition diagnostic and preserve the preceding valid projection.

### Requirement 2: Exact Door proposals and decisions

**User Story:** As an operator, I want a Door decision to cover one visible document revision, so that edits after review require another decision.

#### Acceptance Criteria

1. WHEN a validated Phase_Output becomes ready, THE Haunted_House SHALL create one Door_Proposal bound to Phase, Spec_Document path, Artifact_Revision, and proposal identifier.
2. WHEN the Operator approves the current Door_Proposal, THE Haunted_House SHALL append one `door_approved` Approval_Record through the Canonical_Event_Writer.
3. WHEN the Operator rejects the current Door_Proposal, THE Haunted_House SHALL append one `door_rejected` Approval_Record through the Canonical_Event_Writer.
4. IF a Door decision names a stale proposal identifier, path, revision number, digest, or Projection_Version, THEN THE Haunted_House SHALL reject it without opening the Door or appending an approval record.
5. IF the Spec_Document changes after proposal creation, THEN THE Haunted_House SHALL append a supersession domain record and require a proposal for the new Artifact_Revision.
6. WHEN concurrent decisions target one Door_Proposal, THE Haunted_House SHALL accept the first compare-and-append that matches the current Projection_Version and return a conflict for later decisions.

### Requirement 3: One-time risky-action approvals

**User Story:** As an operator, I want each risky approval to match one exact action and execution attempt, so that approval cannot become reusable authority.

#### Acceptance Criteria

1. WHEN a Ghost proposes a Risky_Action, THE MCP_Gate SHALL canonicalize the complete Action_Descriptor and append a pending Action_Record containing its Action_Digest through the Canonical_Event_Writer.
2. WHEN the Operator approves a pending Risky_Action proposal, THE Haunted_House SHALL append one `risky_action_approved` Approval_Record with the proposal identifier and Action_Digest.
3. WHEN the Operator rejects a pending Risky_Action proposal, THE Haunted_House SHALL append one `risky_action_rejected` Approval_Record with the proposal identifier and Action_Digest.
4. IF an execution request differs from the approved Action_Descriptor in any execution-relevant field, THEN THE MCP_Gate SHALL reject it without performing the Risky_Action.
5. WHEN an execution request exactly matches an approved Action_Descriptor, THE Approval_Ledger SHALL use spec 2 compare-and-append to persist `risky_action_consumed` before execution starts.
6. IF two execution requests claim the same approval concurrently, THEN exactly one compare-and-append SHALL persist a consumption record.
7. IF an execution request names a rejected, pending, superseded, missing, or consumed proposal, THEN THE MCP_Gate SHALL reject it without performing the Risky_Action.
8. IF a Risky_Action fails after consumption, THEN THE Approval_Ledger SHALL retain Consumed_Approval and require a new proposal for retry.
9. IF a Risky_Action targets a Project_Path outside Effective_Room_Policy, THEN THE MCP_Gate SHALL reject it regardless of Approval_Ledger state.

### Requirement 4: Crew approval reconciliation

**User Story:** As an operator, I want Haunted House and Crew to agree about tool approvals, so that waiting state and audit evidence remain accurate.

#### Acceptance Criteria

1. WHEN spec 2 acknowledges a Crew approval fact, THE Session_Reconciler SHALL correlate the Pending_Permission_Message by App_Owned_Session slot and `mid`.
2. IF correlation uses `approval_id` without the Pending_Permission_Message `mid`, THEN THE Session_Reconciler SHALL reject it as ambiguous.
3. WHEN the Operator approves a matching Risky_Action through Haunted_House, THE Session_Reconciler SHALL resolve Crew with the exact `approval_id` and `mid` only after the canonical Approval_Record is acknowledged.
4. WHEN the Operator rejects a matching Risky_Action through Haunted_House, THE Session_Reconciler SHALL reject Crew with the exact `approval_id` and `mid` only after the canonical Approval_Record is acknowledged.
5. WHEN Crew resolves a matching Session_Approval before Haunted_House, THE Session_Reconciler SHALL submit one external-decision Domain_Event_Payload through the Canonical_Event_Writer and treat the first acknowledged decision as authoritative.
6. IF an external Crew decision cannot be matched by slot, `mid`, tool name, and Action_Digest, THEN THE Session_Reconciler SHALL append an ignored-resolution domain record without authorizing a Risky_Action.
7. WHEN live delivery reconnects, THE Session_Reconciler SHALL request bounded history reconciliation through spec 2 before reporting Waiting_State current.
8. WHEN the first valid decision is acknowledged, THE Haunted_House SHALL disable remaining decision controls for that proposal.

### Requirement 5: Filesystem confinement

**User Story:** As an operator, I want trusted code to enforce file access, so that a ghost remains inside its assigned Room.

#### Acceptance Criteria

1. WHEN a Ghost requests a Project_Path read, write, replace, or delete, THE MCP_Gate SHALL route it through Path_Guard.
2. IF a path is absolute or contains an empty, `.`, `..`, backslash, NUL, control, or percent-encoded traversal segment, THEN THE Path_Guard SHALL reject it before filesystem access.
3. WHEN Path_Guard accepts a Project_Path, THE Path_Guard SHALL verify canonical containment inside both Mansion and Effective_Room_Policy.
4. IF any existing path component is a symbolic link, THEN THE Path_Guard SHALL reject the operation.
5. IF an existing regular file has more than one hard link, THEN THE Path_Guard SHALL reject the operation.
6. WHEN Path_Guard opens or replaces a Project_Path, THE Path_Guard SHALL use descriptor-relative operations that prevent parent exchange.
7. IF a Project_Path matches a Protected_Path, THEN THE Path_Guard SHALL reject it regardless of broader allow rules.
8. WHEN Path_Guard denies an operation, THE Haunted_House SHALL append one redacted `path_denied` Domain_Event_Payload through the Canonical_Event_Writer without reading or changing the target.
9. THE Effective_Room_Policy SHALL grant each Ghost only access required by its Phase.

### Requirement 6: Room-scoped MCP tools

**User Story:** As a developer, I want one app-owned tool seam, so that every mutation uses the same checks and audit path.

#### Acceptance Criteria

1. THE Manifest SHALL declare MCP_Gate and runtime Ghost agents as gateway-managed app resources.
2. WHEN an App_Owned_Session starts, THE Haunted_House SHALL expose only MCP_Gate tools listed for the selected Ghost profile.
3. WHEN a requirements Ghost writes a Spec_Document, THE MCP_Gate SHALL permit only active `requirements.md`.
4. WHEN a design Ghost writes a Spec_Document, THE MCP_Gate SHALL permit only active `design.md`.
5. WHEN a tasks Ghost writes a Spec_Document, THE MCP_Gate SHALL permit only active `tasks.md`.
6. IF a Spec_Document write supplies a stale Artifact_Revision, THEN THE MCP_Gate SHALL return a conflict without replacing the file.
7. WHEN a Spec_Document write passes policy and revision checks, THE MCP_Gate SHALL replace it atomically and append content-free `spec_document_written` domain evidence through the Canonical_Event_Writer.
8. WHEN MCP_Gate receives risky execution, THE MCP_Gate SHALL check Approval_Ledger and Path_Guard before performing it.
9. IF MCP_Gate cannot establish session, Ghost, Mansion, and Room identity, THEN MCP_Gate SHALL expose no mutation tool.

### Requirement 7: App-owned Crew chat sessions and canonical event flow

**User Story:** As an operator, I want ghosts in app-owned sessions whose activity enters the one canonical event path, so that tool prompts appear at the correct Door without duplicate ingestion.

#### Acceptance Criteria

1. WHEN Haunted_House starts a Ghost, THE CrewChat adapter SHALL create a slot, set the Mansion project, set normal mode, and send the assignment through `/api/chat` in that order.
2. THE Haunted_House SHALL NOT use `/api/spawn` for runtime Ghosts.
3. THE Manifest SHALL declare `/api/chat`, `/api/chat/*`, `/apps/haunted-house/api/*`, and `sessionApproval: true`.
4. THE Manifest SHALL omit spawn and global approval paths unless separately approved shipped code requires them.
5. WHEN an App_Owned_Session is created, THE Haunted_House SHALL keep it in interactive approval mode.
6. WHEN the browser observes an owned-session Crew event, THE browser SHALL forward one raw Crew envelope to the spec 2 ingest endpoint and SHALL NOT normalize it for this feature.
7. WHEN spec 2 acknowledges canonical Crew events, THE Session_Reconciler and workflow services SHALL consume those events without persisting the source envelope again.
8. IF live delivery disconnects, THEN THE Haunted_House SHALL mark session state uncertain and complete spec 2 canonical catch-up before accepting a decision.
9. WHILE implementation Ghosts are working, THE Haunted_House SHALL limit concurrent implementation sessions to three.
10. WHERE a future direct-backend Crew WebSocket spike succeeds, THE optimization SHALL replace browser forwarding and use the same spec 2 normalizer and writer rather than create a second event owner.

### Requirement 8: Signed workflow API

**User Story:** As a UI developer, I want a small workflow API, so that the browser never appends approval or action records directly.

#### Acceptance Criteria

1. WHEN UI requests Mansion workflow state, THE Haunted_House SHALL return Phase, Door, Waiting_State, Ghost, and proposal projections folded from the Canonical_Read_Result.
2. WHEN UI submits Phase_Start_Command, THE Haunted_House SHALL validate Mansion, Phase, Projection_Version, and transition before starting a Ghost.
3. WHEN UI submits a Door decision, THE Haunted_House SHALL require proposal identifier, Artifact_Revision, and Projection_Version.
4. WHEN UI submits a Risky_Action decision, THE Haunted_House SHALL require proposal identifier, Action_Digest, and Projection_Version.
5. IF a mutation uses stale Projection_Version, THEN THE Haunted_House SHALL return HTTP 409 with current projection and append no domain record.
6. IF API input fails schema, length, enumeration, or Mansion validation, THEN THE Haunted_House SHALL return HTTP 400 without appending a record.
7. WHEN an API mutation succeeds, THE Haunted_House SHALL return the updated projection and acknowledged App_Event identifier and Sequence.
8. THE Haunted_House SHALL apply foundation Proxy_Signature middleware to every workflow route.

### Requirement 9: Door and waiting-state UI

**User Story:** As an operator, I want sealed Doors and exact pending decisions visible, so that I know what needs me without reading chat.

#### Acceptance Criteria

1. WHEN the house renders a Room, THE UI SHALL show Phase, Door state, and Ghost state with text and icon.
2. WHEN a Door_Proposal is pending, THE UI SHALL show Spec_Document path, Artifact_Revision, and separate Approve and Reject controls.
3. WHEN a Risky_Action proposal is pending, THE UI SHALL show complete Action_Descriptor, scope, and one-time effect before enabling controls.
4. IF an Action_Descriptor is redacted or incomplete, THEN THE UI SHALL disable approval and identify the proposal as blocked.
5. WHEN any proposal enters Waiting_State, THE UI SHALL update `Needs you` and announce one polite live-region message.
6. WHEN multiple waiting events for one Ghost arrive within 10 seconds, THE UI SHALL merge matching toast notifications.
7. WHEN a proposal resolves elsewhere, THE UI SHALL remove decision controls and show outcome and actor.
8. WHEN keyboard focus enters the house map, THE UI SHALL support Tab to rooms and decisions, Arrow movement, Enter open, and Escape close with focus restoration.
9. THE UI SHALL NOT infer approval from navigation, viewing, time, `chat_done`, or a Ghost result.

### Requirement 10: Canonical audit evidence and replay

**User Story:** As an operator, I want every authority decision in the canonical log, so that replay can explain what happened without a second ledger.

#### Acceptance Criteria

1. WHEN Haunted_House accepts a command, workflow transition, approval decision, denial, external resolution, action consumption, or outcome, THE owning service SHALL append one Domain_Event_Payload through the Canonical_Event_Writer.
2. WHEN Canonical_Event_Writer acknowledges a spec 4 domain record, THE Phase_State_Machine and Approval_Ledger SHALL use its Sequence as ordering and Projection_Version evidence.
3. WHEN spec 4 constructs tool or action evidence, THE payload builder SHALL omit Spec_Document content and credential values before submission to the Canonical_Event_Writer.
4. WHEN acknowledged canonical events are folded, THE Replay_Projection SHALL reproduce live Phase, Door, Waiting_State, proposal, approval, consumption, and outcome state.
5. IF Canonical_Read_Result reports malformed, unsupported, Sequence, or hash integrity failure, THEN THE Replay_Projection SHALL consume only the authoritative valid records supplied by spec 2 and propagate the diagnostic.
6. WHEN replay mode is active, THE UI SHALL derive workflow state without calling Crew_Gateway or Backend.
7. THE canonical Event_Log SHALL contain enough spec 4 domain evidence to distinguish allowed, denied, consumed, and failed operations without storing secrets or document contents.
8. THE `doors-and-guardrails` feature SHALL define no separate event schema, Event_ID algorithm, Sequence allocator, hash chain, log path, parser, store, or replay ordering rule.

### Requirement 11: Least privilege and fail-closed behavior

**User Story:** As an operator, I want each profile and permission narrowed to the feature, so that a failed secondary guard cannot widen authority.

#### Acceptance Criteria

1. THE runtime Ghost profiles SHALL list exact MCP_Gate tools instead of wildcard selectors.
2. THE runtime Ghost profiles SHALL deny built-in writes, shell, web, subagents, and unassigned MCP tools.
3. THE runtime Ghost profiles SHALL contain no `autoApprove` and no non-empty legacy `allowedTools`.
4. THE Manifest SHALL list only Gateway paths called by shipped code.
5. IF a hook or Ghost permission rule allows an operation that MCP_Gate or Path_Guard denies, THEN Haunted_House SHALL preserve the trusted denial.
6. IF a hook does not run or Crew already approved a tool call, THEN MCP_Gate SHALL apply the same Approval_Ledger and Path_Guard checks.
7. IF required confinement, session identity, Canonical_Event_Writer, or canonical integrity is unavailable, THEN MCP_Gate SHALL refuse mutations and report the Ghost `blocked`.
8. THE Haunted_House SHALL keep tokens, secrets, Session_Capabilities, credentials, and document bodies out of prompts, API responses, UI state, Domain_Event_Payload values, and process logs.

### Requirement 12: MVP and dependency boundary

**User Story:** As a hackathon developer, I want safety-critical behavior before optional review automation, so that delivery order is explicit.

#### Acceptance Criteria

1. THE MVP SHALL include deterministic requirements, design, tasks, and implementation Phase transitions with explicit Door decisions.
2. THE MVP SHALL include exact one-time risky approvals, filesystem confinement, room-scoped tools, app-owned sessions, waiting UI, and canonical replay evidence.
3. THE Haunted_House SHALL implement `seance-log-and-ghost-state` before `doors-and-guardrails` and `doors-and-guardrails` before `room-ghosts`.
4. WHERE Stretch_Feature support is enabled, THE Haunted_House SHALL add the review-and-return loop only after implementation output is ready.
5. WHERE Stretch_Feature support is enabled and review fails, THE Haunted_House SHALL create an explicit return proposal instead of automatically restarting a Phase.
6. WHERE Stretch_Feature support is disabled, THE Haunted_House SHALL complete MVP without review-loop states or controls.
