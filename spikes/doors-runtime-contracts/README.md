# Doors and Guardrails runtime-contract spikes (S9, S10)

Two probes that gate the `doors-and-guardrails` spec (tasks 1.1 and 1.2). Both run without a gateway, write only inside an ephemeral `.probe-work-*` folder under this directory, and print scrubbed JSON: booleans and fixed names, never paths, tokens or file content.

```bash
python3 spikes/doors-runtime-contracts/s9_probe.py            # S9, add --write to refresh the fixture
python3 spikes/doors-runtime-contracts/s10_probe.py           # S10, add --write to refresh the fixture
.venv/bin/python -m pytest spikes/doors-runtime-contracts/tests -q
```

Recorded results: `spikes/fixtures/s9-app-mcp-launch-identity.json` and `spikes/fixtures/s10-approved-process-confinement.json`. A probe exits 0 only when every check holds; each fixture carries the decision, the evidence labels, and the manual step for every item that is still unverified.

## S9: app-MCP launch and trusted identity

`s9_probe.py` builds a synthetic gateway-managed app and runs `s9_worker.py` under Crew's own Python with `HOME` pointed at an ephemeral folder, so Crew's default data home, agents directory and config all live there. The worker calls Crew's packaged `install_app`, `register_app` and `kiro_session_label_elements`, then launches `room_mcp_server.py` exactly as the resulting per-session element describes and speaks MCP over stdio.

Verified on Crew 0.12.2 (isolated):

- An untrusted third-party app gets no MCP server and no agent registered.
- A manifest entry `{"command": "python3", "args": ["mcp/server.py"]}` is rewritten to the gateway interpreter, `-s`, and the launcher's real path under the installed app root. The app never needs to know where it is installed.
- `"x-kirocrew-session-label": true` and a per-server static `env` survive registration. Crew's label builder then emits one per-session element, only for the server the agent's `tools` grant, with `KIROCREW_SESSION_LABEL=<session key>` set last. A value the manifest declares under that name is replaced. No session key means no element.
- Every agent file receives every app server, but an `mcpServers` entry written inside an agent file is copied unresolved (bare `python3`, relative launcher). Per-agent overrides are therefore not portable; use one manifest server per room.
- The reference server exposes the exact room catalog only when the label, the profile's `HH_ROOM` and an owner-only backend binding record agree. Absent, unknown, malformed or cross-room identity lists no tools and refuses every call. Tool arguments, `_meta` and the process working directory cannot select session, Ghost, Mansion or Room.

Verified on kiro-cli 3.3.0 directly over ACP, outside Crew (one run of `s9_kiro_cli_live.py --real-login` by the team lead with the owner's approval, recorded in the fixture as `kiroCliDirectObservation`): a `session/new` stdio element is started at `session/new` with no prompt sent, receives its declared env including `KIROCREW_SESSION_LABEL`, also inherits kiro-cli's own environment, and starts in the session cwd. So the server must trust no environment variable other than the Crew-set label and `HH_ROOM`, and still must not use cwd for authority.

Read from source, not exercised: Crew's gateway hands kiro-cli that element for an app-owned chat slot; the session key is `dashboard:<slot key>`; a server kiro-cli starts natively from the agent file may start in kiro-cli's process directory instead.

Not verified: delivery of the label through Crew's own gateway and agent sandbox, exact-selector enforcement by kiro-cli, and whether that sandbox lets the server read its binding and write the Mansion. The fixture lists the manual step for each.

Decision: mutation tools may be implemented, enabled only with label and binding. Anything missing exposes no tool and reports the Ghost blocked, so an unproven live path fails closed. A live acceptance check is required before the demo.

`s9_kiro_cli_live.py` is the opt-in check for kiro-cli's own element handling. Without flags it uses an isolated `HOME` and reports `authentication_required`. `--real-login` uses the operator's kiro-cli login and sends no prompt; it never runs by default and needs the owner's approval.

## S10: approved-process confinement

`s10_probe.py` drives `confined_runner.py`, a reference runner that wraps one exact argv in `sandbox-exec` with a deny-default profile. Every denial is paired with an unconfined control run.

Verified on this macOS host:

- Reads and writes below the Mansion work. A sibling Mansion, a credential-shaped file, the real home listing, a stray temp file, and `.haunted-house/` inside the Mansion are refused. `.git/` is writable only for the git action kind.
- Loopback connect and bind are refused.
- Without `process-fork` the command cannot create a child. A nested `sandbox-exec` cannot loosen the policy.
- With `process-fork` allowed, a child that calls `setsid` outlives the runner (it stays confined). That mode is therefore never offered.
- Symbolic links that leave the Mansion are refused for read and write. A hard link already inside the Mansion defeats the sandbox on its own; the runner's pre-start scan refuses to start, and the sandbox refuses to create such a link.
- The child sees only the runner's fixed environment. A working directory outside the Mansion is refused before start. A timeout kills the process group.
- `git init`, `add` and `commit` work with no fork. A planted hook and a planted `core.fsmonitor` script do not run; the same script does run in the unconfined control. A push to a sibling repository fails and changes nothing.

Not verified: that the installed backend is itself unsandboxed (a sandboxed process cannot apply a second sandbox), and any non-macOS host.

Decision:

| Action kind | Result |
|---|---|
| `delete_path` | Enabled. In-process Path_Guard operation, independent of S10. |
| `run_command` | Enabled only through the no-fork profile, behind a startup canary. A command that needs child processes returns `confinement_unavailable`. |
| `git_write` | `add` and `commit` only, through the no-fork profile with the real git binary and hooks, fsmonitor, gc and signing disabled. |
| Any action on a host without `sandbox-exec`, or with a failed canary | `confinement_unavailable`, no process started. |
