# Implementation Plan: Mansion Lifecycle

## Overview

Implement the Mansion Lifecycle MVP in Python 3.12 and React with TypeScript. Build the pure validators, path model, creation planner, registry codec, and Foyer reducer first; put filesystem, metadata, and Crew SDK access behind adapters; then wire the signed API, accessible Foyer, replay adapter, committed bundle, and automated acceptance coverage. Every step builds on an earlier tested seam, and no step adds mansion deletion.

## Tasks

- [ ] 1. Verify the app-data persistence assumption (MVP spike)
  - [ ] 1.1 Add an automated Crew app-data persistence probe
    - Create a focused probe under `spikes/mansion-data-persistence/` that resolves the standalone backend's app-data directory without printing an absolute home path, writes a synthetic versioned registry, reconstructs or restarts the backend service, and verifies equivalent data can be loaded
    - Exercise app update preservation when the local Crew test harness exposes update lifecycle hooks; fail closed and return the spec to design if `<app-root>/data` is not a verified persistent app-owned location
    - Keep the probe isolated from the real mansion root and from project files
    - _Requirements: 6.1, 6.4_

- [ ] 2. Implement pure mansion domain logic (MVP)
  - [ ] 2.1 Create mansion value types, exact name validation, and request-shape parsing
    - Add `core/mansion_names.py`, `core/mansion_requests.py`, and shared immutable models with the exact regex and 40-character bound, no coercion or normalization, and a total parser for exact `{name: string}` request objects
    - _Requirements: 2.1, 2.5, 7.5_

  - [ ] 2.2 Write the property test for exact mansion name validation
    - Add `tests/property/test_mansion_name_language.py` with at least 100 Hypothesis examples and the required feature/property comment
    - **Property 1: Mansion name validation matches the exact language**
    - **Validates: Requirements 2.1, 2.5**

  - [ ] 2.3 Implement component-aware path policy over explicit path facts
    - Add `core/mansion_paths.py` with immutable path facts, strict-descendant checks, Approved_Root evaluation, unsafe-root classification, and symlink-escape classification without filesystem access
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [ ] 2.4 Write the property test for path confinement
    - Add `tests/property/test_mansion_path_confinement.py` with a reference component model and generated prefix siblings, equality, `..`, non-directories, and symlink targets
    - **Property 3: Every accepted path remains confined**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**

  - [ ] 2.5 Implement project classification and the pure create transition model
    - Add `core/mansion_planner.py` with project snapshots, required-entry classification, create/adopt/conflict plans, exact Minimal_Project_Tree operations, registry-aware transitions, and order-independent same-name model execution
    - Preserve opaque extra entries in every transition
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.3_

  - [ ] 2.6 Write the property test for invalid-name no-op behavior
    - Add `tests/property/test_mansion_invalid_name_noop.py` with generated model states and rejected input values
    - **Property 2: Invalid names cause no state transition**
    - **Validates: Requirements 2.2, 2.3, 2.4**

  - [ ] 2.7 Write the property test for existing project preservation
    - Add `tests/property/test_existing_project_preservation.py` with generated required-entry kinds, canonical locations, opaque file bytes, and arbitrary extra entries
    - **Property 4: Existing project classification preserves every entry**
    - **Validates: Requirements 4.3, 4.5, 4.6, 5.4, 5.5, 5.6**

  - [ ] 2.8 Write the property test for exact idempotent creation
    - Add `tests/property/test_mansion_creation_idempotence.py` with generated valid names, registries, and operation permutations; assert exact directories, no files, one record, at most one created outcome, and fixed-point behavior
    - **Property 5: Creation is exact, idempotent, and confluent**
    - **Validates: Requirements 4.1, 4.2, 4.7, 5.1, 5.2, 5.3, 6.3**

  - [ ] 2.9 Implement the strict versioned metadata registry codec
    - Add `core/mansion_registry.py` with immutable records, schema-version enforcement, exact fields, unique names, name/spec/relative-path invariants, deterministic sorted pretty printing, and strict parsing
    - _Requirements: 6.2, 6.3, 6.6, 6.7, 6.8_

  - [ ] 2.10 Write the property test for canonical registry round trips
    - Add `tests/property/test_mansion_registry_roundtrip.py` with at least 100 valid generated registries and malformed/unsupported edge examples
    - **Property 6: Registry serialization is canonical and round-trippable**
    - **Validates: Requirements 6.2, 6.3, 6.7, 6.8**

  - [ ] 2.11 Implement pure Mansion_Record-to-descriptor projection
    - Add projection logic that combines registry records with project statuses, emits home-relative display paths only, and sorts by Mansion_Name
    - _Requirements: 7.1, 7.7_

  - [ ] 2.12 Write the property test for descriptor projection
    - Add `tests/property/test_mansion_descriptor_projection.py` with generated record orders and status maps
    - **Property 7: Descriptor projection is complete and sorted**
    - **Validates: Requirements 7.1, 7.7**

  - [ ] 2.13 Write the property test for strict request parsing
    - Add `tests/property/test_mansion_request_shape.py` over arbitrary JSON-compatible values and assert rejected values cannot yield a service command
    - **Property 8: Request parsing accepts only the exact body shape**
    - **Validates: Requirements 7.5**

