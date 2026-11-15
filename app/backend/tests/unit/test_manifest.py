"""Rules for app/app.json (Requirement 3).

`validate_manifest` returns one message per broken rule, so the real-file test
shows every problem at once and the negative tests can check that each rule
fires. It checks:

- Requirement 3.1: name `haunted-house`, semver version, license `MIT`,
  minKiroCrewVersion `0.12.1`;
- Crew's install-time validation rules (manifest reference, "Validation
  rules"): kebab-case name, `X.Y.Z` version, required fields are non-empty
  strings, paths are relative and stay inside the app root after a canonical
  resolve, every UI page has `route` and `label`;
- Requirement 3.2: a Python backend and at least one UI page, and every path
  names an existing file inside app/. Crew 0.12.1 resolves `ui.entry` and
  `ui.pages[].entryPoint` under app/ui/, not the app root;
- Requirement 3.3: `permissions.api` is exactly the gateway client's ROUTES
  paths plus the app's own backend prefix, which the dashboard's
  `useAppApi()` needs;
- Requirement 3.4: no `autoApprove` key at any depth or in any spelling, in
  the manifest or in agent files under app/agents/;
- the manifest asks for nothing spec 1 does not use (only `permissions.api`)
  and has no unknown top-level keys. Crew keeps unknown keys without
  complaint, so a typo would otherwise go unnoticed.

A later spec that adds a grant updates UNUSED_GRANT_KEYS and the expected
`permissions.api` set here.
"""
from __future__ import annotations

import json
import os
import re
import shutil
from collections.abc import Callable, Iterator
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

import pytest

from haunted_house.adapters.gateway_client import ROUTES

# tests/unit/ -> tests/ -> backend/ -> app/
APP_ROOT = Path(__file__).resolve().parents[3]
MANIFEST = APP_ROOT / "app.json"

APP_NAME = "haunted-house"
OWN_BACKEND_PREFIX = f"/apps/{APP_NAME}/api/*"

NAME_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
SEMVER_RE = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")
REQUIRED_STRINGS = ("name", "version", "displayName", "description")

# Every top-level field in the Crew 0.12.1 manifest reference.
DOCUMENTED_TOP_LEVEL_KEYS = frozenset(
    {
        # required and recommended
        "name", "version", "displayName", "description",
        "author", "license", "minKiroCrewVersion", "tags", "jobFamilies",
        # resources
        "agents", "skills", "sops", "mcpServers",
        # store listing
        "repo", "iconPath", "screenshots", "highlights",
        "heroImage", "heroImageDark", "heroImageDetail", "heroImageDetailDark",
        # behaviour
        "crons", "ui", "backend", "permissions", "contributes", "setup",
        "dependencies", "lifecycle", "resources", "platform", "openCommand",
    }
)  # fmt: skip

# Top-level fields that ask Crew to register, run or expose something spec 1
# does not use. `sessionApproval` is not in the manifest reference; it is
# listed so it gets this message rather than "unknown key".
UNUSED_GRANT_KEYS = frozenset(
    {
        "agents", "contributes", "crons", "dependencies", "mcpServers",
        "openCommand", "sessionApproval", "setup", "skills", "sops",
    }
)  # fmt: skip


def expected_api_prefixes() -> set[str]:
    """The gateway paths the backend calls, plus the app's own backend prefix."""
    return {path for (_method, path) in ROUTES.values()} | {OWN_BACKEND_PREFIX}


class ManifestError(AssertionError):
    """Raised by check_manifest with every broken rule, one per line."""


def check_manifest(data: Any, app_root: Path) -> None:
    errors = validate_manifest(data, app_root)
    if errors:
        raise ManifestError("\n".join(errors))


def load_manifest(path: Path) -> Any:
    """Parse JSON, refusing duplicate keys (json.loads would keep the last)."""

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        keys = [key for key, _ in pairs]
        duplicates = sorted({key for key in keys if keys.count(key) > 1})
        if duplicates:
            raise ValueError(f"duplicate keys {duplicates}")
        return dict(pairs)

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicates)


