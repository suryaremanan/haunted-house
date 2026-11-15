"""Cross-spec ownership contract and structural boundary tests (task 10.1).

The first half proves the interfaces later specs consume: a Spec 4 domain
candidate round-trips through the writer with optimistic concurrency, a Spec 5
validated terminal appended after ``crew_turn_ended`` settles the Run, and
every consumer reads one canonical Sequence.

The second half scans the backend source so that no later change can add an
alternate log path, a direct Event_Log write, a second event envelope, a
second Crew normalizer, a persisted Ghost_Transition, writer-field assignment
outside Spec 2, a backend WebSocket, or a domain terminal inferred from Crew
transport.

Validates: Requirements 1.10, 3.2–3.5, 12.4–12.8.
"""

from __future__ import annotations

import ast
import asyncio
import inspect
import json
from pathlib import Path

import pytest

from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.adapters.seance_service import SeanceService
from haunted_house.core import (
    crew_event_normalizer,
    ghost_state,
    seance_history,
    seance_log_parser,
    seance_scope_registry,
)
from haunted_house.core.crew_event_normalizer import MAPPED_CREW_TYPES, CrewEnvelope
from haunted_house.core.ghost_state import fold_ghost_events
from haunted_house.core.seance_event import (
    ALLOWED_EVENT_TYPES,
    AppEventCandidate,
    EventScope,
    EventSource,
    JSONValue,
)
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.seance_persistence import CanonicalEventWriter

_MANSION = "demo-mansion"
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_PACKAGE_ROOT = _BACKEND_ROOT / "haunted_house"
_LOG_NAME = "events.v1." + "jsonl"
_SCOPE = EventScope(
    mansion_id=_MANSION,
    ghost_id="archivist",
    session_slot="study-slot",
    run_id="requirements-1",
    run_sequence=1,
)
_DOMAIN_TERMINALS = frozenset({"run_completed", "run_blocked", "run_failed"})


def _house(
    event_type: str,
    identity: str,
    payload: JSONValue,
    *,
    caused_by: tuple[str, ...] = (),
    scope: EventScope = _SCOPE,
) -> AppEventCandidate:
    return AppEventCandidate(
        schema_version=1,
        event_type=event_type,  # type: ignore[arg-type]
        scope=scope,
        source=EventSource(
            origin="house",
            source_type=event_type,
            identity_parts=(identity,),
            revision=0,
            generation="",
            source_sequence=0,
        ),
        caused_by=caused_by,
        occurred_at_ms=None,
        payload=payload,
    )


def _run(awaitable):
    return asyncio.run(awaitable)


def _store(tmp_path: Path) -> tuple[SeanceLogStore, Path]:
    root = tmp_path / "mansions"
    (root / _MANSION).mkdir(parents=True)
    return (
        SeanceLogStore(root, clock_ms=lambda: 1_731_400_000_000),
        root / _MANSION / ".haunted-house" / "seance" / _LOG_NAME,
    )


# --- contracts later specs consume -------------------------------------------


