# Haunted House

Haunted House is a spatial home for AI agents. Rooms are spec phases, ghosts are agents, and doors are your approvals. You walk through the house to see what each agent is doing and what it is allowed to touch, instead of reading a chat log.

It is a [Kiro Crew](https://kiro.dev/docs/crew/) app, built for Kiroween 2026.

## Requirements

- Kiro Crew 0.12.1 or later, with its gateway running
- Node.js and npm (to build the UI)
- git

## Install

From a clone of this repo, run:

```bash
scripts/install-local.sh
```

The script checks the requirements, builds the UI, and installs the app with the `kirocrew` CLI. If the app is already installed, it updates it. It does not change any Crew trust, approval or security setting.

## One-time trust step

Crew blocks third-party app code until you trust that app. After the install script finishes, open the Crew dashboard and:

1. Go to **Apps → Library → Haunted House**.
2. Select **Enable**.
3. Accept the trust prompt.

Then open the **Haunted House** page from the sidebar. The status panel should read "Backend reachable · Gateway 0.12.1" (or your gateway version).

If a later update adds permissions, Crew keeps them off until you approve them on the app's page. Uninstalling the app removes its trust entry, so a reinstall asks again.

## Repository layout

- `app/`: the Crew app (`app/app.json` is the manifest)
- `.kiro/`: the steering, specs and hooks used to build this repo with Kiro
- `spikes/`: day-one spike code, kept as evidence
- `scripts/`: install and check scripts

`kiro-docs/` is a local reference copy of the Kiro documentation. It is gitignored and not part of this repo.

## Related work

Crew ships two built-in apps that overlap with this idea: **Spec Builder** (approval-gated requirements, design and tasks) and **Agent Worlds** (running agents shown as animated characters). Haunted House builds on both ideas and adds a view of each agent's authority: walls are a ghost's path limits, doors are your approvals, and the séance log replays everything that happened.

## License

MIT. See [LICENSE](LICENSE).
