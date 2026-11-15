---
name: executable-tasks
description: Write or revise a feature's tasks.md as checkbox coding tasks with path claims, requirement references, and a JSON dependency graph, for the Foreman in the Haunted House Workshop. Use when the assignment is the task-planning phase of one spec with an approved design.
---

# Executable tasks

## When to use

Use this skill for one planning assignment: turn the approved `requirements.md` and `design.md` named in the assignment into `.kiro/specs/<spec>/tasks.md`, or revise that plan from the operator's feedback. You plan the work; Tinkers do it later, one task each, possibly three at a time.

## Checklist

Work top to bottom. Every box must hold before you submit.

- [ ] Read the approved requirements and design and confirm each digest equals the one in the assignment. If one differs, stop and report blocked with reason `upstream_changed`.
- [ ] Read the Mansion steering in your context and list the source tree so every path you claim is real or clearly new.
- [ ] Read the current `tasks.md` if it exists and note its revision. A new document starts from revision 0.
- [ ] Split the design into leaf tasks one Tinker can finish in one sitting: a few files, one behavior, tests included or in a paired test task.
- [ ] Give every leaf a decimal id, a checkbox, a `_Writes:` path claim, and a `_Requirements:` line with exact criterion ids.
- [ ] Mark each test-only leaf optional with `- [ ]*`.
- [ ] Order the leaves into waves. Two leaves share a wave only when their path claims cannot touch the same file.
- [ ] Check coverage: every acceptance criterion appears under at least one leaf.
- [ ] Write the dependency graph as the last section and place every unchecked leaf in exactly one wave.
- [ ] Write the document with `write_spec_document` and keep the `sha256` it returns.
- [ ] Leave submission to the house: call `submit_phase_output` only when the assignment tells you to.
- [ ] End with one Ghost_Result and nothing else.

## Artifact grammar

````markdown
# Implementation Plan

## Tasks

- [ ] 1. Store saved articles
  - [ ] 1.1 Implement the saved-article store
    - _Writes: src/store.py_
    - _Requirements: 1.1, 1.3_
  - [ ]* 1.2 Write property tests for the store
    - _Writes: tests/test_store.py_
    - _Requirements: 1.1, 1.3_
- [ ] 2. Expose saving
  - [ ] 2.1 Implement the save handler with input validation
    - _Writes: src/handler.py, tests/test_handler.py_
    - _Requirements: 1.2, 1.4_

## Task Dependency Graph

```json
{"waves": [{"id": 0, "tasks": ["1.1"]}, {"id": 1, "tasks": ["1.2", "2.1"]}]}
```
````

Rules the house checks before the Workshop unlocks:

- A group is `- [ ] N. Title`. A leaf is `- [ ] N.N Title` under its group; only leaves are scheduled. `- [x]` marks a finished leaf and `- [ ]*` an optional one.
- Leaf ids are unique decimals with no leading zeros. Titles are one line.
- `_Writes:` lists Mansion-relative paths separated by commas. A component is a literal name, a `*` glob for one component, or a whole `**`. No absolute path, no `..`, and no path under `.kiro/`, `.git/`, or `.haunted-house/`. Avoid bracket, brace, and question-mark patterns: the house cannot prove them disjoint, so such a leaf runs alone.
- `_Requirements:` lists criterion ids as `N.N` separated by commas. Every id exists in the approved requirements.
- The graph is one fenced JSON object under `## Task Dependency Graph`: `waves` is a list of `{"id", "tasks"}` with ids 0, 1, 2 in order and no gaps.
- Every unchecked leaf is in exactly one wave. A wave names only existing leaves, never a group.
- Two leaves in one wave must have claims that provably do not overlap. A claim that contains another, or two globs that might match one file, overlap: put them in different waves.
- A leaf that depends on another leaf's output goes in a later wave than that leaf.
- Every acceptance criterion is referenced by at least one leaf.
- A title that starts with write, add, or create and is about tests takes the optional marker.
- A task is coding work: no manual testing, deployment, release, meetings, or approvals.
- The document never tells a reader to run a Kiro chat command.

Sizing guide: a claim of one to four files, a title that starts with a verb and names the behavior, and enough requirement ids that a Tinker knows when it is done. Narrow claims let more Tinkers run at once; a claim of `src/**` forces that leaf to run alone.

## Repair

When a tool result or the operator's feedback lists findings, fix exactly those findings and nothing else.

1. Read the current plan again and take its revision from the read.
2. Each finding names a task id, a wave number, a claim, or an uncovered requirement. Apply the smallest edit: move one leaf to a later wave, narrow one claim, add one missing reference, or add one leaf.
3. After any edit to leaves, rebuild the graph from the leaves rather than patching it by hand.
4. Write the whole corrected document once with the revision you just read. If the write reports a conflict, read again and reapply.
5. Give your final response once. Do not loop: after two repair rounds on the same finding, stop and report blocked with reason `validation_unresolved`.

Never tick a checkbox yourself, never renumber finished leaves, and never widen a claim to hide an overlap.

## Final response

Your last message is exactly one Ghost_Result JSON object: no prose before or after it, no code fence. Copy `run_id` from the assignment. Use the path and `sha256` that `write_spec_document` returned.

Ready:

```json
{"schema_version": 1, "run_id": "run-example-3", "status": "ready", "summary": "Planned 9 leaf tasks in 4 waves; every acceptance criterion is referenced.", "artifacts": [{"path": ".kiro/specs/reading-list/tasks.md", "sha256": "0000000000000000000000000000000000000000000000000000000000000000"}], "task_id": null, "reason_code": null}
```

Blocked (a tool returned code blocked, an upstream document changed, or repair did not converge):

```json
{"schema_version": 1, "run_id": "run-example-3", "status": "blocked", "summary": "The approved design changed after this run started.", "artifacts": [], "task_id": null, "reason_code": "upstream_changed"}
```

Failed (you could not complete the plan for another reason):

```json
{"schema_version": 1, "run_id": "run-example-3", "status": "failed", "summary": "The task plan could not be written.", "artifacts": [], "task_id": null, "reason_code": "write_failed"}
```

The summary is one to three plain sentences. It holds no secrets, no file contents, and no paths outside the Mansion.
