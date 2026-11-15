# Implementation Plan: Séance Log and Ghost State

## Overview

Implement the single canonical event contract and backend persistence path after `crew-app-foundation`. The browser forwards raw Crew envelopes for low-latency ingestion. Python owns Crew normalization, final redaction, IDs, per-Mansion Sequence, optional hash links, and the only append-only Event_Log writer. Spec 2 owns equivalent deterministic Python/TypeScript selection and Ghost_State folds for backend, live UI, and replay. No task adds browser normalization, a second log, a domain approval store, or a direct backend Crew WebSocket. Spec 4 depends on the writer delivered here; Spec 5 later owns artifact-validated terminal events.

## Tasks

- [ ] 1. Resolve Crew callback and history shape assumptions (MVP)
  - [ ] 1.1 Add scrubbed S2 callback probes
    - Verify each supported `useAppEvents` subscription receives the expected callback data, that the bridge can preserve it unchanged inside `{type,data}`, and that unsubscribe stops delivery.
    - Capture bounded `chat_error`, final/non-final `tool_result`, reconnect indication, and post-restart history shapes without storing tokens, headers, unrelated sessions, or absolute home paths.
    - Keep probes under `spikes/`; do not implement a backend WebSocket listener.
    - _Requirements: 2.1–2.15, 11.4–11.8_

  - [ ] 1.2 Encode spike outcomes and fail-closed fallbacks as fixtures
    - Add scrubbed machine-readable fixtures for S2-A1 through S2-A4 and retain the verified S6 fixture as baseline evidence.
    - Assert fixture callbacks round-trip through `{type,data}` unchanged and every unavailable field selects the documented bounded fallback rather than browser interpretation.
    - _Requirements: 2.1–2.15, 4.8, 11.5, 11.7_

- [ ] 2. Implement the canonical event schema and identities (MVP)
  - [ ] 2.1 Implement the Python canonical event core
    - Add `core/seance_event.py` with App_Event_Candidate, App_Event, Event_Scope, EventSource, EventRef, Domain_Event_Payload, allowed Event_Type values, limits, runtime validation, canonical JSON, Event_ID, Record_ID, Sequence/hash field validation, and safe diagnostics.
    - Exclude Sequence, persistence time, Record_ID, `prev_hash`, and `hash` from Record_ID input; keep filesystem, network, and clock access out of core.
    - _Requirements: 1.1–1.10, 5.1_

  - [ ] 2.2 Implement the TypeScript canonical parser and model
    - Add `ui/src/core/seance-event.ts` with the same canonical envelope, strict unknown-value parsing, domain payload envelope, bounds, safe diagnostics, and shared event constants.
    - Do not add a Crew frame mapping to TypeScript.
    - _Requirements: 1.1–1.10, 7.1–7.6_

  - [ ] 2.3 Add scrubbed cross-language canonical vectors
    - Add shared vectors for candidates, redacted events, Event_ID, Record_ID, Sequence, optional integrity fields, canonical bytes, domain payloads, and expected validation errors.
    - Consume the vectors in Python and TypeScript example tests; include no real credential or absolute Home_Path.
    - _Requirements: 1.1–1.10, 7.1–7.6_

  - [ ] 2.4 Write the property test for canonical schema validity
    - **Property 1: Canonical schema validation matches the schema model**
    - Use Hypothesis for at least 200 valid values and one-field invalid mutations.
    - **Validates: Requirements 1.1–1.7**

  - [ ] 2.5 Write the property test for identifier boundaries
    - **Property 2: Event and record identifiers exclude writer metadata**
    - Vary writer fields and candidate identity fields independently for at least 200 Hypothesis examples.
    - **Validates: Requirements 1.8, 1.9, 5.1**

