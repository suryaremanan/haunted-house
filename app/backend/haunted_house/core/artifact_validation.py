"""The Artifact_Validator: deterministic checks of what a Room Ghost wrote.

Three Kiro-format documents and one envelope are judged here:

* ``requirements.md``: required headings, a glossary, numbered requirements
  with a user story, and numbered acceptance criteria that each use exactly
  one EARS pattern, name a glossary-defined system, and avoid vague wording;
* ``design.md``: the required sections, numbered universal correctness
  properties that reference real acceptance criteria, coverage of every
  requirement, and assumptions tied to named spikes;
* ``tasks.md``: the Task_Plan_Grammar (see :mod:`task_plan`), requirement
  coverage, optional markers on test-only tasks, and executable titles;
* a ghost's final response as one Ghost_Result.

Every result is a tuple of :class:`Finding` with a stable code, a location
built from numbers and known headings, and a fixed message.  Document text is
model output and never appears in a Finding.  The validators use no Kiro
``/spec`` operation and flag a document that tells a reader to run one.

Pure: no I/O, no clock.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Final

from haunted_house.core.findings import Finding, bound_findings, finding
from haunted_house.core.ghost_result import (
    GhostIdentity,
    GhostResult,
    GhostResultError,
    parse_ghost_result,
)
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.task_plan import (
    check_task_plan,
    is_requirement_id,
    requirement_sort_key,
)

__all__ = [
    "DESIGN_SECTIONS",
    "EARS_PATTERNS",
    "MAX_DOCUMENT_BYTES",
    "REQUIREMENTS_SECTIONS",
    "Finding",
    "ears_pattern",
    "extract_requirement_ids",
    "ghost_result_findings",
    "sorted_requirement_ids",
    "validate_design",
    "validate_phase_artifact",
    "validate_requirements",
    "validate_tasks",
]

MAX_DOCUMENT_BYTES: Final = 256 * 1024
REQUIREMENTS_SECTIONS: Final = ("Introduction", "Glossary", "Requirements")
DESIGN_SECTIONS: Final = (
    "Overview",
    "Architecture",
    "Components and Interfaces",
    "Data Models",
    "Error Handling",
    "Testing Strategy",
)
EARS_PATTERNS: Final = (
    "ubiquitous",
    "event_driven",
    "state_driven",
    "unwanted_event",
    "optional_feature",
    "complex",
)

_HEADING = re.compile(r"(#{1,6}) +(.*?)\s*#*\s*")
_GLOSSARY_ENTRY = re.compile(r"\s*[-*] \*\*(.+?)\*\*\s*:\s*\S.*")
_REQUIREMENT_HEADING = re.compile(r"Requirement ([0-9]{1,4}): \S.*")
_USER_STORY = re.compile(r"\*\*User Story:\*\*\s*As (?:an?|the) .+, I want .+, so that .+")
_NUMBERED = re.compile(r"\s*([0-9]{1,4})\.\s+(\S.*)")
_PROPERTY_HEADING = re.compile(r"Property ([0-9]{1,4}): \S.*")
_VALIDATES = re.compile(r"\*\*Validates:\s*Requirements?\s+(.*?)\*\*\s*")
_UNIVERSAL = re.compile(r"\bfor (?:any|all|every)\b", re.IGNORECASE)
_RANGE = re.compile(
    r"([1-9][0-9]{0,2})\.([1-9][0-9]{0,2})\s*[-–—]\s*([1-9][0-9]{0,2})\.([1-9][0-9]{0,2})"
)
_MAJOR = re.compile(r"[1-9][0-9]{0,2}")
_TERM = re.compile(r"\b[A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b")
_CLAUSE = re.compile(r"(WHERE|WHILE|WHEN|IF) ")
_CLAUSE_END = re.compile(r", (?=(?:WHERE|WHILE|WHEN|IF|THE) )")
_IF_END = re.compile(r", THEN (?=THE )")
_RESPONSE = re.compile(r"THE (\S.{0,79}?) SHALL (?:NOT )?\S.*")
_SHALL = re.compile(r"\bSHALL\b")
_VAGUE = re.compile(
    r"\b(?:should|might|could|tbd)\b|\bto be determined\b|\bas appropriate\b|\bif possible\b"
    r"|\buser-friendly\b|\betc\b|\band/or\b",
    re.IGNORECASE,
)
# The Kiro chat command, not a path such as .kiro/specs/.
_NATIVE_SPEC = re.compile(r"(?<![A-Za-z0-9_./-])/spec(?![A-Za-z0-9_/-])")
_SPIKE_NAME = re.compile(r"\b[A-Z][A-Z0-9]{0,5}(?:-[A-Z][A-Z0-9]{0,3})?[0-9]{1,3}\b")
_NO_ASSUMPTIONS = re.compile(r"\bno (?:open |unverified |remaining |unresolved )?assumptions\b", re.IGNORECASE)
_TEST_TITLE = re.compile(r"(?:write|add|create)\b.*\btests?\b", re.IGNORECASE)
_NOT_CODE_TITLE = re.compile(
    r"(?:manually|deploy|release|publish|ask|discuss|meet|gather feedback|get approval"
    r"|user acceptance|train)\b",
    re.IGNORECASE,
)
_CLAUSE_RANK: Final = {"WHERE": 0, "WHILE": 1, "WHEN": 2, "IF": 2}
_SINGLE_PATTERN: Final = {
    "WHERE": "optional_feature",
    "WHILE": "state_driven",
    "WHEN": "event_driven",
    "IF": "unwanted_event",
}


# --- document scanning ----------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Heading:
    line: int
    level: int
    title: str


@dataclass(frozen=True, slots=True)
class _Document:
    lines: tuple[str, ...]
    fenced: tuple[bool, ...]
    headings: tuple[_Heading, ...]

    def section(self, heading: _Heading) -> tuple[int, int]:
        """Line range of a heading's body: up to the next same-or-higher heading."""

        end = len(self.lines)
        for other in self.headings:
            if other.line > heading.line and other.level <= heading.level:
                end = other.line
                break
        return heading.line + 1, end

    def body(self, heading: _Heading) -> list[tuple[int, str]]:
        start, end = self.section(heading)
        return [(index, self.lines[index]) for index in range(start, end)]

    def find(self, level: int, title: str) -> _Heading | None:
        wanted = title.casefold()
        return next(
            (item for item in self.headings if item.level == level and item.title.casefold() == wanted),
            None,
        )

    def within(self, heading: _Heading, level: int) -> list[_Heading]:
        start, end = self.section(heading)
        return [item for item in self.headings if start <= item.line < end and item.level == level]


