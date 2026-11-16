"""Property test for the permission freeze (scripts/lib/permission_freeze.py).

Feature: replay-and-submission, Property 6: Permission freeze accepts only the exact reviewed baseline

For all normalized Permission_Inventory, manifest, and Permission_Freeze values,
the freeze check succeeds if and only if resource and lifecycle are `gateway`,
minimum Crew version satisfies the reviewed floor, API and event sets exactly
equal the implemented baseline, session approval and storage are true,
prohibited paths and fields are absent, app version and canonical hashes match,
and post-freeze permission changes carry the coordinated version, README,
evidence, and replacement freeze updates; changing, adding, deleting,
duplicating, or mismatching any semantic field cannot preserve a successful
result.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8**

Each example builds a coordinated state (inventory, manifest, exact manifest
bytes, canonical freeze record, README trust copy) that must be accepted in
any API/event order, then applies one mutation that must be refused. A
"coordinated" mutation also bumps the version and regenerates the record and
README, which still must not rescue a permission set outside the reviewed
baseline. Nothing is read from or written to the repository.
"""

from __future__ import annotations

import copy
import json
import string
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable

from hypothesis import given, settings
from hypothesis import strategies as st

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

import permission_freeze as freeze  # noqa: E402
from permission_freeze import PermissionInventory, REVIEWED_API, REVIEWED_EVENTS  # noqa: E402

LOWER = string.ascii_lowercase
# A planted marker no finding may echo.
MARK = st.text(LOWER, min_size=10, max_size=14).map(lambda text: f"zq{text}")
SMALL = st.integers(min_value=0, max_value=40)
VERSION = st.tuples(SMALL, SMALL, SMALL).map(lambda parts: ".".join(map(str, parts)))
CREW_OK = st.sampled_from(["0.12.1", "0.12.2", "0.13.0", "1.0.0", "0.12.10"])
CREW_LOW = st.sampled_from(["0.12.0", "0.6.0", "0.11.9", "0.12", "", "v0.12.1", "0.12.1-beta"])


