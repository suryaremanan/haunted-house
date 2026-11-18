# Requirements Document

## Introduction

The `practice-house` feature lets a stranger on the public replay make the decisions themselves. Today the static replay shows what an owner decided; it cannot be asked "what would you do?". In practice mode the recording stops at each moment where the owner had to decide (open a door, allow or refuse a held command), asks the visitor, and answers with what that choice means and what the owner chose in the recording. It changes nothing real, and says so on every practice screen.

The page also states the run in numbers taken from the log: how many events were recorded, how many ghosts worked, and how many times the house waited for a person.

It is replay only. It adds no backend route, manifest permission, request, storage contract or dependency, and `docs/permission-freeze.json` is unchanged. Every decision point and every number is read from the canonical log by a pure function.

## Glossary

- **Replay_Build**, **Canonical_Record**, **Cursor**, **Attic**: as in `replay-and-submission`.
- **Practice_Mode**: A replay mode in which playback stops before each Decision_Point and waits for the visitor.
- **Decision_Point**: A Canonical_Record that records an owner's decision: a Door approved or rejected, or a risky action approved or rejected.
- **Practice_Choice**: The visitor's answer at a Decision_Point: the same two choices the owner had.
- **Log_Numbers**: Counts read from the log: records, ghosts, and times the house waited for a person (Door proposals and risky-action proposals).

## Requirements

### Requirement 1: A clearly labelled practice mode

**User Story:** As a stranger on the public replay, I want to make the decisions myself, so that I learn what the house asks of its owner by doing it.

#### Acceptance Criteria

1. THE Replay_Build SHALL offer a "Practice: you decide" control on the replay bar, off by default, reachable by keyboard.
2. WHILE Practice_Mode is on, THE Replay_Build SHALL show, on every practice screen, the words "Practice. Nothing real changes: this is a recording."
3. WHEN Practice_Mode is on and playback reaches the record before a Decision_Point, THE Replay_Build SHALL stop there and ask the visitor the question the owner faced, with the owner's two choices.
4. WHEN the visitor chooses, THE Replay_Build SHALL say what the choice means, say what the owner chose in the recording, and offer to go on.
5. WHEN the visitor goes on, THE Replay_Build SHALL play the recording past that Decision_Point to the next one or to the end.
6. Practice_Mode SHALL make no request and write nothing.

### Requirement 2: Real numbers from the log

**User Story:** As a judge, I want the page to state the problem in numbers from the run itself.

#### Acceptance Criteria

1. THE Replay_Build SHALL show the Log_Numbers of the recording: its record count, the number of ghosts that appear in it, and the number of times the house waited for a person.
2. Every number SHALL be computed from the recording the page loaded, never written by hand.

### Requirement 3: Tests

1. Each correctness property SHALL have a fast-check test of at least 200 runs.
2. A DOM test SHALL walk practice mode through the demo recording by keyboard and check that no request but the recording is made.