- [ ] 3. Implement backend-owned Crew normalization (MVP)
  - [ ] 3.1 Implement the pure Backend_Normalizer
    - Add `core/crew_event_normalizer.py` with the complete supported mapping, registered-scope lookup, intrinsic source identities, approval `mid` matching, bounded safe payloads, reconciliation requests, and typed errors.
    - Map every `chat_done` only to `crew_turn_ended` and every `chat_error` only to `crew_error_observed`; emit no domain terminal event.
    - _Requirements: 2.2–2.16, 6.8, 11.1, 11.2_

  - [ ] 3.2 Write the property test for deterministic nonterminal normalization
    - **Property 3: Crew normalization is deterministic and transport-terminal facts remain nonterminal**
    - Cover every mapping family and every `chat_done` flag combination for at least 200 Hypothesis examples.
    - **Validates: Requirements 2.2–2.14**

  - [ ] 3.3 Write the property test for invalid envelope rejection
    - **Property 4: Invalid Crew envelopes produce no affected candidate**
    - Generate unknown slots, missing identifiers, unmatched approval aliases, non-finite values, and non-JSON values.
    - **Validates: Requirements 2.15, 11.1, 11.2**

  - [ ] 3.4 Write the property test for equivalent approval identity
    - **Property 5: Equivalent Crew approval sources share one identity**
    - Generate reusable `approval_id` values, distinct `mid` values, and equivalent source outcomes.
    - **Validates: Requirements 2.12, 2.13**

  - [ ] 3.5 Add verified-frame and terminal-gate examples
    - Replay scrubbed S6 observations through only the Python normalizer and assert message, chunk, tool, decision, and approval candidates.
    - Assert `chat_done` never creates `run_completed`, `run_blocked`, or `run_failed`, including needs-input and continuing forms.
    - Add a structural test rejecting a TypeScript Crew mapping table outside the raw bridge.
    - _Requirements: 2.1–2.16, 6.8, 12.6, 12.7_

- [ ] 4. Implement redaction and the sole Canonical_Event_Writer (MVP)
  - [ ] 4.1 Implement recursive JSON redaction
    - Add `core/deep_redact.py` over the foundation redactor for raw/mixed encoded secrets, credential keys and patterns, Home_Paths, unsafe key collisions, bounded JSON trees, and residual detection.
    - Preserve JSON types and collection cardinality and make repeated redaction stable.
    - _Requirements: 4.1–4.9_

  - [ ] 4.2 Write the property test for recursive redaction
    - **Property 6: Deep redaction is safe, structure-preserving, and idempotent**
    - Use at least 200 Hypothesis examples with planted sensitive values and all supported platform paths.
    - **Validates: Requirements 4.1–4.6**

  - [ ] 4.3 Implement persistence transformation and `SeanceLogStore`
    - Add pure candidate preparation plus `adapters/seance_log_store.py` as the only opener of `.haunted-house/seance/events.v1.jsonl`.
    - Implement pre-existing Mansion resolution, realpath/symlink confinement, an inter-process lock, Record_ID index, contiguous Sequence assignment, optional writer-owned hash linking, append/flush/fsync, exact duplicate no-op, immutable prefixes, and safe valid-prefix diagnostics.
    - Expose append, compare-and-append, and read-after through one `CanonicalEventWriter` interface. Give no caller a file path or handle.
    - _Requirements: 3.1–3.9, 4.7–4.9, 5.3, 5.5–5.8, 9.2, 9.8_

  - [ ] 4.4 Write the property test for writer ordering and integrity
    - **Property 7: The writer is monotonic, idempotent, and tamper-evident**
    - Model candidate sequences, retries, stale comparisons, and hash-linked records for at least 200 Hypothesis examples.
    - **Validates: Requirements 3.1, 3.6–3.8, 5.3, 5.5–5.8**

  - [ ] 4.5 Add writer filesystem and process-integration tests
    - Test all-or-nothing validation, redaction before IDs/bytes, two-process append races, stale compare-and-append, append-before-ack, fsync failure, duplicate no-op, conflicting variants, symlink escape, malformed/truncated lines, mixed integrity mode, immutable prefixes, and missing Mansions.
    - Assert no second log filename or direct writer exists in the app source.
    - _Requirements: 3.1–3.9, 4.7–4.9, 5.3–5.8, 7.4–7.6, 9.5, 9.7, 12.1, 12.4_

- [ ] 5. Implement canonical selection and Ghost_State folds (MVP)
  - [ ] 5.1 Implement Spec 2 selection and reduction in Python and TypeScript
    - Implement exact Record_ID collapse, Event_ID variant ranking, Sequence ordering, causal diagnostics, greatest Run_Sequence selection, six-state precedence, approval/tool set subtraction, nonterminal Crew transport facts, and derived Ghost_Transition identity.
    - Keep both core implementations pure and use shared vectors as the normative parity contract. No other spec may implement Ghost_State reduction.
    - _Requirements: 5.2, 5.4, 5.9, 5.10, 6.1–6.13, 8.1–8.3_

  - [ ] 5.2 Write the property test for selection convergence
    - **Property 8: Selection and reduction converge under duplicates and permutations**
    - Use fast-check for at least 200 multi-run event collections with duplicates, variants, permutations, and delayed lower runs.
    - **Validates: Requirements 5.2, 5.4, 5.9, 5.10**

  - [ ] 5.3 Write the model-based property test for all six states
    - **Property 9: Six-state reduction agrees with the reference fact model**
    - Use fast-check for at least 200 multi-Mansion histories, including `crew_turn_ended` and `crew_error_observed` without domain terminals.
    - **Validates: Requirements 6.1–6.13**

  - [ ] 5.4 Add cross-language fold parity and state examples
    - Compare Python backend and TypeScript UI snapshots/transitions for shared canonical vectors.
    - Cover all six states, terminal precedence, higher runs, pending/resolved approvals, final tools, foreign scopes, and nonterminal Crew turn/error observations.
    - _Requirements: 6.1–6.13, 8.1–8.3_