def manifest_bytes(manifest: dict[str, Any]) -> bytes:
    return (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def readme_for(manifest: dict[str, Any]) -> str:
    permissions = manifest.get("permissions")
    api = permissions.get("api") if isinstance(permissions, dict) else None
    paths = " ".join(f"`{entry}`" for entry in (api if isinstance(api, list) else ()) if isinstance(entry, str))
    return f"Trust prompt: {paths}. Record: [freeze](docs/permission-freeze.json)\n"


class State:
    """One coordinated release state. `sync` regenerates the record and README from the manifest."""

    def __init__(self, manifest: dict[str, Any], inventory: PermissionInventory) -> None:
        self.manifest = manifest
        self.inventory = inventory
        self.record: str | None = None
        self.readme: str | None = None
        self.bytes = b""
        self.sync()

    def sync(self) -> None:
        self.bytes = manifest_bytes(self.manifest)
        self.readme = readme_for(self.manifest)
        try:
            self.record = freeze.render_freeze_record(freeze.build_freeze_record(self.manifest, self.bytes))
        except (KeyError, TypeError, AttributeError):
            self.record = None

    def rebytes(self) -> None:
        """The manifest file changed on disk; record and README did not."""

        self.bytes = manifest_bytes(self.manifest)

    def check(self) -> tuple[freeze.Finding, ...]:
        return freeze.check_freeze_state(
            inventory=self.inventory,
            manifest=self.manifest,
            manifest_bytes=self.bytes,
            record_text=self.record,
            readme_text=self.readme,
        )


Mutation = Callable[[State, st.DataObject], None]


def _perms(state: State) -> dict[str, Any]:
    return state.manifest["permissions"]


def _record(state: State, change: Callable[[dict[str, Any]], None]) -> None:
    assert state.record is not None
    record = json.loads(state.record)
    change(record)
    state.record = freeze.render_freeze_record(record)


def _bump(state: State, data: st.DataObject) -> None:
    old = state.manifest["version"]
    state.manifest["version"] = data.draw(VERSION.filter(lambda v: v != old), label="new version")


def m_field(key: str) -> Mutation:
    def mutate(state: State, data: st.DataObject) -> None:
        state.manifest[key] = data.draw(st.sampled_from(["standalone", "app", "", None, "Gateway"]), label=key)
        state.sync()

    return mutate


def m_field_missing(key: str) -> Mutation:
    def mutate(state: State, data: st.DataObject) -> None:
        del state.manifest[key]
        state.sync()

    return mutate


def m_crew_low(state: State, data: st.DataObject) -> None:
    state.manifest["minKiroCrewVersion"] = data.draw(CREW_LOW, label="crew")
    state.sync()


def m_list_add(key: str, coordinated: bool) -> Mutation:
    def mutate(state: State, data: st.DataObject) -> None:
        mark = data.draw(MARK, label="mark")
        _perms(state)[key].append(f"/api/{mark}" if key == "api" else mark)
        if coordinated:
            _bump(state, data)
            state.sync()
        else:
            state.rebytes()

    return mutate


def m_list_add_everywhere(key: str) -> Mutation:
    """The code, the manifest, the version, the record and the README all move together."""

    def mutate(state: State, data: st.DataObject) -> None:
        mark = data.draw(MARK, label="mark")
        entry = f"/api/{mark}" if key == "api" else mark
        _perms(state)[key].append(entry)
        if key == "api":
            state.inventory = replace(state.inventory, api=state.inventory.api | {entry})
        else:
            state.inventory = replace(state.inventory, events=state.inventory.events | {entry})
        _bump(state, data)
        state.sync()

    return mutate


def m_list_remove(key: str, with_inventory: bool) -> Mutation:
    def mutate(state: State, data: st.DataObject) -> None:
        entries = _perms(state)[key]
        gone = entries.pop(data.draw(st.integers(0, len(entries) - 1), label="index"))
        if with_inventory:
            if key == "api":
                state.inventory = replace(state.inventory, api=state.inventory.api - {gone})
            else:
                state.inventory = replace(state.inventory, events=state.inventory.events - {gone})
            _bump(state, data)
        state.sync()

    return mutate


def m_list_duplicate(key: str) -> Mutation:
    def mutate(state: State, data: st.DataObject) -> None:
        entries = _perms(state)[key]
        entries.insert(
            data.draw(st.integers(0, len(entries)), label="at"),
            entries[data.draw(st.integers(0, len(entries) - 1), label="index")],
        )
        state.sync()

    return mutate


def m_api_prohibited(state: State, data: st.DataObject) -> None:
    entry = data.draw(
        st.sampled_from(
            ["/api/spawn", "/api/spawn/*", "/api/approvals", "/api/approvals/*", "/api/*", "/api", "*", "/*", "/api/ws", "/api/c*"]
        ),
        label="entry",
    )
    _perms(state)["api"].append(entry)
    # Even when the inventory is said to need it and everything else is coordinated.
    state.inventory = replace(state.inventory, api=state.inventory.api | {entry})
    _bump(state, data)
    state.sync()


def m_events_wildcard(state: State, data: st.DataObject) -> None:
    entry = data.draw(st.sampled_from(["*", "chat_*", "tool*"]), label="entry")
    _perms(state)["events"].append(entry)
    state.inventory = replace(state.inventory, events=state.inventory.events | {entry})
    state.sync()


def m_flag(key: str) -> Mutation:
    def mutate(state: State, data: st.DataObject) -> None:
        value = data.draw(st.sampled_from([False, None, "true", 1, "missing"]), label=key)
        if value == "missing":
            del _perms(state)[key]
        else:
            _perms(state)[key] = value
        state.sync()

    return mutate


def m_inventory_flag(state: State, data: st.DataObject) -> None:
    if data.draw(st.booleans(), label="storage"):
        state.inventory = replace(state.inventory, storage=False)
        _perms(state)["storage"] = False
    else:
        state.inventory = replace(state.inventory, session_approval=False)
        _perms(state)["sessionApproval"] = False
    _bump(state, data)
    state.sync()


def m_inventory_resource(state: State, data: st.DataObject) -> None:
    key = data.draw(st.sampled_from(["resources", "lifecycle"]), label="key")
    state.inventory = replace(state.inventory, **{key: "standalone"})
    state.manifest[key] = "standalone"
    state.sync()


def m_inventory_floor(state: State, data: st.DataObject) -> None:
    """The install script's floor is above what the manifest declares."""

    state.inventory = replace(state.inventory, min_crew_version="99.0.0")


def m_auto_approve(state: State, data: st.DataObject) -> None:
    key = data.draw(st.sampled_from(["autoApprove", "auto_approve", "AUTOAPPROVE", "auto-approve"]), label="key")
    mark = data.draw(MARK, label="mark")
    where = data.draw(st.sampled_from(["top", "permissions", "nested", "list"]), label="where")
    if where == "top":
        state.manifest[key] = [mark]
    elif where == "permissions":
        _perms(state)[key] = [mark]
    elif where == "nested":
        state.manifest.setdefault("backend", {})[mark] = {key: True}
    else:
        state.manifest["extra"] = [{"inner": [{key: mark}]}]
    state.sync()


def m_undeclared(state: State, data: st.DataObject) -> None:
    key = data.draw(st.sampled_from(["spawn", "approvals", "network", "cron", "memory", "jobs", "mcpTools"]) | MARK, label="key")
    _perms(state)[key] = True
    _bump(state, data)
    state.sync()


def m_misplaced(state: State, data: st.DataObject) -> None:
    state.manifest[data.draw(st.sampled_from(["sessionApproval", "storage", "api", "events"]), label="key")] = True
    state.sync()


def m_permissions_shape(state: State, data: st.DataObject) -> None:
    key = data.draw(st.sampled_from(["permissions", "api", "events"]), label="key")
    bad = data.draw(st.sampled_from([None, "x", 3, {"a": 1}, [1, 2]]), label="value")
    if key == "permissions":
        state.manifest["permissions"] = None if bad == [1, 2] else (bad if not isinstance(bad, dict) else [bad])
    else:
        _perms(state)[key] = bad
    state.sync()


def m_app_version_only(state: State, data: st.DataObject) -> None:
    _bump(state, data)
    state.rebytes()


def m_app_version_invalid(state: State, data: st.DataObject) -> None:
    state.manifest["version"] = data.draw(st.sampled_from(["1.0", "v1.0.0", "", "1.0.0-rc1", "01.0.0", 1]), label="version")
    state.sync()


def m_manifest_bytes_only(state: State, data: st.DataObject) -> None:
    state.manifest["description"] = data.draw(MARK, label="description")
    state.rebytes()


def m_record(state: State, data: st.DataObject) -> None:
    kind = data.draw(
        st.sampled_from(
            ["missing", "not-json", "date", "schema", "extra-key", "drop-key", "perm-hash", "manifest-hash",
             "frozen-perms", "frozen-order", "whitespace", "app-version", "list"]
        ),
        label="record",
    )
    mark = data.draw(MARK, label="mark")
    assert state.record is not None
    if kind == "missing":
        state.record = None
    elif kind == "not-json":
        state.record = state.record[:-3]
    elif kind == "list":
        state.record = "[]\n"
    elif kind == "whitespace":
        state.record = data.draw(st.sampled_from([state.record + "\n", state.record.rstrip("\n"), json.dumps(json.loads(state.record))]))
    elif kind == "frozen-order":
        text = json.loads(state.record)
        text["permissions"]["api"].reverse()
        state.record = freeze.render_freeze_record(text)
    else:
        changes: dict[str, Callable[[dict[str, Any]], Any]] = {
            "date": lambda r: r.update(frozenOn=data.draw(st.sampled_from(["2026-11-28", "2026-11-30", "", "2026-11-16"]))),
            "schema": lambda r: r.update(schemaVersion=data.draw(st.sampled_from([0, 2, "1", True, 1.5]))),
            "extra-key": lambda r: r.update({mark: mark}),
            "drop-key": lambda r: r.pop(data.draw(st.sampled_from(sorted(freeze.RECORD_KEYS)))),
            "perm-hash": lambda r: r.update(permissionsSha256=data.draw(st.sampled_from(["0" * 64, mark, r["manifestSha256"]]))),
            "manifest-hash": lambda r: r.update(manifestSha256=data.draw(st.sampled_from(["f" * 64, mark, r["permissionsSha256"]]))),
            "frozen-perms": lambda r: r["permissions"]["events"].append(mark),
            "app-version": lambda r: r.update(appVersion=data.draw(VERSION.filter(lambda v: v != r["appVersion"]))),
        }
        _record(state, changes[kind])


def m_readme(state: State, data: st.DataObject) -> None:
    assert state.readme is not None
    if data.draw(st.booleans(), label="drop link"):
        state.readme = state.readme.replace("docs/permission-freeze.json", "docs/permissions.json")
    else:
        entry = data.draw(st.sampled_from(sorted(REVIEWED_API)), label="entry")
        state.readme = state.readme.replace(f"`{entry}`", entry.strip("/"))


MUTATIONS: dict[str, Mutation] = {
    "resources": m_field("resources"),
    "lifecycle": m_field("lifecycle"),
    "resources-missing": m_field_missing("resources"),
    "lifecycle-missing": m_field_missing("lifecycle"),
    "crew-low": m_crew_low,
    "api-add": m_list_add("api", coordinated=False),
    "api-add-coordinated": m_list_add("api", coordinated=True),
    "api-add-everywhere": m_list_add_everywhere("api"),
    "api-remove": m_list_remove("api", with_inventory=False),
    "api-remove-everywhere": m_list_remove("api", with_inventory=True),
    "api-duplicate": m_list_duplicate("api"),
    "api-prohibited": m_api_prohibited,
    "events-add": m_list_add("events", coordinated=False),
    "events-add-coordinated": m_list_add("events", coordinated=True),
    "events-add-everywhere": m_list_add_everywhere("events"),
    "events-remove": m_list_remove("events", with_inventory=False),
    "events-remove-everywhere": m_list_remove("events", with_inventory=True),
    "events-duplicate": m_list_duplicate("events"),
    "events-wildcard": m_events_wildcard,
    "session-approval": m_flag("sessionApproval"),
    "storage": m_flag("storage"),
    "inventory-flag": m_inventory_flag,
    "inventory-resource": m_inventory_resource,
    "inventory-floor": m_inventory_floor,
    "auto-approve": m_auto_approve,
    "undeclared-field": m_undeclared,
    "misplaced-grant": m_misplaced,
    "permissions-shape": m_permissions_shape,
    "app-version-only": m_app_version_only,
    "app-version-invalid": m_app_version_invalid,
    "manifest-bytes-only": m_manifest_bytes_only,
    "record": m_record,
    "readme": m_readme,
}


@st.composite
def baselines(draw: st.DrawFn) -> State:
    manifest = {
        "name": "haunted-house",
        "version": draw(VERSION),
        "description": draw(st.text(LOWER + " ", max_size=30)),
        "minKiroCrewVersion": draw(CREW_OK),
        "resources": "gateway",
        "lifecycle": "gateway",
        "backend": {"type": "python"},
        "permissions": {
            "api": draw(st.permutations(sorted(REVIEWED_API))),
            "events": draw(st.permutations(sorted(REVIEWED_EVENTS))),
            "sessionApproval": True,
            "storage": True,
        },
    }
    if draw(st.booleans()):
        manifest["permissions"] = dict(reversed(list(manifest["permissions"].items())))
    inventory = PermissionInventory(
        api=REVIEWED_API,
        events=REVIEWED_EVENTS,
        session_approval=True,
        storage=True,
        min_crew_version=draw(st.sampled_from(["0.12.1", manifest["minKiroCrewVersion"]])),
    )
    return State(manifest, inventory)


# Feature: replay-and-submission, Property 6: Permission freeze accepts only the exact reviewed baseline
@settings(max_examples=300, deadline=None)
@given(state=baselines(), name=st.sampled_from(sorted(MUTATIONS)), data=st.data())
def test_permission_freeze_accepts_only_the_exact_reviewed_baseline(state: State, name: str, data: st.DataObject) -> None:
    # The exact coordinated baseline is accepted in any declared order.
    assert state.check() == ()
    frozen = json.loads(state.record or "{}")
    assert frozen["permissions"]["api"] == sorted(REVIEWED_API)
    assert frozen["permissions"]["events"] == sorted(REVIEWED_EVENTS)
    assert frozen["permissionsSha256"] == freeze.permissions_sha256(freeze.REVIEWED_INVENTORY.permissions())

    # A version or description change with a replacement record is a coordinated, accepted update.
    updated = State(copy.deepcopy(state.manifest), state.inventory)
    _bump(updated, data)
    updated.sync()
    assert updated.check() == ()

    # Any one semantic change is refused.
    mutated = State(copy.deepcopy(state.manifest), state.inventory)
    MUTATIONS[name](mutated, data)
    findings = mutated.check()
    assert findings, name
    assert all(finding.category in freeze.CATEGORIES for finding in findings)

    # A post-freeze permission change at the same version says so (Requirement 8.8).
    if name in ("api-add", "events-add"):
        assert freeze.CHANGE_WITHOUT_VERSION in {finding.category for finding in findings}

    # Findings are category and field only: no planted marker or manifest value.
    printed = "\n".join(str(finding) for finding in findings)
    assert "zq" not in printed
    for entry in REVIEWED_API | REVIEWED_EVENTS:
        assert entry not in printed
