"""Session_Reconciler: Crew Session_Approvals joined to exact proposals.

The reconciler never reads a raw Crew frame and never writes a Crew fact.
Its input is the acknowledged canonical log (through ``GuardrailPort``) and
one bounded, typed session snapshot per slot (through ``CrewChat``).  Missing
canonical facts are recovered by asking the Spec 2 pipeline to reconcile the
slot's history; the reconciler only folds what that pipeline acknowledged.

One pass:

1. fold the canonical records and find Crew permission prompts that are
   still open, and Crew resolutions that no domain record accounts for;
2. ask Spec 2 to reconcile those slots, then fold again;
3. read each slot's permission messages and correlate them by slot, ``mid``,
   tool name, proposal identifier, and Action_Digest;
4. turn an external Crew resolution into one ``crew`` decision
   (compare-and-append, first acknowledged decision wins) or into
   ``approval_resolution_ignored``, which grants nothing;
5. answer Crew, with the exact ``approval_id`` and ``mid``, for a prompt
   whose proposal the Operator already decided canonically.

``approval_id`` is used only inside the answer sent to Crew.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import Protocol, cast

from haunted_house.adapters.crew_chat import (
    CrewChat,
    CrewChatError,
    CrewSessionSnapshot,
    SessionPermission,
)
from haunted_house.adapters.guardrail_port import GuardrailPort, GuardrailRead
from haunted_house.core.approvals import (
    ApprovalLedger,
    PendingPermission,
    correlate_permission,
    decide_external_resolution,
    permission_digest,
    permission_for_proposal,
)
from haunted_house.core.guardrail_events import GuardrailEventKind, operator_scope
from haunted_house.core.room_catalog import (
    APP_NAME,
    EXECUTION_TOOL,
    EXECUTION_TOOL_NAMES,
    SERVER_BY_ROLE,
    complete_descriptor,
)
from haunted_house.core.seance_event import AppEvent

__all__ = [
    "DEFAULT_EXECUTION_SERVERS",
    "EXECUTION_TOOL_NAME",
    "HistoryReconciler",
    "PermissionInfo",
    "ReconcileReport",
    "SessionReconciler",
    "execution_tool_names",
]

EXECUTION_TOOL_NAME = EXECUTION_TOOL
# Crew reports the MCP server and the tool separately; the server may be
# spelled with or without the app prefix.
DEFAULT_EXECUTION_SERVERS = (f"{APP_NAME}:{SERVER_BY_ROLE['tinker']}", SERVER_BY_ROLE["tinker"])
_PASSES = 3
_MAX_SLOTS = 8
# Only a tinker holds the execution tool, and a tinker's Room is fixed.
_EXECUTION_ROOM = "workshop"


def execution_tool_names(servers: Sequence[str] = DEFAULT_EXECUTION_SERVERS) -> frozenset[str]:
    """Every exact name under which Crew may report the execution tool.

    The room catalog's spellings plus ``<server>/<tool>`` for each server
    name.  A name is one input to a match that also needs slot, ``mid``,
    proposal identifier, and Action_Digest.
    """

    return EXECUTION_TOOL_NAMES | frozenset(f"{server}/{EXECUTION_TOOL}" for server in servers)


class HistoryReconciler(Protocol):
    """Spec 2's bounded history reconciliation (``SeanceService.reconcile``)."""

    def __call__(self, mansion_id: str, slots: Sequence[str]) -> Awaitable[object]: ...


@dataclass(frozen=True, slots=True)
class PermissionInfo:
    """What correlation established about one open Crew prompt."""

    tool_name: str | None = None
    action_digest: str | None = None
    proposal_id: str | None = None


@dataclass(frozen=True, slots=True)
class ReconcileReport:
    read: GuardrailRead
    permissions: Mapping[tuple[str, str], PermissionInfo] = field(default_factory=dict)
    # Slots whose Crew state could not be confirmed current.
    uncertain_slots: tuple[str, ...] = ()
    appended: tuple[AppEvent, ...] = ()
    answered: tuple[tuple[str, str, str], ...] = ()

    @property
    def uncertain(self) -> bool:
        return bool(self.uncertain_slots)


def _resolution_id(prefix: str, slot: str, mid: str) -> str:
    digest = hashlib.sha256(f"{slot}\x00{mid}".encode()).hexdigest()
    return f"{prefix}-{digest[:40]}"