- [ ] 6. Implement canonical parsing and signed backend APIs (MVP)
  - [ ] 6.1 Implement canonical parser, integrity result, and read-after paging
    - Parse canonical JSON lines, recover independently malformed records, stop authoritative integrity at the first Sequence/hash failure, and return highest Sequence plus valid-prefix diagnostics.
    - Page physical records by `after_sequence` and fixed limits without rewriting or byte-offset authority.
    - _Requirements: 7.1–7.6, 9.4, 9.8_

  - [ ] 6.2 Write the property test for serialization and integrity parsing
    - **Property 10: Canonical serialization and integrity parsing are stable**
    - Generate round trips, malformed-line interleavings, and first-corruption positions for at least 200 Hypothesis examples.
    - **Validates: Requirements 7.1–7.6**

  - [ ] 6.3 Add signed ingest and event-read routes
    - Add `POST /api/mansions/{id}/seance/ingest` for raw Crew envelopes and `GET /api/mansions/{id}/seance/events` for canonical pages behind foundation proxy middleware.
    - Validate body size, envelope count, Mansion_ID, registered server scope, `after_sequence`, and page limit; return canonical events only after durable acknowledgment.
    - _Requirements: 9.1, 9.3–9.8_

  - [ ] 6.4 Add bounded session-history reconciliation
    - Extend GatewayClient with typed percent-encoded session history reads for server-registered slots and add `POST /api/mansions/{id}/seance/reconcile`.
    - Convert recovered history to Crew_Envelopes and pass them through the same Backend_Normalizer and Canonical_Event_Writer; return `history_partial` for unproved facts.
    - _Requirements: 2.12, 2.15, 11.4–11.7, 12.2_

  - [ ] 6.5 Add signed route and reconciliation integration tests
    - Cover valid/invalid/unsigned ingest, raw envelope preservation, unregistered slot refusal, batch atomicity, page coverage, duplicate redelivery, history recovery, missing Mansion, body limits, token refresh, timeouts, and redacted responses.
    - _Requirements: 2.1, 4.7–4.9, 9.1, 9.3–9.8, 11.1–11.7_

- [ ] 7. Implement browser raw forwarding and canonical catch-up (MVP)
  - [ ] 7.1 Implement the Live_Event_Bridge
    - Extend the existing SDK seam with static supported event subscriptions and add `adapters/seance-live.ts` that posts exact `{type,data}` envelopes, merges only canonical acknowledgments, pages after highest Sequence, runs Spec 2 selection/fold, and keeps a bounded retry queue.
    - Add no browser normalizer, candidate builder for Crew facts, or direct state update from callback data.
    - _Requirements: 2.1, 2.16, 10.1–10.3, 11.4, 11.6, 11.7, 12.7_

  - [ ] 7.2 Write the property test for session routing and redelivery
    - **Property 12: Session routing and redelivery preserve scope and Sequence**
    - Use Hypothesis against the backend ingest model for at least 200 registered-scope maps and duplicate envelope sequences.
    - **Validates: Requirements 11.1–11.3**

  - [ ] 7.3 Add live bridge acknowledgment and reconnect tests
    - Hold ingest/read promises to prove raw data cannot update UI, exact acknowledgments apply once, catch-up precedes current state, failed catch-up preserves snapshots, unknown slots remain absent, and subscriptions/timers clean up on unmount.
    - Assert there is no backend WebSocket lifecycle in MVP and no browser Crew mapping table.
    - _Requirements: 10.1–10.3, 11.1–11.8_

