"""CrewChat: app-owned Crew chat sessions over REST only.

Runtime Ghosts run in chat sessions the app creates and owns.  This adapter
is the one place that knows the S6 call order and bodies:

    create slot -> set project folder -> set interactive mode -> send turn

plus two reads and answers used by the Session_Reconciler: one bounded
session snapshot and one exact permission answer.  Every request goes
through ``GatewayClient`` (loopback only, manifest-checked, token in memory,
redacted errors).  There is no spawn call, no global approval call, and no
event stream here: Crew events reach the house only as acknowledged
canonical records.

Failures are ``CrewChatError`` with a fixed code; no gateway text, path, or
token is carried.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal, Protocol, cast

from haunted_house.adapters.gateway_client import MAX_CHAT_MESSAGE_BYTES, GatewayError
from haunted_house.core.approvals import PendingPermission
from haunted_house.core.seance_event import JSONValue

__all__ = [
    "MAX_TOOL_INPUT_CHARACTERS",
    "MAX_TURN_BYTES",
    "ChatGateway",
    "CrewChat",
    "CrewChatError",
    "CrewSessionSnapshot",
    "ResolveResult",
    "SessionBinding",
    "SessionPermission",
    "SessionRequest",
    "SessionTurn",
    "StopResult",
    "TurnResult",
    "qualified_tool_name",
]

MAX_TOOL_INPUT_CHARACTERS = 64 * 1024
# The largest turn text Crew is sent: one skill block and one bounded prompt.
MAX_TURN_BYTES = MAX_CHAT_MESSAGE_BYTES
_MAX_LABEL = 200


class ChatGateway(Protocol):
    """The typed chat routes ``GatewayClient`` provides."""

    async def create_chat_slot(self, name: str, agent: str) -> dict[str, Any]: ...

    async def set_chat_slot_project(self, slot: str, project: str) -> dict[str, Any]: ...

    async def set_chat_slot_interactive(self, slot: str) -> dict[str, Any]: ...

    async def send_chat_turn(self, slot: str, message: str) -> dict[str, Any]: ...

    async def session_history(self, slot: str) -> dict[str, Any]: ...

    async def resolve_chat_approval(
        self, slot: str, request_id: str, request_mid: str, action: str
    ) -> dict[str, Any]: ...

    async def stop_chat_slot(self, slot: str) -> dict[str, Any]: ...


class CrewChatError(RuntimeError):
    """A Crew call failed.  ``code`` is ``crew_timeout`` or ``crew_failed``.

    ``status``, ``gateway_code`` and ``retry_after`` repeat the HTTP status,
    Crew's own error code, and the ``Retry-After`` seconds of the refusal when
    it had them (Room Ghosts classifies capacity pressure from these, RG-S5).
    They are a number and a bounded redacted code; no gateway text travels.
    """

    def __init__(
        self,
        code: Literal["crew_timeout", "crew_failed"],
        step: str,
        *,
        status: int | None = None,
        gateway_code: str | None = None,
        retry_after: int | None = None,
    ) -> None:
        self.code = code
        self.step = step
        self.status = status if type(status) is int else None
        self.gateway_code = gateway_code if type(gateway_code) is str else None
        self.retry_after = retry_after if type(retry_after) is int else None
        super().__init__(f"{code}:{step}")


@dataclass(frozen=True, slots=True)
class SessionRequest:
    """What the house decided: a label, the Ghost's agent, and the Mansion
    directory the server resolved.  Nothing here is request input."""

    name: str
    agent: str
    project_directory: str


@dataclass(frozen=True, slots=True)
class SessionBinding:
    slot: str

    @property
    def session_label(self) -> str:
        """The label Crew gives this session's MCP servers."""

        return f"dashboard:{self.slot}"


@dataclass(frozen=True, slots=True)
class TurnResult:
    queued: bool


@dataclass(frozen=True, slots=True)
class SessionTurn:
    """What one owned session's history says about its latest turn.

    ``final_text`` is the last assistant message after the last message the
    house sent, or ``None`` when there is none.  ``notices`` are the
    ``meta.notice`` values Crew left after that message (RG-S5) and
    ``stop_state`` the state of the latest ``stop_event`` row (RG-S3).
    ``activity`` says the session did anything at all after that message.
    """

    final_text: str | None = None
    notices: tuple[str, ...] = ()
    stop_state: str | None = None
    activity: bool = False


