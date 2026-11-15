---
name: scoped-implementation
description: Implement exactly one selected task of an approved tasks.md inside its path claim, with tests, for a Tinker in the Haunted House Workshop. Use when the assignment names one task id and one claim.
---

# Scoped implementation

## When to use

Use this skill for one implementation assignment: the single task whose id is in the assignment, inside the path claim the assignment lists. Other Tinkers may be working on other tasks at the same moment, each inside its own claim. Your claim is the only place you change anything.

## Checklist

Work top to bottom. Every box must hold before you give your final response.

- [ ] Read the task in the approved `tasks.md`, the acceptance criteria it references in `requirements.md`, and the parts of `design.md` that describe it.
- [ ] Read every file in your claim that already exists and keep the `sha256` each read returns.
- [ ] Compare those digests with the expected revisions in the assignment. If one differs, stop and report blocked with reason `stale_revision`.
- [ ] Read neighbouring code outside the claim when you need to follow its conventions. Reading is allowed; changing is not.
- [ ] Write the smallest change that satisfies the referenced criteria, using `write_room_file`, one whole file per call.
- [ ] Write or extend tests inside the claim when the claim includes a test path. Cover each referenced criterion, including its unwanted-event and boundary cases.
- [ ] When a check needs a command, a delete, or a git step, propose it with `propose_risky_action` as one complete action and wait for the operator. Run it with `execute_approved_action`, repeating the identical action, only after approval.
- [ ] Reread each file you wrote and confirm its `sha256` matches the one the write returned.
- [ ] Leave the task checkbox alone. The house ticks it after it validates your result.
- [ ] End with one Ghost_Result that lists every file you created or changed.

## Artifact grammar

A Tinker's artifacts are ordinary project files. What makes them acceptable:

- Every path is Mansion-relative, inside the claim, and outside `.kiro/`, `.git/`, and `.haunted-house/`. Spec documents and Kiro settings are never yours to write.
- A write replaces the whole file. Send complete content, never a fragment or a patch.
- Pass `expected_sha256` with every write: the `sha256` from your latest read of that file, or JSON `null` for a file that must not exist yet. A write answered `stale_revision` means someone changed the file: stop, do not retry with a fresh digest.
- Code follows the project's steering: its language, layout, naming, and test style. Add no dependency the design does not name.
- Tests are deterministic: no network, no clock, no sleep, no reliance on test order.
- No secret, token, credential, or machine-specific path appears in any file.

A risky action is one JSON object with `kind` (`delete_path`, `run_command`, or `git_write`), `working_directory` (Mansion-relative; empty for the root), `arguments`, and `path_intents` (each path the action reads, writes, or deletes). The operator sees exactly what you propose. An approval covers one attempt of that exact action; changing any field needs a new proposal. A rejection is final for this run: do not rephrase and retry.

Done means: the referenced acceptance criteria hold, the files are inside the claim, the tests you could run pass or you say plainly which ones you could not run, and nothing outside the claim changed.

## Repair

When a tool result or the operator's feedback lists findings, fix exactly those findings and nothing else.

1. Read the named file again and take its current `sha256`.
2. Apply the smallest edit that resolves the finding and write the whole file once.
3. If a write is refused as outside the claim, do not try a different path. The task needs a wider claim: report blocked with reason `claim_too_narrow`.
4. If a tool returns code blocked or denied, stop and report blocked. Do not look for another way.
5. Do not loop: after two repair rounds on the same finding, stop and report failed with reason `repair_unresolved`.

Never edit a test only to make it pass, never delete a failing test, and never touch another task's files to make yours work. If the task cannot be done as planned, say why in the summary and leave the files in a consistent state.

## Final response

Your last message is exactly one Ghost_Result JSON object: no prose before or after it, no code fence. Copy `run_id` and `task_id` from the assignment. List every file you created or changed with the `sha256` the write returned.

Ready:

```json
{"schema_version": 1, "run_id": "run-example-4", "status": "ready", "summary": "Implemented the saved-article store with a 500-entry limit; 6 store tests pass.", "artifacts": [{"path": "src/store.py", "sha256": "0000000000000000000000000000000000000000000000000000000000000000"}, {"path": "tests/test_store.py", "sha256": "1111111111111111111111111111111111111111111111111111111111111111"}], "task_id": "1.1", "reason_code": null}
```

Blocked (a tool returned code blocked or denied, a revision was stale, or the claim is too narrow):

```json
{"schema_version": 1, "run_id": "run-example-4", "status": "blocked", "summary": "The store file changed after this task was assigned.", "artifacts": [], "task_id": "1.1", "reason_code": "stale_revision"}
```

Failed (the task could not be completed):

```json
{"schema_version": 1, "run_id": "run-example-4", "status": "failed", "summary": "Two store tests still fail after two repair rounds; the files are left consistent.", "artifacts": [], "task_id": "1.1", "reason_code": "repair_unresolved"}
```

The summary is one to three plain sentences. It holds no secrets, no file contents, and no paths outside the Mansion.
