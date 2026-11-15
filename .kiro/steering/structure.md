# Structure

## Repo layout
```
/
├── LICENSE                  MIT, so GitHub detects it
├── README.md                What it is and how judges run it
├── .kiro/                   Committed. Never gitignored
│   ├── steering/            These files
│   ├── specs/<spec-name>/   requirements.md, design.md, tasks.md
│   ├── hooks/               Build-time hooks
│   └── agents/              Helper agents for developing this repo
├── app/                     The Crew app (app.json lives here)
│   ├── app.json
│   ├── agents/              Runtime ghost agents, one JSON file per ghost
│   ├── skills/              Room skills (EARS writing, properties, review rubric)
│   ├── mcp/                 Our MCP server (spec writes, risky-action gate)
│   ├── backend/
│   │   ├── haunted_house/core/      Pure logic: doors, path policy, mansion creation, approval ledger
│   │   ├── haunted_house/adapters/  Crew client, filesystem, log store
│   │   ├── haunted_house/server.py  HTTP routes
│   │   └── tests/                   pytest + Hypothesis
│   ├── ui/
│   │   ├── src/core/        Pure logic: event normalizer, ghost-state reducer
│   │   ├── src/adapters/    crew.ts (live), replay.ts (log playback), sdk-shim/
│   │   ├── src/rooms/       One folder per room
│   │   ├── src/components/
│   │   └── dist/            Committed build output
│   └── assets/              Original art, icon, hero images
├── fixtures/                Recorded event payloads and séance logs (scrubbed)
├── scripts/                 install-local.sh, check-kiro-tracked.sh, record-fixture
├── spikes/                  Day-one spike code, kept as evidence
└── docs/                    writeup.md, kiro-coverage.md, demo-script.md, credits.md
```

## Rules
- `core/` folders are pure: no Crew SDK, no network, no filesystem, no clock reads. Every correctness property is tested here.
- Only `adapters/` talk to Crew, the filesystem or the clock.
- Runtime ghost agents live in `app/agents/`. `.kiro/agents/` holds only agents that help build this repo.
- This repo's `.kiro/` records how we built Haunted House. Each mansion has its own `.kiro/`, outside this repo.
- `kiro-docs/` is a local copy of the Kiro docs for reference. It is gitignored and not redistributed.

## Naming
- TypeScript files kebab-case, React components PascalCase, Python modules snake_case.
- Tests: `*.test.ts`, property tests `*.property.test.ts`; Python `tests/test_*.py` and `tests/property/test_*.py`.
- Spec folders are kebab-case and match the spec name.
- Event types are past-tense snake_case (`ghost_started`, `door_approved`).