@dataclass(frozen=True, slots=True)
class StopResult:
    """``stopped``: Crew answered ``ok`` with no ``info``, so the cancel
    settled.  ``not_stopped``: the answer carried ``info`` or no ``ok``;
    nothing was stopped."""

    status: Literal["stopped", "not_stopped"]


@dataclass(frozen=True, slots=True)
class SessionPermission:
    """One permission message of a session and whether Crew settled it."""

    message: PendingPermission
    resolved: str | None  # "approved", "rejected", another Crew outcome, or None


@dataclass(frozen=True, slots=True)
class CrewSessionSnapshot:
    slot: str
    permissions: tuple[SessionPermission, ...]

    def permission(self, mid: str) -> SessionPermission | None:
        return next((item for item in self.permissions if item.message.mid == mid), None)


@dataclass(frozen=True, slots=True)
class ResolveResult:
    """``resolved``: Crew took this answer.  ``not_pending``: the prompt was
    already answered or is gone, so another answer won."""

    status: Literal["resolved", "not_pending"]


def qualified_tool_name(server: object, tool: object) -> str:
    """One comparable name for an MCP tool: ``<server>/<tool>``.

    Crew reports the server and the tool separately.  A tool reported with
    no server keeps its bare name.
    """

    name = tool if type(tool) is str else ""
    if type(server) is str and server:
        return f"{server}/{name}"
    return cast(str, name)


class CrewChat:
    def __init__(self, gateway: ChatGateway | Callable[[], ChatGateway | None]) -> None:
        self._provide: Callable[[], ChatGateway | None] = (
            gateway if callable(gateway) else (lambda: cast(ChatGateway, gateway))
        )

    def _gateway(self, step: str) -> ChatGateway:
        client = self._provide()
        if client is None:
            raise CrewChatError("crew_failed", step)
        return client

    async def _call(self, step: str, call: Callable[[ChatGateway], Any]) -> dict[str, Any]:
        client = self._gateway(step)
        failure: CrewChatError | None = None
        try:
            return await call(client)
        except GatewayError as error:
            # Only the kind, status and code: gateway text never travels further.
            failure = _crew_failure(error, step)
        raise failure from None

    async def create_bound_session(self, request: SessionRequest) -> SessionBinding:
        """Create a slot, bind it to the Mansion folder, keep it interactive.

        The turn is sent separately, after the house has recorded the
        binding.  Any failure leaves no turn running.
        """

        created = await self._call(
            "create_slot", lambda client: client.create_chat_slot(request.name, request.agent)
        )
        slot = created.get("key")
        if type(slot) is not str or not slot:
            raise CrewChatError("crew_failed", "create_slot")
        await self._call(
            "set_project",
            lambda client: client.set_chat_slot_project(slot, request.project_directory),
        )
        await self._call("set_mode", lambda client: client.set_chat_slot_interactive(slot))
        return SessionBinding(slot)

    async def send_turn(self, binding: SessionBinding, text: str) -> TurnResult:
        receipt = await self._call(
            "send_turn", lambda client: client.send_chat_turn(binding.slot, text)
        )
        if receipt.get("ok") is not True:
            raise CrewChatError("crew_failed", "send_turn")
        return TurnResult(queued=receipt.get("queued") is True)

    async def get_session(self, slot: str) -> CrewSessionSnapshot:
        """Read one owned session's bounded history as typed permissions."""

        history = await self._call("get_session", lambda client: client.session_history(slot))
        return CrewSessionSnapshot(slot, _permissions(slot, history.get("messages")))

    async def read_turn(self, slot: str) -> SessionTurn:
        """Read the latest turn of one owned session from its bounded history."""

        history = await self._call("read_turn", lambda client: client.session_history(slot))
        return _latest_turn(history.get("messages"))

    async def stop_turn(self, slot: str) -> StopResult:
        """Ask Crew once to stop the session's turn (RG-S3).  Never retried."""

        reply = await self._call("stop_turn", lambda client: client.stop_chat_slot(slot))
        stopped = reply.get("ok") is True and "info" not in reply
        return StopResult("stopped" if stopped else "not_stopped")

    async def resolve_permission(
        self, permission: PendingPermission, decision: Literal["approved", "rejected"]
    ) -> ResolveResult:
        """Answer exactly this prompt with its ``approval_id`` and ``mid``."""

        client = self._gateway("resolve_permission")
        failure: CrewChatError | None = None
        try:
            await client.resolve_chat_approval(
                permission.slot, permission.approval_id, permission.mid, decision
            )
            return ResolveResult("resolved")
        except GatewayError as error:
            if error.kind == "http" and error.status in (404, 409, 410):
                # Someone else answered first, or the prompt expired.
                return ResolveResult("not_pending")
            failure = CrewChatError(
                "crew_timeout" if error.kind == "timeout" else "crew_failed",
                "resolve_permission",
            )
        raise failure from None


