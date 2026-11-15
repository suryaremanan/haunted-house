# Room Ghosts external-contract spikes (RG-S2 to RG-S5)

Four probes that gate the `room-ghosts` spec (tasks 1.2 to 1.5). Each one runs a worker under Crew's own bundled Python with `HOME` pointed at an ephemeral `.probe-work-*` folder below this directory (`crew_harness.py`), so Crew's data home, agents directory and config all live there. No probe starts or contacts a gateway, opens a session, runs kiro-cli, drives a browser, or reads or writes the operator's Crew home. Reports are scrubbed JSON: booleans, fixed names and Crew-relative identifiers, never a host path, a token or file content.

```bash
python3 spikes/room-ghosts-contracts/rg_s2_probe.py            # add --write to refresh the fixture
python3 spikes/room-ghosts-contracts/rg_s3_probe.py
python3 spikes/room-ghosts-contracts/rg_s4_probe.py
python3 spikes/room-ghosts-contracts/rg_s5_probe.py
.venv/bin/python -m pytest spikes/room-ghosts-contracts/tests -q
```

A probe exits 0 when every check holds, 1 when a check failed, and 2 when Crew's Python is not available. Each fixture in `spikes/fixtures/rg-s*.json` carries the checks, the contract found, evidence labelled verified, inferred or unverified, the decision, and the exact manual step for every unverified item.

What "verified" means here: Crew 0.12.2's packaged code produced the result in the isolated home. It never means a live gateway or a live agent did. Every live claim is listed as unverified, and the feature that depends on it ships in its fail-closed state until an owner runs the manual step.

| Spike | Question | Decision |
|---|---|---|
| RG-S2 | Which explicit resources and tools does a Room Ghost profile carry into a launch? | Steering by relative `file://`; no `skill://`; skill text delivered in the prompt; Crew's skill-search server excluded |
| RG-S3 | Which request stops an owned turn, and what confirms it? | Contract found; Cancel stays disabled with `contract_unavailable` until the live step passes |
| RG-S4 | How does an app page open an existing owned slot? | Candidate call found; Session_Link stays disabled with `contract_unavailable` until the live steps pass |
| RG-S5 | Which signals mean retryable pressure? | Retry only the six known signals; anything else is blocked |

## RG-S2: gateway-managed resource loading

`rg_s2_probe.py` stages a copy of the real `app/` tree and runs `rg_s2_worker.py`, which calls Crew's packaged `install_app`, `register_app`, launch projection (`native_skill_view`) and session-label builder.

Verified on Crew 0.12.2 (isolated):

- Nothing is registered for an untrusted app. For the trusted app Crew registers exactly the four manifest agents and links exactly the four manifest skill directories, namespaced under the app name and also flat. The Medium profile and `bounded-review` skill ship in the tree but are not in the manifest, and Crew leaves them alone.
- A registered profile keeps its authored `tools`, `allowedTools`, `excludedTools`, `includeMcpJson`, `includePowers`, `resources`, `permissions` and `prompt`. The steering resource stays the relative `file://.kiro/steering/**/*.md`.
- Crew's launch projection of each shipped profile lists exactly that room's selectors, mounts no `kirocrew-core` server and keeps the steering resource.
- The same projection of a profile **without** `excludedTools: ["@kirocrew-core"]` adds `@kirocrew-core/skill_search` (Crew serves inherited skill folders through it). A `skill://` resource is dropped and replaced by that same tool. A profile that both maps a `skill://` resource and excludes the tool gets no launch view at all.
- A `skill://` URI is either relative to the session project or `~/`-relative; there is no app-relative form.

Decision: a profile lists the steering `file://` resource only, excludes `@kirocrew-core`, and names its Room_Skill in the role prompt. The backend reads the installed `skills/<skill>/SKILL.md` and puts it, delimited, at the front of the assignment prompt (`adapters/room_skills.read_room_skill_block`). This is the design's bounded immutable injection fallback; nothing is inherited implicitly. Not verified: that a live session loads the steering files, lists exactly the room tools, refuses a built-in attempt, and follows the delivered skill.

## RG-S3: owned-session cancellation

`rg_s3_probe.py` runs `rg_s3_worker.py`, which builds Crew's packaged chat route table, resolves requests through the real router, and calls the real slot-ownership checkpoint and stop handler on real chat-slot objects. The session manager and the token middleware's `app` claim are doubles.

Verified on Crew 0.12.2 (isolated): the request is one bodyless `POST /api/chat/slots/{slot}/stop`, covered by the existing `/api/chat` and `/api/chat/*` grants. Only the owner app on its own session passes; everything else is the same `404 slot_not_found`. The reply is `{"ok": true}` after the cancel settled, or carries `info` when nothing was stopped. The confirmation is a `chat_message` frame with `meta.kind` `stop_event` whose `meta.id` is stable from `stopping` to `stopped`, `force_stopped` or `stop_failed_reset`. Earlier rows, completed tool rows included, are untouched. A second POST while the first is pending is a forced stop that resets the session, so the request is never retried.

Not verified: the same exchange on a live gateway with kiro-cli acknowledging the cancel. Decision: Cancel stays disabled with `contract_unavailable`. The cancellation service may be built behind a default-off flag that flips only after the live step.

## RG-S4: existing-session navigation

`rg_s4_probe.py` runs `rg_s4_worker.py`, which reads the dashboard assets shipped inside the Crew package and calls two slot-key helpers. Shipped assets are reduced to booleans, never echoed.

Found on Crew 0.12.2: the host gives app pages `useChatLauncher`; `openChat({ slotKey })` resolves to `/chat?sid=<slot key>`, where the slot key is the `key` returned by `POST /api/chat/slots` (not `dashboard:<key>`). Without a `slotKey` the same call can open `/chat?new=1`, which creates a chat, and a `message` option is sent into the target session as a turn.

A match in a minified bundle proves the code is shipped, not that a running dashboard behaves that way. Decision: Session_Link stays disabled with `contract_unavailable` and never substitutes a new chat. The fixture records the candidate contract and the four manual steps that must pass before the link is enabled.

## RG-S5: app-owned capacity

`rg_s5_probe.py` runs `rg_s5_worker.py`, which calls Crew's packaged scheduler, admission gate, unattended-turn cap and slot-ownership helpers with synthetic inputs.

Verified on Crew 0.12.2 (isolated): the admission gate answers five reasons with HTTP 429, a `code`, and `Retry-After` (`principal_active_limit`, `principal_queue_full`, `crew_active_limit`, `crew_queue_full`, `session_create_rate`). That gate is off by default. On a default Crew an app-owned turn runs under an unattended-turn cap of 4: a turn over the cap is accepted and waits silently, and one that waits out the cap leaves an error row with `meta.notice` `background_turn_abandoned`.

Decision: those six signals are the only retryable ones; any other refusal is blocked. A default host sends no refusal, so the Workshop needs its own start deadline. Not verified: three live concurrent Haunted House turns. If any check fails the retryable set is empty.
