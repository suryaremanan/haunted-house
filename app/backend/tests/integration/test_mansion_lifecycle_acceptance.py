"""Cross-layer acceptance for the mansion lifecycle, over temporary roots.

The journey runs through the signed aiohttp routes, the real service, the real
filesystem adapter, and the real metadata store: list, create, open, rebuild
every backend object to simulate a restart, then list and open again. A second
part pre-populates arbitrary projects and proves that adoption and refusal
never change a project byte.

Every response is also recorded as a transcript and compared with
`fixtures/mansions/api-acceptance.json`. The UI test
`app/ui/src/core/mansion-acceptance.test.ts` parses that same transcript and
reduces it into Foyer state, so both layers are checked against one set of
real responses. Set HH_UPDATE_FIXTURES=1 to rewrite the fixture after a
deliberate contract change.

No development server is started and the real mansion root is never used.
"""

import asyncio
import json
import os
from pathlib import Path

from aiohttp.test_utils import TestClient, TestServer

from haunted_house.adapters.settings import Settings
from haunted_house.core.mansion_registry import parse_registry
from haunted_house.core.proxy_signature import sign
from haunted_house.mansion_routes import live_mansion_service
from haunted_house.server import PROXY_HEADER, build_app

KEY = "k3y-for-tests"  # short on purpose: not a real credential
NOW = 1_731_400_000
NAME = "weather-station"
ADOPTED = "adopted-project"
LEGACY = "legacy-code"
BRIEFED = "guest-book"

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE = REPO_ROOT / "fixtures" / "mansions" / "api-acceptance.json"


def tree(base: Path) -> dict[str, tuple[str, bytes]]:
    """Every entry below `base` with its kind and bytes (or link target)."""
    seen: dict[str, tuple[str, bytes]] = {}
    for current, directories, files in os.walk(base, followlinks=False):
        for entry in (*directories, *files):
            path = Path(current) / entry
            relative = path.relative_to(base).as_posix()
            if path.is_symlink():
                seen[relative] = ("symlink", os.readlink(path).encode())
            elif path.is_dir():
                seen[relative] = ("directory", b"")
            else:
                seen[relative] = ("file", path.read_bytes())
    return seen


class Backend:
    """Temporary roots plus a way to build a completely fresh backend."""

    def __init__(self, tmp_path: Path) -> None:
        self.approved = tmp_path / "home" / "workspace"
        self.approved.mkdir(parents=True)
        self.root = self.approved / "haunted-house" / "mansions"
        self.app_root = tmp_path / "crew" / "apps" / "haunted-house"
        (self.app_root / "data").mkdir(parents=True)
        (self.app_root / "app.json").write_text("{}", encoding="utf-8")
        self.registry = self.app_root / "data" / "mansions-v1.json"
        self.transcript: list[dict] = []

    def fresh_app(self):
        """New Settings, filesystem adapter, metadata store, service and app."""
        settings = Settings(
            port=1,
            secret=KEY,
            gateway_origin=None,
            app_name="haunted-house",
            mansion_root=self.root,
            approved_roots=(self.approved,),
        )
        return build_app(
            settings,
            clock=lambda: NOW,
            mansion_service=live_mansion_service(settings, app_root=self.app_root),
        )

    def run(self, steps: list[tuple[str, str, str, dict | None]]) -> list[dict]:
        """Send signed requests to one fresh backend and record the replies."""

        async def go() -> list[dict]:
            recorded = []
            async with TestClient(TestServer(self.fresh_app())) as client:
                for step, method, path, request in steps:
                    body = b"" if request is None else json.dumps(request).encode()
                    headers = {PROXY_HEADER: sign(KEY, NOW, method, path, body)}
                    if request is not None:
                        headers["Content-Type"] = "application/json"
                    async with client.request(
                        method, path, headers=headers, data=body or None
                    ) as response:
                        recorded.append(
                            {
                                "step": step,
                                "method": method,
                                "path": path,
                                "request": request,
                                "status": response.status,
                                "body": await response.json(),
                            }
                        )
            return recorded

        recorded = asyncio.run(go())
        self.transcript.extend(recorded)
        return recorded


def descriptor(name: str, status: str = "ready") -> dict[str, str]:
    return {
        "name": name,
        "projectSpec": name,
        "displayPath": f"~/workspace/haunted-house/mansions/{name}",
        "status": status,
    }