def _crew_failure(error: GatewayError, step: str) -> CrewChatError:
    return CrewChatError(
        "crew_timeout" if error.kind == "timeout" else "crew_failed",
        step,
        status=error.status,
        gateway_code=error.code,
        retry_after=getattr(error, "retry_after", None),
    )


def _permissions(slot: str, messages: object) -> tuple[SessionPermission, ...]:
    if type(messages) is not list:
        return ()
    found: dict[str, SessionPermission] = {}
    for raw in cast(list[object], messages):
        if type(raw) is not dict:
            continue
        message = cast(dict[str, object], raw)
        if message.get("role") != "permission":
            continue
        meta = message.get("meta")
        fields = cast(dict[str, object], meta) if type(meta) is dict else {}

        def read(key: str) -> object:
            return fields[key] if key in fields else message.get(key)

        mid = read("mid")
        approval_id = fields.get("approval_id", fields.get("request_id", message.get("approval_id")))
        if not _label(mid) or not _label(approval_id):
            continue
        resolved = read("resolved")
        found[cast(str, mid)] = SessionPermission(
            PendingPermission(
                slot=slot,
                mid=cast(str, mid),
                approval_id=cast(str, approval_id),
                tool_name=qualified_tool_name(read("mcp_server"), read("tool_name")),
                tool_input=_tool_input(read("tool_input")),
            ),
            resolved if type(resolved) is str and resolved else None,
        )
    return tuple(found.values())


def _latest_turn(messages: object) -> SessionTurn:
    if type(messages) is not list:
        return SessionTurn()
    final: str | None = None
    notices: list[str] = []
    stop_state: str | None = None
    activity = False
    for raw in cast(list[object], messages):
        if type(raw) is not dict:
            continue
        message = cast(dict[str, object], raw)
        role, content = message.get("role"), message.get("content")
        meta = message.get("meta")
        fields = cast(dict[str, object], meta) if type(meta) is dict else {}
        if role == "user":
            # A new house message starts a new turn: forget the one before.
            final, notices, stop_state, activity = None, [], None, False
            continue
        if role in ("assistant", "permission", "tool"):
            activity = True
        if role == "assistant" and type(content) is str and content.strip():
            final = cast(str, content)
        notice = fields.get("notice")
        if _label(notice) and len(notices) < 16:
            notices.append(cast(str, notice))
        if fields.get("kind") == "stop_event" and _label(fields.get("state")):
            stop_state = cast(str, fields["state"])
    return SessionTurn(final, tuple(notices), stop_state, activity)


def _label(value: object) -> bool:
    return type(value) is str and 0 < len(cast(str, value)) <= _MAX_LABEL


def _tool_input(value: object) -> Mapping[str, JSONValue]:
    """The tool input as an object.  Crew may deliver it as JSON text."""

    if type(value) is str and len(cast(str, value)) <= MAX_TOOL_INPUT_CHARACTERS:
        try:
            value = json.loads(cast(str, value))
        except (ValueError, RecursionError):
            return {}
    return cast(dict[str, JSONValue], value) if type(value) is dict else {}
