"""Shared Hypothesis strategies and builders for the Room Ghosts core tests.

Everything is built through the real codecs' own models, so a generated value
is valid by construction or the model refuses it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from hypothesis import strategies as st

from haunted_house.core.ghost_result import (
    MAX_SUMMARY_CHARS,
    ArtifactRef,
    GhostResult,
    GhostStatus,
)
from haunted_house.core.task_plan import LeafTask, TaskPlan

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES = REPO_ROOT / "fixtures" / "room-ghosts"


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def read_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# --- Ghost_Result -------------------------------------------------------------

SHA256 = st.text(alphabet="0123456789abcdef", min_size=64, max_size=64)
RUN_IDS = st.one_of(
    st.sampled_from(["requirements-1", "design-2", "tasks-1", "implementation-7"]),
    st.from_regex(r"[A-Za-z0-9][A-Za-z0-9._:@-]{0,24}", fullmatch=True),
)
TASK_IDS = st.builds(
    lambda major, minor: f"{major}.{minor}",
    st.integers(min_value=1, max_value=40),
    st.integers(min_value=1, max_value=40),
)
REASON_CODES = st.from_regex(r"[a-z][a-z0-9_]{0,20}", fullmatch=True)

# Printable text in several scripts, quotes and backslashes included, with no
# character the codec calls undisplayable and nothing shaped like a secret.
_WORDS = st.text(
    alphabet=st.sampled_from(list("abcdefgXYZ0189 .,;()[]{}\"'\\<>#*`~é漢字ßЖ✓🙂-")),
    min_size=1,
    max_size=60,
)
SUMMARIES = _WORDS.map(str.strip).filter(lambda text: 1 <= len(text) <= MAX_SUMMARY_CHARS)

_SEGMENT = st.text(alphabet="abcxyz019_-é", min_size=1, max_size=6)
PLAIN_PATHS = st.builds(
    lambda folders, name, suffix: "/".join([*folders, name + suffix]),
    st.lists(_SEGMENT, min_size=0, max_size=3),
    _SEGMENT,
    st.sampled_from([".py", ".md", ".ts", ".txt", ""]),
)
ARTIFACTS = st.lists(
    st.builds(ArtifactRef, path=PLAIN_PATHS, sha256=SHA256),
    min_size=0,
    max_size=5,
    unique_by=lambda item: item.path.casefold(),
).map(tuple)


@st.composite
def ghost_results(draw: st.DrawFn) -> GhostResult:
    status = draw(st.sampled_from(list(GhostStatus)))
    return GhostResult(
        schema_version=1,
        run_id=draw(RUN_IDS),
        status=status,
        summary=draw(SUMMARIES),
        artifacts=draw(ARTIFACTS),
        task_id=draw(st.none() | TASK_IDS),
        reason_code=None if status is GhostStatus.READY else draw(REASON_CODES),
    )


# --- Task_Plan ----------------------------------------------------------------

REQUIREMENT_IDS = tuple(f"{major}.{minor}" for major in range(1, 5) for minor in range(1, 4))
TITLES = st.text(
    alphabet=st.sampled_from(list("abcdefgXYZ019 .,:;()[]`*_#-/é漢✓")),
    min_size=1,
    max_size=40,
).map(str.strip).filter(bool)


@st.composite
def task_plans(draw: st.DrawFn, *, min_leaves: int = 1, max_leaves: int = 9) -> TaskPlan:
    """A valid plan: ascending ids, private claims, every incomplete leaf in a wave."""

    count = draw(st.integers(min_value=min_leaves, max_value=max_leaves))
    leaves: list[LeafTask] = []
    major, minor = 1, 0
    for index in range(count):
        if index and draw(st.booleans()):
            major, minor = major + draw(st.integers(min_value=1, max_value=2)), 0
        minor += draw(st.integers(min_value=1, max_value=2))
        task_id = f"{major}.{minor}"
        # Each leaf owns its own folder, so no two claims can overlap.
        folder = f"src/t{major}_{minor}"
        extra = draw(st.sampled_from(["", "*.py", "**", "sub/*.md"]))
        writes = (f"{folder}/main.py",) if not extra else (f"{folder}/main.py", f"{folder}/x/{extra}")
        leaves.append(
            LeafTask(
                task_id=task_id,
                title=draw(TITLES),
                optional=draw(st.booleans()),
                complete=draw(st.booleans()),
                requirements=tuple(
                    draw(
                        st.lists(
                            st.sampled_from(REQUIREMENT_IDS), min_size=1, max_size=3, unique=True
                        )
                    )
                ),
                writes=writes,
                document_index=index,
            )
        )
    wave_count = draw(st.integers(min_value=1, max_value=4))
    buckets: list[list[str]] = [[] for _ in range(wave_count)]
    for leaf in leaves:
        # A complete leaf may stay in the graph or be left out of it.
        if leaf.complete and draw(st.booleans()):
            continue
        buckets[draw(st.integers(min_value=0, max_value=wave_count - 1))].append(leaf.task_id)
    waves = tuple(tuple(bucket) for bucket in buckets if bucket)
    return TaskPlan(leaves=tuple(leaves), waves=waves)


def covered_requirements(plan: TaskPlan) -> frozenset[str]:
    return frozenset(ref for leaf in plan.leaves for ref in leaf.requirements)


# --- prompts ------------------------------------------------------------------

GOLDEN_SPEC = "guest-book"
SHA_A, SHA_B, SHA_C = "a" * 64, "b" * 64, "c" * 64


def upstream_for(role: str, spec_name: str = GOLDEN_SPEC) -> tuple[Any, ...]:
    """The exact approved upstream documents a role's prompt must be given."""

    from haunted_house.core.prompts import UpstreamArtifact

    documents = {
        "archivist": (),
        "draughtsman": ("requirements.md",),
        "foreman": ("requirements.md", "design.md"),
        "tinker": ("requirements.md", "design.md", "tasks.md"),
        "medium": ("requirements.md", "design.md", "tasks.md"),
    }[role]
    return tuple(
        UpstreamArtifact(f".kiro/specs/{spec_name}/{document}", digest)
        for document, digest in zip(documents, (SHA_A, SHA_B, SHA_C), strict=False)
    )


