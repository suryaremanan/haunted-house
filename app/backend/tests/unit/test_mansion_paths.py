"""Focused examples for the pure mansion path policy (task 2.3).

The generated confinement property belongs to task 2.4.  These examples pin
concrete component, root, and symlink classifications without filesystem I/O.
"""

from dataclasses import FrozenInstanceError
from pathlib import PurePosixPath

import pytest

from haunted_house.core.mansion_paths import (
    PathDecision,
    PathFact,
    evaluate_mansion_path,
    evaluate_root,
    is_component_within,
)

pytestmark = pytest.mark.core

APPROVED = PurePosixPath("/Users/operator/workspace")
ROOT = APPROVED / "haunted-house" / "mansions"
TARGET = ROOT / "weather-station"


def fact(path, kind="directory", *, canonical=None):
    lexical = PurePosixPath(path)
    return PathFact(
        lexical=lexical,
        canonical=PurePosixPath(canonical) if canonical is not None else lexical,
        kind=kind,
    )


def test_path_models_are_immutable():
    path_fact = fact(ROOT)
    decision = PathDecision(accepted=True, code="ok")

    with pytest.raises(FrozenInstanceError):
        path_fact.kind = "file"
    with pytest.raises(FrozenInstanceError):
        decision.accepted = False


def test_component_containment_is_strict_and_not_a_string_prefix_check():
    assert is_component_within(ROOT, TARGET)
    assert is_component_within(ROOT, TARGET / ".kiro" / "specs")

    assert not is_component_within(ROOT, ROOT)
    assert not is_component_within(ROOT, PurePosixPath(f"{ROOT}-old") / "demo")
    assert not is_component_within(ROOT, ROOT / ".." / "outside")
    assert not is_component_within(PurePosixPath("relative"), PurePosixPath("relative/demo"))


def test_root_accepts_missing_containers_below_a_real_approved_root():
    decision = evaluate_root(
        (fact(APPROVED),),
        (
            fact(APPROVED),
            fact(APPROVED / "haunted-house", "missing"),
            fact(ROOT, "missing"),
        ),
    )

    assert decision == PathDecision(accepted=True, code="ok")


@pytest.mark.parametrize(
    "approved_roots, root_chain",
    [
        ((fact(APPROVED),), (fact("relative/mansions"),)),
        ((fact(APPROVED),), (fact(APPROVED / ".." / "elsewhere"),)),
        ((fact(APPROVED),), (fact(ROOT, canonical="/private/mansions"),)),
        ((fact(APPROVED),), (fact(APPROVED), fact(ROOT, "symlink"))),
        ((fact(APPROVED),), (fact(APPROVED), fact(ROOT, "file"))),
        ((fact(APPROVED, "symlink"),), (fact(ROOT),)),
        ((), (fact(ROOT),)),
        ((fact(APPROVED),), ()),
    ],
)
def test_root_rejects_unsafe_configuration(approved_roots, root_chain):
    assert evaluate_root(approved_roots, root_chain) == PathDecision(
        accepted=False, code="unsafe_mansion_root"
    )


def test_mansion_path_accepts_missing_or_real_directories_strictly_below_root():
    decision = evaluate_mansion_path(
        fact(ROOT),
        (
            fact(TARGET, "missing"),
            fact(TARGET / ".kiro", "missing"),
            fact(TARGET / ".kiro" / "specs", "missing"),
            fact(TARGET / ".kiro" / "specs" / "weather-station", "missing"),
        ),
    )

    assert decision == PathDecision(accepted=True, code="ok")


def test_canonical_escape_from_target_or_descendant_is_a_symlink_escape():
    assert evaluate_mansion_path(
        fact(ROOT),
        (fact(TARGET, "symlink", canonical="/private/weather-station"),),
    ) == PathDecision(accepted=False, code="symlink_escape")

    assert evaluate_mansion_path(
        fact(ROOT),
        (
            fact(TARGET),
            fact(TARGET / ".kiro", canonical="/private/weather-station/.kiro"),
        ),
    ) == PathDecision(accepted=False, code="symlink_escape")


def test_in_root_symlinks_and_non_directories_are_mansion_conflicts():
    assert evaluate_mansion_path(
        fact(ROOT),
        (fact(TARGET, "symlink", canonical=ROOT / "shared-project"),),
    ) == PathDecision(accepted=False, code="mansion_conflict")

    assert evaluate_mansion_path(
        fact(ROOT),
        (fact(TARGET, "file"),),
    ) == PathDecision(accepted=False, code="mansion_conflict")


def test_mansion_path_rejects_equality_prefix_siblings_and_unsafe_roots():
    assert evaluate_mansion_path(fact(ROOT), (fact(ROOT),)) == PathDecision(
        accepted=False, code="mansion_conflict"
    )
    assert evaluate_mansion_path(
        fact(ROOT), (fact(PurePosixPath(f"{ROOT}-old") / "demo"),)
    ) == PathDecision(accepted=False, code="mansion_conflict")
    assert evaluate_mansion_path(
        fact(ROOT, "symlink"), (fact(TARGET),)
    ) == PathDecision(accepted=False, code="unsafe_mansion_root")