def validate_manifest(data: Any, app_root: Path) -> list[str]:
    """Return one message per broken rule. An empty list means the manifest passes."""
    if not isinstance(data, dict):
        return ["manifest: must be a JSON object"]
    errors: list[str] = []

    # Identity: Crew's required non-empty strings and patterns, then the
    # exact values from Requirement 3.1.
    for key in REQUIRED_STRINGS:
        if not _non_empty_str(data.get(key)):
            errors.append(f"{key}: required, must be a non-empty string")
    name, version = data.get("name"), data.get("version")
    if isinstance(name, str) and not NAME_RE.fullmatch(name):
        errors.append(f"name: {name!r} is not kebab-case")
    if name != APP_NAME:
        errors.append(f"name: must be {APP_NAME!r}, got {name!r}")
    if isinstance(version, str) and not SEMVER_RE.fullmatch(version):
        errors.append(f"version: {version!r} is not semver X.Y.Z")
    for key, want in (("license", "MIT"), ("minKiroCrewVersion", "0.12.1")):
        if data.get(key) != want:
            errors.append(f"{key}: must be {want!r}, got {data.get(key)!r}")

    # Top-level keys: nothing spec 1 does not use, nothing undocumented.
    for key in sorted(data):
        if key in UNUSED_GRANT_KEYS:
            errors.append(f"{key}: spec 1 does not use this; declare it in the spec that needs it")
        elif key not in DOCUMENTED_TOP_LEVEL_KEYS:
            errors.append(f"{key}: unknown top-level key (typo?)")

    # Backend and icon: paths relative to the app root.
    _check_path(errors, "iconPath", data.get("iconPath"), app_root, app_root)
    backend = _section(errors, data, "backend")
    _check_path(errors, "backend.entryPoint", backend.get("entryPoint"), app_root, app_root)
    if backend.get("type") != "python":
        errors.append(f"backend.type: must be 'python', got {backend.get('type')!r}")
    if "hooks" in backend:
        errors.append("backend.hooks: spec 1 runs no code inside the gateway")

    # UI: bundle paths relative to app/ui/; at least one page with route and label.
    ui = _section(errors, data, "ui")
    ui_root = app_root / "ui"
    _check_path(errors, "ui.entry", ui.get("entry"), ui_root, app_root)
    pages = ui.get("pages")
    if not isinstance(pages, list) or not pages:
        errors.append("ui.pages: must list at least one page")
        pages = []
    for index, page in enumerate(pages):
        where = f"ui.pages[{index}]"
        if not isinstance(page, dict):
            errors.append(f"{where}: must be an object")
            continue
        for key in ("route", "label"):
            if not _non_empty_str(page.get(key)):
                errors.append(f"{where}.{key}: required, must be a non-empty string")
        if "entryPoint" in page:
            _check_path(errors, f"{where}.entryPoint", page["entryPoint"], ui_root, app_root)

    # Permissions: only `api`, and exactly the paths the app calls.
    permissions = _section(errors, data, "permissions")
    unused = sorted(set(permissions) - {"api"})
    if unused:
        errors.append(f"permissions: spec 1 uses only 'api', also found {unused}")
    _check_api(errors, permissions.get("api"))

    # No autoApprove anywhere, in the manifest or in agent files.
    errors.extend(_auto_approve_errors(data, "app.json"))
    agents_dir = app_root / "agents"
    if agents_dir.is_dir():
        for agent_file in sorted(agents_dir.rglob("*.json")):
            where = agent_file.relative_to(app_root).as_posix()
            try:
                agent = load_manifest(agent_file)
            except (OSError, ValueError) as exc:
                errors.append(f"{where}: not readable JSON ({type(exc).__name__})")
                continue
            errors.extend(_auto_approve_errors(agent, where))

    return errors