def test_spec_4_domain_candidates_round_trip_through_the_writer(tmp_path):
    store, log = _store(tmp_path)
    writer: CanonicalEventWriter = store
    started = _run(writer.append_candidates(_MANSION, [_house("run_started", "run", {})]))

    # A new domain kind needs no schema change: only the payload names it.
    door = _house(
        "domain_event_recorded",
        "door:requirements:1",
        {
            "domain": "doors-and-guardrails",
            "kind": "door_approved",
            "entity_id": "door-requirements",
            "data": {"approved_by": "operator", "phase": "requirements", "n": [1, 2.5, None]},
        },
    )
    approval = _house(
        "domain_event_recorded",
        "approval:action-7",
        {
            "domain": "doors-and-guardrails",
            "kind": "a_kind_spec_2_has_never_seen",
            "entity_id": "action-7",
            "data": None,
        },
    )
    appended = _run(
        writer.compare_and_append(_MANSION, started.highest_sequence, [door, approval])
    )

    assert appended.status == "ok"
    assert [event.sequence for event in appended.events] == [2, 3]
    assert [event.event_type for event in appended.events] == ["domain_event_recorded"] * 2
    assert appended.events[0].payload == door.payload
    assert appended.events[1].payload == approval.payload
    assert appended.events[0].source.origin == "house"

    # Optimistic concurrency without a store: the stale writer learns the
    # current Sequence and nothing is written.
    committed = log.read_bytes()
    stale = _run(writer.compare_and_append(_MANSION, 1, [_house("domain_event_recorded", "late", door.payload)]))
    assert stale.status == "conflict"
    assert stale.highest_sequence == 3
    assert stale.events == ()
    assert log.read_bytes() == committed

    # An exact retry of the authorized batch is a no-op acknowledgement.
    retry = _run(writer.append_candidates(_MANSION, [door, approval]))
    assert retry.events == appended.events
    assert retry.duplicate_record_ids == tuple(event.record_id for event in appended.events)
    assert log.read_bytes() == committed

    page = _run(writer.read_after(_MANSION, 1, 10))
    assert page.events == appended.events
    assert page.integrity_ok


@pytest.mark.parametrize(
    "payload",
    [
        {"domain": "doors", "kind": "door_approved", "entity_id": "door-1"},
        {"domain": "doors", "kind": "door_approved", "entity_id": "door-1", "data": {}, "x": 1},
        {"domain": "", "kind": "door_approved", "entity_id": "door-1", "data": {}},
        {"domain": "doors", "kind": 7, "entity_id": "door-1", "data": {}},
        ["doors", "door_approved"],
        "door_approved",
    ],
)
def test_a_malformed_domain_payload_is_rejected_before_any_byte(tmp_path, payload):
    store, log = _store(tmp_path)

    refused = _run(
        store.append_candidates(_MANSION, [_house("domain_event_recorded", "door", payload)])
    )

    assert refused.status == "invalid"
    assert refused.events == ()
    assert not log.exists()


def test_writer_metadata_cannot_be_supplied_by_a_producer(tmp_path):
    store, log = _store(tmp_path)
    candidate = _house("run_started", "run", {})
    as_json = {
        "schema_version": 1,
        "event_type": "run_started",
        "scope": {
            "mansion_id": _MANSION,
            "ghost_id": "archivist",
            "session_slot": "study-slot",
            "run_id": "requirements-1",
            "run_sequence": 1,
        },
        "source": {
            "origin": "house",
            "source_type": "run_started",
            "identity_parts": ["run"],
            "revision": 0,
            "generation": "",
            "source_sequence": 0,
        },
        "caused_by": [],
        "occurred_at_ms": None,
        "payload": {},
    }
    assert _run(store.append_candidates(_MANSION, [as_json])).events[0].record_id
    committed = log.read_bytes()

    for field, value in (
        ("sequence", 99),
        ("persisted_at_ms", 1),
        ("event_id", "e1:" + "0" * 64),
        ("record_id", "r1:" + "0" * 64),
        ("prev_hash", "h1:" + "0" * 64),
        ("hash", "h1:" + "0" * 64),
    ):
        refused = _run(store.append_candidates(_MANSION, [{**as_json, field: value}]))
        assert refused.status == "invalid", field
        assert refused.events == ()
    assert log.read_bytes() == committed
    assert _run(store.append_candidates(_MANSION, [candidate])).duplicate_record_ids


