# Hh Spike

A Kiro Crew app: Hh Spike

## Installation

```bash
kirocrew app install /path/to/hh-spike
kirocrew app enable hh-spike
```

## Development

Edit agents, skills, and backend code. Changes to agents and skills
take effect on next agent invocation. Backend changes require restart.

## Structure

```
hh-spike/
├── app.json              ← manifest
├── assets/
│   └── icon.png          ← store icon; replace this placeholder
├── agents/               ← agent definitions
│   └── sample-agent.json
├── skills/               ← skill files
│   └── sample-skill/
│       └── SKILL.md
├── backend/              ← optional backend (--backend)
│   └── server.py
├── ui/                   ← optional UI frontend (--ui)
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       └── App.tsx
└── README.md
```

## S2 callback and history probes

These development-only probes characterize the event contract needed by
`seance-log-and-ghost-state` task 1.1. They do not add a backend WebSocket
listener and do not write a fixture. Task 1.2 owns durable fixture encoding and
fallback selection.

### Automated checks

```bash
npm --prefix spikes/hh-spike/ui test
npm --prefix spikes/hh-spike/ui run build
.venv/bin/pytest -q spikes/hh-spike/backend/tests/test_history_probe.py
```

The callback contract test drives every supported event through an in-memory
subscription seam. It proves that `{type, data}` retains the exact callback data
object, captures only the selected slot, bounds output, distinguishes final and
non-final `tool_result`, records only `chat_error` field presence, and receives
nothing after unsubscribe.

### Live callback probe

Run the page only when `hh-spike` is already installed, trusted, and enabled.
Do not replace or update the production `haunted-house` app for this probe. The
page starts with every subscription unmounted and performs no live action until
a person enters one known app-owned slot and presses a button.

1. **Arm subscriptions**, then **Run no-tool turn** to observe chat callbacks.
2. **Run read-only tool turn** to request a harmless `README.md` read and observe
   `tool_call`/`tool_result`. Stop if Crew asks for an unexpected approval.
3. **Run post-unmount check**. The probe unmounts every subscription before
   sending a no-tool turn; a pass means no target-slot callback reached the old
   listeners.
4. After a gateway restart, enter the same slot and choose **Read post-restart
   history**.
5. Copy only the JSON shown under **Scrubbed machine-readable result**.

The live result contains field/type metadata, finality booleans, counts, and
fixed status labels. It never contains callback strings, identifiers, request
headers, credentials, exact slot names, or filesystem paths. Callbacks for an
unscoped or different slot are discarded before capture. The probe records
mount, browser-online, and visibility-return indications because Crew 0.12.2's
`useAppEvents` contract does not expose a reconnect callback. It does not force
a disconnect, induce a model failure, or invent a non-final tool result. Missing
`chat_error` or non-final `tool_result` evidence remains explicitly
`not_observed` for task 1.2 to resolve fail closed.

### Read-only post-restart history capture

The backend probe reads one explicitly named slot with a dashboard credential
held only in process memory. It validates that the scrubbed S6 baseline contains
no other slot, proves the current gateway process started after that baseline,
requests at most 500 messages and 1 MiB, validates the returned slot key, and
prints shape-only JSON.

```bash
python3 spikes/hh-spike/backend/history_probe.py \
  --slot hh-s6 \
  --baseline spikes/fixtures/s6-app-session-approval.jsonl
```

An unavailable or ambiguous history response fails with a bounded status code;
the probe never prints the response body or credential.
