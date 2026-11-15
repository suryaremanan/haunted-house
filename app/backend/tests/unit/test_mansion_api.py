"""Contract and trust-boundary tests for the Mansion_API routes.

Requests go through a real aiohttp test server and the real proxy-signature
middleware. One group drives the real service over temporary directories; the
other uses a spy service to prove error mapping and that refused requests never
reach the service. Nothing touches the real mansion root.
"""

import asyncio
import json
import logging
import os
from pathlib import Path

import pytest
from aiohttp.test_utils import TestClient, TestServer
from yarl import URL

from haunted_house.adapters.mansion_filesystem import MansionFilesystem
from haunted_house.adapters.mansion_metadata import FileMansionMetadataStore
from haunted_house.adapters.mansion_service import (
    CreateResult,
    MansionService,
    MansionServiceError,
)
from haunted_house.adapters.settings import Settings
from haunted_house.core.mansion_descriptors import MansionDescriptor
from haunted_house.core.mansion_planner import CreateOutcome, ProjectStatus
from haunted_house.core.proxy_signature import WINDOW_SECONDS, sign
from haunted_house.mansion_routes import (
    ERROR_MESSAGES,
    ERROR_STATUSES,
    live_mansion_service,
)
from haunted_house.server import PROXY_HEADER, build_app, build_live_app

KEY = "k3y-for-tests"  # short on purpose: not a real credential
NOW = 1_731_400_000
NAME = "weather-station"
SENSITIVE = "/Users/someone/private-token-abc123"
JSON = {"Content-Type": "application/json"}

DOCUMENTED_CODES = {
    "invalid_request",
    "invalid_mansion_name",
    "unsafe_mansion_root",
    "symlink_escape",
    "mansion_conflict",
    "mansion_missing",
    "mansion_not_registered",
    "metadata_unavailable",
    "filesystem_error",
}


def descriptor(name: str = NAME, status: str = "ready") -> dict[str, str]:
    return {
        "name": name,
        "projectSpec": name,
        "displayPath": f"~/workspace/haunted-house/mansions/{name}",
        "status": status,
    }


def error_body(code: str) -> dict:
    return {"error": {"code": code, "message": ERROR_MESSAGES[code]}}


def signed(method: str, target: str, body: bytes = b"", extra=None) -> dict[str, str]:
    headers = {PROXY_HEADER: sign(KEY, NOW, method, target, body)}
    headers.update(extra or {})
    return headers


def exchange(app, requests):
    """Send each (method, target, headers, body); return (status, parsed, text)."""

    async def go():
        results = []
        async with TestClient(TestServer(app)) as client:
            for method, target, headers, body in requests:
                url = URL(target, encoded=True)
                async with client.request(
                    method, url, headers=headers, data=body
                ) as response:
                    text = await response.text()
                    try:
                        parsed = json.loads(text)
                    except ValueError:
                        parsed = None
                    results.append((response.status, parsed, text))
        return results

    return asyncio.run(go())


def post(target: str, payload, *, headers=None):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return ("POST", target, signed("POST", target, body, JSON if headers is None else headers), body)


def get(target: str = "/api/mansions"):
    return ("GET", target, signed("GET", target), None)


class Real:
    """The real service over temporary directories."""

    def __init__(self, tmp_path: Path) -> None:
        self.approved = tmp_path / "home" / "workspace"
        self.approved.mkdir(parents=True)
        self.root = self.approved / "haunted-house" / "mansions"
        self.app_root = tmp_path / "app"
        (self.app_root / "data").mkdir(parents=True)
        (self.app_root / "app.json").write_text("{}", encoding="utf-8")
        self.registry = self.app_root / "data" / "mansions-v1.json"
        self.settings = Settings(
            port=1,
            secret=KEY,
            gateway_origin=None,
            app_name="haunted-house",
            mansion_root=self.root,
            approved_roots=(self.approved,),
        )
        self.service = MansionService(
            MansionFilesystem(self.root, (self.approved,)),
            FileMansionMetadataStore(self.app_root),
        )

    def app(self):
        return build_app(
            self.settings, clock=lambda: NOW, mansion_service=self.service
        )


