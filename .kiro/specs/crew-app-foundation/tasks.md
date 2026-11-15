# Implementation Plan

## Overview

Build the Haunted House foundation from the approved requirements and design: repo baseline, `.kiro` check, signed-proxy backend, gateway client, manifest, live and replay UI, secret scan, install script, Kiro hooks, CI, and a live check on Crew 0.12.1. Target: done by M1 (Wed Nov 18), alongside specs 2 and 3.

## Tasks

- [x] 1. Repository baseline (MVP)
  - [x] 1.1 Initialize the repo and add the baseline files
    - Run `git init`; add an MIT `LICENSE`, a `.gitignore` exactly as listed in the design (never naming `.kiro`), and a `README.md` with what the app is, the Crew 0.12.1 requirement, the install command and the one-time trust step
    - Keep `spikes/` as evidence; ignore build outputs under it (`node_modules/`, `dist-replay/`)
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.2 Set up the Python and test tooling
    - Add `pyproject.toml` (pytest config, `core` marker), `requirements-dev.txt` (pytest, hypothesis, `aiohttp>=3.14,<3.15`), `scripts/test-py.sh` (creates `.venv` with `uv venv --python 3.12` when missing) and `scripts/test-all.sh`
    - _Requirements: 9.1_

- [x] 2. `.kiro` tracking check (MVP)
  - [x] 2.1 Write `scripts/check-kiro-tracked.sh`
    - Pipe `.kiro`, `.kiro/`, `.kiro/.probe` and every file under `.kiro/` to `git check-ignore --no-index -v --stdin`; print each hit as rule and path; exit 1 on any hit, 0 otherwise
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.2 Write example tests for the check
    - pytest builds temporary git repos: clean repo, `.kiro/` ignored, `*.md` ignoring `.kiro/specs/x.md`, a negation rule; assert exit codes and that the matching rule is printed
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 3. Proxy signature core (MVP)
  - [x] 3.1 Implement `haunted_house/core/proxy_signature.py`
    - `sign()`, `verify()` and `Verdict` as in the design; header shape `^\d{1,12}:[0-9a-f]{64}$`; 60-second window; `hmac.compare_digest`; never raises; `now` passed in
    - _Requirements: 5.2, 5.3, 5.4, 5.5_
  - [x] 3.2 Write property test: signatures accepted only inside the window
    - **Property 1: Signatures are accepted only inside the time window**
    - **Validates: Requirements 5.2, 5.3**
  - [x] 3.3 Write property test: any change is rejected
    - **Property 2: Any change to a signed request is rejected**
    - **Validates: Requirements 5.3, 5.5**
  - [x] 3.4 Write property test: malformed input rejected without errors
    - **Property 3: Malformed input is rejected without errors**
    - **Validates: Requirements 5.3, 5.4**

- [x] 4. Scope, URL and redaction core (MVP)
  - [x] 4.1 Implement `core/scope.py`, `core/urls.py` and `core/redact.py`
    - `path_allowed()` with the dashboard's prefix rules and refusal of `..`, `\` and absolute URLs; `with_token()`; `redact()` covering raw and percent-encoded forms
    - _Requirements: 3.3, 6.2, 6.4_
  - [x] 4.2 Write property test: token placed exactly once
    - **Property 5: The token is placed in the query exactly once**
    - **Validates: Requirements 6.2**

- [x] 5. Backend server (MVP)
  - [x] 5.1 Implement settings, server and entry point
    - `adapters/settings.py` reads `PORT`, `KIROCREW_PROXY_SECRET`, `KIROCREW_GATEWAY_ORIGIN`, `KIROCREW_APP_NAME`; `server.py` adds the signature middleware for `/api/`, `GET /health`, `GET /api/whoami`; binds `127.0.0.1`; `app/backend/main.py` adds its folder to `sys.path`, checks aiohttp imports, then runs the server
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_
  - [x] 5.2 Write property test: unsigned API requests never reach a handler
    - Use the aiohttp test client with a spy handler, 50 examples
    - **Property 4: Unsigned API requests never reach a handler**
    - **Validates: Requirements 5.1, 5.3, 5.4**
  - [x] 5.3 Write unit tests for the server
    - Missing secret gives 401 on every `/api/` path and one startup warning; health payload has no version or secret; listen address is loopback
    - _Requirements: 5.1, 5.4, 5.6_

