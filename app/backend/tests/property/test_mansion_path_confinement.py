"""Property 3 for haunted_house.core.mansion_paths.

The reference model works on plain tuples of path components. It never calls
``PurePath.is_relative_to`` or any helper from the module under test, so a
string-prefix or equality mistake in the implementation cannot hide behind a
shared comparison.

Generated facts cover prefix siblings (``mansions`` versus ``mansions-old``),
root equality, lexical ``..``, relative paths, files and other non-directory
entries at every position, and symlink facts whose canonical location is
inside or outside the root.
"""

import copy
from pathlib import PurePosixPath

import pytest
from hypothesis import example, given
from hypothesis import strategies as st

from haunted_house.core.mansion_paths import (
    PathFact,
    evaluate_mansion_path,
    evaluate_root,
    is_component_within,
)

pytestmark = pytest.mark.core

# Feature: mansion-lifecycle, Property 3: Every accepted path remains confined

KINDS = ("missing", "directory", "file", "symlink", "other")
SEGMENTS = ("home", "op", "workspace", "workspaces", "haunted-house", "mansions",
            "mansions-old", "mansion", "a", "ab", "a-b", "outside", "tmp")
NAME = "weather-station"


# --- Reference component model ---------------------------------------------


def parts_of(path: PurePosixPath) -> tuple[str, ...]:
    return tuple(path.parts)


def ref_clean_absolute(path: PurePosixPath) -> bool:
    parts = parts_of(path)
    return len(parts) >= 1 and parts[0] == "/" and ".." not in parts


def ref_strict_descendant(parent: PurePosixPath, child: PurePosixPath) -> bool:
    if not (ref_clean_absolute(parent) and ref_clean_absolute(child)):
        return False
    parent_parts, child_parts = parts_of(parent), parts_of(child)
    return (
        len(child_parts) > len(parent_parts)
        and child_parts[: len(parent_parts)] == parent_parts
    )


def ref_at_or_below(parent: PurePosixPath, child: PurePosixPath) -> bool:
    return (
        ref_clean_absolute(parent)
        and ref_clean_absolute(child)
        and (
            parts_of(parent) == parts_of(child)
            or ref_strict_descendant(parent, child)
        )
    )


def ref_root_accepted(approved_roots, root_chain) -> bool:
    if len(root_chain) == 0:
        return False
    for fact in root_chain:
        if not ref_clean_absolute(fact.lexical):
            return False
        if not ref_clean_absolute(fact.canonical):
            return False
        if fact.kind == "symlink" or fact.kind == "file" or fact.kind == "other":
            return False
    root = root_chain[-1]
    for approved in approved_roots:
        if approved.kind != "directory":
            continue
        if not ref_clean_absolute(approved.lexical):
            continue
        if ref_at_or_below(approved.canonical, root.canonical):
            return True
    return False


def ref_mansion_accepted(root, target_chain) -> bool:
    if root.kind != "directory":
        return False
    if not (ref_clean_absolute(root.lexical) and ref_clean_absolute(root.canonical)):
        return False
    if len(target_chain) == 0:
        return False
    target = target_chain[0]
    if not ref_strict_descendant(root.lexical, target.lexical):
        return False
    for position, fact in enumerate(target_chain):
        if fact.kind not in ("missing", "directory"):
            return False
        if not ref_clean_absolute(fact.lexical):
            return False
        if position > 0 and not ref_strict_descendant(target.lexical, fact.lexical):
            return False
        if not ref_strict_descendant(root.canonical, fact.canonical):
            return False
    return True


# --- Strategies -------------------------------------------------------------

segment = st.sampled_from(SEGMENTS)
clean_parts = st.lists(segment, min_size=0, max_size=4)


def absolute(parts) -> PurePosixPath:
    return PurePosixPath("/", *parts)


clean_paths = clean_parts.map(absolute)
dirty_paths = st.one_of(
    # Relative.
    st.lists(segment, min_size=1, max_size=3).map(lambda parts: PurePosixPath(*parts)),
    # Lexical parent reference somewhere in the path.
    st.tuples(clean_parts, clean_parts).map(
        lambda pair: PurePosixPath("/", *pair[0], "..", *pair[1])
    ),
    st.just(PurePosixPath("..")),
    st.just(PurePosixPath(".")),
)
any_paths = st.one_of(clean_paths, clean_paths, clean_paths, dirty_paths)
kinds = st.sampled_from(KINDS)
mostly_directory = st.sampled_from(
    ("directory", "directory", "directory", "missing", "file", "symlink", "other")
)
mostly_creatable = st.sampled_from(
    ("directory", "directory", "missing", "missing", "file", "symlink", "other")
)


