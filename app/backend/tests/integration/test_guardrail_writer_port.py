"""Cross-spec writer and ownership tests for Doors and Guardrails
(tasks 2.3, 2.4).

The real Spec 2 file writer proves that Spec 4 domain candidates round trip,
that Projection_Version is the highest canonical Sequence, that stale
comparisons conflict, and that a restart reads the same projection.  The
structural half rejects any Spec 4 event store, serializer, direct log open,
or Crew mapping table.

Validates: Requirements 1.2, 2.2–2.6, 3.5, 3.6, 8.1, 8.7, 10.1–10.8, 12.3.
"""

from __future__ import annotations

import ast
import asyncio
import inspect
from pathlib import Path

import pytest

from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.seance_log_store import SeanceLogStore
from haunted_house.core import guardrail_events as ge
from haunted_house.core.approvals import ExecutionRequest, ProposalStatus, decide_consumption
from haunted_house.core.crew_event_normalizer import MAPPED_CREW_TYPES
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.workflow import (
    ArtifactRevision,
    ConfirmStart,
    DecideDoor,
    DoorStatus,
    PhaseStatus,
    StartPhase,
    SubmitOutput,
    decide_transition,
    fold_workflow,
)
from tests.guardrail_support import (
    ALLOWED,
    MANSION,
    OPERATOR,
    SESSION_SCOPE,
    SHA_A,
    MemoryWriter,
    delete_descriptor,
    other_event,
    parsed,
    spec_path,
)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_PACKAGE_ROOT = _BACKEND_ROOT / "haunted_house"
_LOG_NAME = "events.v1." + "jsonl"
_SPEC_4_MODULES = (
    "core/path_policy.py",
    "core/action_descriptor.py",
    "core/guardrail_events.py",
    "core/approvals.py",
    "core/workflow.py",
    "adapters/guardrail_port.py",
    "adapters/guarded_filesystem.py",
)


def _run(awaitable):
    return asyncio.run(awaitable)


def _store(tmp_path: Path) -> tuple[SeanceLogStore, Path, Path]:
    root = tmp_path / "mansions"
    (root / MANSION).mkdir(parents=True)
    return SeanceLogStore(root, clock_ms=lambda: 1_731_400_000_000), root, root / MANSION


def _log(mansion: Path) -> Path:
    return mansion / ("." + "haunted-house") / "seance" / _LOG_NAME


async def _apply(port: GuardrailPort, command) -> object:
    projection = await port.projection(MANSION)
    result = decide_transition(projection, command(projection))
    assert result.ok, result.code
    ack = await port.compare_and_append(MANSION, result.expected_sequence, result.candidates)
    assert ack.ok, ack
    return ack


def test_domain_candidates_round_trip_through_the_real_writer_and_a_restart(tmp_path):
    store, root, mansion = _store(tmp_path)
    port = GuardrailPort(store, page_limit=2)

    empty = _run(port.read(MANSION))
    assert (empty.status, empty.integrity, empty.highest_sequence) == ("ok", "valid", 0)
    assert empty.projection.phases[Phase.REQUIREMENTS].status is PhaseStatus.READY
    assert not _log(mansion).exists()

    async def scenario():
        await _apply(port, lambda p: StartPhase(OPERATOR, Phase.REQUIREMENTS, "cmd-1", "res-1", p.version))
        # A Crew record between two domain records still advances the version.
        crew = await store.append_candidates(MANSION, [other_event("chat-1")])
        assert crew.status == "ok"
        await _apply(port, lambda p: ConfirmStart(OPERATOR, Phase.REQUIREMENTS, "res-1", "study-slot"))
        artifact = ArtifactRevision(1, SHA_A, 64)
        await _apply(
            port,
            lambda p: SubmitOutput(SESSION_SCOPE, Phase.REQUIREMENTS, "door-1", spec_path("requirements"), artifact),
        )
        return await _apply(
            port,
            lambda p: DecideDoor(
                OPERATOR, "door-1", Phase.REQUIREMENTS, spec_path("requirements"), artifact,
                p.version, True, "operator", "cmd-2"),
        )

    ack = _run(scenario())
    assert ack.events[0].sequence == ack.highest_sequence == 5

    read = _run(port.read(MANSION))
    assert read.integrity == "valid" and read.highest_sequence == 5
    assert [event.sequence for event in read.events] == [1, 2, 3, 4, 5]
    assert [record.sequence for record in read.domain.records] == [1, 3, 4, 5]
    assert read.projection.version == 5
    assert read.projection.phases[Phase.REQUIREMENTS].door is DoorStatus.OPEN
    assert read.projection.phases[Phase.DESIGN].status is PhaseStatus.READY
    assert read.projection.phases[Phase.REQUIREMENTS].proposal.decision_event_id == ack.events[0].event_id
    assert read.projection.diagnostics == ()

    # Every persisted record is a plain Spec 2 line that its parser accepts,
    # and the Spec 4 payload came back byte-for-byte as built.
    physical = parse_event_log(_log(mansion).read_bytes())
    assert physical.diagnostics == () and physical.events == read.events
    assert {event.event_type for event in physical.events} == {
        "domain_event_recorded", "message_recorded"}
    assert physical.events[-1].payload["domain"] == "doors_and_guardrails"

    # A restart (new store, new port) folds the identical projection.
    restarted = GuardrailPort(SeanceLogStore(root, clock_ms=lambda: 1_999_999_999_999))
    assert _run(restarted.read(MANSION)).projection == read.projection
    assert fold_workflow(physical.events) == read.projection

    # No alternate durable file exists anywhere in the Mansion.
    files = sorted(path.relative_to(mansion).as_posix() for path in mansion.rglob("*") if path.is_file())
    assert files == [_log(mansion).relative_to(mansion).as_posix()]


