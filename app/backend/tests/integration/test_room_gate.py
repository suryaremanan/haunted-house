"""The backend room gate: capability-bound, loopback-only, fail closed.

Validates: Requirements 6.2, 6.9, 10.8, 11.7, 11.8.
"""

from __future__ import annotations

import asyncio
import json
import logging

import aiohttp
import pytest

from haunted_house.adapters.session_bindings import SessionBindingStore
from haunted_house.core.room_catalog import MAX_REQUEST_BYTES, TOOLS_BY_ROLE
from haunted_house.room_gate import (
    CAPABILITY_HEADER,
    LABEL_HEADER,
    SESSION_PATH,
    TOOL_PATH_PREFIX,
    RoomGate,
)
from tests.guardrail_support import MANSION, MemoryWriter
from tests.room_mcp_support import build_service, room_binding


class Parts:
    def __init__(self, tmp_path):
        self.app_root = tmp_path / "app"
        (self.app_root / "data").mkdir(parents=True)
        self.mansions = tmp_path / "mansions"
        (self.mansions / MANSION / "src").mkdir(parents=True)
        (self.mansions / MANSION / "src" / "a.txt").write_text("a")
        self.writer = MemoryWriter()
        self.store = SessionBindingStore(self.app_root / "data")
        self.gate = RoomGate(build_service(self.writer, self.mansions), self.store)

    def open(self, role, **changes):
        binding = room_binding(role, self.mansions, **changes)
        self.store.write(binding)
        return binding


@pytest.fixture
def parts(tmp_path):
    return Parts(tmp_path)


def headers(binding, **extra):
    return {LABEL_HEADER: binding.label, CAPABILITY_HEADER: binding.capability, **extra}


def serve(gate, scenario):
    async def run():
        port = await gate.start()
        try:
            async with aiohttp.ClientSession() as http:
                return await scenario(http, f"http://127.0.0.1:{port}")
        finally:
            await gate.stop()

    return asyncio.run(run())


def test_session_identity_comes_from_label_and_capability_alone(parts):
    tinker, archivist = parts.open("tinker"), parts.open("archivist")

    async def scenario(http, base):
        seen = {}
        for binding in (tinker, archivist):
            # A body that names another identity changes nothing.
            forged = {"room": "tinker", "role": "tinker", "mansion": "other", "slot": "x"}
            async with http.post(base + SESSION_PATH, json=forged, headers=headers(binding)) as response:
                seen[binding.role] = (response.status, await response.json())
        return seen

    seen = serve(parts.gate, scenario)
    assert seen["tinker"][0] == 200 and seen["tinker"][1]["tools"] == list(TOOLS_BY_ROLE["tinker"])
    assert seen["archivist"][1] == {
        "ok": True, "code": "bound", "label": "dashboard:hh-archivist-1", "ghost": "archivist-1",
        "mansion": MANSION, "room": "archivist", "spec": "demo-feature",
        "tools": list(TOOLS_BY_ROLE["archivist"]),
    }  # fmt: skip
    for binding in (tinker, archivist):
        assert binding.capability not in json.dumps(seen)


def test_requests_without_the_exact_label_and_capability_are_refused(parts, caplog):
    caplog.set_level(logging.DEBUG)
    tinker, archivist = parts.open("tinker"), parts.open("archivist")

    async def scenario(http, base):
        good = headers(tinker)
        url = base + TOOL_PATH_PREFIX + "list_room_files"
        out = {}

        async def status(name, method="POST", target=url, **kwargs):
            async with http.request(method, target, **kwargs) as response:
                out[name] = (response.status, await response.json())

        await status("none", json={})
        await status("no-label", json={}, headers={CAPABILITY_HEADER: tinker.capability})
        await status("no-capability", json={}, headers={LABEL_HEADER: tinker.label})
        await status("wrong", json={}, headers={**good, CAPABILITY_HEADER: "0" * 64})
        # Another session's capability does not open this session.
        await status("crossed", json={}, headers={**good, CAPABILITY_HEADER: archivist.capability})
        await status("query", target=url + "?capability=" + tinker.capability, json={})
        await status("get", method="GET", headers=good)
        await status("browser", json={}, headers={**good, "Origin": "http://evil.example"})
        await status("rebinding", json={}, headers={**good, "Host": "evil.example"})
        await status("not-json", data=b"{", headers=good)
        await status("too-big", data=b" " * (MAX_REQUEST_BYTES + 10), headers=good)
        await status("unknown-tool", target=base + TOOL_PATH_PREFIX + "shell", json={}, headers=good)
        await status("ok", json={}, headers=good)
        parts.store.remove(tinker.label)
        await status("closed", json={}, headers=good)
        return out

    out = serve(parts.gate, scenario)
    refused = ("none", "no-label", "no-capability", "wrong", "crossed", "query", "closed")
    assert [out[name][0] for name in refused] == [401] * len(refused)
    assert out["get"][0] == 405 and out["browser"][0] == 403 and out["rebinding"][0] == 403
    assert out["not-json"][1] == {"ok": False, "code": "invalid_arguments"}
    assert out["too-big"][1]["ok"] is False
    assert out["unknown-tool"][1] == {"ok": False, "code": "tool_not_available"}
    assert out["ok"][1]["ok"] is True
    for name in (*refused, "get", "browser", "rebinding"):
        assert out[name][1]["code"] == "blocked" and out[name][1]["ok"] is False
    assert parts.writer.events == []
    assert tinker.capability not in caplog.text and tinker.label not in caplog.text


def test_start_publishes_the_port_and_stop_closes_the_listener(parts):
    assert parts.gate.port is None and parts.store.read_endpoint() is None

    async def scenario(_http, _base):
        assert await parts.gate.start() == parts.gate.port  # idempotent
        return parts.gate.port, [address[0] for address in parts.gate._runner.addresses]

    port, hosts = serve(parts.gate, scenario)
    assert parts.store.read_endpoint() == port and hosts == ["127.0.0.1"]
    assert parts.gate.port is None

    async def closed():
        async with aiohttp.ClientSession() as http:
            with pytest.raises(aiohttp.ClientConnectionError):
                await http.post(f"http://127.0.0.1:{port}{SESSION_PATH}", json={})

    asyncio.run(closed())


def test_the_gate_does_not_start_when_its_port_cannot_be_published(parts):
    (parts.app_root / "data").rename(parts.app_root / "data-moved")

    async def start():
        with pytest.raises(Exception) as caught:
            await parts.gate.start()
        return str(caught.value)

    message = asyncio.run(start())
    assert parts.gate.port is None and str(parts.app_root) not in message


def test_lifecycle_runs_the_gate_for_the_life_of_the_app(parts):
    async def run():
        cycle = parts.gate.lifecycle(None)
        await cycle.__anext__()
        port = parts.gate.port
        with pytest.raises(StopAsyncIteration):
            await cycle.__anext__()
        return port

    assert asyncio.run(run()) is not None and parts.gate.port is None
