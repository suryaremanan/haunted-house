---
name: correctness-design
description: Write or revise a feature's design.md with traceable sections and universal correctness properties, for the Draughtsman in the Haunted House Drafting Room. Use when the assignment is the design phase of one spec with approved requirements.
---

# Correctness design

## When to use

Use this skill for one design assignment: turn the approved `requirements.md` named in the assignment into `.kiro/specs/<spec>/design.md`, or revise that document from the operator's feedback. The requirements are fixed input. If one is wrong, say so in your result; do not rewrite it.

## Checklist

Work top to bottom. Every box must hold before you submit.

- [ ] Read the approved `requirements.md` and confirm its digest equals the one in the assignment. If it differs, stop and report blocked with reason `upstream_changed`.
- [ ] Read the Mansion steering in your context and the source files the feature will touch. Design for the code that exists.
- [ ] Read the current `design.md` if it exists and note its revision. A new document starts from revision 0.
- [ ] Write the six required sections. Each one says something specific to this feature.
- [ ] For every acceptance criterion, decide how it is verified: a property, an example test, or an integration check.
- [ ] Write a correctness property for each criterion that holds for a whole class of inputs. State it as "For any ...".
- [ ] Give every property a `**Validates: Requirements N.N**` line that names real criteria.
- [ ] Add a traceability table so every requirement number is covered by a property or a row.
- [ ] Separate what you verified in the project from what you decided and what you assume. Tie each assumption to a named spike with a pass condition, or state that there are no assumptions.
- [ ] Write the document with `write_spec_document` and keep the `sha256` it returns.
- [ ] Leave submission to the house: call `submit_phase_output` only when the assignment tells you to.
- [ ] End with one Ghost_Result and nothing else.

## Artifact grammar

Section headings are exact. The six required sections may appear in any order; the other three are required whenever the feature has a criterion a property can test, which is nearly always.

```markdown
# Design Document

## Overview

What is built and the one idea that makes it work.

## Architecture

The parts, what calls what, and where state lives.

## Components and Interfaces

Each module with its function signatures and the inputs it rejects.

## Data Models

Each stored or exchanged shape with its field limits.

## Correctness Properties

### Property 1: Saving is idempotent per address

For any sequence of submissions of one article address, the Reading_List holds exactly one Saved_Article for that address.

**Validates: Requirements 1.1, 1.3**

## Error Handling

| Condition | Behavior |
|---|---|
| Empty address | Reject before storage with a validation message |

## Testing Strategy

One property-based test per property with at least 100 generated cases, plus example tests for the criteria no property covers.

## Requirement Traceability

| Requirement | Design element | Verification |
|---|---|---|
| 1 | Save service and store | Property 1; example tests for 1.2 and 1.4 |

## Decisions and Assumptions

Verified: the project already has a storage module with an atomic write.
Decision: addresses are compared after trimming surrounding whitespace.
Assumption: the store keeps insertion order. Spike S1 passes when 500 inserts read back in order.
```

Rules the house checks before the Door can open:

- The title is `# Design Document`. Overview, Architecture, Components and Interfaces, Data Models, Error Handling, and Testing Strategy are all present and none is empty.
- Properties are `### Property N: Title`, numbered 1, 2, 3 in order, each a universal statement containing "for any", "for all", or "for every".
- A Validates line lists criterion ids as `N.N`, or a range `N.A-N.B` inside one requirement. Every id exists in the approved requirements.
- Every requirement number is covered by a property or by the first cell of a traceability row.
- A level-two or level-three heading containing "Decisions" or "Assumptions" exists. Its body names a spike such as S1 for each assumption, or says "No assumptions".
- The document is UTF-8 text with no control characters, and it never tells a reader to run a Kiro chat command.

A good property names its inputs, says what always holds, and can fail. "The system works correctly" is not a property. Prefer round trips (parse then print), invariants (a count never exceeds a limit), idempotence (repeating changes nothing), and confluence (order does not change the result).

## Repair

When a tool result or the operator's feedback lists findings, fix exactly those findings and nothing else.

1. Read the current document again and take its revision from the read.
2. For each finding, go to its location (heading, property number, or requirement number) and apply the smallest edit that satisfies the rule.
3. Write the whole corrected document once with the revision you just read. If the write reports a conflict, read again and reapply; never overwrite blindly.
4. Give your final response once. Do not loop: after two repair rounds on the same finding, stop and report blocked with reason `validation_unresolved`.

Never drop a property or a traceability row to silence a finding, and never cite a criterion that does not exist. If a requirement cannot be designed as written, keep the design honest and report blocked with reason `requirement_conflict`.

## Final response

Your last message is exactly one Ghost_Result JSON object: no prose before or after it, no code fence. Copy `run_id` from the assignment. Use the path and `sha256` that `write_spec_document` returned.

Ready:

```json
{"schema_version": 1, "run_id": "run-example-2", "status": "ready", "summary": "Wrote the design with 5 properties covering all 4 requirements and one spike-gated assumption.", "artifacts": [{"path": ".kiro/specs/reading-list/design.md", "sha256": "0000000000000000000000000000000000000000000000000000000000000000"}], "task_id": null, "reason_code": null}
```

Blocked (a tool returned code blocked, the upstream document changed, or repair did not converge):

```json
{"schema_version": 1, "run_id": "run-example-2", "status": "blocked", "summary": "The approved requirements changed after this run started.", "artifacts": [], "task_id": null, "reason_code": "upstream_changed"}
```

Failed (you could not complete the document for another reason):

```json
{"schema_version": 1, "run_id": "run-example-2", "status": "failed", "summary": "The design document could not be written.", "artifacts": [], "task_id": null, "reason_code": "write_failed"}
```

The summary is one to three plain sentences. It holds no secrets, no file contents, and no paths outside the Mansion.