def test_stale_comparisons_conflict_and_exact_retries_are_idempotent(tmp_path):
    store, _root, mansion = _store(tmp_path)
    port = GuardrailPort(store)
    first = ge.phase_start_reserved(OPERATOR, phase=Phase.REQUIREMENTS, reservation_id="res-1", command_id="cmd-1")
    rival = ge.phase_start_reserved(OPERATOR, phase=Phase.REQUIREMENTS, reservation_id="res-2", command_id="cmd-2")

    async def race():
        return await asyncio.gather(
            port.compare_and_append(MANSION, 0, [first]),
            port.compare_and_append(MANSION, 0, [rival]),
        )

    outcomes = _run(race())
    assert sorted(ack.status for ack in outcomes) == ["conflict", "ok"]
    loser = next(ack for ack in outcomes if not ack.ok)
    assert (loser.events, loser.highest_sequence, loser.code) == ((), 1, "conflict")
    committed = _log(mansion).read_bytes()

    winner = next(ack for ack in outcomes if ack.ok)
    retry = _run(port.append(MANSION, [first if winner.events[0].payload["data"]["command_id"] == "cmd-1" else rival]))
    assert retry.ok and retry.events == winner.events
    assert _log(mansion).read_bytes() == committed
    assert _run(port.projection(MANSION)).version == 1


def test_one_time_consumption_races_through_the_real_writer(tmp_path):
    store, _root, _mansion = _store(tmp_path)
    port = GuardrailPort(store)
    descriptor = parsed(delete_descriptor())
    proposed = ge.risky_action_proposed(SESSION_SCOPE, proposal_id="act-1", descriptor=descriptor)
    digest = proposed.payload["data"]["action_digest"]
    approved = ge.risky_action_approved(
        OPERATOR, proposal_id="act-1", action_digest=digest, actor="operator", command_id="cmd-1")
    assert _run(port.append(MANSION, [proposed, approved])).ok

    ledger = _run(port.projection(MANSION)).ledger
    claims = [
        decide_consumption(
            ledger,
            ExecutionRequest("act-1", delete_descriptor(), SESSION_SCOPE, "workshop", f"claim-{n}", (ALLOWED,)),
        )
        for n in range(4)
    ]
    assert all(claim.allowed and claim.expected_sequence == 2 for claim in claims)

    async def race():
        return await asyncio.gather(
            *(port.compare_and_append(MANSION, claim.expected_sequence, [claim.candidate]) for claim in claims)
        )

    outcomes = _run(race())
    assert sorted(ack.status for ack in outcomes) == ["conflict", "conflict", "conflict", "ok"]
    read = _run(port.read(MANSION))
    consumed = [r for r in read.domain.records if r.kind.value == "risky_action_consumed"]
    assert len(consumed) == 1
    proposal = read.projection.risky_proposals["act-1"]
    assert proposal.status is ProposalStatus.CONSUMED
    assert proposal.claim_id == consumed[0].data["claim_id"]


def test_the_port_refuses_anything_that_is_not_a_valid_guardrail_candidate():
    writer = MemoryWriter()
    port = GuardrailPort(writer)
    good = ge.phase_start_reserved(OPERATOR, phase=Phase.REQUIREMENTS, reservation_id="r", command_id="c")
    from dataclasses import replace

    wrong_kind = replace(good, payload={**good.payload, "kind": "door_unsealed"})
    wrong_mansion = ge.phase_start_reserved(
        ge.operator_scope("other-mansion"), phase=Phase.REQUIREMENTS, reservation_id="r", command_id="c")
    for batch in ([], [other_event("chat")], [good, other_event("chat")], [wrong_kind], [wrong_mansion], [{"x": 1}]):
        ack = _run(port.append(MANSION, batch))
        assert (ack.ok, ack.status, ack.events) == (False, "refused", ())
    assert writer.calls == [] and writer.events == []

    writer.fail_next.append("failed")
    failed = _run(port.compare_and_append(MANSION, 0, [good]))
    assert (failed.ok, failed.status, failed.events) == (False, "failed", ())


