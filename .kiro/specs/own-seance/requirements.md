# Requirements Document

## Introduction

The `own-seance` feature lets a visitor of the public static replay open a séance log of their own and replay it in the same house. The file is read in the page and nowhere else: nothing is uploaded, stored or fetched, and it is gone when the page closes. It is checked whole by the replay's own Canonical_Parser: a file that is not a séance log, or one that has been changed or cut, is refused with one plain sentence and the current recording stays.

It is replay only. It adds no backend route, manifest permission, request, storage contract or dependency, and `docs/permission-freeze.json` is unchanged.

## Glossary

- **Replay_Build**, **Canonical_Parser**, **Event_Selector**, **Attic**: as in `replay-and-submission`.
- **Own_Log**: A séance log file the visitor opens from their own computer.

## Requirements

### Requirement 1: Open a log in the Attic

**User Story:** As someone who ran Haunted House, I want to drop my run's séance log on the public replay, so that I can show any run without installing anything.

#### Acceptance Criteria

1. WHERE the page is the Replay_Build, THE Attic SHALL offer "Replay your own séance": a drop target and a labelled file chooser, reachable by keyboard.
2. WHEN the visitor drops or chooses exactly one file, THE Replay_Build SHALL read it in the page and check it with the Canonical_Parser.
3. WHEN the file is a whole séance log (every line a valid event of the supported schema, an unbroken hash chain, at least one record, at most 5 MB), THE Replay_Build SHALL replace the recording with it in memory and start the page again on it, its mansions listed in the Foyer.
4. WHEN the file is anything else, THE Replay_Build SHALL keep the current recording and say why in one plain sentence.
5. THE Replay_Build SHALL make no request for the Own_Log and write it to no storage; it is gone when the page closes.
6. THE house SHALL show the Own_Log's content as text only, as it shows the recording.

### Requirement 2: Tests

1. The check SHALL have a fast-check test of at least 200 runs.
2. A DOM test SHALL open a broken file and a whole log of another run on the replay entry and check that the only request is the bundled recording.