class SpyService:
    """Counts calls and returns or raises what the test sets."""

    def __init__(self, raises: Exception | None = None) -> None:
        self.raises = raises
        self.calls: list[tuple[str, object]] = []

    def _result(self, operation: str, name: object):
        self.calls.append((operation, name))
        if self.raises is not None:
            raise self.raises
        return MansionDescriptor(
            name=NAME,
            project_spec=NAME,
            display_path=f"~/workspace/haunted-house/mansions/{NAME}",
            status=ProjectStatus.READY,
        )

    async def list_mansions(self):
        return (self._result("list", None),)

    async def create_mansion(self, name):
        return CreateResult(
            outcome=CreateOutcome.CREATED, mansion=self._result("create", name)
        )

    async def open_mansion(self, name):
        return self._result("open", name)


def spy_app(spy: SpyService):
    settings = Settings(port=1, secret=KEY, gateway_origin=None, app_name="haunted-house")
    return build_app(settings, clock=lambda: NOW, mansion_service=lambda: spy)


def tree(base: Path) -> dict[str, bytes | None]:
    seen: dict[str, bytes | None] = {}
    for current, directories, files in os.walk(base):
        for entry in directories:
            seen[(Path(current) / entry).relative_to(base).as_posix()] = None
        for entry in files:
            path = Path(current) / entry
            seen[path.relative_to(base).as_posix()] = path.read_bytes()
    return seen


# --- Success contract -------------------------------------------------------


def test_list_create_open_success_bodies_and_statuses(tmp_path):
    real = Real(tmp_path)

    results = exchange(
        real.app(),
        [
            get(),
            post("/api/mansions", {"name": NAME}),
            post("/api/mansions", {"name": NAME}),
            post("/api/mansions", {"name": "alpha"}),
            post("/api/mansions/open", {"name": NAME}),
            get(),
            get("/api/mansions?refresh=1"),
        ],
    )

    assert [(status, body) for status, body, _text in results] == [
        (200, {"schemaVersion": 1, "mansions": []}),
        (201, {"outcome": "created", "mansion": descriptor()}),
        (200, {"outcome": "existing_compatible", "mansion": descriptor()}),
        (201, {"outcome": "created", "mansion": descriptor("alpha")}),
        (200, {"mansion": descriptor()}),
        (200, {"schemaVersion": 1, "mansions": [descriptor("alpha"), descriptor()]}),
        (200, {"schemaVersion": 1, "mansions": [descriptor("alpha"), descriptor()]}),
    ]
    for _status, _body, text in results:
        assert str(tmp_path) not in text and str(Path.home()) not in text
    assert sorted(tree(real.root)) == sorted(
        f"{name}{suffix}"
        for name in ("alpha", NAME)
        for suffix in ("", "/.kiro", "/.kiro/specs", f"/.kiro/specs/{name}")
    )


def test_adopting_a_compatible_project_returns_200_and_changes_no_byte(tmp_path):
    real = Real(tmp_path)
    target = real.root / NAME
    (target / ".kiro" / "specs" / NAME).mkdir(parents=True)
    (target / "main.py").write_bytes(b"print('mine')\n")
    before = tree(real.root)

    [(status, body, _text)] = exchange(real.app(), [post("/api/mansions", {"name": NAME})])

    assert (status, body) == (
        200,
        {"outcome": "existing_compatible", "mansion": descriptor()},
    )
    assert tree(real.root) == before


def test_missing_and_conflicting_registered_projects_are_listed_and_not_opened(
    tmp_path,
):
    real = Real(tmp_path)
    app = real.app()
    exchange(
        app,
        [post("/api/mansions", {"name": name}) for name in ("gone", "broken", "fine")],
    )
    for path in sorted((real.root / "gone").rglob("*"), reverse=True):
        path.rmdir()
    (real.root / "gone").rmdir()
    (real.root / "broken" / ".kiro" / "specs" / "broken").rmdir()
    registry = real.registry.read_bytes()

    results = exchange(
        real.app(),
        [
            get(),
            post("/api/mansions/open", {"name": "gone"}),
            post("/api/mansions/open", {"name": "broken"}),
            post("/api/mansions/open", {"name": "fine"}),
            post("/api/mansions/open", {"name": "never-made"}),
            post("/api/mansions", {"name": "broken"}),
        ],
    )

    assert [(status, body) for status, body, _text in results] == [
        (
            200,
            {
                "schemaVersion": 1,
                "mansions": [
                    descriptor("broken", "conflict"),
                    descriptor("fine"),
                    descriptor("gone", "missing"),
                ],
            },
        ),
        (409, error_body("mansion_missing")),
        (409, error_body("mansion_conflict")),
        (200, {"mansion": descriptor("fine")}),
        (404, error_body("mansion_not_registered")),
        (409, error_body("mansion_conflict")),
    ]
    assert real.registry.read_bytes() == registry
    assert not (real.root / "gone").exists()
    assert not (real.root / "never-made").exists()