def _scan(markdown: object) -> _Document | Finding:
    if type(markdown) is not str:
        return finding("document_invalid", "The document must be text.", "document")
    try:
        size = len(markdown.encode("utf-8"))
    except UnicodeEncodeError:
        return finding("document_invalid", "The document is not valid UTF-8.", "document")
    if size > MAX_DOCUMENT_BYTES:
        return finding("document_too_large", "The document is too large.", "document")
    if not markdown.strip():
        return finding("document_empty", "The document is empty.", "document")
    lines = tuple(markdown.replace("\r\n", "\n").split("\n"))
    if any(
        unicodedata.category(char) in ("Cc", "Cs") and char != "\t"
        for line in lines
        for char in line
    ):
        return finding("document_invalid", "The document contains control characters.", "document")
    fenced: list[bool] = []
    headings: list[_Heading] = []
    in_fence = False
    for index, line in enumerate(lines):
        if line.lstrip().startswith("```"):
            fenced.append(True)
            in_fence = not in_fence
            continue
        fenced.append(in_fence)
        if in_fence:
            continue
        match = _HEADING.fullmatch(line)
        if match is not None:
            headings.append(_Heading(line=index, level=len(match[1]), title=match[2]))
    return _Document(lines=lines, fenced=tuple(fenced), headings=tuple(headings))


def _native_spec_findings(document: _Document) -> list[Finding]:
    return [
        finding(
            "native_spec_instruction",
            "The document must not tell anyone to run Kiro's /spec command.",
            "line",
            index + 1,
        )
        for index, line in enumerate(document.lines)
        if _NATIVE_SPEC.search(line) is not None
    ]


def _title_findings(document: _Document, title: str) -> list[Finding]:
    first = next((item for item in document.headings if item.level == 1), None)
    if first is None or not first.title.casefold().startswith(title.casefold()):
        return [
            finding("heading_missing", "The document needs its level-one title.", "heading", title)
        ]
    return []