- [ ] 3. Implement the confined filesystem adapter (MVP)
  - [ ] 3.1 Add configured root resolution and filesystem snapshot collection
    - Extend `adapters/settings.py` with an injectable Mansion_Root defaulting to `~/workspace/haunted-house/mansions` and Approved_Root values matching the verified S3 result
    - Add `adapters/mansion_filesystem.py` to walk root components with `lstat`, reject symlink/non-directory roots, create only missing root-container directories, derive targets from validated names, collect canonical path facts, and classify required descendants
    - Never accept a client path or log an absolute home path
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.4, 5.5, 5.6_

  - [ ] 3.2 Implement exact checked directory creation and guarded rollback
    - Recheck the target under the service mutation lock, create with exclusive `mkdir`, use no-follow directory operations where supported, stop on every collision, record device/inode identity for created directories, and roll back only identity-matched empty directories created by the failed attempt
    - Re-snapshot the final tree and expose no deletion API
    - _Requirements: 4.1, 4.5, 4.6, 5.1, 5.2, 10.1_

  - [ ] 3.3 Add filesystem adapter safety tests
    - Use temporary roots for default-container setup, compatible trees with opaque extra files, target and descendant files, in-root and escaping symlinks, sibling-prefix paths, injected mkdir races, rollback identity changes, and complete before/after project snapshots
    - Assert existing project trees remain byte-for-byte unchanged for every compatible and conflicting case
    - _Requirements: 3.2, 3.4, 3.5, 4.3, 4.5, 4.6, 5.1, 5.2, 5.4, 5.5, 5.6_

- [ ] 4. Implement durable app-owned metadata (MVP)
  - [ ] 4.1 Add the atomic mansion metadata store
    - Add `adapters/mansion_metadata.py` using the app-data location verified by task 1.1 and `mansions-v1.json`
    - Load a missing file as empty; preserve malformed and unsupported files; save canonical JSON through a same-directory exclusive temporary file, flush/fsync, atomic replace, and directory fsync where supported
    - Keep registry paths relative and outside every mansion project
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 6.7_

  - [ ] 4.2 Add metadata adapter tests
    - Cover missing files, restart through a new store instance, deterministic bytes, interrupted writes, atomic replacement, unsupported versions, malformed JSON, permission failures, original-byte preservation, and canonical separation from mansion roots
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.7_

- [ ] 5. Implement Mansion_Service orchestration (MVP)
  - [ ] 5.1 Implement listing and revalidated opening
    - Add `adapters/mansion_service.py` with one injected filesystem adapter, metadata store, and mutation lock
    - Load strict metadata, project descriptors through current snapshots, sort list results, require a registered name for open, and revalidate immediately before returning an open descriptor
    - _Requirements: 1.5, 3.6, 6.4, 6.5, 6.6, 7.1, 7.3, 7.4, 7.7_

  - [ ] 5.2 Implement serialized create, compatible adoption, and retry convergence
    - Validate before path access; lock and recheck; apply the pure plan; create or preserve the project; require a final compatible snapshot; upsert one record; then save metadata
    - Return `created` or `existing_compatible`; leave metadata unchanged on project errors; make retry adopt a compatible project left by a prior metadata-save failure
    - _Requirements: 2.2, 2.4, 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 5.1, 5.2, 6.3, 6.7_

  - [ ] 5.3 Add Mansion_Service unit and concurrency tests
    - Use spies to prove validation-before-resolution, check/create/save order, recheck under lock, final compatibility before metadata, registered-only open, list/open revalidation, one record under concurrent same-name asyncio calls, and no absolute paths in results or errors
    - _Requirements: 2.2, 2.4, 3.2, 4.2, 4.3, 4.5, 4.7, 6.3, 7.3, 7.4, 7.6, 7.7_