- [x] 6. Gateway client (MVP)
  - [x] 6.1 Implement `adapters/gateway_client.py`
    - `ROUTES`, `GatewayError`, `GatewayClient.call()`: loopback-only origin, scope check before any request, token exchange with `X-App-Secret`, token as `?token=`, one refresh and retry on 401/403, 30-second timeout, all output passed through `redact()`, URLs logged as path only
    - _Requirements: 3.3, 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 6.2 Wire `GET /api/whoami` to the client
    - Map results to `gateway.version` or `gateway.error` (`timeout`, `unreachable`, `denied`, `config`)
    - _Requirements: 4.4, 6.5_
  - [x] 6.3 Write property test: secret and token never revealed
    - Fake gateway that echoes URLs and headers in bodies, plus timeouts and connection errors; capture logs
    - **Property 6: The client never reveals the secret or token**
    - **Validates: Requirements 6.4, 6.5**
  - [x] 6.4 Write property test: at most one refresh and retry
    - **Property 7: At most one token refresh and one retry per call**
    - **Validates: Requirements 6.1, 6.3, 6.5**
  - [x] 6.5 Write property test: never calls outside the manifest scope
    - Compare `path_allowed()` with a reference model, and assert no network call for refused paths
    - **Property 8: The client never calls outside the manifest scope**
    - **Validates: Requirements 3.3**

- [x] 7. Manifest (MVP)
  - [x] 7.1 Write `app/app.json` and an original placeholder icon
    - Manifest exactly as in the design; `app/assets/icon.png` 256×256, original art, no third-party marks
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 7.2 Write the manifest test
    - Requirement 3 rules plus Crew's documented validation rules; `permissions.api` equals `ROUTES` prefixes plus `/apps/haunted-house/api/*`; no `autoApprove` anywhere
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 8. Checkpoint: all Python tests pass
  - Run `scripts/test-py.sh`; fix failures; ask the user if a failure points at a requirement or design problem

- [x] 9. Live UI build (MVP)
  - [x] 9.1 Set up `app/ui`
    - `package.json` (scripts `build`, `build:replay`, `test`, `test:core`; no `@kirocrew/app-sdk` dependency), `package-lock.json`, `tsconfig.json`, `vite.config.ts` with the host modules external, `vitest.config.ts` with jsdom; dev React types 18.3
    - _Requirements: 4.1, 4.3, 9.1_
  - [x] 9.2 Implement the SDK adapter and status page
    - `src/adapters/sdk.ts` (only importer of `@kirocrew/app-sdk`), `src/adapters/app-sdk.d.ts`, `useBackendStatus()`; `src/App.tsx` default export with Backend and Gateway rows shown as text plus icon
    - _Requirements: 4.4, 7.1_
  - [x] 9.3 Write DOM tests for the status page
    - Mocked adapter: reachable, backend unreachable, gateway timeout, gateway denied
    - _Requirements: 4.4_
  - [x] 9.4 Write `scripts/check-bundle-imports.mjs` and the adapter-only import test
    - `es-module-lexer` over static and dynamic imports; tests with sample modules; a test that no file outside `src/adapters/sdk.ts` imports `@kirocrew/app-sdk`
    - _Requirements: 4.2, 7.1_
  - [x] 9.5 Build `app/ui/dist/index.mjs`
    - Run the build and the import check; the bundle is tracked in git (committed at task 16)
    - _Requirements: 1.4, 4.1, 4.2_

- [x] 10. Replay build (MVP)
  - [x] 10.1 Implement the replay stand-in and entry
    - `src/adapters/sdk-shim/index.ts`, `replay/index.html`, `replay/main.tsx`, `vite.replay.config.ts`; copy `spikes/fixtures/s5-two-ghosts.jsonl` to `fixtures/replay/demo.jsonl`
    - _Requirements: 7.2, 7.3_
  - [x] 10.2 Write property test: replay delivers each frame once, in order
    - fast-check with fake timers
    - **Property 11: Replay delivers each frame once, in order, to the right subscribers**
    - **Validates: Requirements 7.2, 7.3**
  - [x] 10.3 Write the replay DOM test
    - Render the replay entry with a fixture; assert the same root component renders and every `fetch` goes to `./fixture.jsonl`
    - _Requirements: 7.3, 7.4_