def _required_sections(
    document: _Document, titles: tuple[str, ...], *, ordered: bool
) -> tuple[dict[str, _Heading], list[Finding]]:
    found: dict[str, _Heading] = {}
    findings: list[Finding] = []
    previous = -1
    for title in titles:
        heading = document.find(2, title)
        if heading is None:
            findings.append(
                finding("heading_missing", "A required section heading is missing.", "heading", title)
            )
            continue
        found[title] = heading
        if not any(line.strip() for _, line in document.body(heading)):
            findings.append(finding("section_empty", "A required section is empty.", "heading", title))
        if ordered and heading.line < previous:
            findings.append(
                finding("heading_order", "A required section is out of order.", "heading", title)
            )
        previous = max(previous, heading.line)
    return found, findings


# --- EARS -----------------------------------------------------------------------


def _ears(text: str) -> tuple[str, str] | None:
    """``(pattern, system name)`` of a criterion, or ``None`` if it is not EARS."""

    rest = " ".join(text.split())
    keywords: list[str] = []
    rank = -1
    while True:
        clause = _CLAUSE.match(rest)
        if clause is None:
            break
        keyword = clause[1]
        if _CLAUSE_RANK[keyword] <= rank:
            return None
        rank = _CLAUSE_RANK[keyword]
        end = (_IF_END if keyword == "IF" else _CLAUSE_END).search(rest, clause.end())
        if end is None or not rest[clause.end() : end.start()].strip():
            return None
        keywords.append(keyword)
        rest = rest[end.end() :]
    response = _RESPONSE.fullmatch(rest)
    if response is None:
        return None
    if not keywords:
        pattern = "ubiquitous"
    elif len(keywords) == 1:
        pattern = _SINGLE_PATTERN[keywords[0]]
    else:
        pattern = "complex"
    return pattern, response[1]


def ears_pattern(text: str) -> str | None:
    """The one EARS pattern a criterion uses, or ``None``.

    Keywords are upper case and ordered WHERE, WHILE, then WHEN or IF/THEN;
    more than one condition keyword is the complex pattern.  A criterion with
    two SHALLs states two requirements and matches nothing.
    """

    if type(text) is not str or len(_SHALL.findall(text)) != 1:
        return None
    parsed = _ears(text)
    return None if parsed is None else parsed[0]


def _normal_term(term: str) -> str:
    return " ".join(term.replace("_", " ").casefold().split())


# --- requirements ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Criterion:
    requirement: int
    number: int
    position: int
    text: str


def _criteria(document: _Document, heading: _Heading) -> list[tuple[int, str]]:
    """Numbered items of one Acceptance Criteria block: (number, joined text)."""

    items: list[tuple[int, list[str]]] = []
    for index, line in document.body(heading):
        if document.fenced[index]:
            continue
        numbered = _NUMBERED.fullmatch(line)
        if numbered is not None:
            items.append((int(numbered[1]), [numbered[2]]))
        elif items and line.strip() and line[:1] in (" ", "\t"):
            items[-1][1].append(line.strip())
    return [(number, " ".join(parts)) for number, parts in items]


def _requirement_blocks(
    document: _Document, section: _Heading
) -> list[tuple[_Heading, int | None]]:
    blocks: list[tuple[_Heading, int | None]] = []
    for heading in document.within(section, 3):
        match = _REQUIREMENT_HEADING.fullmatch(heading.title)
        blocks.append((heading, int(match[1]) if match is not None else None))
    return blocks


def _collect_criteria(document: _Document) -> list[_Criterion]:
    section = document.find(2, "Requirements")
    if section is None:
        return []
    collected: list[_Criterion] = []
    for heading, number in _requirement_blocks(document, section):
        if number is None:
            continue
        criteria_heading = next(
            (
                item
                for item in document.within(heading, 4)
                if item.title.casefold() == "acceptance criteria"
            ),
            None,
        )
        if criteria_heading is None:
            continue
        for position, (item_number, text) in enumerate(
            _criteria(document, criteria_heading), start=1
        ):
            collected.append(_Criterion(number, item_number, position, text))
    return collected


def extract_requirement_ids(markdown: str) -> frozenset[str]:
    """The acceptance-criterion ids (``N.N``) a requirements document declares.

    Returns an empty set for text that cannot be scanned; run
    :func:`validate_requirements` to learn why.
    """

    document = _scan(markdown)
    if isinstance(document, Finding):
        return frozenset()
    ids = (f"{item.requirement}.{item.number}" for item in _collect_criteria(document))
    return frozenset(value for value in ids if is_requirement_id(value))


