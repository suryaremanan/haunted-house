# Design Document: Practice House

## Overview

One pure module, `app/ui/src/core/practice.ts`, reads the canonical log the replay already loaded and returns its Decision_Points (each owner decision, with the question and the two answers the owner had) and its Log_Numbers. A hook, `rooms/attic/use-practice.ts`, watches the replay Cursor and, while Practice_Mode is on, sends the replay's own `pause` and `seek` commands so playback stops on the record before each unanswered Decision_Point. `rooms/attic/PracticeBoard.tsx` shows the numbers, the switch, the question, the choices and the answer, under the replay bar.

Nothing is written. A practice answer is explained against the recording by `practiceAnswer` and kept only in component state; "Go on" plays the recording past the decision exactly as it was recorded.

## Components and Interfaces

```ts
export interface DecisionPoint { sequence; eventId; subject: 'door' | 'risky'; proposalId; ghostId; question; choices: [approve, refuse]; recorded: 'approved' | 'rejected' }
export function decisionPoints(events: readonly AppEvent[]): readonly DecisionPoint[]
export function nextDecision(points, cursor): DecisionPoint | null
export function practiceAnswer(point, choice): { meaning; recorded; same }
export function logNumbers(events): { records; ghosts; waits }
export function logNumbersText(numbers): string
```

A Decision_Point is a guardrail record of kind `door_approved`, `door_rejected`, `risky_action_approved` or `risky_action_rejected`, read with the workflow fold's own `readDomainRecord`; the first decision per proposal counts, as in the fold. A risky question names the exact command from the matching `risky_action_proposed` record. `waits` counts `phase_output_ready` and `risky_action_proposed` records: each is a moment the house stopped for a person.

## Correctness Properties

### Property 1: Every Decision Point is an owner decision in the log

Each point's record is a decision record of the log; points are in Sequence order; one per proposal.

**Validates: Requirements 1.3**

### Property 2: Practice never passes an unanswered decision, and an answer never claims to be the recording

`nextDecision` is the first point after the Cursor; `practiceAnswer(point, choice).same` is true exactly when the choice equals what was recorded, and its second sentence always reports the recording.

**Validates: Requirements 1.3, 1.4**

### Property 3: The numbers are counted from the log

`records` is the log's length, `ghosts` the number of distinct ghost ids in it, and `waits` never exceeds `records`.

**Validates: Requirement 2**

## Testing Strategy

- `core/practice.property.test.ts`: the three properties, 200 runs each, over generated canonical logs.
- `core/practice.test.ts`: the six decisions of the demo recording, its questions and its numbers.
- `replay-practice.test.tsx`: the replay entry, by keyboard: turn practice on, play, answer all six decisions, reach the end; one request in all.
- Rendered check in headless Comet with `scripts/capture-house.mjs`.
