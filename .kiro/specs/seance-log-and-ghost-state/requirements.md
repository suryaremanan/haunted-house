# Requirements Document

## Introduction

This specification defines Haunted House's single canonical event schema, single append-only séance log, and deterministic ghost-state fold. The Python backend is authoritative for ingestion and persistence. The browser subscribes to Crew events for low-latency display, forwards each raw Crew envelope to the backend, and updates state only from canonical events acknowledged or read back by the backend. The backend validates session scope, normalizes, redacts, deduplicates, assigns a monotonic per-Mansion sequence, and appends canonical records. Replay reads the same records and uses the same selection and fold rules.

This specification builds on `crew-app-foundation`. It must be implemented before `doors-and-guardrails`, which appends domain records through the writer defined here. `room-ghosts` follows `doors-and-guardrails` and is the only feature that may convert an observed `chat_done` fact into a domain `run_completed` or `run_failed` result after validating the expected artifact.

### Scope labels

- **MVP:** Requirements 1 through 12.
- **Stretch:** Direct backend subscription to Crew's WebSocket, search, filtering, export, rich Attic controls, cloud synchronization, and multi-user ownership are deferred.

## Glossary

- **Haunted_House**: The local Kiro Crew App defined in `app/`.
- **Backend**: The local Python HTTP process established by `crew-app-foundation`.
- **Crew_Gateway**: Kiro Crew 0.12.1 or later.
- **Crew_Envelope**: An object containing the subscribed Crew event `type` and the callback `data` exactly as observed by the browser, before normalization.
- **Supported_Crew_Envelope**: A Crew_Envelope whose type starts with `chat_` or equals `tool_call`, `tool_result`, `shared_crew.decision`, or `approval_resolved`.
- **App_Event_Candidate**: A validated domain fact before writer-owned redaction, identifiers, sequence, persistence time, and optional tamper-evidence fields are assigned.
- **App_Event**: One validated, redacted, persisted record in the canonical Haunted House event schema.
- **Event_Type**: A past-tense snake_case fact name allowed by the canonical schema.
- **Domain_Event_Payload**: A payload with `domain`, `kind`, `entity_id`, and JSON-compatible `data`; the named domain owns its state machine and payload validation.
- **Schema_Version**: A positive integer identifying the App_Event schema.
- **Event_Scope**: The `mansion_id`, `ghost_id`, `session_slot`, `run_id`, and `run_sequence` values associated with an event.
- **Run**: One assignment to one ghost in one app-owned chat session.
- **Run_Sequence**: A non-negative integer assigned by Haunted House that orders Runs for one ghost.
- **Sequence**: A positive integer assigned by the Canonical_Event_Writer that orders newly persisted records for one Mansion; zero represents an empty log projection.
- **Event_ID**: A deterministic identifier for one logical event, independent of delivery time and Sequence.
- **Record_ID**: A deterministic identifier for one redacted event variant, excluding writer-assigned fields.
- **Source_Revision**: A non-negative upstream revision or sequence, or zero when none exists.
- **Causal_Predecessor**: An Event_ID naming a logical predecessor.
- **Canonical_Order**: Sequence order after exact duplicates and losing Event_ID variants are removed deterministically.
- **Backend_Normalizer**: The pure Python module that validates a Supported_Crew_Envelope and maps it to zero or more App_Event_Candidates using a server-registered Event_Scope.
- **Canonical_Event_Validator**: The pure module that validates candidates and persisted events against the canonical schema.
- **Event_Selector**: The pure module that collapses exact duplicates, selects one winning variant for each Event_ID, and emits Canonical_Order.
- **Canonical_Event_Writer**: The only interface allowed to assign Sequence, persistence time, `prev_hash`, or `hash`, and the only interface allowed to append the Event_Log.
- **Persistence_Pipeline**: The Canonical_Event_Writer implementation that validates, redacts, identifies, deduplicates, sequences, optionally hash-links, and persists events.
- **Event_Log**: The one append-only canonical App_Event sequence for one Mansion.
- **Log_Store**: The filesystem adapter used only by the Canonical_Event_Writer.
- **Mansion**: One local software project managed by Haunted_House.
- **Mansion_Root**: The canonical filesystem root of a Mansion.
- **Mansion_ID**: A kebab-case Mansion name containing at most 40 characters.
- **Mansion_Log_Directory**: The `.haunted-house/seance/` directory below a Mansion_Root.
- **Known_Secret**: An in-memory app secret, app token, authorization value, or other credential known to the Persistence_Pipeline.
- **Sensitive_Value**: A string matching repository credential patterns or stored below a credential-like key.
- **Home_Path**: An absolute path beginning with `/Users/<name>/`, `/home/<name>/`, or `C:\Users\<name>\`.
- **Redactor**: The pure module that recursively replaces Known_Secrets, Sensitive_Values, and Home_Paths in JSON-compatible data.
- **Tool_Call**: One Crew tool invocation identified by `tool_call_id` within a Run.
- **Crew_Approval**: One Crew permission request identified by the permission message `mid` within a Run.
- **Ghost_State**: One of `idle`, `working`, `waiting`, `blocked`, `failed`, or `done`.
- **Ghost_State_Reducer**: The pure module that derives Ghost_Snapshots from canonical App_Events.
- **Ghost_Snapshot**: The selected Run, Ghost_State, pending approvals, open tool calls, latest Event_ID, and optional reason for one ghost.
- **Ghost_Transition**: A deterministic derived transition between two Ghost_Snapshots; it is not a second persisted event.
- **Live_Fold**: A Ghost_State_Reducer evaluation after canonical App_Events are acknowledged or read from the Backend.
- **Replay_Fold**: The same selection and reduction semantics applied to an Event_Log without live services.
- **Canonical_Event_API**: Signed Backend routes used to ingest Crew_Envelopes and read canonical App_Events.
- **Live_Event_Bridge**: The UI adapter that subscribes to Crew, forwards raw Crew_Envelopes, and publishes only acknowledged canonical state.
- **Replay_Build**: The static UI build that uses a recorded Event_Log and no Crew_Gateway or Backend connection.
- **Ghost_Status_View**: The minimal UI list displaying a ghost name, Ghost_State text, non-color state icon, and short reason.
- **Canonical_Serializer**: The module that writes one App_Event as one deterministic UTF-8 JSON line.
- **Canonical_Parser**: The module that reads Canonical_Serializer output and reports line-specific and integrity diagnostics.

## Requirements

### Requirement 1: One canonical app-event schema (MVP)

**User Story:** As a Haunted House developer, I want one versioned event envelope, so that every producer, room, projection, and replay shares the same contract.

#### Acceptance Criteria

1. THE App_Event SHALL contain Schema_Version, Event_ID, Record_ID, Sequence, Event_Type, Event_Scope, Source_Revision, zero or more Causal_Predecessors, occurrence time, persistence time, and a JSON-compatible payload.
2. THE App_Event schema SHALL permit optional `prev_hash` and `hash` fields only as a pair.
3. THE Event_Scope SHALL contain non-empty `mansion_id`, `ghost_id`, `session_slot`, and `run_id` strings plus a non-negative Run_Sequence.
4. THE Event_Type SHALL be one of `run_started`, `ghost_progressed`, `message_recorded`, `message_updated`, `response_segment_started`, `response_chunk_recorded`, `crew_turn_ended`, `crew_error_observed`, `run_completed`, `run_blocked`, `run_failed`, `tool_started`, `tool_updated`, `tool_finished`, `approval_requested`, `approval_decided`, `decision_recorded`, `domain_event_recorded`, or `source_event_observed`.
5. THE `domain_event_recorded` App_Event SHALL carry a Domain_Event_Payload without changing the canonical envelope.
6. WHEN an App_Event schema version is supported, THE Canonical_Event_Validator SHALL accept every App_Event that satisfies the schema.
7. IF a candidate or App_Event has an unsupported Schema_Version, invalid Event_Scope, unknown Event_Type, invalid identifier, invalid Sequence, non-finite number, or non-JSON payload, THEN THE Canonical_Event_Validator SHALL return a typed validation error without appending a record.
8. THE Event_ID SHALL depend only on stable source identity, Event_Scope, and Event_Type.
9. THE Record_ID SHALL depend only on the redacted canonical candidate fields and SHALL exclude Sequence, persistence time, Record_ID, `prev_hash`, and `hash`.
10. THE canonical schema SHALL be the only persisted event envelope used by Haunted_House.

### Requirement 2: Backend-owned Crew normalization (MVP)

**User Story:** As a developer, I want Crew payload interpretation in one backend module, so that browsers and room features cannot produce conflicting facts.

#### Acceptance Criteria

1. WHEN the Live_Event_Bridge observes a supported Crew callback, THE Live_Event_Bridge SHALL forward one Crew_Envelope containing the subscribed type and unmodified callback data to the Canonical_Event_API.
2. WHEN the Backend_Normalizer receives a `chat_message` Crew_Envelope for a registered Event_Scope, THE Backend_Normalizer SHALL produce a `message_recorded` App_Event_Candidate.
3. WHEN the Backend_Normalizer receives a `chat_message_update` Crew_Envelope for a registered Event_Scope, THE Backend_Normalizer SHALL produce a `message_updated` App_Event_Candidate.
4. WHEN the Backend_Normalizer receives a `chat_status` Crew_Envelope for a registered Event_Scope, THE Backend_Normalizer SHALL produce a `ghost_progressed` App_Event_Candidate.
5. WHEN the Backend_Normalizer receives a `chat_segment` Crew_Envelope for a registered Event_Scope, THE Backend_Normalizer SHALL produce a `response_segment_started` App_Event_Candidate.
6. WHEN the Backend_Normalizer receives a `chat_chunk` Crew_Envelope for a registered Event_Scope, THE Backend_Normalizer SHALL produce a `response_chunk_recorded` App_Event_Candidate identified by generation and source sequence.
7. WHEN the Backend_Normalizer receives any `chat_done` Crew_Envelope for a registered Event_Scope, THE Backend_Normalizer SHALL produce a `crew_turn_ended` App_Event_Candidate that preserves bounded transport facts and has no terminal Ghost_State effect.
8. THE Backend_Normalizer SHALL NOT infer `run_completed`, `run_failed`, or `run_blocked` from `chat_done`.
9. WHEN the Backend_Normalizer receives a `chat_error` Crew_Envelope for a registered Event_Scope, THE Backend_Normalizer SHALL produce a `crew_error_observed` App_Event_Candidate with a redaction-safe category and no direct terminal Ghost_State effect.
10. WHEN the Backend_Normalizer receives an initial or updating `tool_call` Crew_Envelope, THE Backend_Normalizer SHALL produce `tool_started` or `tool_updated` identified by `tool_call_id`.
11. WHEN the Backend_Normalizer receives a `tool_result` Crew_Envelope, THE Backend_Normalizer SHALL produce `tool_finished` identified by `tool_call_id` and reported finality.
12. WHEN the Backend_Normalizer receives `shared_crew.decision` or `approval_resolved`, THE Backend_Normalizer SHALL produce the applicable `decision_recorded`, `approval_requested`, or `approval_decided` Crew fact only after matching the permission `mid`.
13. WHEN equivalent Crew approval outcomes arrive through two source envelope types, THE Backend_Normalizer SHALL assign equivalent stable identity fields.
14. WHEN the Backend_Normalizer receives an unrecognized `chat_` Crew_Envelope for a registered Event_Scope, THE Backend_Normalizer SHALL produce `source_event_observed` with no Ghost_State effect.
15. IF a Crew_Envelope lacks a registered session slot, required source identifier, valid approval match, or valid JSON value, THEN THE Backend_Normalizer SHALL return a typed normalization result and produce no affected candidate.
16. THE Browser, `doors-and-guardrails`, and `room-ghosts` SHALL NOT implement a second Crew normalization mapping.

### Requirement 3: One authoritative append-only writer and log (MVP)

**User Story:** As an operator, I want every accepted fact committed through one backend writer, so that order, replay, and authorization cannot diverge.

#### Acceptance Criteria

1. WHEN the Canonical_Event_Writer accepts an App_Event_Candidate, THE Canonical_Event_Writer SHALL validate, redact, identify, deduplicate, assign the next Sequence, append, flush, and acknowledge the resulting App_Event in that order.
2. THE Canonical_Event_Writer SHALL be the only module that writes `<Mansion>/.haunted-house/seance/events.v1.jsonl`.
3. THE Haunted_House SHALL create no second event log, approval ledger file, hash-chain file, or mutable replay store inside or outside a Mansion.
4. WHEN a tool, Crew approval, Crew decision, domain decision, denial, command, action, or outcome is accepted, THE responsible domain SHALL submit one App_Event_Candidate through the Canonical_Event_Writer.
5. WHEN `doors-and-guardrails` submits a workflow, Door, approval, action, or guardrail record, THE Canonical_Event_Writer SHALL persist it as one canonical `domain_event_recorded` App_Event.
6. WHEN an exact Record_ID already exists, THE Canonical_Event_Writer SHALL return the existing App_Event without assigning a new Sequence or appending bytes.
7. THE Log_Store SHALL preserve every acknowledged byte without rewriting, truncating, deleting, or renumbering an earlier record.
8. WHEN the Log_Store acknowledges an append, THE Log_Store SHALL have flushed the complete JSON line to the local filesystem.
9. THE Canonical_Event_Writer SHALL expose append, compare-and-append, and read operations without exposing direct Log_Store mutation.

### Requirement 4: Redaction before persistence (MVP)

**User Story:** As an operator, I want every persisted event scrubbed by the authoritative writer, so that replay cannot expose credentials or local usernames.

#### Acceptance Criteria

1. WHEN JSON-compatible data contains a Known_Secret in raw, URL-encoded, or partially URL-encoded form, THE Redactor SHALL replace every Known_Secret occurrence with `[redacted]`.
2. WHEN JSON-compatible data contains a Sensitive_Value, THE Redactor SHALL replace the Sensitive_Value with `[redacted]`.
3. WHEN JSON-compatible data contains a Home_Path, THE Redactor SHALL replace the user-specific home prefix with `[home]/`.
4. THE Redactor SHALL recursively process object keys, object values, and array elements.
5. THE Redactor SHALL preserve JSON value types, object membership count, and array length except for replaced string content.
6. THE Redactor SHALL be idempotent for every JSON-compatible value.
7. THE Persistence_Pipeline SHALL apply the Redactor before calculating Event_ID, Record_ID, `hash`, or serialized bytes.
8. IF post-redaction validation detects a Known_Secret, Sensitive_Value, Home_Path, or forbidden document body, THEN THE Persistence_Pipeline SHALL reject the candidate without appending bytes.
9. THE Persistence_Pipeline SHALL return only canonical redacted App_Events and safe diagnostics.

### Requirement 5: Sequence, identity, deduplication, and integrity (MVP)

**User Story:** As a developer, I want retries and reconnects to converge on one ordered history, so that live and replay observe the same facts.

#### Acceptance Criteria

1. WHEN the same logical source fact is submitted more than once for the same Event_Scope, THE Persistence_Pipeline SHALL assign the same Event_ID.
2. WHEN candidate variants share an Event_ID, THE Event_Selector SHALL select the greatest Source_Revision, then greatest semantic-completeness rank, then lexicographically greatest Record_ID.
3. WHEN a new Record_ID is appended, THE Canonical_Event_Writer SHALL assign exactly one Sequence greater than the preceding persisted Sequence for that Mansion.
4. WHEN canonical App_Events are selected for folding, THE Canonical_Order SHALL order them by Sequence and use Event_ID only as a defensive tie-breaker for invalid external input.
5. WHEN a compare-and-append request names the current highest Sequence, THE Canonical_Event_Writer SHALL evaluate and append under the same per-Mansion lock.
6. IF a compare-and-append request names a stale highest Sequence, THEN THE Canonical_Event_Writer SHALL return a conflict without appending.
7. WHEN tamper evidence is enabled for a new Event_Log, THE Canonical_Event_Writer SHALL populate `prev_hash` and `hash` from the redacted canonical record and preceding acknowledged hash.
8. IF a record has only one tamper-evidence field, an invalid hash, a broken link, a duplicate Sequence, or a missing Sequence, THEN THE Canonical_Parser SHALL return the valid prefix and an integrity diagnostic without repairing the log.
9. WHEN any finite canonical App_Event collection is duplicated or permuted in memory, THE Event_Selector and Ghost_State_Reducer SHALL produce the same selected Sequence/Event_ID set and Ghost_Snapshots.
10. WHEN a delayed App_Event belongs to a lower Run_Sequence than the selected Run, THE Ghost_State_Reducer SHALL preserve the selected Run and Ghost_State.

### Requirement 6: Six-state ghost reducer (MVP)

**User Story:** As a developer, I want one pure six-state fold, so that every live and replay surface reports the same ghost state.

#### Acceptance Criteria

1. THE Ghost_State_Reducer SHALL return only `idle`, `working`, `waiting`, `blocked`, `failed`, or `done`.
2. WHEN no `run_started` App_Event exists for a ghost, THE Ghost_State_Reducer SHALL select `idle`.
3. WHEN the greatest Run_Sequence has `run_started` and no unresolved approval or domain terminal event, THE Ghost_State_Reducer SHALL select `working`.
4. WHILE the selected Run has one or more unresolved Crew or domain approvals and no terminal event, THE Ghost_State_Reducer SHALL select `waiting`.
5. WHEN the selected Run has `run_blocked` and no `run_failed`, THE Ghost_State_Reducer SHALL select `blocked`.
6. WHEN the selected Run has `run_failed`, THE Ghost_State_Reducer SHALL select `failed`.
7. WHEN the selected Run has `run_completed` and no `run_blocked` or `run_failed`, THE Ghost_State_Reducer SHALL select `done`.
8. WHEN the selected Run has only `crew_turn_ended` or `crew_error_observed` transport facts, THE Ghost_State_Reducer SHALL NOT select `done`, `blocked`, or `failed` from those facts alone.
9. WHEN an approval is requested and later decided within the selected Run, THE Ghost_State_Reducer SHALL remove it from the pending set.
10. WHEN a Tool_Call starts and later finishes within the selected Run, THE Ghost_State_Reducer SHALL remove it from the open-tool set.
11. WHEN a higher Run_Sequence receives `run_started`, THE Ghost_State_Reducer SHALL select the higher Run independently of lower-run terminal state.
12. WHEN an App_Event belongs to another ghost or Mansion, THE Ghost_State_Reducer SHALL preserve the target Ghost_Snapshot.
13. THE Ghost_State_Reducer SHALL perform no network access, filesystem access, clock read, or input mutation.

### Requirement 7: Canonical serialization and parsing (MVP)

**User Story:** As a developer, I want one stable on-disk representation, so that logs remain portable and independently testable.

#### Acceptance Criteria

1. WHEN the Canonical_Serializer receives a valid redacted App_Event, THE Canonical_Serializer SHALL produce one UTF-8 JSON object with recursively sorted keys and one trailing newline.
2. WHEN the Canonical_Parser receives a line produced by the Canonical_Serializer, THE Canonical_Parser SHALL produce a semantically equivalent App_Event.
3. WHEN serializer output is parsed and serialized again, THE Canonical_Serializer SHALL produce identical bytes.
4. WHEN the Canonical_Parser encounters malformed or unsupported records outside a hash-verified prefix, THE Canonical_Parser SHALL report one-based line diagnostics and continue reading later independently valid records.
5. WHEN the Canonical_Parser detects a Sequence or hash-chain integrity failure, THE Canonical_Parser SHALL identify the first invalid line and expose only the preceding valid prefix to authoritative folds.
6. WHEN the Canonical_Parser reads an empty Event_Log, THE Canonical_Parser SHALL return an empty collection, Sequence zero, and no error.

### Requirement 8: Replay from the one log (MVP)

**User Story:** As a judge, I want replay to rebuild Haunted House from its canonical log, so that the demonstration relies on no hidden state.

#### Acceptance Criteria

1. WHEN Replay_Fold receives an Event_Log and no external state, THE Replay_Fold SHALL reconstruct every supported Ghost_Snapshot from the valid canonical records.
2. WHEN Live_Fold and Replay_Fold receive the same selected App_Events, THE folds SHALL produce equal Ghost_Snapshots and Ghost_Transitions.
3. WHEN the Replay_Build loads a recorded Event_Log, THE Replay_Build SHALL use the same Event_Selector and Ghost_State_Reducer semantics used by live mode.
4. THE Replay_Build SHALL use fixture-backed adapters as the sole sources of event and status data.
5. IF an Event_Log contains malformed, unsupported, or integrity-invalid records, THEN THE Replay_Build SHALL display the safe diagnostic and fold only the authoritative valid records or valid prefix.
6. WHEN replay timing is enabled, THE Replay_Build SHALL present visible events in Canonical_Order rather than fixture file arrival order.

### Requirement 9: Canonical writer and signed event API (MVP)

**User Story:** As a later feature, I want one small writer interface and signed event API, so that no caller owns storage details.

#### Acceptance Criteria

1. WHEN a signed request posts at most 100 Crew_Envelopes and at most 1 MiB to `/api/mansions/{mansion_id}/seance/ingest`, THE Canonical_Event_API SHALL normalize and durably append accepted facts before returning canonical App_Events.
2. WHEN a trusted backend domain calls `append_candidates` or `compare_and_append`, THE Canonical_Event_Writer SHALL return acknowledged canonical App_Events and the highest Sequence.
3. IF an ingest request uses an invalid Mansion_ID, invalid envelope, unregistered slot, oversized body, or invalid JSON, THEN THE Canonical_Event_API SHALL return HTTP 400 or 413 without appending an affected record.
4. WHEN a signed request gets `/api/mansions/{mansion_id}/seance/events` with a valid `after_sequence` and limit from 1 through 500, THE Canonical_Event_API SHALL return the next canonical page, highest Sequence, and safe parser/integrity diagnostics.
5. WHEN a requested Mansion_Log_Directory does not exist, THE Canonical_Event_API SHALL return HTTP 404 without creating a Mansion.
6. THE Canonical_Event_API SHALL use the proxy-signature middleware established by `crew-app-foundation`.
7. THE Canonical_Event_API SHALL resolve every Event_Log below the configured Mansion root using Mansion_ID rather than a caller-supplied path.
8. THE Canonical_Event_Writer SHALL expose no rewrite, truncate, delete, renumber, or alternate-store operation.

### Requirement 10: Browser low-latency bridge and acknowledged UI state (MVP)

**User Story:** As an operator, I want live activity quickly without trusting browser-only state, so that reconnect and replay remain authoritative.

#### Acceptance Criteria

1. WHEN a registered live Crew event arrives, THE Live_Event_Bridge SHALL send its raw Crew_Envelope to the ingest endpoint without normalizing it in the browser.
2. WHEN the Canonical_Event_API acknowledges App_Events, THE Live_Event_Bridge SHALL apply each acknowledged Record_ID to Live_Fold at most once.
3. IF ingest fails or does not acknowledge an envelope, THEN THE Live_Event_Bridge SHALL preserve the prior Ghost_Snapshot and display a persistence diagnostic.
4. WHEN the Ghost_Status_View renders a Ghost_Snapshot, THE view SHALL display the ghost name, Ghost_State text, state icon, and optional reason without using color alone.
5. WHEN a derived Ghost_Transition enters `waiting`, `blocked`, or `failed`, THE Ghost_Status_View SHALL announce one concise update through the shared polite live region.
6. WHEN a derived Ghost_Transition enters `working`, `done`, or `idle`, THE Ghost_Status_View SHALL update in place without a toast, sound, or live-region announcement.
7. WHEN equivalent canonical records drive live and replay modes, THE Ghost_Status_View SHALL render equal ghost names, states, pending counts, and reasons.
8. THE Ghost_Status_View SHALL contain only ghost-state rows, persistence diagnostics, loading state, catching-up state, and empty state.

### Requirement 11: Session isolation and reconnect behavior (MVP)

**User Story:** As an operator, I want only app-owned ghost sessions recorded, so that unrelated Crew chats never enter a Mansion log.

#### Acceptance Criteria

1. WHEN an ingest request carries a Crew_Envelope whose slot matches a Backend-registered active Event_Scope, THE Backend_Normalizer SHALL associate it only with that Event_Scope.
2. IF a Crew_Envelope slot has no Backend-registered active Event_Scope, THEN THE Canonical_Event_API SHALL reject or ignore it without appending an App_Event.
3. WHEN Crew redelivers an earlier Crew_Envelope, THE Persistence_Pipeline SHALL acknowledge the existing Record_ID without appending or assigning another Sequence.
4. WHEN the Live_Event_Bridge mounts or reconnects, THE Live_Event_Bridge SHALL read canonical events after its highest acknowledged Sequence before declaring the stream current.
5. WHEN canonical catch-up identifies a gap that Crew history can resolve, THE Backend SHALL read only registered app-owned session history and pass recovered Crew facts through the same Backend_Normalizer and Canonical_Event_Writer.
6. WHILE catch-up is incomplete, THE Ghost_Status_View SHALL mark the stream as catching up without changing Ghost_State solely because of connection state.
7. IF catch-up cannot complete, THEN THE Live_Event_Bridge SHALL report a persistence diagnostic and preserve the latest replayable Ghost_Snapshot.
8. WHERE a future spike proves direct Backend subscription to Crew's WebSocket, THE optimization SHALL feed the same Backend_Normalizer and Canonical_Event_Writer and SHALL replace rather than duplicate browser delivery.

### Requirement 12: Ownership and local operation boundary (MVP)

**User Story:** As a hackathon judge, I want the event foundation small and explicit, so that storage and replay ownership are easy to verify.

#### Acceptance Criteria

1. THE Haunted_House SHALL store Event_Logs only under local Mansion_Root directories.
2. THE Haunted_House SHALL use the Crew authentication and app-permission boundaries established by `crew-app-foundation`.
3. THE Haunted_House SHALL expose Ghost_Snapshots for one local operator.
4. THE `seance-log-and-ghost-state` feature SHALL own the canonical event envelope, identifiers, writer, Sequence, optional tamper evidence, Event_Log, selector, Ghost_State_Reducer, and replay semantics.
5. THE `doors-and-guardrails` feature SHALL own workflow, Door, approval, action, and guardrail domain payloads and folds while persisting them only through the Canonical_Event_Writer.
6. THE `room-ghosts` feature SHALL own artifact validation and SHALL append `run_completed` or `run_failed` only after evaluating the acknowledged `crew_turn_ended` fact and expected artifact.
7. THE Browser SHALL own low-latency Crew subscription and raw-envelope forwarding but SHALL own neither normalization nor persistence.
8. THE Haunted_House SHALL implement dependencies in the order `crew-app-foundation`, `seance-log-and-ghost-state`, `doors-and-guardrails`, then `room-ghosts`.