@st.composite
def related_path(draw, base: PurePosixPath) -> PurePosixPath:
    """A path chosen to sit near ``base``: below, equal, sibling, or elsewhere."""
    choice = draw(st.integers(min_value=0, max_value=7))
    extra = draw(st.lists(segment, min_size=1, max_size=3))
    if choice <= 2:
        return base.joinpath(*extra)
    if choice == 3:
        return base
    if choice == 4 and len(base.parts) > 1:
        # Prefix sibling: same string prefix, different final component.
        return base.with_name(base.name + draw(st.sampled_from(["-old", "2", "x"])))
    if choice == 5 and len(base.parts) > 1:
        return base.parent
    if choice == 6:
        return base.joinpath("..", *extra)
    return draw(any_paths)


@st.composite
def fact_near(draw, lexical_base, canonical_base, kind_strategy) -> PathFact:
    lexical = draw(related_path(lexical_base))
    if draw(st.integers(min_value=0, max_value=3)) == 0:
        canonical = draw(related_path(canonical_base))
    else:
        # The usual case: nothing was a link, so the canonical location has
        # the same tail below the canonical base.
        try:
            tail = lexical.relative_to(lexical_base).parts
            canonical = canonical_base.joinpath(*tail)
        except ValueError:
            canonical = draw(related_path(canonical_base))
    return PathFact(lexical=lexical, canonical=canonical, kind=draw(kind_strategy))


@st.composite
def mutated_fact(draw, fact: PathFact, lexical_base, canonical_base) -> PathFact:
    """Apply one generated defect (or harmless change) to a fact."""
    choice = draw(st.integers(min_value=0, max_value=5))
    if choice == 0:
        return PathFact(fact.lexical, fact.canonical, draw(kinds))
    if choice >= 4:
        # Prefix sibling of the base: ``mansions-old/...`` beside ``mansions``.
        def sibling(path: PurePosixPath, of: PurePosixPath) -> PurePosixPath:
            try:
                tail = path.relative_to(of).parts
            except ValueError:
                tail = ()
            if len(of.parts) < 2:
                return path
            return of.with_name(of.name + "-old").joinpath(*tail)

        if choice == 4:
            return PathFact(
                fact.lexical, sibling(fact.canonical, canonical_base), fact.kind
            )
        return PathFact(
            sibling(fact.lexical, lexical_base),
            sibling(fact.canonical, canonical_base),
            fact.kind,
        )
    if choice == 1:
        return PathFact(
            fact.lexical, draw(related_path(canonical_base)), draw(mostly_creatable)
        )
    if choice == 2:
        return PathFact(draw(related_path(lexical_base)), fact.canonical, fact.kind)
    return draw(fact_near(lexical_base, canonical_base, kinds))


def component_chain(path: PurePosixPath) -> list[PurePosixPath]:
    components = [PurePosixPath("/")]
    for part in path.parts[1:]:
        components.append(components[-1] / part)
    return components


@st.composite
def root_cases(draw):
    """A safe approved-root/root-chain pair with zero to two mutations."""
    approved_path = absolute(draw(st.lists(segment, min_size=1, max_size=3)))
    root_lexical = approved_path.joinpath(
        *draw(st.lists(segment, min_size=0, max_size=3))
    )
    approved_roots = [
        PathFact(lexical=approved_path, canonical=approved_path, kind="directory")
    ]
    for _ in range(draw(st.integers(min_value=0, max_value=2))):
        other = draw(any_paths)
        approved_roots.append(
            PathFact(lexical=other, canonical=other, kind=draw(mostly_directory))
        )
    chain = [
        PathFact(
            lexical=component,
            canonical=component,
            kind=draw(st.sampled_from(("directory", "directory", "missing"))),
        )
        for component in component_chain(root_lexical)
    ]

    for _ in range(draw(st.sampled_from((0, 0, 1, 1, 2)))):
        where = draw(st.integers(min_value=0, max_value=5))
        if where == 0 and approved_roots:
            index = draw(st.integers(min_value=0, max_value=len(approved_roots) - 1))
            approved_roots[index] = draw(
                mutated_fact(approved_roots[index], approved_path, approved_path)
            )
        elif where == 1:
            approved_roots = approved_roots[1:]
        elif where == 2:
            chain = chain[: draw(st.integers(min_value=0, max_value=len(chain)))]
        elif chain:
            index = draw(st.integers(min_value=0, max_value=len(chain) - 1))
            chain[index] = draw(
                mutated_fact(chain[index], root_lexical, approved_path)
            )
    return tuple(draw(st.permutations(approved_roots))), tuple(chain)


