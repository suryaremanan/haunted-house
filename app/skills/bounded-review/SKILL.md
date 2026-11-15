---
name: bounded-review
description: Review finished Workshop work against the approved requirements, design, and task plan and return one verdict with traced findings, for the Medium in the Haunted House Séance Room. Use when the assignment is one review cycle of one spec.
---

# Bounded review

## When to use

Use this skill for one review cycle: judge the changed files the assignment lists against the approved `requirements.md`, `design.md`, and `tasks.md`, and return one verdict. You read; you never change a file. The cycle number is in the assignment, and there are at most three cycles.

## Checklist

Work top to bottom. Every box must hold before you give your verdict.

- [ ] Read the approved requirements, design, and task plan and confirm each digest equals the one in the assignment. If one differs, stop and report blocked with reason `upstream_changed`.
- [ ] Read every changed file the assignment lists. Review only those files.
- [ ] For each acceptance criterion in the assignment, find the code that satisfies it and the test that would fail without it.
- [ ] For each correctness property in the design, find its property-based test and check that it states the property, not an example.
- [ ] Check each changed file against the task that claimed it: nothing outside the task's purpose, nothing left half done.
- [ ] Look for the failures a criterion implies but the code misses: empty input, the largest input, repeats, and the unwanted events the requirements name.
- [ ] Keep a finding only when you can name the criterion it breaks and the file where it shows. Drop everything else.
- [ ] Keep at most five findings, most serious first. One finding, one cause.
- [ ] End with one Ghost_Result that carries the verdict.

## Artifact grammar

A review produces no file. Its whole output is the verdict in the final response.

| Verdict | Meaning | Ghost_Result |
|---|---|---|
| Pass | Every listed criterion is met and tested in the changed files | status `ready` |
| Changes requested | One to five traced findings | status `failed`, reason `changes_requested` |
| Blocked | The review could not be done | status `blocked` with a reason |

A finding is written in the summary in this exact form, findings separated by `; `:

```text
F1 [criteria 1.2, 2.1] [src/handler.py] empty address is stored instead of rejected; F2 [criteria 1.3] [tests/test_store.py] no test reaches the 500-entry limit
```

- `F1` to `F5`, numbered in order.
- `[criteria ...]` lists one or more acceptance-criterion ids as `N.N`, separated by a comma and a space. Every id is in the assignment.
- `[path]` is one changed file from the assignment, Mansion-relative.
- The rest is one plain clause saying what is wrong, not how to fix it. No code, no quotes from files.
- The whole summary stays within 1000 characters. Shorten clauses before dropping a finding.

What is not a finding: style the steering does not require, a different design you would prefer, work that belongs to a task not yet done, and anything you cannot tie to a criterion.

## Repair

You repair nothing. Each finding becomes one repair task the operator may approve; a Tinker does the work, and a later cycle reviews it.

- In cycle two or three, first check the earlier findings named in the assignment. Report one again only if it is still present.
- Do not raise the bar between cycles. A new finding in a later cycle must concern code that changed since the previous cycle, or a criterion that was not reviewed before.
- The loop is bounded at three cycles. After the third cycle without a pass the house stops and asks the operator; you never start a cycle, ask for a fourth, or keep a turn open waiting for fixes.
- If a tool returns code blocked or denied, stop and report blocked. Do not look for another way.

## Final response

Your last message is exactly one Ghost_Result JSON object: no prose before or after it, no code fence. Copy `run_id` from the assignment. `task_id` is null and `artifacts` is always the empty list.

Pass:

```json
{"schema_version": 1, "run_id": "run-example-5", "status": "ready", "summary": "All 14 listed criteria are met and tested in the 6 changed files.", "artifacts": [], "task_id": null, "reason_code": null}
```

Changes requested:

```json
{"schema_version": 1, "run_id": "run-example-5", "status": "failed", "summary": "F1 [criteria 1.2, 2.1] [src/handler.py] empty address is stored instead of rejected; F2 [criteria 1.3] [tests/test_store.py] no test reaches the 500-entry limit", "artifacts": [], "task_id": null, "reason_code": "changes_requested"}
```

Blocked:

```json
{"schema_version": 1, "run_id": "run-example-5", "status": "blocked", "summary": "The approved design changed after this review started.", "artifacts": [], "task_id": null, "reason_code": "upstream_changed"}
```

The summary holds no secrets, no file contents, and no paths outside the Mansion.
