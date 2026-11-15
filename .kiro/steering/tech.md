# Tech

## Delivery
A Kiro Crew App, gateway-managed (`resources: "gateway"`, `lifecycle: "gateway"`). Crew runs the ghosts. The app owns phases, doors and the séance log. Crew has no API for Kiro's native spec phases, so the house writes Kiro-format spec files itself.

## Stack
| Layer | Choice | Status |
|---|---|---|
| UI | React + TypeScript, Vite library build to ESM `app/ui/dist/index.mjs` | Decided |
| Host-provided libs | `react`, `react-dom`, `react/jsx-runtime`, `lucide-react`, `@kirocrew/app-sdk`. Mark them external in Vite. Never npm-install the SDK | Decided |
| Styling | Plain CSS on top of Crew theme variables (`useTheme`) | Decided. Tailwind on app pages is unconfirmed, so don't depend on it |
| Backend | Python 3.12 + aiohttp, both from Crew's own interpreter (aiohttp 3.14.5). No `kirocrew-client` (not published) | Decided (spec 1 design) |
| Replay mode | Same UI built against our own SDK stand-in, static site on GitHub Pages | Resolved; replay build and replay DOM test pass |
| Tests | Vitest + fast-check (TypeScript); pytest + Hypothesis (Python) | Decided |