def test_conflicting_target_returns_409_and_is_left_unchanged(tmp_path):
    real = Real(tmp_path)
    real.root.mkdir(parents=True)
    (real.root / NAME).write_bytes(b"a file, not a project")
    outside = tmp_path / "outside"
    outside.mkdir()
    (real.root / "linked").symlink_to(outside, target_is_directory=True)

    results = exchange(
        real.app(),
        [
            post("/api/mansions", {"name": NAME}),
            post("/api/mansions", {"name": "linked"}),
        ],
    )

    assert [(status, body) for status, body, _text in results] == [
        (409, error_body("mansion_conflict")),
        (409, error_body("symlink_escape")),
    ]
    assert (real.root / NAME).read_bytes() == b"a file, not a project"
    assert tree(outside) == {}
    assert not real.registry.exists()


# --- Request shape and names ------------------------------------------------

MALFORMED_BODIES = [
    b"",
    b"{",
    b"not json",
    b"null",
    b"[]",
    b'"weather-station"',
    b"7",
    b"{}",
    b'{"name": 7}',
    b'{"name": null}',
    b'{"name": ["weather-station"]}',
    b'{"name": {"name": "weather-station"}}',
    b'{"Name": "weather-station"}',
    b'{"name": "weather-station", "path": "/tmp/x"}',
    b'{"name": "weather-station", "name": "weather-station"}',
    b'{"name": "a", "name": "b"}',
    b'{"name": "weather-station"} trailing',
    b'{"name": NaN}',
    b'{"name": "\xff"}',
    b"[" * 100_000,
]


@pytest.mark.parametrize("target", ["/api/mansions", "/api/mansions/open"])
@pytest.mark.parametrize("body", MALFORMED_BODIES, ids=lambda b: repr(b[:40]))
def test_malformed_body_is_400_and_never_reaches_the_service(target, body):
    spy = SpyService()

    [(status, parsed, _text)] = exchange(spy_app(spy), [post(target, body)])

    assert (status, parsed) == (400, error_body("invalid_request"))
    assert spy.calls == []


@pytest.mark.parametrize("target", ["/api/mansions", "/api/mansions/open"])
@pytest.mark.parametrize(
    "content_type",
    [None, "text/plain", "application/x-www-form-urlencoded", "application/jsonx"],
)
def test_non_json_content_type_is_400_and_never_reaches_the_service(
    target, content_type
):
    spy = SpyService()
    headers = {} if content_type is None else {"Content-Type": content_type}

    [(status, parsed, _text)] = exchange(
        spy_app(spy), [post(target, {"name": NAME}, headers=headers)]
    )

    assert (status, parsed) == (400, error_body("invalid_request"))
    assert spy.calls == []


def test_json_content_type_with_a_charset_is_accepted():
    spy = SpyService()

    [(status, _parsed, _text)] = exchange(
        spy_app(spy),
        [
            post(
                "/api/mansions/open",
                {"name": NAME},
                headers={"Content-Type": "application/json; charset=utf-8"},
            )
        ],
    )

    assert status == 200
    assert spy.calls == [("open", NAME)]


INVALID_NAMES = [
    "",
    "Weather",
    "weather_station",
    "-a",
    "a-",
    "a--b",
    " a",
    "a ",
    "a\n",
    "../../etc",
    "a/b",
    "..",
    "wéather",
    "a" * 41,
    "/tmp/absolute",
    "~",
]


@pytest.mark.parametrize("target", ["/api/mansions", "/api/mansions/open"])
@pytest.mark.parametrize("name", INVALID_NAMES, ids=repr)
def test_invalid_name_is_422_and_changes_nothing(tmp_path, target, name):
    real = Real(tmp_path)
    before = tree(tmp_path)

    [(status, parsed, _text)] = exchange(real.app(), [post(target, {"name": name})])

    # The exact body also proves the rejected name is not echoed back.
    assert (status, parsed) == (422, error_body("invalid_mansion_name"))
    assert tree(tmp_path) == before
    assert not real.root.exists()