- [ ] 6. Add the signed Mansion_API (MVP)
  - [ ] 6.1 Add list, create, and open routes to `server.py`
    - Register only `GET /api/mansions`, `POST /api/mansions`, and `POST /api/mansions/open` behind the existing proxy-signature middleware
    - Enforce JSON content and exact request shape, inject Mansion_Service in tests, map domain outcomes to the documented statuses/codes, return fixed safe messages, and construct the live service during app startup
    - Preserve 404/405 behavior for unsupported mansion mutations
    - _Requirements: 2.3, 3.6, 4.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 10.1, 10.3_

  - [ ] 6.2 Add API contract and trust-boundary tests
    - Cover success bodies/statuses, malformed JSON and shapes, invalid names, unregistered/missing/conflicting projects, metadata and filesystem failures containing fake sensitive text, unsupported methods/paths, body-size behavior, and unsigned requests that never call the service
    - _Requirements: 2.3, 4.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 10.3_

- [ ] 7. Implement pure Foyer state and response parsing (MVP)
  - [ ] 7.1 Add typed mansion API parsers and the Foyer reducer
    - Add `ui/src/core/mansion-api.ts` for strict success/error parsing and bounded safe messages
    - Add `ui/src/core/foyer-reducer.ts` for loading, ready, error, selection, create/open pending and results, sorted upsert, Mansion Shell entry, and return state
    - Keep network, SDK, React, filesystem, and clock access out of `core/`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 7.1, 7.2, 7.3, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 9.3_

  - [ ] 7.2 Write the property test for coherent Foyer transitions
    - Add `ui/src/core/foyer-reducer.property.test.ts` with at least 100 fast-check runs over valid states and event sequences
    - **Property 9: Foyer transitions preserve one coherent selection and list**
    - **Validates: Requirements 1.4, 8.2, 8.3, 8.5, 9.3**

  - [ ] 7.3 Add example and edge tests for Foyer core parsing
    - Cover all success and error shapes, extra response fields, invalid/absolute display paths, duplicate names, unknown statuses, bounded messages, sorted upsert, stale selection, retry transitions, and return state
    - _Requirements: 1.2, 1.3, 7.1, 7.6, 7.7, 8.4, 8.5_

- [ ] 8. Build the accessible Foyer and Mansion Shell (MVP)
  - [ ] 8.1 Extend the SDK boundary with mansion operations and theme state
    - Add `useMansionApi()` and typed `get`/`post` declarations in `adapters/sdk.ts` and `app-sdk.d.ts`; call only the two app-backend paths from the design and parse every response before returning
    - Re-export `useTheme()` through the existing boundary and map backend errors to fixed Foyer copy
    - _Requirements: 1.1, 1.5, 7.1, 7.2, 7.3, 7.6, 8.9_

  - [ ] 8.2 Create the Foyer room components and styles
    - Add `rooms/foyer/Foyer.tsx`, `CreateMansionForm.tsx`, `MansionList.tsx`, `MansionShell.tsx`, and Foyer CSS using Crew variables
    - Render loading, empty, ready, missing, conflict, and inline error states; use a labelled native radio group, visible Open/Create/Retry/Return controls, text plus icons, one polite live region, Arrow/Enter/Escape behavior, focus restoration, reduced motion, and the Still House seam
    - Include no delete, rename, archive, discovery, import, or custom-root controls
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 10.2_

  - [ ] 8.3 Wire `App.tsx` from backend status into the Foyer
    - Preserve the foundation loading, unreachable, and retry states; mount the Foyer only after backend reachability; keep the same root component for live and replay builds
    - _Requirements: 1.1, 8.1, 8.4, 9.1_

  - [ ] 8.4 Add Foyer DOM, keyboard, accessibility, and theme tests
    - Cover backend gating; list loading/empty/ready/error; create validation/success/failure; one selected mansion; open revalidation; Mansion Shell; Return and Escape focus restoration; Arrow and Enter controls; duplicate-action disabling; one live region; textual states; theme variables; reduced motion; and absence of destructive/stretch actions
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 10.2_

