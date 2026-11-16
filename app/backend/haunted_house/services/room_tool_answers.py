"""RoomToolAnswerer: the house approves non-risky room-tool prompts itself.

Design decision 2026-11-16.  A Ghost session runs in interactive approval
mode, so every room MCP tool call raises a Crew permission prompt.  Without a
person at the dashboard a run stalls on its first ``read_room_file``.  The
house answers such a prompt on its own bound session only when ALL hold:

* the slot is app-owned and has a current binding of this backend for the
  Mansion being watched (the caller passes that binding);
* the prompt is still unresolved and names its ``approval_id`` and ``mid``;
* the prompt's tool is, by its MCP-namespaced name, one of
  ``HOUSE_ANSWERED_TOOLS`` that the binding's role is granted, served by that
  role's own room server.  A bare tool name with no server is ambiguous and
  is left alone;
* the feature is on (one setting, default on).

The proposal and execution tools, any Crew built-in, and anything else are
never answered here: they keep the human and ledger path.  Doors are not
prompts and are never touched.  Answering grants only the call itself; the
room gate still enforces path policy when the tool runs (product rules 1,
3, 4).

Each answer is first recorded in the séance log as one ``room_tool_answered``
domain record (actor ``house``, reason ``non_risky_room_tool``) through the
one writer, so replay shows it (product rule 6).  The record's identity is
derived from slot and ``mid``, so a retry is the same record.  Crew is then
answered with the prompt's ``approval_id`` and ``mid``; if someone answered
first, Crew says so and nothing else happens.
"""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass

from haunted_house.adapters.crew_chat import CrewChat, CrewChatError
from haunted_house.adapters.guardrail_port import GuardrailPort
from haunted_house.adapters.session_bindings import RoomBinding, session_label
from haunted_house.core.approvals import PendingPermission
from haunted_house.core.guardrail_events import (
    HOUSE_ANSWERED_TOOLS,
    GuardrailPayloadError,
    room_tool_answered,
)
from haunted_house.core.room_catalog import (
    APP_NAME,
    EXECUTION_TOOL,
    PROPOSAL_TOOL,
    SERVER_BY_ROLE,
    TOOLS_BY_ROLE,
    tool_selector,
)

__all__ = [
    "AnswerReport",
    "RoomToolAnswerer",
    "answer_bound_slot",
    "answer_id_for",
    "house_tool_names",
]

log = logging.getLogger(__name__)

_NEVER = frozenset({EXECUTION_TOOL, PROPOSAL_TOOL})
assert not _NEVER & set(HOUSE_ANSWERED_TOOLS)

BindingsFor = Callable[[str], Awaitable[Sequence[RoomBinding]]]


def house_tool_names(role: str) -> dict[str, str]:
    """Every MCP-namespaced spelling of ``role``'s answerable tools -> tool.

    The profile selector with and without ``@``, and ``<server>/<tool>`` for
    the server with and without the app prefix.  No bare tool name.
    """

    names: dict[str, str] = {}
    server = SERVER_BY_ROLE.get(role)
    if server is None:
        return names
    for tool in TOOLS_BY_ROLE[role]:
        if tool not in HOUSE_ANSWERED_TOOLS or tool in _NEVER:
            continue
        selector = tool_selector(role, tool)
        for spelling in (
            selector,
            selector[1:],
            f"{APP_NAME}:{server}/{tool}",
            f"{server}/{tool}",
        ):
            names[spelling] = tool
    return names


def answer_id_for(slot: str, mid: str) -> str:
    digest = hashlib.sha256(f"{slot}\x00{mid}".encode()).hexdigest()
    return f"house-{digest[:40]}"


@dataclass(frozen=True, slots=True)
class AnswerReport:
    answered: tuple[tuple[str, str, str], ...] = ()  # (slot, mid, tool)
    not_pending: tuple[tuple[str, str], ...] = ()
    failed: bool = False


class RoomToolAnswerer:
    def __init__(
        self,
        port: GuardrailPort,
        crew: CrewChat,
        *,
        enabled: bool | Callable[[], bool] = True,
    ) -> None:
        self._port = port
        self._crew = crew
        self._enabled = enabled

    @property
    def enabled(self) -> bool:
        return bool(self._enabled() if callable(self._enabled) else self._enabled)

    async def answer(self, mansion_id: str, binding: RoomBinding) -> AnswerReport:
        """Answer every eligible open prompt of ``binding``'s session."""

        if not self.enabled or binding.mansion != mansion_id:
            return AnswerReport()
        names = house_tool_names(binding.role)
        if not names:
            return AnswerReport()
        try:
            snapshot = await self._crew.get_session(binding.slot)
        except CrewChatError:
            return AnswerReport(failed=True)
        if snapshot.slot != binding.slot:
            return AnswerReport()
        answered: list[tuple[str, str, str]] = []
        not_pending: list[tuple[str, str]] = []
        failed = False
        for item in snapshot.permissions:
            message = item.message
            if item.resolved is not None or message.slot != binding.slot:
                continue
            tool = names.get(message.tool_name)
            if tool is None:
                continue  # not a non-risky room tool of this role: the human decides
            outcome = await self._answer_one(mansion_id, binding, message, tool)
            if outcome == "resolved":
                answered.append((message.slot, message.mid, tool))
            elif outcome == "not_pending":
                not_pending.append((message.slot, message.mid))
            else:
                failed = True
        return AnswerReport(tuple(answered), tuple(not_pending), failed)

    async def _answer_one(
        self, mansion_id: str, binding: RoomBinding, message: PendingPermission, tool: str
    ) -> str:
        try:
            candidate = room_tool_answered(
                binding.scope,
                answer_id=answer_id_for(message.slot, message.mid),
                session_slot=message.slot,
                mid=message.mid,
                tool=tool,
            )
        except GuardrailPayloadError:
            return "skipped"  # an unusable slot or mid label: leave it for the human
        # Recorded first: an answer the log does not hold is never sent.
        acknowledged = await self._port.append(mansion_id, [candidate])
        if not acknowledged.ok:
            return "failed"
        try:
            result = await self._crew.resolve_permission(message, "approved")
        except CrewChatError:
            return "failed"
        return result.status


class _BindingStore:  # the one method of SessionBindingStore used here
    def load(self, label: str) -> RoomBinding | None: ...


async def answer_bound_slot(
    answerer: RoomToolAnswerer | None,
    store: _BindingStore | None,
    mansion_id: str,
    slot: str,
) -> bool | None:
    """The TurnWatcher's ``answer`` seam: one slot, by its current binding.

    True when a prompt was answered, False when there was nothing to answer
    (or no current binding of this Mansion), None when Crew or the log failed.
    """

    if answerer is None or store is None or not answerer.enabled:
        return False
    try:
        binding = store.load(session_label(slot))
    except Exception:  # noqa: BLE001 - an unreadable binding is no identity
        return False
    if binding is None or binding.slot != slot or binding.mansion != mansion_id:
        return False
    report = await answerer.answer(mansion_id, binding)
    return None if report.failed else bool(report.answered)