def test_spec_5_settles_a_run_only_with_its_own_terminal_after_crew_turn_ended(tmp_path):
    store, log = _store(tmp_path)
    service = SeanceService(store)
    _run(store.append_candidates(_MANSION, [_house("run_started", "run", {"reason": "assigned"})]))

    turn = _run(
        service.ingest(
            _MANSION,
            [
                CrewEnvelope(
                    "chat_done",
                    {
                        "slot": "study-slot",
                        "turn": 1,
                        "turn_gen": "generation-a",
                        "continuing": False,
                        "needs_input": False,
                    },
                ),
                CrewEnvelope("chat_error", {"slot": "study-slot", "code": "provider_error"}),
            ],
        )
    )
    assert turn.status == "ok"
    assert [event.event_type for event in turn.events] == [
        "crew_turn_ended",
        "crew_error_observed",
    ]

    def state() -> str:
        events = _run(store.read_after(_MANSION, 0, 500)).events
        (snapshot,) = fold_ghost_events(events).snapshots
        return snapshot.state

    # Transport evidence alone never settles the Run.
    assert state() == "working"

    # Room Ghosts validated the artifact and appends the terminal, citing
    # the acknowledged transport fact as its cause.
    completed = _run(
        store.compare_and_append(
            _MANSION,
            turn.highest_sequence,
            [
                _house(
                    "run_completed",
                    "requirements-1:completed",
                    {"reason": "artifact_valid"},
                    caused_by=(turn.events[0].event_id,),
                )
            ],
        )
    )
    assert completed.status == "ok"
    assert completed.events[0].caused_by == (turn.events[0].event_id,)
    assert state() == "done"

    # Every consumer sees one canonical Sequence: the writer's page, the
    # ingest acknowledgements, and the physical log agree record for record.
    page = _run(service.read_events(_MANSION, 0, 500))
    physical = parse_event_log(log.read_bytes())
    assert page.events == physical.events
    assert [event.sequence for event in page.events] == [1, 2, 3, 4]
    assert page.events[1:3] == turn.events
    assert page.events[3] == completed.events[0]
    assert {json.loads(line)["schema_version"] for line in log.read_bytes().splitlines()} == {1}


def test_ingest_can_never_produce_a_domain_terminal_or_a_house_record(tmp_path):
    store, _log = _store(tmp_path)
    service = SeanceService(store)
    _run(store.append_candidates(_MANSION, [_house("run_started", "run", {})]))
    envelopes = [
        CrewEnvelope(
            "chat_done",
            {
                "slot": "study-slot",
                "turn": turn,
                "turn_gen": "g",
                "continuing": continuing,
                "needs_input": needs_input,
                "event_type": "run_completed",
                "outcome": "completed",
            },
        )
        for turn, (continuing, needs_input) in enumerate(
            [(False, False), (False, True), (True, False), (True, True)]
        )
    ] + [
        CrewEnvelope("chat_run_completed", {"slot": "study-slot", "id": "x"}),
        CrewEnvelope("chat_error", {"slot": "study-slot", "category": "run_failed"}),
    ]

    outcome = _run(service.ingest(_MANSION, envelopes))

    assert outcome.status == "ok"
    assert _DOMAIN_TERMINALS.isdisjoint(event.event_type for event in outcome.events)
    assert {event.source.origin for event in outcome.events} == {"crew"}
    events = _run(store.read_after(_MANSION, 0, 500)).events
    assert fold_ghost_events(events).snapshots[0].state == "working"


# --- structural boundaries ---------------------------------------------------


def _modules() -> dict[str, ast.Module]:
    sources = sorted(_PACKAGE_ROOT.rglob("*.py")) + [_BACKEND_ROOT / "main.py"]
    return {
        path.relative_to(_BACKEND_ROOT).as_posix(): ast.parse(
            path.read_text(encoding="utf-8")
        )
        for path in sources
        if "__pycache__" not in path.parts
    }


def _names(tree: ast.AST) -> set[str]:
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            found.add(node.id)
        elif isinstance(node, ast.Attribute):
            found.add(node.attr)
        elif isinstance(node, ast.alias):
            found.add(node.name.rpartition(".")[2])
    return found


def _called(tree: ast.AST) -> set[str]:
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            target = node.func
            if isinstance(target, ast.Name):
                found.add(target.id)
            elif isinstance(target, ast.Attribute):
                found.add(target.attr)
    return found


def _string_constants(tree: ast.AST) -> set[str]:
    docstrings: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = node.body
            if (
                body
                and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)
            ):
                docstrings.add(id(body[0].value))
    return {
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and id(node) not in docstrings
    }


def _defined_classes(tree: ast.AST) -> set[str]:
    return {node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)}