def populate_arbitrary_projects(root: Path) -> None:
    """A compatible project and a conflicting one, both with opaque content."""
    adopted = root / ADOPTED
    (adopted / ".kiro" / "specs" / ADOPTED).mkdir(parents=True)
    (adopted / ".kiro" / "specs" / ADOPTED / "requirements.md").write_bytes(
        b"# Requirements\n\nwritten by the operator\n"
    )
    (adopted / ".kiro" / "steering").mkdir()
    (adopted / ".kiro" / "steering" / "product.md").write_bytes(b"steer\r\n")
    (adopted / "src").mkdir()
    (adopted / "src" / "blob.bin").write_bytes(bytes(range(256)) * 4)
    (adopted / "src" / "empty").write_bytes(b"")
    (adopted / "latest").symlink_to("src/blob.bin")

    legacy = root / LEGACY
    (legacy / ".kiro").mkdir(parents=True)
    (legacy / ".kiro" / "specs").write_bytes(b"this is a file, not a directory")
    (legacy / "Makefile").write_bytes(b"all:\n\ttrue\n")
    (legacy / "data").mkdir()
    (legacy / "data" / "rows.csv").write_bytes(b"a,b\n1,2\n")


def test_mansion_lifecycle_through_the_signed_api_with_restart(tmp_path):
    backend = Backend(tmp_path)

    # 1. First backend process: empty list, create, list, open.
    first = backend.run(
        [
            ("list-empty", "GET", "/api/mansions", None),
            ("create", "POST", "/api/mansions", {"name": NAME}),
            ("list-after-create", "GET", "/api/mansions", None),
            ("open", "POST", "/api/mansions/open", {"name": NAME}),
        ]
    )
    assert [(item["status"], item["body"]) for item in first] == [
        (200, {"schemaVersion": 1, "mansions": []}),
        (201, {"outcome": "created", "mansion": descriptor(NAME)}),
        (200, {"schemaVersion": 1, "mansions": [descriptor(NAME)]}),
        (200, {"mansion": descriptor(NAME)}),
    ]

    # The exact project tree: four directories, no file.
    project = {
        NAME: ("directory", b""),
        f"{NAME}/.kiro": ("directory", b""),
        f"{NAME}/.kiro/specs": ("directory", b""),
        f"{NAME}/.kiro/specs/{NAME}": ("directory", b""),
    }
    assert tree(backend.root) == project

    # A separate, persistent registry in app data, outside every mansion.
    assert tree(backend.app_root) == {
        "app.json": ("file", b"{}"),
        "data": ("directory", b""),
        "data/mansions-v1.json": ("file", backend.registry.read_bytes()),
    }
    assert backend.root.resolve() not in backend.registry.resolve().parents
    assert backend.app_root.resolve() not in backend.root.resolve().parents
    registry_text = backend.registry.read_text(encoding="utf-8")
    assert json.loads(registry_text) == {
        "schemaVersion": 1,
        "mansions": [
            {
                "name": NAME,
                "projectSpec": NAME,
                "relativePath": NAME,
                "origin": "created",
            }
        ],
    }
    assert str(tmp_path) not in registry_text and str(Path.home()) not in registry_text
    registry_bytes = backend.registry.read_bytes()

    # 2. Restart: every backend object is rebuilt; only the disk carries over.
    second = backend.run(
        [
            ("list-after-restart", "GET", "/api/mansions", None),
            ("open-after-restart", "POST", "/api/mansions/open", {"name": NAME}),
            ("create-repeat", "POST", "/api/mansions", {"name": NAME}),
        ]
    )
    assert [(item["status"], item["body"]) for item in second] == [
        (200, {"schemaVersion": 1, "mansions": [descriptor(NAME)]}),
        (200, {"mansion": descriptor(NAME)}),
        (200, {"outcome": "existing_compatible", "mansion": descriptor(NAME)}),
    ]
    assert tree(backend.root) == project
    assert backend.registry.read_bytes() == registry_bytes

    # 3. Pre-populated arbitrary projects: adopt one, refuse the other.
    populate_arbitrary_projects(backend.root)
    before = tree(backend.root)
    third = backend.run(
        [
            ("open-unregistered", "POST", "/api/mansions/open", {"name": ADOPTED}),
            ("adopt", "POST", "/api/mansions", {"name": ADOPTED}),
            ("open-adopted", "POST", "/api/mansions/open", {"name": ADOPTED}),
            ("create-conflict", "POST", "/api/mansions", {"name": LEGACY}),
            ("open-conflict", "POST", "/api/mansions/open", {"name": LEGACY}),
            ("invalid-name", "POST", "/api/mansions", {"name": "../escape"}),
            ("invalid-request", "POST", "/api/mansions", {"path": "/tmp/x"}),
        ]
    )
    assert [(item["status"], item["body"].get("outcome") or item["body"].get("error", {}).get("code") or "opened") for item in third] == [
        (404, "mansion_not_registered"),
        (200, "existing_compatible"),
        (200, "opened"),
        (409, "mansion_conflict"),
        (404, "mansion_not_registered"),
        (422, "invalid_mansion_name"),
        (400, "invalid_request"),
    ]
    assert third[1]["body"]["mansion"] == descriptor(ADOPTED)
    assert tree(backend.root) == before  # not one project byte changed
    assert [
        (record.name, record.origin)
        for record in parse_registry(backend.registry.read_text()).mansions
    ] == [(ADOPTED, "existing"), (NAME, "created")]

    # 4. Restart again: a registered project that later breaks is listed as
    #    such, refused on open, and still not modified.
    (backend.root / ADOPTED / ".kiro" / "specs" / ADOPTED / "requirements.md").unlink()
    (backend.root / ADOPTED / ".kiro" / "specs" / ADOPTED).rmdir()
    broken = tree(backend.root)
    fourth = backend.run(
        [
            ("list-final", "GET", "/api/mansions", None),
            ("open-broken", "POST", "/api/mansions/open", {"name": ADOPTED}),
        ]
    )
    assert [(item["status"], item["body"]) for item in fourth] == [
        (
            200,
            {
                "schemaVersion": 1,
                "mansions": [descriptor(ADOPTED, "conflict"), descriptor(NAME)],
            },
        ),
        (
            409,
            {
                "error": {
                    "code": "mansion_conflict",
                    "message": "Existing content conflicts with this mansion. Nothing was changed.",
                }
            },
        ),
    ]
    assert tree(backend.root) == broken

    # 5. Design decision 2026-11-16 (feature brief): create with `{name, brief}`
    #    writes the normalised brief once to the project spec's brief.md; a
    #    repeat create with another brief keeps the original bytes.
    fifth = backend.run(
        [
            (
                "create-with-brief",
                "POST",
                "/api/mansions",
                {"name": BRIEFED, "brief": "  A guest book.\r\nKeep the last 50 entries.  "},
            ),
            ("create-with-brief-repeat", "POST", "/api/mansions", {"name": BRIEFED, "brief": "Another."}),
        ]
    )
    assert [(item["status"], item["body"]) for item in fifth] == [
        (201, {"outcome": "created", "mansion": descriptor(BRIEFED)}),
        (200, {"outcome": "existing_compatible", "mansion": descriptor(BRIEFED)}),
    ]
    briefed = {
        key: value for key, value in tree(backend.root).items() if key.startswith(BRIEFED)
    }
    assert briefed == {
        BRIEFED: ("directory", b""),
        f"{BRIEFED}/.kiro": ("directory", b""),
        f"{BRIEFED}/.kiro/specs": ("directory", b""),
        f"{BRIEFED}/.kiro/specs/{BRIEFED}": ("directory", b""),
        f"{BRIEFED}/.kiro/specs/{BRIEFED}/brief.md": (
            "file",
            b"A guest book.\nKeep the last 50 entries.\n",
        ),
    }

    # No response carries a host path.
    rendered = json.dumps(backend.transcript)
    assert str(tmp_path) not in rendered and str(Path.home()) not in rendered

    # The UI acceptance test consumes exactly these responses.
    document = (
        json.dumps(
            {
                "description": (
                    "Real Mansion_API responses recorded by "
                    "app/backend/tests/integration/test_mansion_lifecycle_acceptance.py "
                    "over temporary roots. Do not edit by hand."
                ),
                "exchanges": backend.transcript,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
    if os.environ.get("HH_UPDATE_FIXTURES") == "1":
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(document, encoding="utf-8")
    assert FIXTURE.read_text(encoding="utf-8") == document, (
        "the recorded API transcript differs from the committed fixture; "
        "rerun with HH_UPDATE_FIXTURES=1 if the contract change is intended"
    )


def test_creation_under_an_unsafe_or_missing_app_data_never_touches_projects(
    tmp_path,
):
    backend = Backend(tmp_path)
    backend.root.mkdir(parents=True)
    populate_arbitrary_projects(backend.root)
    before = tree(backend.root)
    backend.registry.write_bytes(b"{ not a registry")

    replies = backend.run(
        [
            ("list", "GET", "/api/mansions", None),
            ("create", "POST", "/api/mansions", {"name": ADOPTED}),
            ("open", "POST", "/api/mansions/open", {"name": ADOPTED}),
        ]
    )

    assert [(item["status"], item["body"]["error"]["code"]) for item in replies] == [
        (500, "metadata_unavailable")
    ] * 3
    assert tree(backend.root) == before
    assert backend.registry.read_bytes() == b"{ not a registry"