class SessionReconciler:
    def __init__(
        self,
        port: GuardrailPort,
        crew: CrewChat,
        *,
        history: HistoryReconciler | None = None,
        tool_names: frozenset[str] | None = None,
        min_interval_seconds: float = 2.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._port = port
        self._crew = crew
        self._history = history
        self._tool_names = execution_tool_names() if tool_names is None else tool_names
        self._min_interval = float(min_interval_seconds)
        self._clock = clock
        self._last_pass: dict[str, float] = {}
        self._last_report: dict[str, ReconcileReport] = {}
        # Resolutions already compared with the ledger and needing no record.
        self._settled: set[tuple[str, str, str]] = set()

    @property
    def tool_names(self) -> frozenset[str]:
        return self._tool_names

    # --- queries ---------------------------------------------------------------------

    async def permission_for(
        self, ledger: ApprovalLedger, proposal_id: str
    ) -> PendingPermission | None:
        """The one open Crew prompt that asks to run ``proposal_id``, if any.

        Used before an app decision so the record can name the prompt, and
        after it so exactly that prompt is answered.
        """

        proposal = ledger.proposals.get(proposal_id)
        if proposal is None:
            return None
        if proposal.descriptor is None:
            return None
        try:
            snapshot = _described(
                proposal.descriptor.mansion_id,
                await self._crew.get_session(proposal.session_slot),
            )
        except CrewChatError:
            return None
        matches = [
            item.message
            for item in snapshot.permissions
            if item.resolved is None
            and item.message.tool_name in self._tool_names
            and item.message.tool_input.get("proposal_id") == proposal_id
            and permission_digest(item.message.tool_input) == proposal.action_digest
            and proposal.descriptor is not None
            and proposal.descriptor.session_slot == item.message.slot
        ]
        return matches[0] if len({message.mid for message in matches}) == 1 else None

    async def answer(self, permission: PendingPermission, outcome: str) -> str:
        """Answer one prompt after its decision was acknowledged.

        Returns ``resolved`` or ``not_pending``; raises ``CrewChatError``.
        """

        result = await self._crew.resolve_permission(
            permission, "approved" if outcome == "approved" else "rejected"
        )
        return result.status

    # --- the pass ----------------------------------------------------------------------

    async def reconcile(self, mansion_id: str, *, force: bool = False) -> ReconcileReport:
        """Run one reconciliation pass and return the folded result.

        Passes for one Mansion are spaced by ``min_interval_seconds`` unless
        ``force`` is set; in between, the last correlation is reused with a
        fresh canonical read.
        """

        now = self._clock()
        last = self._last_pass.get(mansion_id)
        previous = self._last_report.get(mansion_id)
        if not force and last is not None and previous is not None and now - last < self._min_interval:
            read = await self._port.read(mansion_id)
            return ReconcileReport(read, previous.permissions, previous.uncertain_slots)
        self._last_pass[mansion_id] = now

        appended: list[AppEvent] = []
        answered: list[tuple[str, str, str]] = []
        uncertain: set[str] = set()
        permissions: dict[tuple[str, str], PermissionInfo] = {}
        read = await self._port.read(mansion_id)
        reconciled_history = False
        for _ in range(_PASSES):
            if not read.writable:
                break
            open_prompts = dict(read.projection.pending_permissions)
            resolutions = self._unsettled_resolutions(mansion_id, read)
            behind = _slots_behind(read) if not reconciled_history else set()
            slots = sorted(
                {slot for slot, _mid in open_prompts}
                | {slot for slot, _m, _o in resolutions}
                | behind
            )[:_MAX_SLOTS]
            if not slots:
                break

            if not reconciled_history and self._history is not None:
                # Canonical catch-up belongs to Spec 2; fold what it acknowledged.
                reconciled_history = True
                try:
                    outcome = await self._history(mansion_id, slots)
                except Exception:  # noqa: BLE001 - recovery is best effort
                    outcome = None
                for recovery in getattr(outcome, "slots", ()) or ():
                    if getattr(recovery, "status", "") == "history_unavailable":
                        uncertain.add(getattr(recovery, "slot", ""))
                if getattr(outcome, "status", "ok") != "ok":
                    uncertain.update(slots)
                read = await self._port.read(mansion_id)
                continue

            snapshots: dict[str, CrewSessionSnapshot] = {}
            for slot in slots:
                try:
                    snapshots[slot] = _described(mansion_id, await self._crew.get_session(slot))
                except CrewChatError:
                    uncertain.add(slot)

            conflict = False
            ledger = read.projection.ledger
            for slot, mid, outcome_name in resolutions:
                snapshot = snapshots.get(slot)
                if snapshot is None:
                    continue
                found = snapshot.permission(mid)
                message = found.message if found is not None else PendingPermission(slot, mid, "", "", {})
                result = await self._record_resolution(
                    mansion_id, ledger, message, outcome_name
                )
                if result == "conflict":
                    conflict = True
                    break
                if isinstance(result, tuple):
                    appended.extend(result)
                    read = await self._port.read(mansion_id)
                    ledger = read.projection.ledger
            if conflict:
                read = await self._port.read(mansion_id)
                continue

            permissions = {}
            for (slot, mid) in read.projection.pending_permissions:
                snapshot = snapshots.get(slot)
                found = snapshot.permission(mid) if snapshot is not None else None
                if found is None:
                    permissions[(slot, mid)] = PermissionInfo()
                    continue
                message = found.message
                correlation = correlate_permission(message, ledger, tool_names=self._tool_names)
                digest = permission_digest(message.tool_input)
                proposal_id = message.tool_input.get("proposal_id")
                known = (
                    ledger.proposals.get(proposal_id) if type(proposal_id) is str else None
                )
                exact = (
                    known is not None
                    and message.tool_name in self._tool_names
                    and digest == known.action_digest
                )
                permissions[(slot, mid)] = PermissionInfo(
                    tool_name=_display_tool(message.tool_name),
                    action_digest=digest if exact else None,
                    proposal_id=known.proposal_id if exact and known is not None else None,
                )
                if correlation.matched or found.resolved is not None or not exact:
                    continue  # still undecided here, or already settled by Crew
                assert known is not None
                decision = known.decision
                if decision is None or decision.actor != "operator":
                    continue
                target = permission_for_proposal(
                    ledger, known.proposal_id,
                    [item.message for item in snapshot.permissions if item.resolved is None],
                    tool_names=self._tool_names,
                )
                if target is None or target.mid != mid:
                    continue
                try:
                    status = await self.answer(target, decision.outcome)
                except CrewChatError:
                    uncertain.add(slot)
                    continue
                answered.append((slot, mid, decision.outcome if status == "resolved" else status))
            break

        report = ReconcileReport(
            read,
            permissions,
            tuple(sorted(slot for slot in uncertain if slot)),
            tuple(appended),
            tuple(answered),
        )
        self._last_report[mansion_id] = report
        return report

    def _unsettled_resolutions(
        self, mansion_id: str, read: GuardrailRead
    ) -> list[tuple[str, str, str]]:
        """Crew resolutions that no Spec 4 record accounts for yet."""

        accounted: set[tuple[str, str]] = set()
        for record in read.domain.records:
            data = record.data
            if record.kind in (
                GuardrailEventKind.RISKY_ACTION_APPROVED,
                GuardrailEventKind.RISKY_ACTION_REJECTED,
            ):
                if data["crew_slot"] is not None and data["crew_mid"] is not None:
                    accounted.add((cast(str, data["crew_slot"]), cast(str, data["crew_mid"])))
            elif record.kind in (
                GuardrailEventKind.APPROVAL_RESOLUTION_IGNORED,
                # The house answered this prompt itself (decision 2026-11-16).
                GuardrailEventKind.ROOM_TOOL_ANSWERED,
            ):
                accounted.add((cast(str, data["session_slot"]), cast(str, data["mid"])))
        found: dict[tuple[str, str], str] = {}
        for event in read.events:
            if event.event_type != "approval_decided" or event.source.origin != "crew":
                continue
            payload = event.payload if type(event.payload) is dict else {}
            mid, outcome = payload.get("mid"), payload.get("outcome")
            if type(mid) is not str or outcome not in ("approved", "rejected"):
                continue
            found[(event.scope.session_slot, mid)] = cast(str, outcome)
        return [
            (slot, mid, outcome)
            for (slot, mid), outcome in found.items()
            if (slot, mid) not in accounted and (mansion_id, slot, mid) not in self._settled
        ]

    async def _record_resolution(
        self,
        mansion_id: str,
        ledger: ApprovalLedger,
        message: PendingPermission,
        outcome: str,
    ) -> tuple[AppEvent, ...] | str | None:
        """Append the one record an external resolution deserves.

        Returns the acknowledged records, ``"conflict"`` when another write
        won the comparison, or ``None`` when nothing needs recording.
        """

        approved = outcome == "approved"
        scope = operator_scope(mansion_id)
        result = decide_external_resolution(
            ledger,
            message,
            approved=approved,
            scope=scope,
            command_id=_resolution_id("crew", message.slot, message.mid),
            tool_names=self._tool_names,
        )
        key = (mansion_id, message.slot, message.mid)
        if result.ok and result.candidate is not None:
            acknowledged = await self._port.compare_and_append(
                mansion_id, cast(int, result.expected_sequence), [result.candidate]
            )
            if acknowledged.status == "conflict":
                return "conflict"
            return acknowledged.events if acknowledged.ok else None
        if result.code == "duplicate_command":
            self._settled.add(key)
            return None
        if result.candidate is None:
            return None
        ignored_code = cast(dict, cast(dict, result.candidate.payload)["data"])["code"]
        if ignored_code == "not_pending":
            proposal_id = message.tool_input.get("proposal_id")
            known = ledger.proposals.get(proposal_id) if type(proposal_id) is str else None
            decision = known.decision if known is not None else None
            if decision is not None and decision.outcome == outcome:
                # Crew only echoes a decision the ledger already holds.
                self._settled.add(key)
                return None
        acknowledged = await self._port.append(mansion_id, [result.candidate])
        return acknowledged.events if acknowledged.ok else None


def _described(mansion_id: str, snapshot: CrewSessionSnapshot) -> CrewSessionSnapshot:
    """Give each execution prompt the full descriptor it asks to run.

    The tool input holds only the model's ``action``.  The Action_Descriptor
    it stands for is that action joined with trusted identity: the Mansion
    being reconciled, the slot the prompt was read from, and the tinker's
    Room.  Anything else is left as it is and matches no proposal.
    """

    permissions = []
    for item in snapshot.permissions:
        message = item.message
        tool_input = message.tool_input
        if set(tool_input) == {"proposal_id", "action"}:
            raw = complete_descriptor(
                tool_input["action"],
                mansion_id=mansion_id,
                session_slot=message.slot,
                room=_EXECUTION_ROOM,
            )
            if raw is not None:
                message = replace(
                    message,
                    tool_input={"proposal_id": tool_input["proposal_id"], "descriptor": raw},
                )
        elif "descriptor" in tool_input:
            # Identity is never taken from tool input: this names no proposal.
            message = replace(
                message,
                tool_input={key: value for key, value in tool_input.items() if key != "descriptor"},
            )
        permissions.append(SessionPermission(message, item.resolved))
    return CrewSessionSnapshot(snapshot.slot, tuple(permissions))


def _slots_behind(read: GuardrailRead) -> set[str]:
    """Slots whose canonical approval facts trail Crew's own decisions.

    Spec 2 records a Crew approval decision even when it cannot yet name the
    permission message.  A slot with more such decisions than approval facts
    needs Spec 2's history reconciliation before its waiting state is current.
    """

    latest: dict[tuple[str, str], tuple[int, str]] = {}
    requested: dict[str, set[str]] = {}
    decided: dict[str, set[str]] = {}
    for event in read.events:
        if event.source.origin != "crew":
            continue
        payload = event.payload if type(event.payload) is dict else {}
        slot = event.scope.session_slot
        if event.event_type == "decision_recorded" and payload.get("kind") == "approval":
            key = (slot, str(payload.get("decision_id")))
            revision = payload.get("revision")
            rank = revision if type(revision) is int else 0
            if key not in latest or rank >= latest[key][0]:
                latest[key] = (rank, str(payload.get("state")))
        elif event.event_type == "approval_requested" and type(payload.get("mid")) is str:
            requested.setdefault(slot, set()).add(cast(str, payload["mid"]))
        elif event.event_type == "approval_decided" and type(payload.get("mid")) is str:
            decided.setdefault(slot, set()).add(cast(str, payload["mid"]))
    behind: set[str] = set()
    counts: dict[str, list[int]] = {}
    for (slot, _decision), (_rank, state) in latest.items():
        seen = counts.setdefault(slot, [0, 0])
        seen[0] += 1
        seen[1] += 1 if state == "resolved" else 0
    for slot, (total, resolved) in counts.items():
        known = requested.get(slot, set()) | decided.get(slot, set())
        if total > len(known) or resolved > len(decided.get(slot, set())):
            behind.add(slot)
    return behind


def _display_tool(name: str) -> str | None:
    """A bounded tool label for the dashboard, or ``None``."""

    if not name or len(name) > 160 or any(ord(char) < 0x20 for char in name):
        return None
    return name