def _imported_roots(tree: ast.AST) -> set[str]:
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.partition(".")[0])
    return roots


_SEANCE_CORE = "haunted_house/core/seance_event.py"
_PERSISTENCE = "haunted_house/core/seance_persistence.py"
_PARSER = "haunted_house/core/seance_log_parser.py"
_STORE = "haunted_house/adapters/seance_log_store.py"
_NORMALIZER = "haunted_house/core/crew_event_normalizer.py"
_GHOST_STATE = "haunted_house/core/ghost_state.py"
_ROOM_GHOSTS_TERMINAL_MODULES = {
    "haunted_house/services/terminal_gate.py",
    "haunted_house/services/canonical_port.py",
    "haunted_house/services/task_claims.py",
    "haunted_house/services/contracts.py",
}
_SERVICE = "haunted_house/adapters/seance_service.py"
_HISTORY = "haunted_house/core/seance_history.py"


def test_one_module_defines_the_canonical_event_envelope():
    envelope_classes = {"AppEvent", "AppEventCandidate", "EventScope", "EventSource"}
    owners = {
        name: _defined_classes(tree) & envelope_classes
        for name, tree in _modules().items()
        if _defined_classes(tree) & envelope_classes
    }
    assert owners == {_SEANCE_CORE: envelope_classes}


def test_only_spec_2_assigns_writer_fields():
    modules = _modules()
    # Constructing an AppEvent is the only way to give a record a Sequence,
    # persistence time, or hash link.
    constructors = {name for name, tree in modules.items() if "AppEvent" in _called(tree)}
    assert constructors == {_SEANCE_CORE, _PERSISTENCE}

    writer_transforms = {"build_app_event", "serialize_app_event", "calculate_event_hash"}
    users = {
        name: _called(tree) & writer_transforms
        for name, tree in modules.items()
        if _called(tree) & writer_transforms
    }
    assert set(users) <= {_PERSISTENCE, _PARSER, _STORE}
    assert "build_app_event" not in users.get(_PARSER, set())
    assert users[_STORE] >= {"build_app_event", "serialize_app_event"}


def test_only_the_log_store_writes_event_log_bytes():
    modules = _modules()
    file_locking = {name for name, tree in modules.items() if "fcntl" in _imported_roots(tree)}
    assert file_locking == {_STORE}
    for name, tree in modules.items():
        if name == _STORE:
            continue
        constants = _string_constants(tree)
        assert not any(value.endswith((".jsonl", ".ndjson")) for value in constants), name
        assert not any("seance/" in value and "/api/" not in value for value in constants), name
        assert ".haunted-house" not in constants, name
    # Callers reach the log through the writer interface, never a path.
    store_public = {
        name
        for name, member in inspect.getmembers(SeanceLogStore)
        if not name.startswith("_") and callable(member)
    }
    protocol_public = {
        name for name in vars(CanonicalEventWriter) if not name.startswith("_")
    }
    assert store_public == protocol_public == {
        "append_candidates",
        "compare_and_append",
        "read_after",
    }
    forbidden = {"truncate", "rewrite", "delete", "repair", "renumber", "unlink", "path"}
    assert not {name for name in dir(SeanceLogStore) if name.lstrip("_") in forbidden}


def test_there_is_one_crew_normalizer_and_one_pipeline_that_calls_it():
    modules = _modules()
    definers = {
        name
        for name, tree in modules.items()
        if any(
            isinstance(node, ast.FunctionDef) and node.name == "normalize_crew_envelope"
            for node in ast.walk(tree)
        )
    }
    assert definers == {_NORMALIZER}
    callers = {
        name for name, tree in modules.items() if "normalize_crew_envelope" in _called(tree)
    }
    assert callers == {_SERVICE}
    # Besides the normalizer, only history recovery spells a Crew wire type,
    # and only to rebuild raw envelopes that the normalizer then interprets:
    # it never builds a candidate, so it cannot be a second mapping.
    spellers = {
        name: _string_constants(tree) & MAPPED_CREW_TYPES
        for name, tree in modules.items()
        if _string_constants(tree) & MAPPED_CREW_TYPES
    }
    assert set(spellers) == {_NORMALIZER, _HISTORY}
    assert spellers[_HISTORY] == {"chat_message", "shared_crew.decision"}
    history_names = _names(modules[_HISTORY])
    assert "CrewEnvelope" in history_names
    assert not history_names & {
        "AppEventCandidate",
        "EventSource",
        "validate_candidate",
        "append_candidates",
        "compare_and_append",
    }


