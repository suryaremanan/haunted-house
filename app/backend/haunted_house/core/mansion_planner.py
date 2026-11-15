"""Pure project classification and mansion-create transition planning.

The filesystem adapter supplies immutable entry facts.  This module only
classifies those facts and models the state changes a successful create may
make; it never reads a path, mutates a filesystem, or persists metadata.

Names passed to the model are already validated Mansion_Name values.  The
service owns the validation-before-path-access boundary.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import PurePath, PurePosixPath
from typing import Literal, TypeAlias

from haunted_house.core.mansion_names import is_valid_mansion_name

__all__ = [
    "INVALID_MANSION_NAME",
    "MANSION_CONFLICT",
    "MANSION_MISSING",
    "MANSION_NOT_REGISTERED",
    "CreateDirectory",
    "CreateOutcome",
    "CreatePlan",
    "EntryFact",
    "EntryKind",
    "ModelCreateRequest",
    "ModelCreateResponse",
    "ModelExecution",
    "ModelMansionRecord",
    "ModelRequestResult",
    "ModelResult",
    "ModelState",
    "ProjectSnapshot",
    "ProjectStatus",
    "RequiredEntryStatus",
    "apply_model_create",
    "apply_model_create_request",
    "apply_model_open_request",
    "classify_project",
    "classify_required_entry",
    "execute_same_name_creates",
    "minimal_project_tree_operations",
    "plan_create",
]

MANSION_CONFLICT = "mansion_conflict"
INVALID_MANSION_NAME = "invalid_mansion_name"
MANSION_MISSING = "mansion_missing"
MANSION_NOT_REGISTERED = "mansion_not_registered"


class EntryKind(StrEnum):
    """Observed kind of one project-tree entry."""

    MISSING = "missing"
    DIRECTORY = "directory"
    FILE = "file"
    SYMLINK = "symlink"
    OTHER = "other"


class RequiredEntryStatus(StrEnum):
    """Compatibility of one required descendant with its mansion target."""

    READY = "ready"
    MISSING = "missing"
    CONFLICT = "conflict"


class ProjectStatus(StrEnum):
    READY = "ready"
    MISSING = "missing"
    CONFLICT = "conflict"


class CreateOutcome(StrEnum):
    CREATED = "created"
    EXISTING_COMPATIBLE = "existing_compatible"


@dataclass(frozen=True, slots=True)
class EntryFact:
    """An adapter-observed entry without any live filesystem authority.

    ``lexical`` is the path that was inspected and ``canonical`` is the
    adapter-resolved location.  Missing entries still carry the canonical
    location at which they would be created.  ``opaque_content`` lets model
    tests retain uninterpreted bytes for pre-existing entries; the planner
    never reads or rewrites it.
    """

    lexical: PurePath
    canonical: PurePath | None
    kind: EntryKind
    opaque_content: bytes = b""


@dataclass(frozen=True, slots=True)
class ProjectSnapshot:
    """Facts for the four required entries and all additional project data."""

    target: EntryFact
    kiro: EntryFact
    specs: EntryFact
    project_spec: EntryFact
    extra_entries: tuple[EntryFact, ...] = ()

    @property
    def required_descendants(self) -> tuple[EntryFact, EntryFact, EntryFact]:
        return (self.kiro, self.specs, self.project_spec)


CreateAction: TypeAlias = Literal[
    "create_tree", "register_existing", "return_existing", "reject"
]


@dataclass(frozen=True, slots=True)
class CreatePlan:
    action: CreateAction
    error_code: str | None = None


@dataclass(frozen=True, slots=True)
class CreateDirectory:
    """One root-relative directory operation in a Minimal_Project_Tree."""

    relative_path: PurePosixPath
    action: Literal["create_directory"] = "create_directory"


@dataclass(frozen=True, order=True, slots=True)
class ModelMansionRecord:
    """The registry fields relevant to pure create-model transitions."""

    name: str
    project_spec: str
    relative_path: str
    origin: Literal["created", "existing"]


@dataclass(frozen=True, slots=True)
class ModelState:
    """Pure state for one mansion target plus the app-owned registry."""

    project: ProjectSnapshot
    registry: tuple[ModelMansionRecord, ...] = ()


@dataclass(frozen=True, slots=True)
class ModelResult:
    """One create transition and the operations it authorizes."""

    state: ModelState
    plan: CreatePlan
    outcome: CreateOutcome | None
    record: ModelMansionRecord | None
    operations: tuple[CreateDirectory, ...] = ()


@dataclass(frozen=True, slots=True)
class ModelCreateRequest:
    """A labelled same-name request used to model arbitrary scheduling."""

    request_id: str
    name: str


@dataclass(frozen=True, slots=True)
class ModelCreateResponse:
    request_id: str
    result: ModelResult


@dataclass(frozen=True, slots=True)
class ModelExecution:
    """The result of serializing an arbitrary same-name request order."""

    state: ModelState
    responses: tuple[ModelCreateResponse, ...]


def classify_required_entry(
    target: EntryFact, entry: EntryFact
) -> RequiredEntryStatus:
    """Classify a required descendant without inspecting the filesystem.

    A real directory is compatible only when its canonical location is a
    strict component descendant of the target.  Symlinks never qualify, even
    when their destination is inside the target.
    """

    if not _is_strict_descendant(target.canonical, entry.canonical):
        return RequiredEntryStatus.CONFLICT
    if entry.kind == EntryKind.MISSING:
        return RequiredEntryStatus.MISSING
    if entry.kind == EntryKind.DIRECTORY:
        return RequiredEntryStatus.READY
    return RequiredEntryStatus.CONFLICT


def classify_project(snapshot: ProjectSnapshot) -> ProjectStatus:
    """Classify an absent, compatible, or conflicting mansion project.

    Extra entries are deliberately ignored for compatibility after the four
    required entries pass.  An absent target is creatable only when every
    required descendant is also absent and no opaque extra entry exists; this
    prevents an inconsistent model snapshot from authorizing replacement of
    represented user data.
    """

    target = snapshot.target
    if target.kind == EntryKind.MISSING:
        descendants = tuple(
            classify_required_entry(target, entry)
            for entry in snapshot.required_descendants
        )
        if (
            target.canonical is not None
            and not snapshot.extra_entries
            and all(
                status == RequiredEntryStatus.MISSING
                for status in descendants
            )
        ):
            return ProjectStatus.MISSING
        return ProjectStatus.CONFLICT

    if target.kind != EntryKind.DIRECTORY or target.canonical is None:
        return ProjectStatus.CONFLICT

    if all(
        classify_required_entry(target, entry) == RequiredEntryStatus.READY
        for entry in snapshot.required_descendants
    ):
        return ProjectStatus.READY
    return ProjectStatus.CONFLICT


def plan_create(snapshot: ProjectSnapshot, registered: bool) -> CreatePlan:
    """Choose create, adopt, idempotent return, or non-destructive refusal."""

    status = classify_project(snapshot)
    if status == ProjectStatus.MISSING:
        return CreatePlan(action="create_tree")
    if status == ProjectStatus.READY:
        return CreatePlan(
            action="return_existing" if registered else "register_existing"
        )
    return CreatePlan(action="reject", error_code=MANSION_CONFLICT)


def minimal_project_tree_operations(
    name: str,
) -> tuple[CreateDirectory, CreateDirectory, CreateDirectory, CreateDirectory]:
    """Return the exact directory-only operations for a new mansion.

    ``name`` has already passed Mansion_Name validation.  Paths are relative
    to the configured safe root and use the portable project-tree spelling.
    """

    target = PurePosixPath(name)
    kiro = target / ".kiro"
    specs = kiro / "specs"
    return (
        CreateDirectory(target),
        CreateDirectory(kiro),
        CreateDirectory(specs),
        CreateDirectory(specs / name),
    )


def apply_model_create(state: ModelState, name: str) -> ModelResult:
    """Apply one already-validated create request to immutable model state.

    The transition changes only missing required entries and the matching
    registry record.  Compatible and conflicting project snapshots, including
    every opaque extra entry, are returned unchanged.
    """

    existing_record = _record_for(state.registry, name)
    plan = plan_create(state.project, registered=existing_record is not None)

    if plan.action == "reject":
        return ModelResult(
            state=state,
            plan=plan,
            outcome=None,
            record=None,
        )

    if plan.action == "return_existing":
        return ModelResult(
            state=state,
            plan=plan,
            outcome=CreateOutcome.EXISTING_COMPATIBLE,
            record=existing_record,
        )

    if plan.action == "register_existing":
        record = ModelMansionRecord(
            name=name,
            project_spec=name,
            relative_path=name,
            origin="existing",
        )
        next_state = ModelState(
            project=state.project,
            registry=_upsert_record(state.registry, record),
        )
        return ModelResult(
            state=next_state,
            plan=plan,
            outcome=CreateOutcome.EXISTING_COMPATIBLE,
            record=record,
        )

    operations = minimal_project_tree_operations(name)
    record = existing_record or ModelMansionRecord(
        name=name,
        project_spec=name,
        relative_path=name,
        origin="created",
    )
    next_state = ModelState(
        project=_created_snapshot(state.project),
        registry=_upsert_record(state.registry, record),
    )
    return ModelResult(
        state=next_state,
        plan=plan,
        outcome=CreateOutcome.CREATED,
        record=record,
        operations=operations,
    )


@dataclass(frozen=True, slots=True)
class ModelRequestResult:
    """One create or open request applied to the model, name check included.

    ``error_code`` is ``None`` exactly when the request succeeded.  ``state``
    is the state after the request; every refusal returns the input state
    object itself.  ``result`` carries the create transition when one ran.
    """

    state: ModelState
    error_code: str | None
    result: ModelResult | None = None
    record: ModelMansionRecord | None = None


def apply_model_create_request(state: ModelState, name: object) -> ModelRequestResult:
    """Model a create request whose name has not been validated yet.

    The name language is checked before the project snapshot or registry is
    consulted.  A rejected value yields ``invalid_mansion_name`` and the very
    same state object, so no transition can follow from it.
    """

    if not is_valid_mansion_name(name):
        return ModelRequestResult(state=state, error_code=INVALID_MANSION_NAME)

    assert isinstance(name, str)
    result = apply_model_create(state, name)
    if result.plan.action == "reject":
        return ModelRequestResult(
            state=state, error_code=result.plan.error_code, result=result
        )
    return ModelRequestResult(
        state=result.state, error_code=None, result=result, record=result.record
    )


def apply_model_open_request(state: ModelState, name: object) -> ModelRequestResult:
    """Model an open request; opening never changes the model state.

    Order: name language, then registration, then current project status.
    """

    if not is_valid_mansion_name(name):
        return ModelRequestResult(state=state, error_code=INVALID_MANSION_NAME)

    assert isinstance(name, str)
    record = _record_for(state.registry, name)
    if record is None:
        return ModelRequestResult(state=state, error_code=MANSION_NOT_REGISTERED)

    status = classify_project(state.project)
    if status == ProjectStatus.MISSING:
        return ModelRequestResult(state=state, error_code=MANSION_MISSING)
    if status == ProjectStatus.CONFLICT:
        return ModelRequestResult(state=state, error_code=MANSION_CONFLICT)
    return ModelRequestResult(state=state, error_code=None, record=record)


def execute_same_name_creates(
    state: ModelState, requests: Iterable[ModelCreateRequest]
) -> ModelExecution:
    """Serialize one possible order of concurrent same-name create requests.

    Request labels make scheduling permutations observable without affecting
    domain behavior.  Every non-empty execution must contain one name.  The
    final state and multiset of outcomes are independent of request order;
    only which request observes ``created`` may differ.
    """

    ordered_requests = tuple(requests)
    if not ordered_requests:
        return ModelExecution(state=state, responses=())

    name = ordered_requests[0].name
    if any(request.name != name for request in ordered_requests):
        raise ValueError("same_name_requests_required")

    current = state
    responses: list[ModelCreateResponse] = []
    for request in ordered_requests:
        result = apply_model_create(current, name)
        current = result.state
        responses.append(
            ModelCreateResponse(request_id=request.request_id, result=result)
        )
    return ModelExecution(state=current, responses=tuple(responses))


def _created_snapshot(snapshot: ProjectSnapshot) -> ProjectSnapshot:
    def created(entry: EntryFact) -> EntryFact:
        return EntryFact(
            lexical=entry.lexical,
            canonical=entry.canonical,
            kind=EntryKind.DIRECTORY,
        )

    return ProjectSnapshot(
        target=created(snapshot.target),
        kiro=created(snapshot.kiro),
        specs=created(snapshot.specs),
        project_spec=created(snapshot.project_spec),
        extra_entries=snapshot.extra_entries,
    )


def _record_for(
    registry: tuple[ModelMansionRecord, ...], name: str
) -> ModelMansionRecord | None:
    return next((record for record in registry if record.name == name), None)


def _upsert_record(
    registry: tuple[ModelMansionRecord, ...], record: ModelMansionRecord
) -> tuple[ModelMansionRecord, ...]:
    without_name = (item for item in registry if item.name != record.name)
    return tuple(sorted((*without_name, record), key=lambda item: item.name))


def _is_strict_descendant(
    parent: PurePath | None, child: PurePath | None
) -> bool:
    if parent is None or child is None or parent == child:
        return False
    try:
        child.relative_to(parent)
    except (TypeError, ValueError):
        return False
    return True
