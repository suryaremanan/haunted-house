"""Unit and generated-input tests for the Artifact_Validator.

The valid documents are the scrubbed fixtures under ``fixtures/room-ghosts``;
every invalid case is one small edit of a valid fixture, so each test names
the single fault it introduces.

Validates: Requirements 5.2, 5.3, 5.5, 6.2, 6.3, 6.4, 6.5, 7.8, 15.2.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from haunted_house.core.artifact_validation import (
    DESIGN_SECTIONS,
    EARS_PATTERNS,
    MAX_DOCUMENT_BYTES,
    REQUIREMENTS_SECTIONS,
    ears_pattern,
    extract_requirement_ids,
    ghost_result_findings,
    sorted_requirement_ids,
    validate_design,
    validate_phase_artifact,
    validate_requirements,
    validate_tasks,
)
from haunted_house.core.findings import (
    MAX_FINDINGS,
    MAX_LOCATION_CHARS,
    MAX_MESSAGE_CHARS,
    TRUNCATED_CODE,
    Finding,
)
from haunted_house.core.ghost_result import GhostIdentity
from haunted_house.core.guardrail_events import Phase
from tests.room_ghost_support import load_fixture, read_fixture

pytestmark = pytest.mark.core

REQUIREMENTS = read_fixture("requirements-valid.md")
DESIGN = read_fixture("design-valid.md")
TASKS = read_fixture("task-plan-valid.md")
IDS = frozenset(load_fixture("task-plan-valid.json")["requirement_ids"])

Edit = Callable[[str], str]


def _pairs(findings: tuple[Finding, ...]) -> list[tuple[str, str]]:
    return [(item.code, item.location) for item in findings]


def _swap(old: str, new: str) -> Edit:
    def edit(text: str) -> str:
        assert old in text, old
        return text.replace(old, new)

    return edit


# --- the valid fixtures ---------------------------------------------------------


def test_valid_fixtures_have_no_findings() -> None:
    assert validate_requirements(REQUIREMENTS) == ()
    assert extract_requirement_ids(REQUIREMENTS) == IDS
    assert validate_design(DESIGN, IDS) == ()
    assert validate_tasks(TASKS, IDS) == ()
    assert sorted_requirement_ids(IDS) == ("1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "3.1", "3.2")


def test_phase_dispatch_matches_the_direct_validators() -> None:
    assert validate_phase_artifact(Phase.REQUIREMENTS, REQUIREMENTS) == ()
    assert validate_phase_artifact("design", DESIGN, IDS) == ()
    assert validate_phase_artifact(Phase.TASKS, TASKS, IDS) == ()
    assert validate_phase_artifact("tasks", DESIGN, IDS) == validate_tasks(DESIGN, IDS)
    with pytest.raises(ValueError):
        validate_phase_artifact(Phase.IMPLEMENTATION, TASKS, IDS)
    with pytest.raises(ValueError):
        validate_phase_artifact("seance", TASKS, IDS)


def test_windows_line_endings_are_the_same_documents() -> None:
    assert validate_requirements(REQUIREMENTS.replace("\n", "\r\n")) == ()
    assert validate_design(DESIGN.replace("\n", "\r\n"), IDS) == ()
    assert validate_tasks(TASKS.replace("\n", "\r\n"), IDS) == ()


# --- EARS -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "pattern"),
    [
        ("THE Entry_Store SHALL keep every Entry.", "ubiquitous"),
        ("THE Entry_Store SHALL NOT drop an Entry.", "ubiquitous"),
        ("WHEN a visitor submits, THE Entry_Store SHALL save one Entry.", "event_driven"),
        ("WHILE the store is full, THE Entry_Store SHALL refuse new entries.", "state_driven"),
        ("IF the name is blank, THEN THE Entry_Store SHALL reject it.", "unwanted_event"),
        ("WHERE Moderation is enabled, THE Entry_Store SHALL hold the Entry.", "optional_feature"),
        ("WHILE the store is full, WHEN a visitor submits, THE Entry_Store SHALL refuse.", "complex"),
        ("WHERE x is on, WHILE busy, IF it fails, THEN THE Entry_Store SHALL NOT retry.", "complex"),
        ("WHEN a name, a message, and a date arrive, THE Entry_Store SHALL save them, in order.", "event_driven"),
        ("WHEN 訪問者 submits “text”, THE Entry_Store SHALL save 漢字.", "event_driven"),
    ],
)
def test_all_six_ears_patterns_are_recognized(text: str, pattern: str) -> None:
    assert pattern in EARS_PATTERNS
    assert ears_pattern(text) == pattern


@pytest.mark.parametrize(
    "text",
    [
        "",
        "The store keeps entries.",
        "When a visitor submits, the store shall save one entry.",
        "THE Entry_Store SHALL",
        "Entry_Store SHALL keep every Entry.",
        "WHEN a visitor submits THE Entry_Store SHALL save it.",
        "WHEN , THE Entry_Store SHALL save it.",
        "IF the name is blank, THE Entry_Store SHALL reject it.",
        "WHEN a visitor submits, WHILE the store is full, THE Entry_Store SHALL refuse.",
        "WHEN a visitor submits, IF the name is blank, THEN THE Entry_Store SHALL refuse.",
        "WHEN a visitor submits, WHEN the host reads, THE Entry_Store SHALL refuse.",
        "THE Entry_Store SHALL save it and THE Page_Renderer SHALL show it.",
        "THE Entry_Store WILL keep every Entry.",
    ],
)
def test_text_that_is_not_one_ears_pattern(text: str) -> None:
    assert ears_pattern(text) is None


_NAMES = st.sampled_from(["Entry_Store", "Page_Renderer", "Guest_Book"])
_PHRASE = st.text(alphabet="abcdefghij klmnop", min_size=1, max_size=20).map(
    lambda text: " ".join(text.split()) or "x"
)


@settings(max_examples=200)
@given(
    where=st.none() | _PHRASE,
    during=st.none() | _PHRASE,
    trigger=st.none() | st.tuples(st.sampled_from(["WHEN", "IF"]), _PHRASE),
    system=_NAMES,
    negative=st.booleans(),
    response=_PHRASE,
)
def test_generated_ears_criteria_classify_by_their_clauses(
    where: str | None,
    during: str | None,
    trigger: tuple[str, str] | None,
    system: str,
    negative: bool,
    response: str,
) -> None:
    parts: list[str] = []
    if where is not None:
        parts.append(f"WHERE {where},")
    if during is not None:
        parts.append(f"WHILE {during},")
    if trigger is not None:
        parts.append(f"{trigger[0]} {trigger[1]}," + (" THEN" if trigger[0] == "IF" else ""))
    parts.append(f"THE {system} SHALL{' NOT' if negative else ''} {response}.")
    text = " ".join(parts)
    clauses = [where is not None, during is not None, trigger is not None].count(True)
    if clauses == 0:
        expected = "ubiquitous"
    elif clauses > 1:
        expected = "complex"
    elif where is not None:
        expected = "optional_feature"
    elif during is not None:
        expected = "state_driven"
    else:
        assert trigger is not None
        expected = "event_driven" if trigger[0] == "WHEN" else "unwanted_event"
    assert ears_pattern(text) == expected
    # The same criterion in a valid document is accepted as written.
    document = _swap(
        "1. WHEN a visitor submits a name and a message, THE Entry_Store SHALL save one Entry with the submission time.",
        f"1. {text}",
    )(REQUIREMENTS)
    assert validate_requirements(document) == ()
    # Lower-casing the keywords stops it being EARS.
    assert ears_pattern(text.replace("SHALL", "shall")) is None


# --- requirements ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("edit", "expected"),
    [
        (_swap("# Requirements Document", "# Notes"), ("heading_missing", "heading:Requirements Document")),
        (_swap("## Introduction", "## Preface"), ("heading_missing", "heading:Introduction")),
        (_swap("## Glossary", "## Terms"), ("heading_missing", "heading:Glossary")),
        (_swap("## Requirements\n", "## Stories\n"), ("heading_missing", "heading:Requirements")),
        (
            lambda text: text.replace("## Glossary", "## Temp").replace("## Introduction", "## Glossary").replace("## Temp", "## Introduction"),
            ("heading_order", "heading:Glossary"),
        ),
        (
            lambda text: text[: text.index("- **Guest_Book**")] + text[text.index("## Requirements") :],
            ("section_empty", "heading:Glossary"),
        ),
        (
            _swap("- **Entry**: One visitor", "- **Guest_Book**: One visitor"),
            ("glossary_duplicate", "line:10"),
        ),
        (_swap("### Requirement 2: Refuse", "### Requirement 4: Refuse"), ("requirement_numbering", "requirement:4")),
        (_swap("### Requirement 2: Refuse bad entries", "### Second requirement"), ("requirement_heading_invalid", "line:27")),
        (
            _swap("**User Story:** As a visitor, I want to leave a signed message, so that the host knows I stopped by.\n", ""),
            ("user_story_missing", "requirement:1"),
        ),
        (
            _swap("**User Story:** As a visitor, I want to leave a signed message, so that the host knows I stopped by.", "**User Story:** Visitors leave messages."),
            ("user_story_invalid", "requirement:1"),
        ),
        (
            lambda text: text.replace("#### Acceptance Criteria", "#### Criteria", 1),
            ("criteria_missing", "requirement:1"),
        ),
        (_swap("2. THE Entry_Store SHALL keep a name", "5. THE Entry_Store SHALL keep a name"), ("criterion_numbering", "criterion:1.2")),
        (
            _swap("1. IF a submitted name is blank, THEN THE Entry_Store SHALL reject", "1. If a submitted name is blank, then the Entry_Store shall reject"),
            ("ears_invalid", "criterion:2.1"),
        ),
        (
            _swap("SHALL reject the submission and save nothing.", "SHALL reject the submission and THE Page_Renderer SHALL save nothing."),
            ("ears_multiple_shall", "criterion:2.1"),
        ),
        (
            _swap("SHALL save one Entry with the submission time.", "SHALL save one Entry quickly, if possible."),
            ("criterion_ambiguous", "criterion:1.1"),
        ),
        (
            _swap("SHALL save one Entry with the submission time.", "SHALL save the name, message, etc."),
            ("criterion_ambiguous", "criterion:1.1"),
        ),
        (
            _swap("SHALL save one Entry with the submission time.", "SHALL save one Entry and should confirm it."),
            ("criterion_ambiguous", "criterion:1.1"),
        ),
        (
            _swap("THE Page_Renderer SHALL escape", "THE Template_Engine SHALL escape"),
            ("glossary_undefined", "criterion:3.2"),
        ),
        (
            _swap("THE Page_Renderer SHALL escape", "THE page SHALL escape"),
            ("glossary_undefined", "criterion:3.2"),
        ),
        (
            _swap("list every saved Entry with its name", "list every saved Entry from the Audit_Log with its name"),
            ("glossary_undefined", "criterion:3.1"),
        ),
        (
            _swap("- **Page_Renderer**: The component", "- **Renderer**: The component"),
            ("glossary_undefined", "criterion:3.1"),
        ),
        (
            _swap("Moderation is stretch scope.", "Moderation is stretch scope. Run `/spec` in Kiro to regenerate this file."),
            ("native_spec_instruction", "line:5"),
        ),
    ],
)
def test_each_requirements_fault_is_found_and_located(edit: Edit, expected: tuple[str, str]) -> None:
    mutated = edit(REQUIREMENTS)
    assert mutated != REQUIREMENTS
    assert expected in _pairs(validate_requirements(mutated))


def test_glossary_terms_match_with_spaces_or_underscores() -> None:
    spaced = _swap("- **Entry_Store**:", "- **Entry Store**:")(REQUIREMENTS)
    assert validate_requirements(spaced) == ()
    spoken = _swap("THE Page_Renderer SHALL escape", "THE Page Renderer SHALL escape")(REQUIREMENTS)
    assert validate_requirements(spoken) == ()


def test_spec_directory_paths_are_not_native_spec_instructions() -> None:
    mentions = _swap(
        "Moderation is stretch scope.",
        "Files live under `.kiro/specs/guest-book/` and `docs/spec/notes.md`; see the /specs page.",
    )(REQUIREMENTS)
    assert validate_requirements(mentions) == ()


def test_requirement_ids_come_from_declared_numbers() -> None:
    assert extract_requirement_ids("") == frozenset()
    assert extract_requirement_ids(DESIGN) == frozenset()
    assert extract_requirement_ids(None) == frozenset()  # type: ignore[arg-type]
    fenced = REQUIREMENTS.replace(
        "1. WHEN the host opens",
        "```\n9. THE Entry_Store SHALL be ignored inside a fence.\n```\n1. WHEN the host opens",
    )
    assert extract_requirement_ids(fenced) == IDS


# --- design ---------------------------------------------------------------------


@pytest.mark.parametrize("section", DESIGN_SECTIONS)
def test_each_missing_design_section_is_named(section: str) -> None:
    mutated = _swap(f"## {section}\n", f"## Renamed {section}\n")(DESIGN)
    assert ("heading_missing", f"heading:{section}") in _pairs(validate_design(mutated, IDS))


@pytest.mark.parametrize(
    ("edit", "expected"),
    [
        (_swap("# Design Document", "# Thoughts"), ("heading_missing", "heading:Design Document")),
        (
            lambda text: text[: text.index("Hypothesis property tests")] + text[text.index("## Requirement Traceability") :],
            ("section_empty", "heading:Testing Strategy"),
        ),
        (_swap("### Property 2: Invalid", "### Property 5: Invalid"), ("property_numbering", "property:5")),
        (_swap("### Property 2: Invalid submissions change nothing", "### Second property"), ("property_heading_invalid", "line:39")),
        (_swap("*For any* store and any submission", "A store given a submission"), ("property_not_universal", "property:2")),
        (_swap("**Validates: Requirements 3.2**", "Validates requirement 3.2"), ("property_validates_missing", "property:3")),
        (_swap("**Validates: Requirements 3.2**", "**Validates: Requirements three point two**"), ("property_reference_malformed", "property:3")),
        (_swap("**Validates: Requirements 3.2**", "**Validates: Requirements 3.2, 3**"), ("property_reference_malformed", "property:3")),
        (_swap("**Validates: Requirements 3.2**", "**Validates: Requirements **"), ("property_reference_malformed", "property:3")),
        (_swap("**Validates: Requirements 1.2, 2.1–2.2**", "**Validates: Requirements 1.2, 2.2-2.1**"), ("property_reference_malformed", "property:2")),
        (_swap("**Validates: Requirements 3.2**", "**Validates: Requirements 3.9**"), ("property_reference_unknown", "property:3")),
        (_swap("| 3 | Page_Renderer |", "| 7 | Page_Renderer |"), ("requirement_unknown", "requirement:7")),
        (
            lambda text: text[: text.index("### Property 1")] + text[text.index("## Error Handling") :],
            ("property_missing", "heading:Correctness Properties"),
        ),
        (
            lambda text: text[: text.index("## Decisions and Assumptions")],
            ("heading_missing", "heading:Decisions and Assumptions"),
        ),
        (
            _swap("Spike S1 renders the page in a plain browser before the renderer task starts.", "We expect that to hold."),
            ("assumption_without_spike", "heading:Decisions and Assumptions"),
        ),
        (
            _swap("The store never renders and the renderer never stores.", "Use /spec to continue."),
            ("native_spec_instruction", "line:14"),
        ),
    ],
)
def test_each_design_fault_is_found_and_located(edit: Edit, expected: tuple[str, str]) -> None:
    mutated = edit(DESIGN)
    assert mutated != DESIGN
    assert expected in _pairs(validate_design(mutated, IDS))


def test_design_must_cover_every_requirement() -> None:
    # Requirement 2 is covered by Property 2 and by its traceability row.
    without_row = _swap("| 2 | Entry_Store | Property 2; moderation unit tests |\n", "")(DESIGN)
    assert validate_design(without_row, IDS) == ()
    without_both = _swap("**Validates: Requirements 1.2, 2.1–2.2**", "**Validates: Requirements 1.2**")(without_row)
    assert _pairs(validate_design(without_both, IDS)) == [("requirement_uncovered", "requirement:2")]
    # A new requirement nobody designed for is reported by its number.
    assert ("requirement_uncovered", "requirement:4") in _pairs(validate_design(DESIGN, IDS | {"4.1"}))


def test_design_without_properties_or_assumptions_can_still_pass() -> None:
    start, end = DESIGN.index("## Correctness Properties"), DESIGN.index("## Error Handling")
    plain = DESIGN[:start] + DESIGN[end:]
    assert validate_design(plain, IDS) == ()
    stated = _swap(
        "- Assumption: the host page can load without a framework. Spike S1 renders the page in a plain browser before the renderer task starts.",
        "- No assumptions remain; every fact above was verified.",
    )(plain).replace("No assumptions remain", "There are no open assumptions")
    assert validate_design(stated, IDS) == ()


# --- tasks ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("edit", "expected"),
    [
        (_swap("- [ ]* 2.2 Write renderer unit tests", "- [ ] 2.2 Write renderer unit tests"), ("test_task_not_optional", "task:2.2")),
        (_swap("- [ ] 2.1 Implement the page renderer", "- [ ] 2.1 Deploy the page to production"), ("task_not_executable", "task:2.1")),
        (_swap("- [ ] 2.1 Implement the page renderer", "- [ ] 2.1 Manually click through the page"), ("task_not_executable", "task:2.1")),
        (_swap("- [ ] 2.1 Implement the page renderer", "- [ ] 2.1"), ("task_title_invalid", "task:2.1")),
        (_swap('"1.2", "2.1"', '"2.1"'), ("graph_missing_task", "task:1.2")),
        (_swap('{ "id": 1,', '{ "id": 3,'), ("wave_not_contiguous", "wave:3")),
        (_swap("src/guestbook/render.py,", "src/guestbook/**,"), ("claim_conflict", "wave:0 1.2 2.1")),
        (_swap("_Requirements: 3.1, 3.2_\n  - [ ]* 2.2", "_Requirements: 3.1_\n  - [ ]* 2.2"), ("requirement_unknown", "task:1.1")),
        (_swap("Build the guest book in three waves.", "Start with /spec and then build."), ("native_spec_instruction", "line:5")),
        (lambda text: text[: text.index("## Task Dependency Graph")], ("graph_missing", "graph")),
    ],
)
def test_each_task_plan_fault_is_found_and_located(edit: Edit, expected: tuple[str, str]) -> None:
    mutated = edit(TASKS)
    assert mutated != TASKS
    ids = IDS - {"1.1"} if expected[0] == "requirement_unknown" else IDS
    assert expected in _pairs(validate_tasks(mutated, ids))


def test_tasks_need_every_criterion_covered() -> None:
    assert _pairs(validate_tasks(TASKS, IDS | {"4.1", "10.2"})) == [
        ("requirement_uncovered", "requirement:4.1"),
        ("requirement_uncovered", "requirement:10.2"),
    ]


# --- documents that are not documents --------------------------------------------


@pytest.mark.parametrize(
    ("markdown", "code"),
    [
        ("", "document_empty"),
        (" \n\t\r\n", "document_empty"),
        (None, "document_invalid"),
        (b"# Requirements Document", "document_invalid"),
        ("# Requirements Document\n\x00", "document_invalid"),
        ("# Requirements Document\n\x1b[31m", "document_invalid"),
        ("\ud800", "document_invalid"),
        ("x" * (MAX_DOCUMENT_BYTES + 1), "document_too_large"),
    ],
)
def test_unusable_documents_give_one_document_finding(markdown: object, code: str) -> None:
    for findings in (
        validate_requirements(markdown),  # type: ignore[arg-type]
        validate_design(markdown, IDS),  # type: ignore[arg-type]
        validate_tasks(markdown, IDS),  # type: ignore[arg-type]
    ):
        assert _pairs(findings) == [(code, "document")]


def test_prose_only_documents_report_missing_structure() -> None:
    prose = "Just some thoughts about a guest book.\n"
    assert [code for code, _ in _pairs(validate_requirements(prose))] == ["heading_missing"] * 4
    assert ("heading_missing", "heading:Overview") in _pairs(validate_design(prose, IDS))
    assert ("graph_missing", "graph") in _pairs(validate_tasks(prose, IDS))
    assert REQUIREMENTS_SECTIONS == ("Introduction", "Glossary", "Requirements")


def test_findings_are_capped_and_say_so() -> None:
    criteria = "".join(f"{index}. the store does thing {index}\n" for index in range(1, 120))
    document = REQUIREMENTS[: REQUIREMENTS.index("1. WHEN a visitor")] + criteria
    findings = validate_requirements(document)
    assert len(findings) == MAX_FINDINGS
    assert findings[-1].code == TRUNCATED_CODE
    assert findings[0] == Finding(
        "ears_invalid",
        "criterion:1.1",
        "A criterion must use one EARS pattern: [WHERE/WHILE/WHEN/IF-THEN] THE <system> SHALL ...",
    )


# --- generated input -------------------------------------------------------------

_FRAGMENTS = st.sampled_from(
    [
        "# Requirements Document\n",
        "# Design Document\n",
        "## Introduction\n",
        "## Glossary\n",
        "## Requirements\n",
        "## Overview\n",
        "## Correctness Properties\n",
        "## Requirement Traceability\n",
        "## Decisions and Assumptions\n",
        "## Task Dependency Graph\n",
        "### Requirement 1: X\n",
        "### Requirement 9: Y\n",
        "### Property 1: P\n",
        "#### Acceptance Criteria\n",
        "**User Story:** As a user, I want x, so that y.\n",
        "- **Thing_One**: a thing\n",
        "1. WHEN x happens, THE Thing_One SHALL do y.\n",
        "2. THE Unknown_Thing SHALL do y and SHALL do z.\n",
        "**Validates: Requirements 1.1, 9.9, nope**\n",
        "| 1 | a | b |\n",
        "| 99, x | a | b |\n",
        "- [ ] 1. Group\n",
        "- [ ] 1.1 Leaf\n",
        "- [ ]* 1.2 Write tests\n",
        "- [x] 01.2 Bad id\n",
        "- _Writes: src/a.py, ../b_\n",
        "- _Requirements: 1.1, zz_\n",
        "```json\n",
        "```\n",
        '{"waves": [{"id": 0, "tasks": ["1.1"]}]}\n',
        '{"waves": [{"id": 4, "tasks": [1]}]}\n',
        "Run /spec now.\n",
        "SECRET-MARKER-ZX81 漢字 “quoted” \t tab\n",
        "\n",
    ]
)
_NOISE = st.text(
    alphabet=st.characters(blacklist_categories=("Cs",), max_codepoint=0x2FFF), max_size=40
).map(lambda text: text + "\n")
_DOCUMENTS = st.lists(st.one_of(_FRAGMENTS, _FRAGMENTS, _FRAGMENTS, _NOISE), max_size=40).map("".join)


@settings(max_examples=300)
@given(markdown=_DOCUMENTS, ids=st.frozensets(st.sampled_from(["1.1", "1.2", "9.9", "x"]), max_size=4))
def test_any_document_gives_bounded_safe_deterministic_findings(
    markdown: str, ids: frozenset[str]
) -> None:
    results = (
        validate_requirements(markdown),
        validate_design(markdown, ids),
        validate_tasks(markdown, ids),
    )
    assert results == (
        validate_requirements(markdown),
        validate_design(markdown, ids),
        validate_tasks(markdown, ids),
    )
    assert extract_requirement_ids(markdown) == extract_requirement_ids(markdown)
    for findings in results:
        assert len(findings) <= MAX_FINDINGS
        assert len(set(findings)) == len(findings)
        for item in findings:
            assert type(item) is Finding
            assert item.code.isascii() and item.code.replace("_", "").isalnum()
            assert 1 <= len(item.location) <= MAX_LOCATION_CHARS
            assert 1 <= len(item.message) <= MAX_MESSAGE_CHARS
            # Nothing the document said reaches a finding.
            assert "SECRET-MARKER" not in item.location + item.message
            assert item.location.isascii() and item.message.isascii()


# --- Ghost_Result findings --------------------------------------------------------


def test_ghost_result_findings_wrap_the_codec() -> None:
    vectors = load_fixture("ghost-result-vectors.json")
    good = vectors["valid"][0]
    result, findings = ghost_result_findings(good["canonical"], GhostIdentity("requirements-1", None))
    assert findings == () and result is not None and result.run_id == "requirements-1"

    result, findings = ghost_result_findings(good["canonical"], GhostIdentity("design-1", None))
    assert result is None
    assert _pairs(findings) == [("ghost_result_identity_mismatch", "ghost_result")]

    for vector in vectors["invalid"]:
        result, findings = ghost_result_findings(vector["text"])
        assert result is None
        assert _pairs(findings) == [(f"ghost_result_{vector['code']}", "ghost_result")]
        assert vector["text"][:20] not in findings[0].message or not vector["text"]