## Decisions waiting on spikes
| Question | Spike | Default if the spike fails |
|---|---|---|
| How a ghost runs inside a mansion folder | S3 | **Resolved:** `POST /api/spawn` with `cwd`. Mansions must live under `~/workspace` (Crew's `agent.subagent_cwd_allowed_roots`) |
| Whether the app can answer tool approvals | S6 | **Resolved:** yes, for chat sessions the app owns. Ghosts run as app-owned sessions, not `/api/spawn` |
| Real event payload shapes | S5 | **Resolved:** see spike results; fixture in `spikes/fixtures/` |
| Agent harness Crew uses (V2 or V3) | S0 after update | Assume V3 fields (`permissions`) and verify in S4 |

Record each answer here when its spike finishes.

## Spike results
- S0 (Nov 12): Updated from 0.6.0 to 0.12.1; gateway 0.12.1 healthy. Installed Crew was 0.6.0 (desktop app; the CLI links into the app bundle). Current stable is 0.12.1 (Nov 9). Decision: target 0.12.1 and set `minKiroCrewVersion: "0.12.1"`. Kiro CLI 2.37.0, signed in. Crew approval mode was `auto`; no project dir set. macOS arm64. Crew bundles its own Python 3.12.
- Reference apps: Crew's built-in Spec Builder and Agent Worlds (Crew is Apache-2.0). Read them to learn; don't copy code. Spec Builder sets a session's working directory through undocumented in-gateway state, so we don't depend on that.

- Leads from reading the 0.12.1 source (undocumented; confirm in spikes): `POST /api/chat` creates a session and `POST /api/chat/slots/{slot}/project` sets its working folder, allowed only for sessions the app owns (S3). `GET /api/approvals` and `POST /api/approvals/{id}/{action}` exist; an app may use them only if its manifest declares `permissions.sessionApproval` and the owner consents when enabling it (S6). Spec Builder declares `permissions.api` for `/api/chat` and `/api/chat/*`.

- Verified on 0.12.1 (differs from or is missing in the docs):
  - The proxy signature header is `X-KiroCrew-Proxy` (docs say `X-Crew-Proxy`). It signs `ts:METHOD:/api/<path>[?query]:sha256(body)`; the backend gets the secret in env `KIROCREW_PROXY_SECRET` and the gateway URL in `KIROCREW_GATEWAY_ORIGIN`. A v2 replay-proof signature rides beside it.
  - `kirocrew-client` is not on PyPI. The backend calls REST itself: `POST /api/apps/<name>/token` with header `X-App-Secret` returns an app token.
  - `POST /api/spawn` accepts `task`, `agent`, `cwd`, `approval_mode`, `max_turns`, `label`, `model`. App tokens may call it if `permissions.api` lists it.
  - App backends run on the gateway's bundled Python 3.12. Use the standard library, or plan for dependency provisioning.
  - `kirocrew app init --ui` lists `@kirocrew/app-sdk` as an npm peer dependency, which npm can't resolve. Remove it; the host supplies it at runtime.
  - Owner REST calls need a dashboard token as `?token=`; Bearer is refused.
  - Third-party app code (backend, hooks, scripts) is blocked until the owner trusts that one app in the dashboard (config `agent.apps_trusted`). Judges will see this prompt; the README must explain it. Uninstall removes the trust entry.
  - A manifest update that adds `permissions.api` entries keeps them off until the owner approves them on the app page. Ship the final permission list in the first judge-facing version.
  - Crew writes both `allowedTools` and `permissions` into agent files, so app agents should carry both until we know which harness reads which.

- Spikes run Nov 12 on 0.12.1 (code in `spikes/hh-spike/`):
  - S1 pass: page bundle served; backend verifies `X-KiroCrew-Proxy` and rejects unsigned, forged and stale requests.
  - S2 pass: backend gets an app token and starts an app agent with `POST /api/spawn` (`agent` is the short name, e.g. `hh-scribe`); poll `GET /api/spawn/{id}` (`done`, `awaiting_approval`, `outcome`, `result`, `credits`).
  - S3 pass: two ghosts in two mansions at once, each wrote only in its own `cwd`. `cwd` must be under `~/workspace`, `~/workspaces`, `~/workplace` or `~/workplaces`.
  - S4 pass: an out-of-bounds write was refused by the agent's `permissions` deny rule ("Blocked by a permission rule ... Source: agent-profile"). Crew strips an app agent's `allowedTools` (rewritten to `[]`).
  - S5 pass: WebSocket `/api/ws` (send `{"type":"subscribe_subagents"}`) emits `subagent_spawn`, `subagent_tool` (has `tool`, `tool_kind`, `tool_count`, `turns`), `subagent_chunk`, `subagent_done` (`outcome`, `result`, `credits`, `error`), `subagent_status`, `approval`, `approval_resolved`, `notification`. No timestamps except on `approval`; `tool_count` gives per-ghost order. The docs' `tool_call` event did not fire for subagents.
  - S6 pass (app-owned sessions): the app creates a session (`POST /api/chat/slots` with `name`, `agent`, `memory_mode`), sets its folder (`POST /api/chat/slots/{slot}/project` with `project`), sets `POST /api/chat/mode` `{"mode":"normal","slot":...}`, then sends the task (`POST /api/chat`, which streams until the turn ends). A pending tool call appears as a `permission` message (`meta.approval_id`, `meta.mid`, `tool_name`, `tool_input`) on `GET /api/chat/slots/{slot}`; the app answers with `POST /api/chat/slots/{slot}/approve` `{"action":"approved","request_id":...,"request_mid":...}`. `request_id` repeats across turns, so key on `mid`. The owner's dashboard can also answer the same prompt, and the first answer wins. Out-of-room writes are still refused by the agent's deny rule. The app token can open `/api/ws` and receives `chat_*`, `tool_call`, `tool_result`, `approval_resolved` and `shared_crew.decision` frames for its own session. Needs `permissions.api` `/api/chat` and `/api/chat/*` plus `sessionApproval`.
  - Spawn path (S2) still works but every spawn waits for an owner-only approval the app can't see. Not used for ghosts.
  - S7 fail (expected): `/spec new` sent through Crew chat is plain text; the agent replied it has no `/spec` command. Emulate spec phases.
  - Spec 1 live check (Nov 15, Crew 0.12.2): Haunted House 0.1.0 was installed, trusted and enabled; `/api/whoami` returned `{"backend":"ok","gateway":{"version":"0.12.2"}}`, and the UI bundle returned HTTP 200 (6,989 bytes), with DOM tests establishing the resulting line as `Backend reachable · Gateway 0.12.2`; unsigned, forged and stale direct requests returned HTTP 401, `/health` returned HTTP 200 with only `{"status":"ok"}`, and `lsof` showed the backend listening on loopback only; a fresh-session secret-guard probe blocked the fake credential write and created no file; S8 is resolved because the replay build and replay DOM test pass.

- Verified while designing spec 1 (0.12.1 source):
  - The dashboard imports `/apps/<name>/ui/<ui.entry>` and renders its default export. `ui.entry` is relative to the app's `ui/` folder (docs say app root). Host React is 18.3.1.
  - `useAppApi()` refuses any path not covered by `permissions.api` (exact, `p/` children, `p/*`, trailing `*`), so the UI's calls to its own backend need `/apps/<name>/api/*` declared.
  - Backends run as `<gateway python> -s <entry>` with cwd at the app root. An `app/requirements.txt` would be pip-provisioned at enable time; we don't ship one.
  - `GET /api/version` is the smallest authenticated read (not public). `kirocrew app info <name>` exits 1 when the app isn't installed; `kirocrew app update --source <dir> <name>` updates from a local folder.

- Kiro IDE hooks (Kiro 1.4.154, read from the installed agent bundle, Nov 13): the post-task trigger is `PostTaskExec` (fires when a spec task is set to completed). Every event has `session_id`, `hook_event_name`, `cwd`; `PreToolUse` adds `tool_name` and `tool_input` (the raw tool args, e.g. `fs_write` `{path, text}`, `str_replace` `{path, oldStr, newStr}`); `PostFileSave` adds `file_path`. File matchers are tested against the path exactly as the agent passed it (absolute or relative), so they start with `(^|/)`, not `^`.

## Crew constraints to design around
- Only `permissions.api` is enforced; the other permission fields are advisory. Declare only what we use. (crew__apps.md)
- Commit `app/ui/dist/`. Install drops `node_modules`, `.git`, `__pycache__`, `.venv` and symlinks that point outside the app. (crew__apps__publishing.md)
- Backend requests arrive through the gateway proxy with an HMAC header. Verify it on every route. (crew__apps__sdk.md)
- `PreToolUse` hooks can't block a call kiro-cli already approved, and `autoApprove` lists skip hooks and the approval floor. Never rely on hooks as the only gate. (crew__capabilities__hooks.md, crew__security.md)
- Custom agents don't load workspace steering unless it is listed in their `resources`. (steering.md)
- Subagent concurrency is capped by host capacity. The Workshop runs at most 3 ghosts at once. (crew__features__subagents.md)
- No Preview features (Mates, Dynamic Dashboard, Crew Mode). Set `minKiroCrewVersion` in `app.json`.

## Security
- No secrets in the repo, steering, fixtures or séance logs. Credentials stay in Crew's secrets vault.
- The backend enforces path policy: resolve with realpath, reject `..`, reject symlinks that leave the mansion, then match the room's allowlist. Ghost agent `permissions` rules are a second layer, not the only one.
- Planned (confirm in design): ghosts write spec documents only through our MCP tool, which checks path policy; risky tools check the approval ledger before acting.
- Ghost agents get least-privilege `tools`, deny rules for anything outside their room, and no `autoApprove` lists. Ghost sessions run in interactive approval mode.
- Mansions live outside this repo (default `~/workspace/haunted-house/mansions/`, because spawn `cwd` must be under an allowed root). Ghosts never touch Haunted House's own source.
- Redact séance logs before writing them. Committed fixtures come only from a demo project that contains no secrets.
- Validate every backend input. Mansion names are kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`), at most 40 characters.

## Building with Kiro
This repo is built in Kiro IDE: specs in `.kiro/specs/`, a property-based test for each correctness property, and hooks in `.kiro/hooks/`. Kiro's property-based testing runs in the IDE only (specs__correctness.md).
