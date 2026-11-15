---
name: ears-requirements
description: Write or revise a feature's requirements.md as numbered EARS acceptance criteria with a glossary, for the Archivist in the Haunted House Study. Use when the assignment is the requirements phase of one spec.
---

# EARS requirements

## When to use

Use this skill for one requirements assignment: turn the feature brief in the assignment into `.kiro/specs/<spec>/requirements.md`, or revise that document from the operator's feedback. One assignment, one document. Design choices, task lists, and code belong to later rooms.

## Checklist

Work top to bottom. Every box must hold before you submit.

- [ ] Read the Mansion steering already in your context, then list and read only the project files the brief touches.
- [ ] Read the current `requirements.md` if it exists and note its revision. A new document starts from revision 0.
- [ ] Name the system and every technical term once in the glossary, then use exactly those names.
- [ ] Write one requirement per user goal: a heading, a user story, and numbered acceptance criteria.
- [ ] Give each criterion exactly one EARS pattern and exactly one SHALL.
- [ ] Cover the normal path, each unwanted event the brief implies, and each boundary (empty, largest, repeated, concurrent).
- [ ] Say in the Introduction what is MVP and what is stretch when the brief separates them.
- [ ] Reread every criterion: it names a glossary system, it can be tested, and it has no vague wording.
- [ ] Write the document with `write_spec_document` and keep the `sha256` it returns.
- [ ] Leave submission to the house: call `submit_phase_output` only when the assignment tells you to.
- [ ] End with one Ghost_Result and nothing else.

## Artifact grammar

The document has this shape. Headings are exact; the three level-two sections appear in this order.

```markdown
# Requirements Document

## Introduction

Two or three sentences: what the feature is, who it is for, what is out of scope.

## Glossary

- **Reading_List**: The application that stores a person's saved articles.
- **Saved_Article**: One article a person added to the Reading_List.

## Requirements

### Requirement 1: Save an article

**User Story:** As a reader, I want to save an article, so that I can read it later.

#### Acceptance Criteria

1. WHEN a reader submits an article address, THE Reading_List SHALL store one Saved_Article for that address.
2. IF the submitted address is empty, THEN THE Reading_List SHALL reject the submission with a validation message.
3. WHILE the Reading_List holds 500 Saved_Article entries, THE Reading_List SHALL refuse a new Saved_Article.
4. THE Reading_List SHALL show Saved_Article entries newest first.
```

The six EARS patterns, with upper-case keywords:

| Pattern | Form |
|---|---|
| Ubiquitous | THE system SHALL response |
| Event-driven | WHEN trigger, THE system SHALL response |
| State-driven | WHILE state, THE system SHALL response |
| Unwanted event | IF condition, THEN THE system SHALL response |
| Optional feature | WHERE feature is included, THE system SHALL response |
| Complex | WHERE, then WHILE, then WHEN or IF/THEN, in that order |

Rules the house checks before the Door can open:

- Requirements are numbered 1, 2, 3 in order; criteria inside each requirement are numbered 1, 2, 3 in order.
- A glossary entry reads `- **Term**: definition`. Each term is defined once.
- The system named after THE, and every Capitalised_Term in a criterion, is a glossary term.
- A user story reads `**User Story:** As a ..., I want ..., so that ...`.
- A criterion with two SHALLs is two criteria. Split it.
- Words that fail a criterion: should, might, could, etc, and/or, if possible, as appropriate, user-friendly, TBD.
- The document is UTF-8 text with no control characters, and it never tells a reader to run a Kiro chat command.

## Repair

When a tool result or the operator's feedback lists findings, fix exactly those findings and nothing else.

1. Read the current document again and take its revision from the read.
2. For each finding, go to its location (requirement number, criterion number, or heading) and apply the smallest edit that satisfies the rule.
3. Write the whole corrected document once with the revision you just read. If the write reports a conflict, read again and reapply; never overwrite blindly.
4. Give your final response once. Do not loop: after two repair rounds on the same finding, stop and report blocked with reason `validation_unresolved`.

Never weaken a requirement to make a finding disappear, never delete a criterion the brief needs, and never invent a requirement the brief does not support. If the brief is too thin to write testable criteria, report blocked with reason `brief_insufficient`.

## Final response

Your last message is exactly one Ghost_Result JSON object: no prose before or after it, no code fence. Copy `run_id` from the assignment. Use the path and `sha256` that `write_spec_document` returned.

Ready:

```json
{"schema_version": 1, "run_id": "run-example-1", "status": "ready", "summary": "Wrote 4 requirements with 14 EARS criteria and a 6-term glossary.", "artifacts": [{"path": ".kiro/specs/reading-list/requirements.md", "sha256": "0000000000000000000000000000000000000000000000000000000000000000"}], "task_id": null, "reason_code": null}
```

Blocked (a tool returned code blocked, the brief is insufficient, or repair did not converge):

```json
{"schema_version": 1, "run_id": "run-example-1", "status": "blocked", "summary": "The brief names no user goal that can be written as a testable criterion.", "artifacts": [], "task_id": null, "reason_code": "brief_insufficient"}
```

Failed (you could not complete the document for another reason):

```json
{"schema_version": 1, "run_id": "run-example-1", "status": "failed", "summary": "The requirements document could not be written.", "artifacts": [], "task_id": null, "reason_code": "write_failed"}
```

The summary is one to three plain sentences. It holds no secrets, no file contents, and no paths outside the Mansion.
