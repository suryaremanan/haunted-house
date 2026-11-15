# Implementation Plan: Guest Book

## Overview

Build the guest book in three waves. Tasks in one wave write disjoint files.

## Tasks

- [ ] 1. Store guest entries
  - [x] 1.1 Create the entry model
    - Add a frozen `Entry` dataclass with name, message, and timestamp.
    - _Writes: src/guestbook/model.py_
    - _Requirements: 1.1, 1.2_
  - [ ] 1.2 Implement the entry store
    - Keep entries in insertion order and reject blank names.
    - _Writes: src/guestbook/store.py_
    - _Requirements: 1.3, 2.1–2.3_
  - [ ]* 1.3 Write the property test for store ordering
    - **Property 1: Entries keep insertion order**
    - _Writes: `tests/test_store_order.py`_
    - _Requirements: 1.3_

- [ ] 2. Render the guest book
  - [ ] 2.1 Implement the page renderer
    - _Writes: src/guestbook/render.py, src/guestbook/templates/*.html_
    - _Requirements: 3.1, 3.2_
  - [ ]* 2.2 Write renderer unit tests
    - _Writes: tests/render/**_
    - _Requirements: 3.1, 3.2_

- [ ] 3. Checkpoint: verify the guest book
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks.

```text
- [ ] 9.9 A checkbox inside a code fence is not a task
```

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "2.2"] }
  ]
}
```
