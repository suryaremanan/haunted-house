"""Pure mansion path-policy decisions over adapter-supplied facts.

Adapters inspect and canonicalize filesystem entries.  This module only
compares :class:`pathlib.PurePath` components and classifies those explicit
facts; it never reads the host filesystem.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePath
from typing import Literal, TypeAlias

__all__ = [
    "DecisionCode",
    "EntryKind",
    "PathDecision",
    "PathFact",
    "evaluate_mansion_path",
    "evaluate_root",
    "is_component_within",
]

EntryKind: TypeAlias = Literal["missing", "directory", "file", "symlink", "other"]
DecisionCode: TypeAlias = Literal[
    "ok", "unsafe_mansion_root", "symlink_escape", "mansion_conflict"
]


@dataclass(frozen=True, slots=True)
class PathFact:
    """A filesystem fact collected by an adapter.

    ``lexical`` is the configured or derived path before link resolution;
    ``canonical`` is the adapter-resolved path.  ``missing`` facts represent
    paths that may be created later and still carry the adapter's projected
    canonical location.
    """

    lexical: PurePath
    canonical: PurePath
    kind: EntryKind


@dataclass(frozen=True, slots=True)
class PathDecision:
    """The stable result of a path-policy evaluation."""

    accepted: bool
    code: DecisionCode


_OK = PathDecision(accepted=True, code="ok")
_UNSAFE_ROOT = PathDecision(accepted=False, code="unsafe_mansion_root")
_SYMLINK_ESCAPE = PathDecision(accepted=False, code="symlink_escape")
_MANSION_CONFLICT = PathDecision(accepted=False, code="mansion_conflict")


def is_component_within(parent: PurePath, child: PurePath) -> bool:
    """Return whether ``child`` is a strict component descendant of ``parent``.

    Both paths must be absolute and free of lexical parent references.
    Equality is deliberately false, and component comparison prevents prefix
    siblings such as ``/work/mansions-old`` from matching ``/work/mansions``.
    """

    if not (_is_absolute_clean(parent) and _is_absolute_clean(child)):
        return False
    if parent == child:
        return False
    try:
        return child.is_relative_to(parent)
    except (TypeError, ValueError):
        # Different PurePath flavours cannot share a component ancestry.
        return False


def evaluate_root(
    approved_roots: tuple[PathFact, ...], root_chain: tuple[PathFact, ...]
) -> PathDecision:
    """Classify a configured mansion root from explicit component facts.

    The final item in ``root_chain`` is the configured Mansion_Root.  Missing
    components are allowed because the filesystem adapter may create root
    containers later.  Every existing component must be a real directory,
    no component may be a symbolic link, and the final canonical root must be
    equal to or below at least one real canonical Approved_Root.
    """

    if not root_chain:
        return _UNSAFE_ROOT

    root = root_chain[-1]
    if not all(_valid_root_component(fact) for fact in root_chain):
        return _UNSAFE_ROOT

    for approved in approved_roots:
        if not _is_usable_approved_root(approved):
            continue
        if _component_at_or_within(approved.canonical, root.canonical):
            return _OK

    return _UNSAFE_ROOT


def evaluate_mansion_path(
    root: PathFact, target_chain: tuple[PathFact, ...]
) -> PathDecision:
    """Classify a derived mansion path and its required descendants.

    ``root`` must already describe an existing Safe_Mansion_Root.  The first
    target fact is the Mansion_Path; remaining facts are required descendants.
    Lexical paths must stay component-confined.  A canonical path outside the
    root (or equal to it) is classified as ``symlink_escape`` because adapters
    resolve links before supplying facts.  In-root links and non-directory
    entries are conflicts rather than safe directories.
    """

    if not _is_safe_existing_root(root):
        return _UNSAFE_ROOT
    if not target_chain:
        return _MANSION_CONFLICT

    target = target_chain[0]
    if not is_component_within(root.lexical, target.lexical):
        return _MANSION_CONFLICT

    for index, fact in enumerate(target_chain):
        if not (
            _is_absolute_clean(fact.lexical)
            and _is_absolute_clean(fact.canonical)
        ):
            return _MANSION_CONFLICT
        if index > 0 and not is_component_within(target.lexical, fact.lexical):
            return _MANSION_CONFLICT
        if not is_component_within(root.canonical, fact.canonical):
            return _SYMLINK_ESCAPE

    if any(fact.kind not in ("missing", "directory") for fact in target_chain):
        return _MANSION_CONFLICT

    return _OK


def _is_absolute_clean(path: object) -> bool:
    return (
        isinstance(path, PurePath)
        and path.is_absolute()
        and ".." not in path.parts
    )


def _component_at_or_within(parent: PurePath, child: PurePath) -> bool:
    return parent == child or is_component_within(parent, child)


def _valid_root_component(fact: PathFact) -> bool:
    return (
        _is_absolute_clean(fact.lexical)
        and _is_absolute_clean(fact.canonical)
        and fact.kind in ("missing", "directory")
    )


def _is_usable_approved_root(fact: PathFact) -> bool:
    return (
        _is_absolute_clean(fact.lexical)
        and _is_absolute_clean(fact.canonical)
        and fact.kind == "directory"
    )


def _is_safe_existing_root(fact: PathFact) -> bool:
    return (
        _is_absolute_clean(fact.lexical)
        and _is_absolute_clean(fact.canonical)
        and fact.kind == "directory"
    )