def validate_requirements(markdown: str) -> tuple[Finding, ...]:
    """Every reason ``markdown`` is not a valid EARS requirements document."""

    document = _scan(markdown)
    if isinstance(document, Finding):
        return (document,)
    findings = _title_findings(document, "Requirements Document")
    sections, section_findings = _required_sections(document, REQUIREMENTS_SECTIONS, ordered=True)
    findings += section_findings

    glossary: set[str] = set()
    if "Glossary" in sections:
        for index, line in document.body(sections["Glossary"]):
            entry = _GLOSSARY_ENTRY.fullmatch(line)
            if entry is None or document.fenced[index]:
                continue
            term = _normal_term(entry[1])
            if term in glossary:
                findings.append(
                    finding("glossary_duplicate", "The glossary defines one term twice.", "line", index + 1)
                )
            glossary.add(term)
        if not glossary:
            findings.append(
                finding(
                    "glossary_empty",
                    "The glossary needs entries shaped '- **Term**: definition'.",
                    "heading",
                    "Glossary",
                )
            )

    if "Requirements" in sections:
        findings += _requirement_findings(document, sections["Requirements"], glossary)
    findings += _native_spec_findings(document)
    return bound_findings(findings)


def _requirement_findings(
    document: _Document, section: _Heading, glossary: set[str]
) -> list[Finding]:
    findings: list[Finding] = []
    blocks = _requirement_blocks(document, section)
    if not blocks:
        return [
            finding(
                "requirement_missing",
                "The Requirements section needs '### Requirement N: Title' headings.",
                "heading",
                "Requirements",
            )
        ]
    for position, (heading, number) in enumerate(blocks, start=1):
        if number is None:
            findings.append(
                finding(
                    "requirement_heading_invalid",
                    "A requirement heading must read '### Requirement N: Title'.",
                    "line",
                    heading.line + 1,
                )
            )
            continue
        if number != position:
            findings.append(
                finding(
                    "requirement_numbering",
                    "Requirements must be numbered 1, 2, 3 in order.",
                    "requirement",
                    number,
                )
            )
        body = document.body(heading)
        stories = [line.strip() for _, line in body if line.strip().startswith("**User Story:**")]
        if not stories:
            findings.append(
                finding("user_story_missing", "A requirement needs a **User Story:** line.", "requirement", number)
            )
        elif _USER_STORY.fullmatch(stories[0]) is None:
            findings.append(
                finding(
                    "user_story_invalid",
                    "A user story reads 'As a ..., I want ..., so that ...'.",
                    "requirement",
                    number,
                )
            )
        criteria_heading = next(
            (
                item
                for item in document.within(heading, 4)
                if item.title.casefold() == "acceptance criteria"
            ),
            None,
        )
        criteria = [] if criteria_heading is None else _criteria(document, criteria_heading)
        if not criteria:
            findings.append(
                finding(
                    "criteria_missing",
                    "A requirement needs '#### Acceptance Criteria' with a numbered list.",
                    "requirement",
                    number,
                )
            )
        for item_position, (item_number, text) in enumerate(criteria, start=1):
            location = f"{number}.{item_position}"
            if item_number != item_position:
                findings.append(
                    finding(
                        "criterion_numbering",
                        "Acceptance criteria must be numbered 1, 2, 3 in order.",
                        "criterion",
                        location,
                    )
                )
            findings += _criterion_findings(text, location, glossary)
    return findings


def _criterion_findings(text: str, location: str, glossary: set[str]) -> list[Finding]:
    findings: list[Finding] = []
    shalls = len(_SHALL.findall(text))
    parsed = _ears(text) if shalls == 1 else None
    if shalls > 1:
        findings.append(
            finding(
                "ears_multiple_shall",
                "A criterion states one behavior: use exactly one SHALL.",
                "criterion",
                location,
            )
        )
    elif parsed is None:
        findings.append(
            finding(
                "ears_invalid",
                "A criterion must use one EARS pattern: [WHERE/WHILE/WHEN/IF-THEN] THE <system> SHALL ...",
                "criterion",
                location,
            )
        )
    if _VAGUE.search(text) is not None:
        findings.append(
            finding(
                "criterion_ambiguous",
                "A criterion uses vague wording (should, might, could, etc, and/or, if possible).",
                "criterion",
                location,
            )
        )
    undefined = any(_normal_term(term) not in glossary for term in _TERM.findall(text))
    if parsed is not None and _normal_term(parsed[1]) not in glossary:
        undefined = True
    if undefined:
        findings.append(
            finding(
                "glossary_undefined",
                "A criterion names a system or term the glossary does not define.",
                "criterion",
                location,
            )
        )
    return findings