def test_name_is_used_exactly_without_trimming_or_case_folding(tmp_path):
    real = Real(tmp_path)

    results = exchange(
        real.app(),
        [
            post("/api/mansions", {"name": "a" * 40}),
            post("/api/mansions", {"name": "A" * 40}),
            post("/api/mansions", {"name": " " + "a" * 39}),
        ],
    )

    assert [status for status, _body, _text in results] == [201, 422, 422]
    assert sorted(path.name for path in real.root.iterdir()) == ["a" * 40]


# --- Error mapping with sensitive text --------------------------------------


@pytest.mark.parametrize("code", sorted(DOCUMENTED_CODES - {"invalid_request"}))
@pytest.mark.parametrize("operation", ["list", "create", "open"])
def test_service_errors_map_to_documented_status_and_fixed_copy(code, operation):
    spy = SpyService(raises=MansionServiceError(code))
    request = {
        "list": get(),
        "create": post("/api/mansions", {"name": NAME}),
        "open": post("/api/mansions/open", {"name": NAME}),
    }[operation]

    [(status, parsed, _text)] = exchange(spy_app(spy), [request])

    expected_status = {
        "invalid_mansion_name": 422,
        "mansion_not_registered": 404,
        "mansion_missing": 409,
        "mansion_conflict": 409,
        "symlink_escape": 409,
        "unsafe_mansion_root": 500,
        "metadata_unavailable": 500,
        "filesystem_error": 500,
    }[code]
    assert (status, parsed) == (expected_status, error_body(code))
    assert len(spy.calls) == 1


@pytest.mark.parametrize(
    "exception",
    [
        OSError(13, "Permission denied", SENSITIVE),
        RuntimeError(f"failed at {SENSITIVE}"),
        KeyError(SENSITIVE),
        MansionServiceError("not_a_documented_code"),  # type: ignore[arg-type]
    ],
    ids=["OSError", "RuntimeError", "KeyError", "unknown code"],
)
@pytest.mark.parametrize("operation", ["list", "create", "open"])
def test_unexpected_failures_are_500_without_exception_text(
    exception, operation, caplog
):
    caplog.set_level(logging.DEBUG)
    spy = SpyService(raises=exception)
    request = {
        "list": get(),
        "create": post("/api/mansions", {"name": NAME}),
        "open": post("/api/mansions/open", {"name": NAME}),
    }[operation]

    [(status, parsed, text)] = exchange(spy_app(spy), [request])

    assert (status, parsed) == (500, error_body("filesystem_error"))
    assert SENSITIVE not in text and "private-token" not in text
    assert "Traceback" not in text
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert SENSITIVE not in logged and "private-token" not in logged
    assert not any(record.exc_info for record in caplog.records)


@pytest.mark.parametrize(
    "payload",
    [b"{broken " + SENSITIVE.encode(), b'{"schemaVersion": 99, "mansions": []}'],
    ids=["malformed", "unsupported version"],
)
def test_unreadable_registry_is_500_metadata_unavailable_and_preserved(
    tmp_path, payload
):
    real = Real(tmp_path)
    real.registry.write_bytes(payload)

    results = exchange(
        real.app(),
        [
            get(),
            post("/api/mansions", {"name": NAME}),
            post("/api/mansions/open", {"name": NAME}),
        ],
    )

    for status, parsed, text in results:
        assert (status, parsed) == (500, error_body("metadata_unavailable"))
        assert SENSITIVE not in text and str(tmp_path) not in text
    assert real.registry.read_bytes() == payload
    assert not real.root.exists()


def test_unsafe_root_is_500_and_writes_nothing(tmp_path):
    real = Real(tmp_path)
    outside = tmp_path / "not-approved" / "mansions"
    service = MansionService(
        MansionFilesystem(outside, (real.approved,)),
        FileMansionMetadataStore(real.app_root),
    )
    app = build_app(real.settings, clock=lambda: NOW, mansion_service=service)

    [(status, parsed, text)] = exchange(app, [post("/api/mansions", {"name": NAME})])

    assert (status, parsed) == (500, error_body("unsafe_mansion_root"))
    assert str(tmp_path) not in text
    assert not outside.exists()
    assert not real.registry.exists()


