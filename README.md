# Haunted House

Haunted House is a spatial home for AI agents. Rooms are spec phases, ghosts are agents, and doors are your approvals. You walk through the house to see what each agent is doing and what it is allowed to touch, instead of reading a chat log.

It is a [Kiro Crew](https://kiro.dev/docs/crew/) app, built for Kiroween 2026 (Resurrection category): the 1990s "house as interface" idea, remade for the agent era.

What the house shows that a chat log does not is each agent's authority:

- **Walls** are a ghost's path limits. A ghost reads and writes only inside its room's allowed paths.
- **Doors** are your approvals. A door opens only when you approve the room's output; nothing advances on its own.
- **The séance log** is an append-only record of every tool call, state change and decision. The Attic replays a run from that log alone.

## Static replay

The static replay is the same interface built as a plain web page. It plays a recorded, synthetic séance log and needs no Crew, no account and no install. It is read-only: it cannot start a ghost, approve anything or reach a Crew gateway.

The public replay link is not listed yet. It is published by the Pages workflow (`.github/workflows/pages.yml`) and will be added here only after the repository check recorded in [docs/publication-metadata.json](docs/publication-metadata.json) has verified it.

Until then you can build the same page from a clone:

```bash
bun install --cwd app/ui --frozen-lockfile
bun run --cwd app/ui build:replay
bun scripts/check-replay-artifact.mjs
bun scripts/smoke-replay-site.mjs --local
```

The page is written to `app/ui/dist-replay/`. Every URL in it is relative, so any static file server can serve that folder from any path.

## Live app requirements

- Kiro Crew 0.12.1 or later, with its gateway running
- bun (installs the UI dependencies from `app/ui/bun.lock` and runs the build) and Node.js (Vite runs on it)
- git
- curl (the install script uses it to check that the gateway answers)

## Install

From a clone of this repo, run:

```bash
scripts/install-local.sh
```

The script checks the requirements, builds the UI, and installs the app with the `kirocrew` CLI. If the app is already installed, it updates it. If a requirement is missing or the gateway does not answer, it names the problem and stops before it changes anything. It does not change any Crew trust, approval, permission or security setting.

## One-time trust step

Crew blocks third-party app code until you trust that app. After the install script finishes, open the Crew dashboard and:

1. Go to **Apps → Library → Haunted House**.
2. Select **Enable**.
3. Accept the **Trust** prompt. Crew shows the permissions listed below and asks you to confirm them.

Then open the **Haunted House** page from the sidebar. The status panel should read "Backend reachable · Gateway 0.12.1" (or your gateway version).

If a later update adds permissions, Crew keeps them off until you approve them on the app's page. Uninstalling the app removes its trust entry, so a reinstall asks again.

## Permissions

The app asks for the smallest set it uses. The list is frozen in [docs/permission-freeze.json](docs/permission-freeze.json), and `scripts/check-permission-freeze.py` fails if the manifest, the code or that record drift apart.

| Permission | Why |
|---|---|
| `/api/version` | Read the gateway version for the status panel |
| `/api/chat` and `/api/chat/*` | Create and run the ghosts' own chat sessions, set their project folder, read their history, and answer tool prompts of those sessions |
| `/apps/haunted-house/api/*` | The page talks to the app's own backend |
| Events: `chat_*`, `tool_call`, `tool_result`, `approval_resolved`, `shared_crew.decision` | Follow what the ghosts' sessions do and write it to the séance log |
| `sessionApproval` | Answer approval prompts for sessions the app owns, after you approve in the house |
| `storage` | Keep the list of mansions in Crew's app data folder |

The app does not ask to spawn subagents, does not ask for the global approval queue, uses no wildcard over the whole API, and ships no auto-approve list. Ghost sessions run in interactive approval mode.

## Demo

After you trust the app, open **Haunted House**. A first visit starts at the front gate: knock, tell the Warden what you want to build, and he offers the next step in every room, in plain words: Study (requirements), Drafting Room (design), Workshop (tasks and implementation), then the Attic (replay). Each door stays sealed until you approve the room's output. If you already have a mansion you land in the Foyer, where you can go back into it or create another. The full timed walkthrough is in [docs/demo-script.md](docs/demo-script.md).

What has been checked against a running Crew, and what has so far been checked only by automated tests, is listed in [docs/writeup.md](docs/writeup.md) under "Verification status".

## Tests

```bash
scripts/test-all.sh
```

This runs the Python tests (pytest and Hypothesis) and the UI tests (Vitest and fast-check). The UI toolchain is bun: `bun install --cwd app/ui --frozen-lockfile` installs from `app/ui/bun.lock`, and `bun run --cwd app/ui test`, `typecheck`, `build` and `build:replay` run the package scripts (Vitest, Vite and tsc start on Node.js). Other checks:

- `scripts/test-py.sh` runs the Python tests only.
- `python3 scripts/secret_scan.py` scans the repo for credentials and home paths.
- `python3 scripts/check-submission.py` checks this README and the documents below.
- `python3 scripts/check-assets.py` checks asset provenance.
- `scripts/check-release.sh` runs every offline release gate in one go and lists what is still pending.

## Repository layout

- `app/`: the Crew app (`app/app.json` is the manifest; `app/ui/dist/` is the committed UI bundle)
- `.kiro/`: the steering, specs and hooks used to build this repo with Kiro
- `fixtures/`: the synthetic séance log the replay plays
- `spikes/`: spike code and results, kept as evidence
- `scripts/`: install, check and test scripts
- `docs/`: write-up, demo script, credits and checklists

`kiro-docs/` is a local reference copy of the Kiro documentation. It is gitignored and not part of this repo.

## Documents

- [docs/writeup.md](docs/writeup.md): the problem, the design, and how Kiro was used
- [docs/kiro-coverage.md](docs/kiro-coverage.md): which Kiro capability built and tested each feature
- [docs/demo-script.md](docs/demo-script.md): the timed demo walkthrough
- [docs/credits.md](docs/credits.md): asset provenance and acknowledgements
- [docs/assets-checklist.md](docs/assets-checklist.md): icon, screenshots and video thumbnail
- [docs/submission-checklist.md](docs/submission-checklist.md): dated gates and the submission checklist
- [docs/assets-manifest.json](docs/assets-manifest.json): machine-readable asset provenance
- [docs/permission-freeze.json](docs/permission-freeze.json): the frozen permission list and its hashes

## Related work

Crew ships two built-in apps that overlap with this idea: **Spec Builder** (approval-gated requirements, design and tasks) and **Agent Worlds** (running agents shown as animated characters). Haunted House builds on both ideas and adds a view of each agent's authority: walls are a ghost's path limits, doors are your approvals, and the séance log replays everything that happened.

## License

MIT. See [LICENSE](LICENSE).