# --- design ---------------------------------------------------------------------


def _references(text: str) -> tuple[list[str], bool]:
    """Requirement ids in a comma list (ranges expanded) and whether all parsed."""

    refs: list[str] = []
    clean = True
    entries = [entry.strip() for entry in text.split(",") if entry.strip()]
    if not entries:
        return [], False
    for entry in entries:
        span = _RANGE.fullmatch(entry)
        if is_requirement_id(entry):
            refs.append(entry)
        elif span is not None and span[1] == span[3] and int(span[2]) <= int(span[4]):
            refs.extend(f"{span[1]}.{minor}" for minor in range(int(span[2]), int(span[4]) + 1))
        else:
            clean = False
    return refs, clean


def _property_findings(
    document: _Document, section: _Heading, requirement_ids: frozenset[str], covered: set[str]
) -> list[Finding]:
    findings: list[Finding] = []
    headings = document.within(section, 3)
    if not headings:
        return [
            finding(
                "property_missing",
                "Correctness Properties needs '### Property N: Title' headings.",
                "heading",
                "Correctness Properties",
            )
        ]
    position = 0
    for heading in headings:
        match = _PROPERTY_HEADING.fullmatch(heading.title)
        if match is None:
            findings.append(
                finding(
                    "property_heading_invalid",
                    "A property heading must read '### Property N: Title'.",
                    "line",
                    heading.line + 1,
                )
            )
            continue
        position += 1
        number = int(match[1])
        if number != position:
            findings.append(
                finding(
                    "property_numbering",
                    "Properties must be numbered 1, 2, 3 in order.",
                    "property",
                    number,
                )
            )
        body = [line for index, line in document.body(heading) if not document.fenced[index]]
        if not any(_UNIVERSAL.search(line) for line in body):
            findings.append(
                finding(
                    "property_not_universal",
                    "A property must be a universal statement ('For any ...').",
                    "property",
                    number,
                )
            )
        validates = [match for line in body if (match := _VALIDATES.fullmatch(line.strip()))]
        if not validates:
            findings.append(
                finding(
                    "property_validates_missing",
                    "A property needs a '**Validates: Requirements N.N, ...**' line.",
                    "property",
                    number,
                )
            )
            continue
        refs, clean = _references(validates[0][1])
        if not clean:
            findings.append(
                finding(
                    "property_reference_malformed",
                    "A property's requirement references must be N.N, or a range N.A-N.B.",
                    "property",
                    number,
                )
            )
        if any(ref not in requirement_ids for ref in refs):
            findings.append(
                finding(
                    "property_reference_unknown",
                    "A property references an acceptance criterion that does not exist.",
                    "property",
                    number,
                )
            )
        covered.update(ref.split(".")[0] for ref in refs if ref in requirement_ids)
    return findings


def _traceability(document: _Document, majors: set[str], covered: set[str]) -> list[Finding]:
    """Requirement numbers named in the first cell of a traceability table."""

    findings: list[Finding] = []
    for heading in document.headings:
        if "traceability" not in heading.title.casefold():
            continue
        for index, line in document.body(heading):
            if document.fenced[index] or not line.lstrip().startswith("|"):
                continue
            cell = line.strip().strip("|").split("|")[0].strip()
            cell = re.sub(r"^requirements?\s+", "", cell, flags=re.IGNORECASE)
            names: list[str] = []
            for entry in (part.strip() for part in cell.split(",") if part.strip()):
                refs, clean = _references(entry)
                if clean:
                    names.extend(ref.split(".")[0] for ref in refs)
                elif _MAJOR.fullmatch(entry) is not None:
                    names.append(entry)
            for name in names:
                if name in majors:
                    covered.add(name)
                else:
                    findings.append(
                        finding(
                            "requirement_unknown",
                            "The traceability table names a requirement that does not exist.",
                            "requirement",
                            name,
                        )
                    )
    return findings


