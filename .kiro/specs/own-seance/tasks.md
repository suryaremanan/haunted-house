# Implementation Plan: Own Séance

## Overview

Let a visitor open their own séance log in the public replay, checked whole, kept in the page only.

## Tasks

- [x] 1. Check a log (MVP)
  - [x] 1.1 `core/own-seance.ts` and its tests, Property 1 at 200 runs
    - _Writes: `app/ui/src/core/own-seance.ts`, `app/ui/src/core/own-seance.test.ts`_
    - _Requirements: 1.3, 1.4, 2.1_

- [x] 2. Replace the recording in memory (MVP)
  - [x] 2.1 Delegating replay source, `replace`, subscribers; `createReplaySource({ text })`; seam types
  - [x] 2.2 Key the house by logs opened in `App.tsx`
    - _Writes: `app/ui/src/adapters/sdk-shim/index.ts`, `app/ui/src/adapters/sdk-shim/replay-source.ts`, `app/ui/src/adapters/sdk.ts`, `app/ui/src/adapters/app-sdk.d.ts`, `app/ui/src/App.tsx`_
    - _Requirements: 1.3, 1.5_

- [x] 3. The Attic's drop target (MVP)
  - [x] 3.1 `OwnSeanceDrop.tsx` and `use-own-seance.ts` in the replay Attic
    - _Writes: `app/ui/src/rooms/attic/OwnSeanceDrop.tsx`, `app/ui/src/rooms/attic/use-own-seance.ts`, `app/ui/src/rooms/attic/AtticPanel.tsx`, `app/ui/src/rooms/attic/attic-styles.ts`_
    - _Requirements: 1.1, 1.2, 1.4, 1.6_

- [x] 4. Prove it (MVP)
  - [x] 4.1 DOM test on the replay entry; rendered check in headless Comet
    - _Writes: `app/ui/src/replay-own-seance.test.tsx`_
    - _Requirements: 2.2_