def test_domain_terminals_are_never_derived_from_crew_transport():
    modules = _modules()
    spellers = {
        name for name, tree in modules.items() if _string_constants(tree) & _DOMAIN_TERMINALS
    }
    # The schema lists them and the reducer reads them.  The only producer is
    # the Room Ghosts validated terminal gate (Spec 5), which appends a
    # house-origin terminal through the writer after artifact validation; its
    # port, claim release, and contract check name the types to recognize them.
    assert spellers == {_SEANCE_CORE, _GHOST_STATE} | _ROOM_GHOSTS_TERMINAL_MODULES
    assert _DOMAIN_TERMINALS.isdisjoint(_string_constants(ast.parse(inspect.getsource(crew_event_normalizer))))
    # None of them reads Crew transport: no Crew wire type, no normalizer.
    for name in _ROOM_GHOSTS_TERMINAL_MODULES:
        tree = modules[name]
        assert not _string_constants(tree) & MAPPED_CREW_TYPES, name
        assert "normalize_crew_envelope" not in _called(tree), name
        assert "crew_event_normalizer" not in "".join(
            node.module or ""
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom)
        ), name


def test_ghost_transitions_are_derived_and_never_persisted():
    assert not any("transition" in event_type for event_type in ALLOWED_EVENT_TYPES)
    modules = _modules()
    transition_names = {"GhostTransition", "derive_ghost_transitions", "ghost_transition_id"}
    writer_names = {"append_candidates", "compare_and_append", "build_app_event"}
    for name, tree in modules.items():
        names = _names(tree)
        assert not (names & transition_names and names & writer_names), name
    reducer_imports = {
        node.module
        for node in ast.walk(ast.parse(inspect.getsource(ghost_state)))
        if isinstance(node, ast.ImportFrom) and node.module
    }
    assert not any("persistence" in module or "adapters" in module for module in reducer_imports)


def test_the_backend_opens_no_crew_websocket():
    for name, tree in _modules().items():
        names = _names(tree)
        assert not names & {
            "ws_connect",
            "WebSocketResponse",
            "ClientWebSocketResponse",
            "WSMsgType",
            "websockets",
        }, name
        assert not any("/api/ws" in value for value in _string_constants(tree)), name


@pytest.mark.parametrize(
    "module",
    [crew_event_normalizer, ghost_state, seance_history, seance_log_parser, seance_scope_registry],
    ids=lambda module: module.__name__.rpartition(".")[2],
)
def test_spec_2_core_modules_stay_pure(module):
    roots = _imported_roots(ast.parse(inspect.getsource(module)))
    assert roots.isdisjoint(
        {"aiohttp", "asyncio", "fcntl", "os", "pathlib", "socket", "subprocess", "time", "logging"}
    )
    assert "adapters" not in inspect.getsource(module).split('"""', 2)[-1]


def test_the_scanner_itself_flags_each_violation(tmp_path):
    offending = ast.parse(
        "import fcntl\n"
        "from haunted_house.core.seance_event import AppEvent\n"
        "LOG = 'approvals.jsonl'\n"
        "def write(event):\n"
        "    '''events.v1.jsonl is only named in this docstring.'''\n"
        "    return AppEvent(sequence=1)\n"
        "KIND = {'chat_done': 'run_completed'}\n"
    )
    assert "fcntl" in _imported_roots(offending)
    assert "AppEvent" in _called(offending)
    assert "approvals.jsonl" in _string_constants(offending)
    assert not any("events.v1" in value for value in _string_constants(offending))
    assert {"chat_done", "run_completed"} <= _string_constants(offending)