def _assumption_findings(document: _Document) -> list[Finding]:
    heading = next(
        (
            item
            for item in document.headings
            if item.level in (2, 3)
            and ("assumption" in item.title.casefold() or "decision" in item.title.casefold())
        ),
        None,
    )
    name = "Decisions and Assumptions"
    if heading is None:
        return [
            finding(
                "heading_missing",
                "The design needs a section that separates decisions from assumptions.",
                "heading",
                name,
            )
        ]
    body = "\n".join(line for _, line in document.body(heading))
    if not body.strip():
        return [finding("section_empty", "A required section is empty.", "heading", name)]
    if _SPIKE_NAME.search(body) is None and _NO_ASSUMPTIONS.search(body) is None:
        return [
            finding(
                "assumption_without_spike",
                "Tie each assumption to a named spike (for example S1), or state 'No assumptions'.",
                "heading",
                name,
            )
        ]
    return []


def validate_design(markdown: str, requirement_ids: frozenset[str]) -> tuple[Finding, ...]:
    """Every reason ``markdown`` is not a valid, traceable design document.

    ``requirement_ids`` are the acceptance-criterion ids of the approved
    requirements (see :func:`extract_requirement_ids`).
    """

    document = _scan(markdown)
    if isinstance(document, Finding):
        return (document,)
    findings = _title_findings(document, "Design Document")
    findings += _required_sections(document, DESIGN_SECTIONS, ordered=False)[1]

    majors = {value.split(".")[0] for value in requirement_ids if is_requirement_id(value)}
    covered: set[str] = set()
    properties = document.find(2, "Correctness Properties")
    if properties is not None:
        findings += _property_findings(document, properties, requirement_ids, covered)
    findings += _traceability(document, majors, covered)
    for major in sorted(majors - covered, key=int):
        findings.append(
            finding(
                "requirement_uncovered",
                "No property or traceability row covers this requirement.",
                "requirement",
                major,
            )
        )
    findings += _assumption_findings(document)
    findings += _native_spec_findings(document)
    return bound_findings(findings)


# --- tasks ----------------------------------------------------------------------


def validate_tasks(markdown: str, requirement_ids: frozenset[str]) -> tuple[Finding, ...]:
    """Every reason ``markdown`` is not a valid, executable task plan."""

    document = _scan(markdown)
    if isinstance(document, Finding):
        return (document,)
    check = check_task_plan(markdown, requirement_ids)
    findings = list(check.findings)
    if check.plan is not None:
        for leaf in check.plan.leaves:
            if _NOT_CODE_TITLE.match(leaf.title) is not None:
                findings.append(
                    finding(
                        "task_not_executable",
                        "A task must be coding work a Tinker can do with files and tests.",
                        "task",
                        leaf.task_id,
                    )
                )
            elif _TEST_TITLE.match(leaf.title) is not None and not leaf.optional:
                findings.append(
                    finding(
                        "test_task_not_optional",
                        "A test-only task takes Kiro's optional marker: '- [ ]* N.N ...'.",
                        "task",
                        leaf.task_id,
                    )
                )
    findings += _native_spec_findings(document)
    return bound_findings(findings)


# --- dispatch and Ghost_Result ----------------------------------------------------


def validate_phase_artifact(
    phase: Phase | str, markdown: str, requirement_ids: frozenset[str] = frozenset()
) -> tuple[Finding, ...]:
    """Validate the Spec_Document of ``phase``.

    The implementation phase has no single document, so asking for it is a
    programming error rather than a finding.
    """

    resolved = Phase(phase)
    if resolved is Phase.REQUIREMENTS:
        return validate_requirements(markdown)
    if resolved is Phase.DESIGN:
        return validate_design(markdown, requirement_ids)
    if resolved is Phase.TASKS:
        return validate_tasks(markdown, requirement_ids)
    raise ValueError("the implementation phase has no phase artifact")


def ghost_result_findings(
    text: str, expected: GhostIdentity | None = None
) -> tuple[GhostResult | None, tuple[Finding, ...]]:
    """Parse a final response; a refusal becomes one safe Finding."""

    try:
        return parse_ghost_result(text, expected), ()
    except GhostResultError as error:
        return None, (
            finding(
                f"ghost_result_{error.code.value}",
                "The final response must be exactly one valid Ghost_Result JSON object.",
                "ghost_result",
            ),
        )


def sorted_requirement_ids(requirement_ids: frozenset[str]) -> tuple[str, ...]:
    return tuple(sorted(requirement_ids, key=requirement_sort_key))