def test_error_table_covers_exactly_the_documented_codes():
    assert set(ERROR_STATUSES) == DOCUMENTED_CODES == set(ERROR_MESSAGES)
    for message in ERROR_MESSAGES.values():
        assert message.strip() and len(message) <= 200
        assert "/" not in message and "\n" not in message


# --- Operation boundary -----------------------------------------------------


@pytest.mark.parametrize(
    ("method", "target", "expected"),
    [
        ("DELETE", "/api/mansions", 405),
        ("PUT", "/api/mansions", 405),
        ("PATCH", "/api/mansions", 405),
        ("DELETE", "/api/mansions/open", 405),
        ("GET", "/api/mansions/open", 405),
        ("PUT", "/api/mansions/open", 405),
        ("DELETE", f"/api/mansions/{NAME}", 404),
        ("POST", f"/api/mansions/{NAME}", 404),
        ("GET", f"/api/mansions/{NAME}", 404),
        ("POST", "/api/mansions/delete", 404),
        ("POST", "/api/mansions/rename", 404),
        ("POST", "/api/mansions/archive", 404),
        ("POST", "/api/mansions/import", 404),
        ("POST", "/api/mansions/open/extra", 404),
        ("POST", "/api/mansions/", 404),
        ("POST", "/api/mansion", 404),
    ],
)
def test_unsupported_methods_and_paths_change_nothing(tmp_path, method, target, expected):
    real = Real(tmp_path)
    exchange(real.app(), [post("/api/mansions", {"name": NAME})])
    project, registry = tree(real.root), real.registry.read_bytes()
    body = json.dumps({"name": NAME}).encode()

    [(status, _parsed, _text)] = exchange(
        real.app(), [(method, target, signed(method, target, body, JSON), body)]
    )

    assert status == expected
    assert tree(real.root) == project
    assert real.registry.read_bytes() == registry


def test_only_three_mansion_routes_are_registered():
    app = spy_app(SpyService())
    routes = sorted(
        (route.method, route.resource.canonical)
        for route in app.router.routes()
        if route.resource is not None and "mansion" in route.resource.canonical
    )
    assert routes == [
        ("GET", "/api/mansions"),
        ("POST", "/api/mansions"),
        ("POST", "/api/mansions/open"),
    ]


def test_app_without_a_mansion_service_has_no_mansion_routes():
    settings = Settings(port=1, secret=KEY, gateway_origin=None, app_name="haunted-house")
    app = build_app(settings, clock=lambda: NOW)

    [(status, _parsed, _text)] = exchange(app, [get()])

    assert status == 404


# --- Trust boundary ---------------------------------------------------------


def unsigned_requests():
    body = json.dumps({"name": NAME}).encode()
    stale = NOW - WINDOW_SECONDS - 1
    cases = []
    for method, target, payload in [
        ("GET", "/api/mansions", b""),
        ("POST", "/api/mansions", body),
        ("POST", "/api/mansions/open", body),
    ]:
        good = sign(KEY, NOW, method, target, payload)
        cases += [
            (method, target, dict(JSON), payload),  # no header
            (method, target, {**JSON, PROXY_HEADER: ""}, payload),
            (method, target, {**JSON, PROXY_HEADER: good[:-1] + "0"}, payload),
            (method, target, {**JSON, PROXY_HEADER: sign("0ther-k3y", NOW, method, target, payload)}, payload),
            (method, target, {**JSON, PROXY_HEADER: sign(KEY, stale, method, target, payload)}, payload),
        ]
    # A valid signature for another body, method, or path does not transfer.
    other = json.dumps({"name": "other"}).encode()
    cases += [
        ("POST", "/api/mansions", {**JSON, PROXY_HEADER: sign(KEY, NOW, "POST", "/api/mansions", other)}, body),
        ("POST", "/api/mansions", {**JSON, PROXY_HEADER: sign(KEY, NOW, "POST", "/api/mansions/open", body)}, body),
        ("POST", "/api/mansions", {**JSON, PROXY_HEADER: sign(KEY, NOW, "GET", "/api/mansions", b"")}, body),
        ("POST", "/%61pi/mansions", {**JSON, PROXY_HEADER: sign(KEY, NOW, "POST", "/api/mansions", body)}, body),
    ]
    return cases