def test_integrity_and_availability_are_propagated_from_spec_2(tmp_path):
    store, _root, mansion = _store(tmp_path)
    port = GuardrailPort(store)
    good = ge.phase_start_reserved(OPERATOR, phase=Phase.REQUIREMENTS, reservation_id="r", command_id="c")
    assert _run(port.append(MANSION, [good])).ok
    with _log(mansion).open("ab") as handle:
        handle.write(b"{not a canonical record}\n")
    corrupt = _run(port.read(MANSION))
    assert (corrupt.status, corrupt.integrity, corrupt.writable) == ("invalid_log", "corrupt", False)
    # Only the authoritative valid prefix is folded.
    assert corrupt.projection.version == 1
    assert corrupt.projection.phases[Phase.REQUIREMENTS].status is PhaseStatus.STARTING
    refused = decide_transition(
        corrupt.projection, ConfirmStart(OPERATOR, Phase.REQUIREMENTS, "r", "slot"))
    assert (refused.ok, refused.code) == (False, "integrity_unavailable")
    assert _run(port.append(MANSION, [good])).status == "invalid_log"

    missing = _run(GuardrailPort(store).read("absent-mansion"))
    assert (missing.status, missing.integrity) == ("mansion_not_found", "uncertain")
    broken = MemoryWriter()
    broken.fail_reads = True
    assert _run(GuardrailPort(broken).read(MANSION)).integrity == "uncertain"


# --- structural ownership ------------------------------------------------------


def _trees() -> dict[str, ast.Module]:
    return {
        name: ast.parse((_PACKAGE_ROOT / name).read_text(encoding="utf-8"))
        for name in _SPEC_4_MODULES
        if (_PACKAGE_ROOT / name).exists()
    }


def _strings(tree: ast.AST) -> set[str]:
    return {
        node.value for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
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
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            found.add(node.name)
    return found


def test_spec_4_owns_no_event_store_serializer_or_crew_mapping():
    trees = _trees()
    assert set(trees) >= set(_SPEC_4_MODULES[:6])
    forbidden_files = {"seance.py", "seance_store.py", "guardrail_store.py", "approval_store.py"}
    present = {path.name for path in _PACKAGE_ROOT.rglob("*.py")}
    assert not present & forbidden_files
    assert not list(_BACKEND_ROOT.parent.rglob("seance." + "jsonl"))

    writer_internals = {
        "AppEvent", "build_app_event", "serialize_app_event", "calculate_event_hash",
        "calculate_event_id", "calculate_record_id", "prepare_candidates", "parse_event_log",
        "GENESIS_HASH", "prev_hash", "persisted_at_ms", "SeanceLogStore", "normalize_crew_envelope",
        "CrewEnvelope", "fcntl", "flock", "ws_connect",
    }
    for name, tree in trees.items():
        names = _names(tree)
        called = {
            node.func.id if isinstance(node.func, ast.Name) else getattr(node.func, "attr", "")
            for node in ast.walk(tree) if isinstance(node, ast.Call)
        }
        # Records are read (typed as AppEvent) but never constructed.
        assert "AppEvent" not in called, name
        assert not (names - {"AppEvent"}) & writer_internals, (name, names & writer_internals)
        strings = _strings(tree)
        assert not any(value.endswith((".jsonl", ".ndjson", ".log")) for value in strings), name
        assert not any("seance" in value.lower() for value in strings if "\n" not in value), name
        assert ("." + "haunted-house") not in strings, name
        # No Crew wire type is spelled, so no mapping table can exist.
        assert not strings & MAPPED_CREW_TYPES, name
        assert not {"run_completed", "run_blocked", "run_failed"} & strings, name
        if name.startswith("core/"):
            roots = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    roots.update(alias.name.partition(".")[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    roots.add(node.module.partition(".")[0])
                    assert "adapters" not in node.module, name
            assert roots.isdisjoint(
                {"os", "pathlib", "asyncio", "aiohttp", "socket", "subprocess", "time", "logging", "io"}
            ), name

    port_source = inspect.getsource(GuardrailPort)
    assert "open(" not in port_source and "Path" not in port_source
    public = {name for name in vars(GuardrailPort) if not name.startswith("_")}
    assert public == {"read", "projection", "append", "compare_and_append"}


def test_only_json_hashing_in_spec_4_is_the_action_digest():
    trees = _trees()
    hashers = {name for name, tree in trees.items() if "hashlib" in _names(tree)}
    assert hashers <= {"core/action_descriptor.py", "adapters/guarded_filesystem.py"}
    json_users = {name for name, tree in trees.items() if "json" in _names(tree)}
    assert json_users <= {"core/action_descriptor.py"}
    # The canonical encoder is Spec 2's; Spec 4 defines none.
    for name, tree in trees.items():
        defined = {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
        assert not {"canonical_json", "serialize", "dumps"} & defined, name
