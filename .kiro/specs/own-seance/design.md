# Design Document: Own Séance

## Overview

`core/own-seance.ts` (pure) checks the text: size, `parseEventLog` (integrity and diagnostics), and `selectCanonical`; it returns the records and the mansion ids, or one fixed sentence. The replay stand-in (`adapters/sdk-shim/index.ts`) reads its recording through one delegating `ReplaySource`; `replayRecording.replace(text, bytes)` swaps in a source built from the text (`createReplaySource({ text })`, which fetches nothing) and a mansion registry seeded with the log's mansions, then notifies subscribers. `App.tsx` keys the house by the number of logs opened, so the page starts again at the Gate on the new log. In Crew the seam has no `replace`, so nothing changes there.

The Attic shows `OwnSeanceDrop` (drop target and file chooser) in the Replay_Build only; `use-own-seance.ts` reads the file with `File.text()`.

The house renders every value of a log through React text nodes; no component sets HTML.

## Correctness Properties

### Property 1: Only a whole log is accepted

Changing any line of a real log is refused unless the result is still a byte-identical valid log; every refusal is one of the fixed sentences.

**Validates: Requirements 1.3, 1.4**

## Testing Strategy

- `core/own-seance.test.ts`: the demo and vector logs are accepted whole; empty, foreign, cut and oversized files refused; Property 1 at 200 runs.
- `replay-own-seance.test.tsx`: on the replay entry, a junk file is refused and the recording stays; the vector log replaces it and its mansion is watched; one request in all.
- Rendered check in headless Comet.