def golden_prompts() -> dict[str, str]:
    """Each role prompt for the guest-book fixtures, keyed by golden file name."""

    from haunted_house.core.findings import Finding
    from haunted_house.core.prompts import (
        ExpectedRevision,
        MediumAssignment,
        PhaseAssignment,
        RevisionAssignment,
        TinkerAssignment,
        render_medium_prompt,
        render_phase_prompt,
        render_revision_prompt,
        render_tinker_prompt,
    )
    from haunted_house.core.task_plan import parse_task_plan

    brief = (
        "Visitors leave a short signed message; the host reads them in order.\n"
        "Keep it small — “no accounts”, no moderation in the MVP."
    )
    plan = parse_task_plan(read_fixture("task-plan-valid.md"))
    requirement_ids = frozenset(load_fixture("task-plan-valid.json")["requirement_ids"])
    return {
        "archivist-phase.txt": render_phase_prompt(
            PhaseAssignment("requirements-1", "archivist", GOLDEN_SPEC, brief)
        ),
        "draughtsman-phase.txt": render_phase_prompt(
            PhaseAssignment(
                "design-1", "draughtsman", GOLDEN_SPEC, brief, upstream_for("draughtsman")
            )
        ),
        "foreman-phase.txt": render_phase_prompt(
            PhaseAssignment(
                "tasks-1",
                "foreman",
                GOLDEN_SPEC,
                brief,
                upstream_for("foreman"),
                current_revision=2,
                current_sha256=SHA_C,
            )
        ),
        "draughtsman-revision.txt": render_revision_prompt(
            RevisionAssignment(
                "design-1",
                "draughtsman",
                GOLDEN_SPEC,
                current_revision=3,
                current_sha256=SHA_C,
                feedback="Property 2 should also cover a name of only spaces.",
                findings=(
                    Finding(
                        "property_not_universal",
                        "property:2",
                        "A property must be a universal statement ('For any ...').",
                    ),
                ),
                upstream=upstream_for("draughtsman"),
            )
        ),
        "tinker-task.txt": render_tinker_prompt(
            TinkerAssignment(
                run_id="implementation-4",
                spec_name=GOLDEN_SPEC,
                plan=plan,
                selected_task_ids=("2.1",),
                claim_id="claim-4",
                attempt=1,
                requirement_ids=requirement_ids,
                upstream=upstream_for("tinker"),
                expected_revisions=(
                    ExpectedRevision("src/guestbook/render.py", None),
                    ExpectedRevision("src/guestbook/templates/page.html", SHA_A),
                ),
                dependency_results=(ArtifactRef("src/guestbook/store.py", SHA_B),),
            )
        ),
        "medium-review.txt": render_medium_prompt(
            MediumAssignment(
                run_id="review-1",
                spec_name=GOLDEN_SPEC,
                cycle=1,
                requirement_ids=requirement_ids,
                upstream=upstream_for("medium"),
                changed_files=(
                    ArtifactRef("src/guestbook/store.py", SHA_B),
                    ArtifactRef("src/guestbook/render.py", SHA_C),
                ),
            )
        ),
    }