- [ ] 9. Extend replay mode for the Foyer journey (MVP)
  - [ ] 9.1 Implement fixture-backed replay list, create, and open operations
    - Extend `adapters/sdk-shim/` with an in-memory registry and the same response contracts as live mode; keep fixture input immutable and allow no Gateway or filesystem operation
    - Reuse the live mansion parsers, reducer, Foyer, and Mansion Shell
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ] 9.2 Write the property test for deterministic isolated replay
    - Add `ui/src/core/replay-mansion.property.test.ts` with generated fixture registries and operation sequences, two fresh replay models, and network/filesystem spies
    - **Property 10: Replay operations are deterministic and isolated**
    - **Validates: Requirements 9.2**

  - [ ] 9.3 Add replay DOM parity tests
    - Render list, empty, create, select, open, and return flows through the replay entry; assert shared landmarks/components and no Gateway request
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 10. Update manifest declarations and build artifacts (MVP)
  - [ ] 10.1 Declare app-scoped storage and test the permission set
    - Add `permissions.storage: true` to `app/app.json` while retaining the existing minimal `permissions.api` list; update manifest tests to require storage and continue rejecting `autoApprove`
    - _Requirements: 6.1, 7.8_

  - [ ] 10.2 Build and verify live and replay bundles
    - Run TypeScript typechecking and Vitest, build `app/ui/dist/index.mjs`, run the host-module import check, build replay output, and verify the committed live bundle matches source
    - _Requirements: 1.1, 8.8, 8.9, 9.1, 9.2_

- [ ] 11. Integrate and verify the lifecycle (MVP)
  - [ ] 11.1 Add automated cross-layer acceptance tests with temporary roots
    - Create a mansion through the signed aiohttp API, parse and reduce the response into Foyer state, open the mansion, construct a fresh service/store to simulate backend restart, list and open again, and assert the exact project tree and separate persistent registry
    - Add a pre-populated arbitrary project case and prove create/open refusal or compatible adoption never changes any project byte
    - Do not launch a development server or touch the real default mansion root
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 3.1, 3.3, 4.1, 4.2, 4.3, 4.5, 5.1, 5.2, 6.1, 6.4, 7.1, 7.2, 7.3, 7.8_

  - [ ] 11.2 Run the complete automated validation set
    - Run Python tests, UI tests, typechecking, live and replay builds, manifest checks, bundle import checks, the `.kiro` tracking check, and the secret scan; fix only failures caused by Mansion Lifecycle changes
    - _Requirements: 2.1, 3.3, 4.2, 4.5, 6.4, 7.8, 9.1, 10.1, 10.2, 10.3_

- [ ] 12. Checkpoint: ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Every task above is **MVP**. Stretch behavior is explicitly deferred and has no implementation task.
- Mansion deletion is absent from the API, service, reducer, UI, and task list. Guarded rollback in task 3.2 can remove only empty directories created by the same failed attempt after device/inode verification; rollback cannot remove a mansion or pre-existing entry.
- Property tests are required rather than optional because workspace steering requires one property-based test for every correctness property and the user specifically prioritized idempotence, non-overwrite, containment, and name validation.
- Each property test runs at least 100 generated examples and includes `Feature: mansion-lifecycle, Property N: <property title>`.
- Crew/Kiro capabilities and limits used by the plan are documented in `crew__apps.md`, `crew__apps__manifest.md`, `crew__apps__sdk.md`, `crew__interfaces__cli-reference.md`, `specs.md`, `specs__feature-specs__requirements-first.md`, and `specs__correctness.md`. The allowed-root detail comes from verified spike S3 in `.kiro/steering/tech.md`.
- Task 1.1 is a gate. If Crew's app-data path does not persist, implementation returns to the design phase before tasks 4–11 rather than selecting an undocumented fallback.
- Tasks neither commit nor push and do not modify a real mansion project.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "2.1", "2.3", "2.5", "2.9", "7.1", "10.1"]
    },
    {
      "id": 1,
      "tasks": ["2.2", "2.4", "2.6", "2.7", "2.8", "2.10", "2.11", "2.13", "3.1", "4.1", "7.2", "7.3", "8.1"]
    },
    {
      "id": 2,
      "tasks": ["2.12", "3.2", "4.2", "5.1", "8.2", "9.1"]
    },
    {
      "id": 3,
      "tasks": ["3.3", "5.2", "6.1", "8.3", "9.2"]
    },
    {
      "id": 4,
      "tasks": ["5.3", "6.2", "8.4", "9.3", "11.1"]
    },
    {
      "id": 5,
      "tasks": ["10.2"]
    },
    {
      "id": 6,
      "tasks": ["11.2"]
    }
  ]
}
```