- [x] 11. Secret scan (MVP)
  - [x] 11.1 Implement `scripts/secret_scan.py`
    - Pattern table from the design, fixture home-path rule, `.app_secret` by name, output `file:line: pattern` only, `--hook` mode that exits 2
    - _Requirements: 10.1, 10.2, 10.3, 11.4_
  - [x] 11.2 Write property test: credentials found without being printed
    - **Property 9: The secret scan finds credentials without printing them**
    - **Validates: Requirements 10.1, 10.2, 11.4**
  - [x] 11.3 Write property test: home paths in fixtures flagged
    - **Property 10: Home paths in fixtures are flagged**
    - **Validates: Requirements 10.3**
  - [x] 11.4 Scan the repo and fix any findings
    - Run the scan over all tracked files, including `spikes/`; remove or scrub anything it reports
    - _Requirements: 10.1_

- [x] 12. Install script (MVP)
  - [x] 12.1 Write `scripts/install-local.sh`
    - Prerequisite checks (Crew ≥ 0.12.1, node, npm, git, gateway health), UI build, install or update via `kirocrew app info` exit code, printed dashboard steps; never touches config, enable or trust
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 12.2 Write tests with a fake `kirocrew` on `PATH`
    - Fresh install, update, too-old version, missing tool, gateway down; assert forbidden strings are absent from the script; run `shellcheck`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 13. Kiro hooks (MVP)
  - [x] 13.1 Create the four hook files in `.kiro/hooks/`
    - `kiro-tracked.json`, `test-core-on-save.json`, `tests-after-task.json`, `secret-guard.json` as in the design; confirm the post-task trigger name in the IDE hook editor and record it in tech.md
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x] 13.2 Test the hooks
    - A test that each file parses and names the expected trigger, matcher and command; a manual check that the secret guard blocks an agent write of a fake key
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 14. CI (MVP)
  - [x] 14.1 Write `.github/workflows/ci.yml`
    - Jobs `python`, `ui` (tests, build, import check, `git diff --exit-code app/ui/dist`, replay build) and `repo` (`.kiro` check, secret scan, shellcheck); any failing step fails the run
    - _Requirements: 4.5, 9.2, 9.3_
  - [x] 14.2 Push and confirm a green run (needs you)
    - User creates the public GitHub repo `haunted-house` and approves the first push; confirm all three jobs pass
    - _Requirements: 9.2, 9.3_

- [x] 15. Live check on Crew 0.12.1 (MVP, needs you)
  - [x] 15.1 Install and confirm the status line
    - Run `scripts/install-local.sh`; user trusts and enables the app; open the page and confirm "Backend reachable · Gateway 0.12.1"; if `useAppApi()` refuses the own-backend path, switch the adapter to same-origin `fetch` and rebuild
    - _Requirements: 4.4, 8.2, 8.5_
  - [x] 15.2 Spot-check the trust boundary and record results
    - Unsigned request straight to the backend port returns 401; record the results and the resolved assumptions in tech.md
    - _Requirements: 5.3_

- [x] 16. Final checkpoint: all checks pass
  - Run `scripts/test-all.sh`, the `.kiro` check and the secret scan; ask the user before making the first commit; ask the user if anything is unclear

- [ ]* 17. Verify the v2 replay-proof proxy signature (stretch)
  - [ ]* 17.1 Add a nonce cache and v2 verification alongside v1
    - Requires confirming Crew's exact v2 format; reject a reused nonce
    - _Requirements: 5.2, 5.3_

## Notes

- (MVP) tasks are required. (stretch) tasks are optional (`*`) and skipped by Run all. Property test tasks are required, not optional.
- (needs you) tasks stop for the user: 14.2 creates and pushes the public GitHub repo, and 15.1 needs the Crew trust dialog.
- Tasks don't commit or push. The first commit happens at task 16 after the user agrees, so parallel tasks never fight over the git index.
- Crew facts used here (paths, env vars, headers, CLI exit codes) are recorded in `.kiro/steering/tech.md` under Spike results.
- Each property test carries the comment `Feature: crew-app-foundation, Property N: <title>` and runs at least 100 examples (Property 4: 50).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "9.1"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1", "9.2", "11.1"] },
    { "id": 3, "tasks": ["2.2", "3.2", "3.3", "3.4", "4.2", "5.1", "9.3", "9.4", "10.1", "11.2", "11.3"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1", "10.2", "10.3", "12.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4", "6.5", "7.1", "12.2"] },
    { "id": 6, "tasks": ["7.2", "9.5", "13.1"] },
    { "id": 7, "tasks": ["8", "11.4", "13.2", "14.1"] },
    { "id": 8, "tasks": ["15.1"] },
    { "id": 9, "tasks": ["14.2", "15.2"] },
    { "id": 10, "tasks": ["16"] },
    { "id": 11, "tasks": ["17.1"] }
  ]
}
```