@st.composite
def mansion_cases(draw):
    """A safe root and required-entry chain with zero to two mutations."""
    root_lexical = absolute(draw(st.lists(segment, min_size=1, max_size=4)))
    # The canonical root may differ from the lexical one (a resolved link
    # above an approved root); descendants then live below the canonical one.
    root_canonical = draw(
        st.one_of(
            st.just(root_lexical),
            st.just(root_lexical),
            st.lists(segment, min_size=1, max_size=3).map(absolute),
        )
    )
    root = PathFact(lexical=root_lexical, canonical=root_canonical, kind="directory")

    name = draw(st.sampled_from((NAME, "a", "mansions", "a-b")))
    tails = ((), (".kiro",), (".kiro", "specs"), (".kiro", "specs", name))
    count = draw(st.sampled_from((4, 4, 4, 1, 2, 3)))
    chain = [
        PathFact(
            lexical=root_lexical.joinpath(name, *tail),
            canonical=root_canonical.joinpath(name, *tail),
            kind=draw(st.sampled_from(("directory", "missing"))),
        )
        for tail in tails[:count]
    ]

    for _ in range(draw(st.sampled_from((0, 0, 1, 1, 2)))):
        where = draw(st.integers(min_value=0, max_value=5))
        if where == 0:
            root = draw(mutated_fact(root, root_lexical, root_canonical))
        elif where == 1:
            chain = chain[: draw(st.integers(min_value=0, max_value=len(chain)))]
        elif chain:
            index = draw(st.integers(min_value=0, max_value=len(chain) - 1))
            chain[index] = draw(
                mutated_fact(chain[index], root_lexical, root_canonical)
            )
    return root, tuple(chain)


def well_formed_tree(root_path: PurePosixPath, kinds_for_chain=("missing",) * 4):
    target = root_path / NAME
    paths = (
        target,
        target / ".kiro",
        target / ".kiro" / "specs",
        target / ".kiro" / "specs" / NAME,
    )
    return tuple(
        PathFact(lexical=path, canonical=path, kind=kind)
        for path, kind in zip(paths, kinds_for_chain, strict=True)
    )


# --- Properties -------------------------------------------------------------


@given(parent=any_paths, data=st.data())
@example(parent=PurePosixPath("/work/mansions"), data=None)
def test_component_containment_matches_the_reference_model(parent, data):
    if data is None:
        children = [
            PurePosixPath("/work/mansions-old"),
            PurePosixPath("/work/mansions-old/x"),
            PurePosixPath("/work/mansions"),
            PurePosixPath("/work/mansions/x"),
            PurePosixPath("/work/mansions/../x"),
            PurePosixPath("/work"),
            PurePosixPath("work/mansions/x"),
        ]
    else:
        children = [data.draw(related_path(parent))]

    for child in children:
        assert is_component_within(parent, child) is ref_strict_descendant(
            parent, child
        )
        # Strictness: nothing contains itself, and containment is one-way.
        assert is_component_within(child, child) is False
        if is_component_within(parent, child):
            assert is_component_within(child, parent) is False
            assert str(child).startswith(str(parent))
            assert len(child.parts) > len(parent.parts)


@given(case=root_cases())
def test_root_is_accepted_only_as_real_directories_under_an_approved_root(case):
    approved_roots, root_chain = case
    before = copy.deepcopy((approved_roots, root_chain))

    decision = evaluate_root(approved_roots, root_chain)

    assert decision.accepted is ref_root_accepted(approved_roots, root_chain)
    assert (decision.code == "ok") is decision.accepted
    if not decision.accepted:
        assert decision.code == "unsafe_mansion_root"
    else:
        # Spelled out, independent of the reference function above.
        assert all(fact.kind in ("missing", "directory") for fact in root_chain)
        assert all(".." not in fact.lexical.parts for fact in root_chain)
        root = root_chain[-1]
        assert any(
            approved.kind == "directory"
            and root.canonical.parts[: len(approved.canonical.parts)]
            == approved.canonical.parts
            for approved in approved_roots
        )
    # The policy is a pure decision: every input fact is unchanged.
    assert (approved_roots, root_chain) == before


@given(case=mansion_cases())
def test_mansion_path_is_accepted_only_when_strictly_confined(case):
    root, target_chain = case
    before = copy.deepcopy((root, target_chain))

    decision = evaluate_mansion_path(root, target_chain)

    assert decision.accepted is ref_mansion_accepted(root, target_chain)
    assert (decision.code == "ok") is decision.accepted
    assert decision.code in (
        "ok",
        "unsafe_mansion_root",
        "symlink_escape",
        "mansion_conflict",
    )
    if decision.accepted:
        root_parts = root.canonical.parts
        for fact in target_chain:
            assert fact.kind in ("missing", "directory")
            assert fact.canonical.parts[: len(root_parts)] == root_parts
            assert len(fact.canonical.parts) > len(root_parts)
            assert ".." not in fact.lexical.parts
        assert target_chain[0].lexical.parts[: len(root.lexical.parts)] == (
            root.lexical.parts
        )
        assert target_chain[0].lexical != root.lexical
    assert (root, target_chain) == before