def test_unsigned_forged_and_stale_requests_never_reach_the_service():
    spy = SpyService()
    cases = unsigned_requests()

    results = exchange(spy_app(spy), cases)

    assert [status for status, _body, _text in results] == [401] * len(cases)
    assert all(body == {"error": "bad_proxy_signature"} for _status, body, _text in results)
    assert spy.calls == []


def test_unsigned_requests_change_nothing_on_the_real_service(tmp_path):
    real = Real(tmp_path)
    before = tree(tmp_path)
    body = json.dumps({"name": NAME}).encode()

    results = exchange(
        real.app(),
        [
            ("POST", "/api/mansions", dict(JSON), body),
            ("POST", "/api/mansions/open", dict(JSON), body),
            ("GET", "/api/mansions", {}, None),
        ],
    )

    assert [status for status, _body, _text in results] == [401, 401, 401]
    assert tree(tmp_path) == before


def test_body_over_one_mebibyte_is_refused_before_the_service():
    spy = SpyService()
    body = json.dumps({"name": "a" * (1024 * 1024 + 16)}).encode()

    [(status, _parsed, _text)] = exchange(spy_app(spy), [post("/api/mansions", body)])

    assert status == 413
    assert spy.calls == []


def test_body_just_under_the_limit_is_parsed_and_rejected_by_name(tmp_path):
    real = Real(tmp_path)
    body = json.dumps({"name": "a" * (1024 * 1024 - 64)}).encode()

    [(status, parsed, _text)] = exchange(real.app(), [post("/api/mansions", body)])

    assert (status, parsed) == (422, error_body("invalid_mansion_name"))
    assert not real.root.exists()


# --- Live wiring ------------------------------------------------------------


def test_live_provider_builds_the_service_from_settings_and_app_data(tmp_path):
    real = Real(tmp_path)
    provider = live_mansion_service(real.settings, app_root=real.app_root)
    app = build_app(real.settings, clock=lambda: NOW, mansion_service=provider)

    results = exchange(app, [post("/api/mansions", {"name": NAME}), get()])

    assert [status for status, _body, _text in results] == [201, 200]
    assert provider() is provider()  # built once
    assert (real.root / NAME / ".kiro" / "specs" / NAME).is_dir()
    assert json.loads(real.registry.read_text())["mansions"][0]["name"] == NAME


def test_live_provider_fails_closed_without_app_data_then_recovers(tmp_path):
    real = Real(tmp_path)
    (real.app_root / "data").rmdir()
    provider = live_mansion_service(real.settings, app_root=real.app_root)
    app = build_app(real.settings, clock=lambda: NOW, mansion_service=provider)

    results = exchange(app, [get(), post("/api/mansions", {"name": NAME})])

    assert [(status, body) for status, body, _text in results] == [
        (500, error_body("metadata_unavailable")),
        (500, error_body("metadata_unavailable")),
    ]
    assert not real.root.exists()
    assert not (real.app_root / "data").exists()  # no fallback location made

    (real.app_root / "data").mkdir()
    [(status, _body, _text)] = exchange(
        build_app(real.settings, clock=lambda: NOW, mansion_service=provider),
        [get()],
    )
    assert status == 200


def test_build_live_app_registers_mansion_routes_and_fails_closed_off_app_root(
    tmp_path, monkeypatch
):
    real = Real(tmp_path)
    elsewhere = tmp_path / "not-an-app"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    manifest = tmp_path / "app.json"
    manifest.write_text('{"permissions": {"api": []}}', encoding="utf-8")
    app = build_live_app(real.settings, manifest_path=manifest, clock=lambda: NOW)

    [(status, parsed, _text)] = exchange(app, [get()])

    assert (status, parsed) == (500, error_body("metadata_unavailable"))
    assert tree(elsewhere) == {}
    assert not real.root.exists()


def test_build_live_app_serves_mansions_from_the_app_root_cwd(tmp_path, monkeypatch):
    real = Real(tmp_path)
    monkeypatch.chdir(real.app_root)
    manifest = real.app_root / "app.json"
    app = build_live_app(real.settings, manifest_path=manifest, clock=lambda: NOW)

    results = exchange(
        app,
        [post("/api/mansions", {"name": NAME}), post("/api/mansions/open", {"name": NAME})],
    )

    assert [status for status, _body, _text in results] == [201, 200]
    assert real.registry.is_file()
    assert sorted(path.name for path in real.root.iterdir()) == [NAME]