- [ ] 8. Convert replay to canonical Event_Log folding (MVP)
  - [ ] 8.1 Replace raw replay frames with a canonical fixture and adapter
    - Replace the `{t,frame}` replay contract with scrubbed canonical App_Event JSONL containing multiple ghosts, tool and approval facts, `crew_turn_ended`, validated completion, and failure/block evidence.
    - Parse, verify, select, and fold through Spec 2 core; use occurrence time only for optional presentation delay.
    - _Requirements: 7.1–7.6, 8.1, 8.3–8.6_

  - [ ] 8.2 Write the property test for live/replay equivalence
    - **Property 11: Live and replay folding agree**
    - Use fast-check for at least 200 canonical multi-ghost logs and acknowledged page/file permutations.
    - **Validates: Requirements 8.1–8.6, 10.2, 10.7**

  - [ ] 8.3 Add replay parser, timing, and transport-boundary tests
    - Verify valid-prefix diagnostics, deterministic Sequence presentation, derived transitions, one application per Record_ID, empty logs, and no Gateway/Backend transport.
    - _Requirements: 7.4–7.6, 8.3–8.6_

- [ ] 9. Add the minimal accessible Ghost_Status_View (MVP)
  - [ ] 9.1 Implement canonical live/replay ghost status
    - Add `GhostStatusView` with name, exact state text, Lucide icon, pending count, safe reason, loading/catching-up/diagnostic/empty states, and the shared polite live region.
    - Notify only derived transitions to waiting, blocked, or failed; keep idle, working, and done ambient.
    - _Requirements: 10.4–10.8_

  - [ ] 9.2 Add accessibility and rendered-parity tests
    - Render all six states from canonical live acknowledgments and replay, compare names/states/counts/reasons, assert text-plus-icon and one live region, and reject toasts, sounds, room maps, or chat panels in this provisional view.
    - _Requirements: 10.4–10.8_

- [ ] 10. Enforce ownership, permissions, and build integration (MVP)
  - [ ] 10.1 Add cross-spec ownership and structural tests
    - Prove Spec 4 domain candidates round-trip through the writer, Spec 5 can append a validated terminal after `crew_turn_ended`, and consumers receive one canonical sequence.
    - Reject alternate log paths, direct Event_Log writes, duplicate event envelopes, browser/Spec 4/Spec 5 Crew normalizers, persisted Ghost_Transitions, and writer-field assignment outside Spec 2.
    - _Requirements: 1.10, 3.2–3.5, 12.4–12.8_

  - [ ] 10.2 Update least-privilege manifest contracts
    - Add only `/api/chat/*` for bounded history reads and exact supported advisory event names while retaining foundation and own-backend paths.
    - Add no `sessionApproval` in Spec 2, no spawn/global approval path, and no backend WebSocket permission.
    - _Requirements: 11.5, 12.2, 12.7_

  - [ ] 10.3 Run all checks and rebuild live/replay artifacts
    - Run Python and UI suites, typecheck, manifest and ownership checks, secret/home-path scan, live build, replay build, bundle-import check, and deterministic second build.
    - Commit the updated `app/ui/dist/index.mjs` only as part of later implementation, not during this spec edit.
    - _Requirements: 8.3, 8.4, 10.4–10.8, 12.1–12.8_

- [ ] 11. Checkpoint: verify canonical writer and fold contracts
  - Ensure all tests pass; ask the user if a requirement or design decision needs revision.

- [ ] 12. Final checkpoint: verify the complete Spec 2 feature
  - Ensure all tests and builds pass; ask the user if questions arise.

## Notes

- Every task is MVP. Direct backend Crew WebSocket subscription is explicitly deferred and has no implementation task.
- Each numbered correctness property has exactly one primary property-based test and at least 200 generated cases.
- Python owns primary tests for Properties 1–7, 10, and 12. TypeScript owns Properties 8, 9, and 11.
- Spec 2 implements before Spec 4. Spec 4 uses the writer instead of creating `seance_store.py`, `seance.jsonl`, or a hash ledger. Spec 5 implements after Spec 4 and owns artifact-validated terminal candidates.
- No task creates a Mansion, commits, pushes, deploys, modifies Crew trust, or enables automatic approval.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "4.1"] },
    { "id": 1, "tasks": ["1.2", "2.3", "2.4", "2.5", "3.1", "4.2", "5.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "3.5", "4.3", "5.2", "5.3"] },
    { "id": 3, "tasks": ["4.4", "4.5", "5.4", "6.1", "7.2"] },
    { "id": 4, "tasks": ["6.2", "6.3", "6.4", "7.1", "8.1", "9.1"] },
    { "id": 5, "tasks": ["6.5", "7.3", "8.2", "8.3", "10.1", "10.2"] },
    { "id": 6, "tasks": ["9.2"] },
    { "id": 7, "tasks": ["10.3"] }
  ]
}
```