def _non_empty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _section(errors: list[str], data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    if isinstance(value, dict):
        return value
    errors.append(f"{key}: required, must be an object")
    return {}


def _check_path(errors: list[str], label: str, value: Any, root: Path, app_root: Path) -> None:
    """Crew's path rule: relative, no '..', inside the root after realpath. Plus: the file exists."""
    if not _non_empty_str(value):
        errors.append(f"{label}: required, must be a non-empty relative path")
        return
    slashed = value.replace("\\", "/")
    if slashed.startswith("/") or PureWindowsPath(value).drive:
        errors.append(f"{label}: {value!r} is absolute; Crew rejects absolute paths")
        return
    if ".." in PurePosixPath(slashed).parts:
        errors.append(f"{label}: {value!r} uses '..'; Crew rejects traversal")
        return
    resolved = Path(os.path.realpath(root / value))
    for boundary in (root, app_root):
        if not resolved.is_relative_to(os.path.realpath(boundary)):
            errors.append(f"{label}: {value!r} resolves outside {boundary}")
            return
    if not resolved.is_file():
        errors.append(f"{label}: {value!r} is not a file under {root}")


def _check_api(errors: list[str], api: Any) -> None:
    if not isinstance(api, list) or not all(isinstance(entry, str) for entry in api):
        errors.append("permissions.api: must be a list of strings")
        return
    duplicates = sorted({entry for entry in api if api.count(entry) > 1})
    if duplicates:
        errors.append(f"permissions.api: duplicate entries {duplicates}")
    for entry in api:
        if not entry.startswith("/"):
            errors.append(f"permissions.api: {entry!r} must start with '/'")
    want = expected_api_prefixes()
    missing, extra = sorted(want - set(api)), sorted(set(api) - want)
    if missing:
        errors.append(f"permissions.api: missing {missing}, which the app calls")
    if extra:
        errors.append(f"permissions.api: {extra} not called by the app (not in ROUTES or the own-backend prefix)")


def _auto_approve_errors(node: Any, where: str) -> Iterator[str]:
    """Yield a message for every key spelled like autoApprove (any case, '-' or '_')."""
    if isinstance(node, dict):
        for key, value in node.items():
            here = f"{where}.{key}"
            if "autoapprove" in re.sub(r"[^a-z]", "", str(key).lower()):
                yield f"{here}: autoApprove is not allowed (Requirement 3.4)"
            yield from _auto_approve_errors(value, here)
    elif isinstance(node, list):
        for index, item in enumerate(node):
            yield from _auto_approve_errors(item, f"{where}[{index}]")


# --- the real manifest -------------------------------------------------------


def test_the_app_manifest_passes_every_rule():
    assert validate_manifest(load_manifest(MANIFEST), APP_ROOT) == []


def test_the_app_manifest_is_json_with_a_trailing_newline():
    load_manifest(MANIFEST)  # raises on bad JSON or a duplicate key
    assert MANIFEST.read_text(encoding="utf-8").endswith("\n")


# --- each rule fires ---------------------------------------------------------

# Empty stand-ins for the files the manifest names, so a copy in tmp_path
# passes before it is mutated.
STAND_IN_FILES = ("backend/main.py", "assets/icon.png", "ui/dist/index.mjs")


@pytest.fixture
def app_copy(tmp_path: Path) -> Path:
    root = tmp_path / "app"
    root.mkdir()
    shutil.copy2(MANIFEST, root / "app.json")
    for rel in STAND_IN_FILES:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).touch()
    return root


def test_the_unmutated_copy_passes(app_copy: Path):
    check_manifest(load_manifest(app_copy / "app.json"), app_copy)


def _write_agent_with_auto_approve(data: dict[str, Any], root: Path) -> None:
    (root / "agents").mkdir()
    agent = {"name": "ghost", "mcpServers": {"x": {"command": "x", "autoApprove": ["*"]}}}
    (root / "agents" / "ghost.json").write_text(json.dumps(agent), encoding="utf-8")


def _symlink_icon_outside(data: dict[str, Any], root: Path) -> None:
    outside = root.parent / "outside.png"
    outside.touch()
    (root / "assets" / "icon.png").unlink()
    (root / "assets" / "icon.png").symlink_to(outside)


Mutation = Callable[[dict[str, Any], Path], None]

MUTATIONS: list[tuple[str, Mutation, str]] = [
    ("bad-name", lambda d, r: d.update(name="Haunted_House"), "is not kebab-case"),
    (
        "dotdot-path",
        lambda d, r: d["backend"].update(entryPoint="../outside/main.py"),
        "backend.entryPoint: '../outside/main.py' uses '..'",
    ),
    (
        "absolute-path",
        lambda d, r: d["ui"].update(entry=str(r / "ui" / "dist" / "index.mjs")),
        "is absolute",
    ),
    ("extra-api-path", lambda d, r: d["permissions"]["api"].append("/api/agents"), "['/api/agents'] not called"),
    ("nested-autoApprove", lambda d, r: d["backend"].update(autoApprove=[]), "app.json.backend.autoApprove:"),
    (
        "auto_approve-variant",
        lambda d, r: d["ui"]["pages"][0].update(auto_approve=["*"]),
        "app.json.ui.pages[0].auto_approve:",
    ),
    ("agent-autoApprove", _write_agent_with_auto_approve, "agents/ghost.json.mcpServers.x.autoApprove:"),
    ("symlink-escape", _symlink_icon_outside, "iconPath: 'assets/icon.png' resolves outside"),
    ("unused-grant", lambda d, r: d.update(crons=[{"name": "t", "every": 60, "message": "m"}]), "crons: spec 1"),
    ("typo-key", lambda d, r: d.update(minKiroCrewVerison="0.12.1"), "minKiroCrewVerison: unknown top-level key"),
]


@pytest.mark.parametrize(
    ("mutate", "message"),
    [pytest.param(mutate, message, id=name) for name, mutate, message in MUTATIONS],
)
def test_a_broken_rule_is_reported(app_copy: Path, mutate: Mutation, message: str):
    path = app_copy / "app.json"
    data = load_manifest(path)
    mutate(data, app_copy)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    with pytest.raises(ManifestError, match=re.escape(message)):
        check_manifest(load_manifest(path), app_copy)
