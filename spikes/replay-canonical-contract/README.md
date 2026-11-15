# RS-S0: canonical replay composition

Gate for the `replay-and-submission` spec (task 1.1). It answers one question: do the implemented specs expose one spec 2 Event Log, one Canonical Parser and selector, and live and replay folds that agree, so the Attic can replay without a log, parser, reducer or state store of its own?

```bash
bun spikes/replay-canonical-contract/run.ts            # print the scrubbed result
bun spikes/replay-canonical-contract/run.ts --check    # exit 1 unless it passes and equals the recorded result
bun spikes/replay-canonical-contract/run.ts --write    # refresh spikes/fixtures/replay-canonical-contract.json
cd app/ui && bunx vitest run scripts-tests/replay-canonical-contract.test.ts
```

Recorded result: `spikes/fixtures/replay-canonical-contract.json`. It holds schema versions, event type names, seam names, field names and booleans only. It holds no record, payload, local path or secret.

## What it does

`probe.ts` is a pure function. It receives the real public seams of `app/ui/src/core`, the synthetic replay fixture, the two backend evidence files that `scripts/build_replay_fixture.py` writes, and the source text of the UI and the backend. It creates no compatibility log, parser, reducer or snapshot.

It checks that:

- every seam replay composes is exported (`REQUIRED_SEAMS`);
- the backend names exactly one `.jsonl` Event Log, in one file;
- each language defines one parser, one selector and one fold per projection;
- no file on the replay or Attic path stores state in the browser;
- the fixture parses without a diagnostic and selects the same Record IDs as the backend;
- the history has a Door decision, a tool approval, a terminal result, a failure with a denial, and several Ghosts;
- the live fold and the replay fold give equal full projections, also after reordered and repeated delivery;
- the TypeScript fold of every prefix equals the backend workflow projection for that step, and the final Ghost, transition and workflow projection equals the backend's;
- the Replay Engine at its final Cursor shows the full fold, and the House view reads that projection.

## When it fails

The result is `contract_unavailable` and the command exits 1. Attic integration stays blocked: return to the spec that owns the failing seam. Do not add an adapter that invents state.

## Not covered here

The probe runs in process. Restart reconstruction of the backend log and the live Crew path are covered by the upstream integration tests of `seance-log-and-ghost-state`.
