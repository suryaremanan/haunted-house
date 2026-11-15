"""The Task_Plan codec: parse, validate, and print a Kiro-format ``tasks.md``.

Grammar (the Task_Plan_Grammar)::

    - [ ] 2. Group heading                    a group; not a leaf
      - [ ] 2.1 Leaf title                    an incomplete leaf task
        - _Writes: src/a.py, tests/**_        its Path_Claim
        - _Requirements: 1.1, 1.2_            its requirement references
      - [x] 2.2 Done leaf                     a complete leaf
      - [ ]* 2.3 Optional leaf                Kiro's optional marker

    ## Task Dependency Graph

    ```json
    { "waves": [ { "id": 0, "tasks": ["2.1"] }, { "id": 1, "tasks": ["2.3"] } ] }
    ```

A leaf is a ``N.N`` task.  Other bullets under a task are prose and are not
part of the model.  A Path_Claim entry is a clean Mansion-relative path whose
components are literals, ``*`` component globs, or a whole ``**`` (the same
pattern language as a Room_Policy rule).

Parsing reads text; validation judges a plan; printing renders the one
canonical document of a plan.  Parse, print, parse gives an equal plan.
Claim overlap is conservative: when two patterns cannot be proven disjoint
they overlap, and so does a claim that is an ancestor of another.

Pure: no I/O, no clock.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from typing import Final, cast

from haunted_house.core.findings import Finding, bound_findings, finding
from haunted_house.core.ghost_result import is_task_id
from haunted_house.core.path_policy import (
    Access,
    PathError,
    RoomPolicy,
    is_protected,
    join_parts,
    parse_relative_path,
    policy_allows,
    rule,
)

__all__ = [
    "GRAPH_HEADING",
    "MAX_CLAIM_PATHS",
    "MAX_LEAVES",
    "MAX_PLAN_BYTES",
    "MAX_REQUIREMENT_REFS",
    "MAX_TITLE_CHARS",
    "MAX_WAVES",
    "LeafTask",
    "TaskPlan",
    "TaskPlanCheck",
    "TaskPlanError",
    "check_task_plan",
    "claim_covers",
    "claims_may_overlap",
    "is_claim_path",
    "is_requirement_id",
    "parse_task_plan",
    "print_task_plan",
    "requirement_sort_key",
    "validate_task_plan",
]

MAX_PLAN_BYTES: Final = 256 * 1024
MAX_LEAVES: Final = 200
MAX_WAVES: Final = 64
MAX_CLAIM_PATHS: Final = 32
MAX_REQUIREMENT_REFS: Final = 64
MAX_TITLE_CHARS: Final = 200
GRAPH_HEADING: Final = "## Task Dependency Graph"

_REQUIREMENT_ID = re.compile(r"[1-9][0-9]{0,2}\.[1-9][0-9]{0,2}")
_RANGE = re.compile(
    r"([1-9][0-9]{0,2})\.([1-9][0-9]{0,2})\s*[-–—]\s*([1-9][0-9]{0,2})\.([1-9][0-9]{0,2})"
)
_CHECKBOX = re.compile(r"\s*[-*] \[([ xX])\](\*?)(?: +(.*))?\s*")
_LEAF = re.compile(r"([0-9]+(?:\.[0-9]+)+)\.?(?: +(.*))?")
_GROUP = re.compile(r"[0-9]+\.(?: +.*)?")
_METADATA = re.compile(r"\s*(?:[-*] )?_(Writes|Requirements):\s*(.*?)_\s*")
_FENCE = "```"
_UNDISPLAYABLE = frozenset({"Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"})
# Glob syntax this module does not model.  A claim using it is accepted but
# can never be proven disjoint from another claim.
_INDETERMINATE = frozenset("?[]{}!")
_GROUP_ID = re.compile(r"[0-9]{1,8}")


@dataclass(frozen=True, slots=True)
class LeafTask:
    task_id: str
    title: str
    optional: bool
    complete: bool
    requirements: tuple[str, ...]
    writes: tuple[str, ...]
    document_index: int


@dataclass(frozen=True, slots=True)
class TaskPlan:
    """Leaves in document order and waves by index (wave ``i`` has id ``i``)."""

    leaves: tuple[LeafTask, ...]
    waves: tuple[tuple[str, ...], ...]


@dataclass(frozen=True, slots=True)
class TaskPlanCheck:
    """The parsed plan (``None`` when the text did not parse) and its findings."""

    plan: TaskPlan | None
    findings: tuple[Finding, ...]

    @property
    def ok(self) -> bool:
        return self.plan is not None and not self.findings


class TaskPlanError(ValueError):
    """The text or plan cannot be parsed or printed; carries safe findings."""

    def __init__(self, findings: Iterable[Finding]) -> None:
        self.findings = bound_findings(findings)
        super().__init__(self.findings[0].code if self.findings else "task_plan_invalid")


# --- identifiers and claims -----------------------------------------------------


def is_requirement_id(value: object) -> bool:
    return type(value) is str and _REQUIREMENT_ID.fullmatch(value) is not None


def requirement_sort_key(value: str) -> tuple[int, int, str]:
    if is_requirement_id(value):
        major, minor = value.split(".")
        return (int(major), int(minor), "")
    return (10**6, 0, value)


def _task_key(task_id: str) -> tuple[int, int]:
    major, minor = task_id.split(".")
    return (int(major), int(minor))


def _claim_parts(path: object) -> tuple[str, ...] | None:
    """Components of a well-formed Path_Claim entry, else ``None``."""

    parts = parse_relative_path(path)
    if isinstance(parts, PathError):
        return None
    text = cast(str, path)
    if text != text.strip() or "," in text or "`" in text or join_parts(parts) != text:
        return None
    if any("**" in part and part != "**" for part in parts):
        return None
    return parts


def is_claim_path(path: object) -> bool:
    return _claim_parts(path) is not None


def _is_glob(parts: tuple[str, ...]) -> bool:
    return any("*" in part or not _INDETERMINATE.isdisjoint(part) for part in parts)


def _edges(pattern: str) -> tuple[str, str]:
    """The literal text a component must start with and end with."""

    if "*" not in pattern:
        return pattern, pattern
    return pattern.partition("*")[0], pattern.rpartition("*")[2]


def _components_may_meet(left: str, right: str) -> bool:
    """Whether one path component could match both patterns (never a false no)."""

    left, right = left.casefold(), right.casefold()
    if "*" not in left and "*" not in right:
        return left == right
    left_head, left_tail = _edges(left)
    right_head, right_tail = _edges(right)
    heads = left_head.startswith(right_head) or right_head.startswith(left_head)
    tails = left_tail.endswith(right_tail) or right_tail.endswith(left_tail)
    return heads and tails


def _patterns_may_overlap(left: tuple[str, ...], right: tuple[str, ...]) -> bool:
    @lru_cache(maxsize=None)
    def meet(i: int, j: int) -> bool:
        # One pattern used up: its paths equal, or are ancestors of, the
        # other's.  A claim on a folder covers what is inside it.
        if i == len(left) or j == len(right):
            return True
        if left[i] == "**":
            return meet(i + 1, j) or meet(i, j + 1)
        if right[j] == "**":
            return meet(i, j + 1) or meet(i + 1, j)
        return _components_may_meet(left[i], right[j]) and meet(i + 1, j + 1)

    return meet(0, 0)


def _entry_may_overlap(left: str, right: str) -> bool:
    left_parts, right_parts = _claim_parts(left), _claim_parts(right)
    if left_parts is None or right_parts is None:
        return True
    if not _INDETERMINATE.isdisjoint(left) or not _INDETERMINATE.isdisjoint(right):
        return True
    return _patterns_may_overlap(left_parts, right_parts)


def claims_may_overlap(left: tuple[str, ...], right: tuple[str, ...]) -> bool:
    """Whether two Path_Claims might name a common file.

    ``False`` is a proof of disjointness.  Malformed entries, unmodelled glob
    syntax, an empty claim, and anything undecided all count as overlap.
    """

    if not left or not right:
        return True
    return any(_entry_may_overlap(a, b) for a in left for b in right)


def claim_covers(claim: tuple[str, ...], path: str) -> bool:
    """Whether a clean, unprotected Mansion-relative ``path`` is inside ``claim``.

    Uses the Spec 4 rule matcher, so a claim reads exactly like a Room_Policy
    allow list.  A claim with unmodelled glob syntax covers nothing.
    """

    parts = parse_relative_path(path)
    if isinstance(parts, PathError):
        return False
    entries = tuple(
        entry
        for entry in claim
        if is_claim_path(entry) and _INDETERMINATE.isdisjoint(entry)
    )
    policy = RoomPolicy(
        room="task_claim",
        allow=tuple(rule(entry, Access.WRITE) for entry in entries),
        deny=(),
    )
    return policy_allows(policy, Access.WRITE, parts)


# --- parsing ------------------------------------------------------------------


def _error(code: str, message: str, kind: str, part: object = None) -> TaskPlanError:
    return TaskPlanError((finding(code, message, kind, part),))


def _split_entries(text: str) -> list[str]:
    return [entry.strip() for entry in text.split(",") if entry.strip()]


def _parse_requirements(text: str, task_id: str, findings: list[Finding]) -> tuple[str, ...]:
    refs: list[str] = []
    for entry in _split_entries(text):
        expanded: list[str] = []
        span = _RANGE.fullmatch(entry)
        if is_requirement_id(entry):
            expanded = [entry]
        elif span is not None and span[1] == span[3] and int(span[2]) <= int(span[4]):
            expanded = [f"{span[1]}.{minor}" for minor in range(int(span[2]), int(span[4]) + 1)]
        else:
            findings.append(
                finding(
                    "requirement_reference_malformed",
                    "A requirement reference must be N.N, or a range N.A-N.B.",
                    "task",
                    task_id,
                )
            )
        refs.extend(ref for ref in expanded if ref not in refs)
    return tuple(refs)


def _parse_writes(text: str, task_id: str, findings: list[Finding]) -> tuple[str, ...]:
    writes: list[str] = []
    for entry in _split_entries(text):
        if len(entry) >= 2 and entry[0] == "`" == entry[-1]:
            entry = entry[1:-1]
        if not is_claim_path(entry):
            findings.append(
                finding(
                    "claim_invalid",
                    "A Path_Claim entry must be a clean Mansion-relative path or glob.",
                    "task",
                    task_id,
                )
            )
        elif entry not in writes:
            writes.append(entry)
    return tuple(writes)


class _Duplicate(Exception):
    pass


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, item in pairs:
        if key in result:
            raise _Duplicate
        result[key] = item
    return result


def _parse_graph(text: str, findings: list[Finding]) -> tuple[tuple[str, ...], ...]:
    def bad(code: str, message: str, part: object = None) -> tuple[tuple[str, ...], ...]:
        findings.append(finding(code, message, "wave" if part is not None else "graph", part))
        return ()

    try:
        raw = json.loads(text, object_pairs_hook=_unique_object)
    except _Duplicate:
        return bad("graph_invalid", "The dependency graph JSON repeats a key.")
    except (ValueError, RecursionError):
        return bad("graph_invalid", "The dependency graph is not valid JSON.")
    if type(raw) is not dict or raw.keys() != {"waves"} or type(raw["waves"]) is not list:
        return bad("graph_invalid", 'The dependency graph must be {"waves": [...]}.')
    entries = cast(list[object], raw["waves"])
    if len(entries) > MAX_WAVES:
        return bad("graph_invalid", "The dependency graph has too many waves.")
    waves: list[tuple[str, ...]] = []
    for index, entry in enumerate(entries):
        if type(entry) is not dict or entry.keys() != {"id", "tasks"}:
            return bad("graph_invalid", 'Every wave must be {"id": N, "tasks": [...]}.', index)
        wave_id, tasks = entry["id"], entry["tasks"]
        if type(wave_id) is not int:
            return bad("graph_invalid", "A wave id must be an integer.", index)
        if wave_id != index:
            return bad(
                "wave_not_contiguous",
                "Wave ids must count up from zero with no gap or repeat.",
                wave_id,
            )
        if type(tasks) is not list or any(type(item) is not str for item in tasks):
            return bad("graph_invalid", "Wave tasks must be a list of task id strings.", index)
        waves.append(tuple(cast(list[str], tasks)))
    return tuple(waves)


def parse_task_plan(markdown: str) -> TaskPlan:
    """Parse ``tasks.md`` text, or raise :class:`TaskPlanError` with findings."""

    if type(markdown) is not str:
        raise _error("document_invalid", "The task plan must be text.", "document")
    try:
        size = len(markdown.encode("utf-8"))
    except UnicodeEncodeError:
        raise _error("document_invalid", "The task plan is not valid UTF-8.", "document") from None
    if size > MAX_PLAN_BYTES:
        raise _error("document_too_large", "The task plan is too large.", "document")
    if not markdown.strip():
        raise _error("document_empty", "The task plan is empty.", "document")
    lines = markdown.replace("\r\n", "\n").split("\n")
    # Titles are held to the stricter visible-character rule in validation.
    if any(
        unicodedata.category(char) in ("Cc", "Cs") and char != "\t"
        for line in lines
        for char in line
    ):
        raise _error(
            "document_invalid", "The task plan contains control characters.", "document"
        )

    findings: list[Finding] = []
    leaves: list[LeafTask] = []
    seen_metadata: set[tuple[int, str]] = set()
    current: int | None = None
    in_fence = False
    graph_line: int | None = None
    graph_text: str | None = None
    graph_lines: list[str] | None = None

    for number, line in enumerate(lines, start=1):
        fence = line.lstrip().startswith(_FENCE)
        if graph_line is not None:
            # After the graph heading only the first ```json block matters.
            if graph_text is not None:
                if not in_fence and not fence and line.strip() == GRAPH_HEADING:
                    findings.append(_graph_twice(number))
                in_fence = in_fence != fence
                continue
            if graph_lines is not None:
                if fence:
                    graph_text = "\n".join(graph_lines)
                else:
                    graph_lines.append(line)
            elif fence and line.strip().lower() in ("```json", "``` json"):
                graph_lines = []
            elif line.strip() == GRAPH_HEADING:
                findings.append(_graph_twice(number))
            continue
        if fence:
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if line.strip() == GRAPH_HEADING:
            graph_line = number
            continue

        box = _CHECKBOX.fullmatch(line)
        if box is not None:
            rest = box[3] or ""
            leaf = _LEAF.fullmatch(rest)
            if leaf is not None:
                task_id = leaf[1]
                if not is_task_id(task_id):
                    findings.append(
                        finding(
                            "task_id_invalid",
                            "A leaf task id must be N.N without leading zeros.",
                            "line",
                            number,
                        )
                    )
                    current = None
                    continue
                current = len(leaves)
                leaves.append(
                    LeafTask(
                        task_id=task_id,
                        title=(leaf[2] or "").strip(),
                        optional=box[2] == "*",
                        complete=box[1] != " ",
                        requirements=(),
                        writes=(),
                        document_index=current,
                    )
                )
            elif _GROUP.fullmatch(rest) is not None:
                current = None
            else:
                findings.append(
                    finding(
                        "task_id_missing",
                        "Every checkbox task needs a number: N. for a group, N.N for a leaf.",
                        "line",
                        number,
                    )
                )
                current = None
            continue

        metadata = _METADATA.fullmatch(line)
        if metadata is None or current is None:
            continue
        leaf_task = leaves[current]
        if (current, metadata[1]) in seen_metadata:
            findings.append(
                finding(
                    "task_metadata_duplicate",
                    "A leaf task may have one _Writes_ line and one _Requirements_ line.",
                    "task",
                    leaf_task.task_id,
                )
            )
            continue
        seen_metadata.add((current, metadata[1]))
        if metadata[1] == "Writes":
            writes = _parse_writes(metadata[2], leaf_task.task_id, findings)
            leaves[current] = _replace(leaf_task, writes=writes)
        else:
            requirements = _parse_requirements(metadata[2], leaf_task.task_id, findings)
            leaves[current] = _replace(leaf_task, requirements=requirements)

    waves: tuple[tuple[str, ...], ...] = ()
    if graph_line is None:
        findings.append(
            finding(
                "graph_missing",
                "The plan needs a '## Task Dependency Graph' section.",
                "graph",
            )
        )
    elif graph_text is None:
        findings.append(
            finding(
                "graph_missing",
                "The Task Dependency Graph section needs one closed ```json block.",
                "graph",
            )
        )
    else:
        waves = _parse_graph(graph_text, findings)
    if len(leaves) > MAX_LEAVES:
        findings.append(finding("plan_too_large", "The plan has too many leaf tasks.", "document"))
    if findings:
        raise TaskPlanError(findings)
    return TaskPlan(leaves=tuple(leaves), waves=waves)


def _graph_twice(number: int) -> Finding:
    return finding(
        "graph_duplicate",
        "The plan may have only one Task Dependency Graph section.",
        "line",
        number,
    )


def _replace(
    leaf: LeafTask,
    *,
    writes: tuple[str, ...] | None = None,
    requirements: tuple[str, ...] | None = None,
) -> LeafTask:
    return LeafTask(
        task_id=leaf.task_id,
        title=leaf.title,
        optional=leaf.optional,
        complete=leaf.complete,
        requirements=leaf.requirements if requirements is None else requirements,
        writes=leaf.writes if writes is None else writes,
        document_index=leaf.document_index,
    )


# --- validation ---------------------------------------------------------------


def _title_ok(title: object) -> bool:
    return (
        type(title) is str
        and 1 <= len(title) <= MAX_TITLE_CHARS
        and title == title.strip()
        and not any(unicodedata.category(char) in _UNDISPLAYABLE for char in title)
    )


def _leaf_location(leaf: LeafTask, index: int) -> tuple[str, object]:
    return ("task", leaf.task_id) if is_task_id(leaf.task_id) else ("leaf", index)


def _printable_findings(plan: TaskPlan) -> list[Finding]:
    """What stops a plan from having a canonical document at all."""

    found: list[Finding] = []
    if type(plan) is not TaskPlan or type(plan.leaves) is not tuple or type(plan.waves) is not tuple:
        return [finding("plan_invalid", "The task plan has the wrong shape.", "document")]
    if len(plan.leaves) > MAX_LEAVES or len(plan.waves) > MAX_WAVES:
        return [finding("plan_too_large", "The plan has too many tasks or waves.", "document")]
    seen: set[str] = set()
    previous: tuple[int, int] | None = None
    for index, leaf in enumerate(plan.leaves):
        if type(leaf) is not LeafTask:
            return [finding("plan_invalid", "The task plan has the wrong shape.", "document")]
        kind, part = _leaf_location(leaf, index)
        if not is_task_id(leaf.task_id):
            found.append(
                finding("task_id_invalid", "A leaf task id must be N.N without leading zeros.", kind, part)
            )
            continue
        if leaf.task_id in seen:
            found.append(finding("task_duplicate", "Two leaf tasks share one id.", kind, part))
            continue
        seen.add(leaf.task_id)
        key = _task_key(leaf.task_id)
        if previous is not None and key <= previous:
            found.append(
                finding("task_order", "Leaf task ids must ascend in document order.", kind, part)
            )
        previous = key
        if type(leaf.document_index) is not int or leaf.document_index != index:
            found.append(
                finding("task_index_invalid", "A leaf's document index must be its position.", kind, part)
            )
        if type(leaf.optional) is not bool or type(leaf.complete) is not bool:
            found.append(finding("plan_invalid", "A leaf's markers must be booleans.", kind, part))
        if not _title_ok(leaf.title):
            found.append(
                finding(
                    "task_title_invalid",
                    f"A leaf title must be one line of 1 to {MAX_TITLE_CHARS} visible characters.",
                    kind,
                    part,
                )
            )
        writes_ok = (
            type(leaf.writes) is tuple
            and len(leaf.writes) <= MAX_CLAIM_PATHS
            and len(set(leaf.writes)) == len(leaf.writes)
            and all(is_claim_path(entry) for entry in leaf.writes)
        )
        if not writes_ok:
            found.append(
                finding(
                    "claim_invalid",
                    "A Path_Claim must be distinct clean Mansion-relative paths or globs.",
                    kind,
                    part,
                )
            )
        refs_ok = (
            type(leaf.requirements) is tuple
            and len(leaf.requirements) <= MAX_REQUIREMENT_REFS
            and len(set(leaf.requirements)) == len(leaf.requirements)
            and all(is_requirement_id(ref) for ref in leaf.requirements)
        )
        if not refs_ok:
            found.append(
                finding(
                    "requirement_reference_malformed",
                    "Requirement references must be distinct N.N identifiers.",
                    kind,
                    part,
                )
            )
    for index, wave in enumerate(plan.waves):
        if type(wave) is not tuple or any(type(item) is not str for item in wave):
            found.append(finding("graph_invalid", "A wave must list task id strings.", "wave", index))
    return found


def _claim_findings(plan: TaskPlan) -> list[Finding]:
    found: list[Finding] = []
    for leaf in plan.leaves:
        if not leaf.writes:
            found.append(
                finding("claim_missing", "Every leaf task needs a _Writes_ Path_Claim.", "task", leaf.task_id)
            )
            continue
        for entry in leaf.writes:
            parts = cast(tuple[str, ...], _claim_parts(entry))
            if _is_glob(parts):
                continue
            # A Tinker can never write Kiro control data or a Protected_Path.
            if parts[0].casefold() == ".kiro" or is_protected(Access.WRITE, parts):
                found.append(
                    finding(
                        "claim_not_writable",
                        "A Path_Claim names a path no Tinker may write.",
                        "task",
                        leaf.task_id,
                    )
                )
                break
    return found


def _graph_findings(plan: TaskPlan) -> list[Finding]:
    found: list[Finding] = []
    by_id = {leaf.task_id: leaf for leaf in plan.leaves}
    assigned: set[str] = set()
    for index, wave in enumerate(plan.waves):
        if not wave:
            found.append(finding("wave_empty", "A wave must hold at least one task.", "wave", index))
        for task_id in wave:
            if task_id not in by_id:
                non_leaf = _GROUP_ID.fullmatch(task_id) is not None
                found.append(
                    finding(
                        "graph_non_leaf_task" if non_leaf else "graph_unknown_task",
                        "The dependency graph names a group, not a leaf task."
                        if non_leaf
                        else "The dependency graph names a task the plan does not have.",
                        "task",
                        task_id,
                    )
                )
            elif task_id in assigned:
                found.append(
                    finding(
                        "graph_duplicate_task",
                        "The dependency graph assigns one task more than once.",
                        "task",
                        task_id,
                    )
                )
            assigned.add(task_id)
    for leaf in plan.leaves:
        if not leaf.complete and leaf.task_id not in assigned:
            found.append(
                finding(
                    "graph_missing_task",
                    "An incomplete leaf task is in no dependency-graph wave.",
                    "task",
                    leaf.task_id,
                )
            )
    for index, wave in enumerate(plan.waves):
        members = [by_id[task_id] for task_id in dict.fromkeys(wave) if task_id in by_id]
        for position, left in enumerate(members):
            for right in members[position + 1 :]:
                if left.writes and right.writes and claims_may_overlap(left.writes, right.writes):
                    found.append(
                        finding(
                            "claim_conflict",
                            "Two tasks in one wave have Path_Claims that may overlap.",
                            "wave",
                            f"{index} {left.task_id} {right.task_id}",
                        )
                    )
    return found


def _coverage_findings(plan: TaskPlan, requirement_ids: frozenset[str]) -> list[Finding]:
    found: list[Finding] = []
    covered: set[str] = set()
    for leaf in plan.leaves:
        if not leaf.requirements:
            found.append(
                finding(
                    "requirements_missing",
                    "Every leaf task needs a _Requirements_ line.",
                    "task",
                    leaf.task_id,
                )
            )
        covered.update(leaf.requirements)
        if any(ref not in requirement_ids for ref in leaf.requirements):
            found.append(
                finding(
                    "requirement_unknown",
                    "A task references an acceptance criterion that does not exist.",
                    "task",
                    leaf.task_id,
                )
            )
    for requirement in sorted(requirement_ids - covered, key=requirement_sort_key):
        found.append(
            finding(
                "requirement_uncovered",
                "No task covers this acceptance criterion.",
                "requirement",
                requirement,
            )
        )
    return found


def validate_task_plan(plan: TaskPlan, requirement_ids: frozenset[str]) -> tuple[Finding, ...]:
    """Every reason ``plan`` is not a safe, complete Workshop plan.

    ``requirement_ids`` is the set of acceptance-criterion ids (``N.N``) of
    the approved requirements.  An empty result means the plan is valid.
    """

    found = _printable_findings(plan)
    if found:
        return bound_findings(found)
    return bound_findings(
        _claim_findings(plan) + _graph_findings(plan) + _coverage_findings(plan, requirement_ids)
    )


def check_task_plan(markdown: str, requirement_ids: frozenset[str]) -> TaskPlanCheck:
    """Parse and validate in one step; never raises."""

    try:
        plan = parse_task_plan(markdown)
    except TaskPlanError as error:
        return TaskPlanCheck(plan=None, findings=error.findings)
    return TaskPlanCheck(plan=plan, findings=validate_task_plan(plan, requirement_ids))


# --- printing -----------------------------------------------------------------


def print_task_plan(plan: TaskPlan) -> str:
    """Render the one canonical Kiro-format document of a plan.

    Group headings are regenerated from the leaf ids.  A plan whose leaves
    cannot be spelled in the grammar raises :class:`TaskPlanError`.
    """

    found = _printable_findings(plan)
    if found:
        raise TaskPlanError(found)
    lines = ["# Implementation Plan", "", "## Tasks", ""]
    group: str | None = None
    for leaf in plan.leaves:
        major = leaf.task_id.split(".")[0]
        if major != group:
            group = major
            done = all(
                other.complete for other in plan.leaves if other.task_id.split(".")[0] == major
            )
            lines.append(f"- [{'x' if done else ' '}] {major}. Task group {major}")
        box = "x" if leaf.complete else " "
        marker = "*" if leaf.optional else ""
        lines.append(f"  - [{box}]{marker} {leaf.task_id} {leaf.title}")
        if leaf.writes:
            lines.append(f"    - _Writes: {', '.join(leaf.writes)}_")
        if leaf.requirements:
            lines.append(f"    - _Requirements: {', '.join(leaf.requirements)}_")
    graph = {"waves": [{"id": index, "tasks": list(wave)} for index, wave in enumerate(plan.waves)]}
    lines += [
        "",
        GRAPH_HEADING,
        "",
        "```json",
        json.dumps(graph, indent=2, ensure_ascii=False),
        "```",
        "",
    ]
    return "\n".join(lines)