@given(
    root_parts=st.lists(segment, min_size=1, max_size=4),
    kinds_for_chain=st.lists(
        st.sampled_from(("missing", "directory")), min_size=4, max_size=4
    ),
    position=st.integers(min_value=0, max_value=3),
    bad_kind=st.sampled_from(("file", "symlink", "other")),
    escape=st.sampled_from(("outside", "equal", "sibling", "parent")),
)
def test_each_single_defect_in_an_otherwise_safe_tree_is_rejected(
    root_parts, kinds_for_chain, position, bad_kind, escape
):
    root_path = absolute(root_parts)
    root = PathFact(lexical=root_path, canonical=root_path, kind="directory")
    chain = well_formed_tree(root_path, tuple(kinds_for_chain))

    assert evaluate_mansion_path(root, chain).code == "ok"

    # A file, in-root symlink, or other entry at any required position.
    wrong_kind = list(chain)
    wrong_kind[position] = PathFact(
        lexical=chain[position].lexical,
        canonical=chain[position].canonical,
        kind=bad_kind,
    )
    assert evaluate_mansion_path(root, tuple(wrong_kind)).code == "mansion_conflict"

    # A symlink at any required position whose target leaves the root.
    escaped_to = {
        "outside": PurePosixPath("/elsewhere/data"),
        "equal": root_path,
        "sibling": root_path.with_name(root_path.name + "-old") / NAME,
        "parent": root_path.parent,
    }[escape]
    escaping = list(chain)
    escaping[position] = PathFact(
        lexical=chain[position].lexical, canonical=escaped_to, kind="symlink"
    )
    escaped = evaluate_mansion_path(root, tuple(escaping))
    assert escaped.accepted is False
    assert escaped.code == "symlink_escape"

    # The same chain is refused for every root that is not a real directory.
    for root_kind in ("missing", "file", "symlink", "other"):
        unsafe = PathFact(lexical=root_path, canonical=root_path, kind=root_kind)
        assert evaluate_mansion_path(unsafe, chain).code == "unsafe_mansion_root"

    # A target equal to the root, or a prefix sibling of it, is never inside.
    equal_target = (PathFact(lexical=root_path, canonical=root_path, kind="directory"),)
    assert evaluate_mansion_path(root, equal_target).accepted is False
    sibling_root = root_path.with_name(root_path.name + "-old")
    sibling_chain = well_formed_tree(sibling_root, tuple(kinds_for_chain))
    assert evaluate_mansion_path(root, sibling_chain).accepted is False


@given(
    approved_parts=st.lists(segment, min_size=1, max_size=3),
    below=st.lists(segment, min_size=0, max_size=3),
    chain_kinds=st.data(),
)
def test_safe_root_chain_then_safe_tree_is_accepted_and_one_link_breaks_it(
    approved_parts, below, chain_kinds
):
    approved_path = absolute(approved_parts)
    root_path = approved_path.joinpath(*below)
    approved = (PathFact(lexical=approved_path, canonical=approved_path, kind="directory"),)

    components = [PurePosixPath("/")]
    for part in root_path.parts[1:]:
        components.append(components[-1] / part)
    # Components at or above the approved root exist; lower ones may be absent.
    chain = []
    for component in components:
        must_exist = len(component.parts) <= len(approved_path.parts)
        kind = (
            "directory"
            if must_exist
            else chain_kinds.draw(st.sampled_from(("directory", "missing")))
        )
        chain.append(PathFact(lexical=component, canonical=component, kind=kind))

    assert evaluate_root(approved, tuple(chain)).code == "ok"

    index = chain_kinds.draw(st.integers(min_value=0, max_value=len(chain) - 1))
    for bad_kind in ("symlink", "file", "other"):
        broken = list(chain)
        broken[index] = PathFact(
            lexical=chain[index].lexical, canonical=chain[index].canonical, kind=bad_kind
        )
        assert evaluate_root(approved, tuple(broken)).code == "unsafe_mansion_root"

    # A root whose canonical location is a prefix sibling of the approved root
    # or outside it is refused even when every component is a real directory.
    for elsewhere in (
        approved_path.with_name(approved_path.name + "-old") / "mansions",
        PurePosixPath("/elsewhere"),
    ):
        moved = list(chain)
        moved[-1] = PathFact(
            lexical=chain[-1].lexical, canonical=elsewhere, kind=chain[-1].kind
        )
        if elsewhere.parts[: len(approved_path.parts)] != approved_path.parts:
            assert evaluate_root(approved, tuple(moved)).accepted is False

    assert evaluate_root((), tuple(chain)).accepted is False
    assert evaluate_root(approved, ()).accepted is False
