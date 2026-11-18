# Implementation Plan: Practice House

## Overview

Let a stranger on the public replay make the owner's decisions, and state the run in numbers from the log. Replay only; no request, route, permission, storage or dependency.

## Tasks

- [x] 1. Write the pure core (MVP)
  - [x] 1.1 Implement `core/practice.ts`: Decision_Points, the next decision, the answer, the Log_Numbers
    - _Writes: `app/ui/src/core/practice.ts`, `app/ui/src/core/practice.test.ts`_
    - _Requirements: 1.3, 1.4, 2.1, 2.2_
  - [x]* 1.2 Property tests for Properties 1 to 3
    - _Writes: `app/ui/src/core/practice.property.test.ts`_
    - _Requirements: 3.1_

- [x] 2. Build the practice board (MVP)
  - [x] 2.1 `use-practice.ts`: stop before each unanswered decision with the replay's own pause and seek; go on with seek and play
  - [x] 2.2 `PracticeBoard.tsx` under the replay bar: numbers, switch, practice note, question, choices, answer, "Go on"
    - _Writes: `app/ui/src/rooms/attic/use-practice.ts`, `app/ui/src/rooms/attic/PracticeBoard.tsx`, `app/ui/src/rooms/house/House.tsx`, `app/ui/src/components/dread-styles.ts`_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1_

- [x] 3. Prove it (MVP)
  - [x] 3.1 Keyboard walk on the replay entry, one request in all
  - [x] 3.2 Rendered check in headless Comet
    - _Writes: `app/ui/src/replay-practice.test.tsx`_
    - _Requirements: 3.2_
