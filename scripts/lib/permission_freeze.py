"""Pure permission inventory and freeze rules for the judge-facing manifest.

Spec 7 (replay-and-submission) task 8.1; Requirements 8.1-8.8; design
"Final permission inventory and freeze" and Property 6.

Everything here is a function of values. The manifest, the freeze record and
the README arrive as parsed data or text; findings come out. Nothing reads a
file, a clock, the environment or the network, and nothing here can enable an
app, approve a permission or write a manifest. scripts/check-permission-freeze.py
is the thin adapter that reads the repository and prints the findings.

Three things must agree before a freeze is accepted:

  the reviewed baseline   the constants below, copied from the approved design
  the inventory           what the implementation needs, built by the adapter
                          from the backend's central route and event constants
  the manifest            app/app.json

and the freeze record (docs/permission-freeze.json) must be the canonical
record of exactly that manifest. A finding names a fixed category and a fixed
field path. It has no field for a manifest value, so nothing a manifest holds
is ever echoed.

Stdlib only.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Optional, Sequence

__all__ = [
    "FROZEN_ON",
    "Finding",
    "MIN_CREW_FLOOR",
    "PermissionInventory",
    "REVIEWED_API",
    "REVIEWED_EVENTS",
    "SCHEMA_VERSION",
    "api_entry_covers",
    "build_freeze_record",
    "canonical_permissions_json",
    "check_freeze_state",
    "check_inventory",
    "check_manifest",
    "check_readme",
    "check_record",
    "manifest_sha256",
    "normalize_permissions",
    "permissions_sha256",
    "render_freeze_record",
]

# --- The reviewed baseline (design "Final permission inventory and freeze") ---

SCHEMA_VERSION = 1
# The release gate the record belongs to (Requirement 12.4), not a clock reading.
FROZEN_ON = "2026-11-29"
MIN_CREW_FLOOR = (0, 12, 1)
GATEWAY = "gateway"
REVIEWED_API = frozenset(
    {
        "/api/version",
        "/api/chat",
        "/api/chat/*",
        "/apps/haunted-house/api/*",
    }
)
REVIEWED_EVENTS = frozenset(
    {
        "approval_resolved",
        "chat_chunk",
        "chat_done",
        "chat_error",
        "chat_message",
        "chat_message_update",
        "chat_segment",
        "chat_status",
        "shared_crew.decision",
        "tool_call",
        "tool_result",
    }
)
PERMISSION_KEYS = frozenset({"api", "events", "sessionApproval", "storage"})
RECORD_KEYS = frozenset(
    {"schemaVersion", "appVersion", "frozenOn", "permissions", "permissionsSha256", "manifestSha256"}
)
# Gateway paths no declared entry may reach (Requirement 8.5).
PROHIBITED_PATHS = (
    "/api/spawn",
    "/api/spawn/x",
    "/api/approvals",
    "/api/approvals/x/approved",
    "/api/ws",
)
# One gateway path under each reviewed family. An entry that covers two families is broad.
_FAMILY_PROBES = ("/api/version", "/api/chat", "/apps/haunted-house/api/x", "/api/config")
FREEZE_RECORD_LINK = "docs/permission-freeze.json"

_SEMVER = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")
_SHA256 = re.compile(r"[0-9a-f]{64}")

# --- Categories ---------------------------------------------------------------

RESOURCE = "resource-not-gateway"
LIFECYCLE = "lifecycle-not-gateway"
CREW_VERSION = "crew-version-below-floor"
APP_VERSION = "app-version-invalid"
PERMISSIONS_SHAPE = "permissions-invalid"
UNDECLARED_FIELD = "undeclared-permission-field"
API_SHAPE = "api-invalid"
API_DUPLICATE = "api-duplicate"
API_MISSING = "api-missing"
API_EXTRA = "api-extra"
API_PROHIBITED = "api-prohibited-path"
API_BROAD = "api-broad-wildcard"
EVENTS_SHAPE = "events-invalid"
EVENTS_DUPLICATE = "events-duplicate"
EVENTS_MISSING = "events-missing"
EVENTS_EXTRA = "events-extra"
EVENTS_WILDCARD = "events-wildcard"
SESSION_APPROVAL = "session-approval-not-true"
STORAGE = "storage-not-true"
AUTO_APPROVE = "auto-approve-present"
MISPLACED_GRANT = "grant-outside-permissions"
INVENTORY_DRIFT = "inventory-differs-from-reviewed-baseline"
RECORD_MISSING = "freeze-record-missing"
RECORD_INVALID = "freeze-record-invalid"
RECORD_NONCANONICAL = "freeze-record-noncanonical"
RECORD_SCHEMA = "freeze-schema-version"
RECORD_DATE = "freeze-date"
RECORD_VERSION = "freeze-app-version-mismatch"
RECORD_PERMISSIONS = "freeze-permissions-mismatch"
RECORD_PERMISSIONS_HASH = "freeze-permissions-hash-mismatch"
RECORD_MANIFEST_HASH = "freeze-manifest-hash-mismatch"
CHANGE_WITHOUT_VERSION = "permission-change-without-version-change"
README_LINK = "readme-freeze-link-missing"
README_PATH = "readme-api-path-missing"

CATEGORIES = frozenset(
    value
    for name, value in list(globals().items())
    if name.isupper() and isinstance(value, str) and "-" in value and name not in {"FROZEN_ON", "FREEZE_RECORD_LINK"}
)


@dataclass(frozen=True, order=True)
class Finding:
    """One reason a freeze is refused: a fixed category at a fixed field path. No value."""

    where: str
    category: str

    def __str__(self) -> str:
        return f"{self.where}: {self.category}"


@dataclass(frozen=True)
class PermissionInventory:
    """What the implementation needs, normalized. Built from central constants by the adapter."""

    api: frozenset[str]
    events: frozenset[str]
    session_approval: bool
    storage: bool
    resources: str = GATEWAY
    lifecycle: str = GATEWAY
    min_crew_version: str = "0.12.1"

    def permissions(self) -> dict[str, Any]:
        return {
            "api": sorted(self.api),
            "events": sorted(self.events),
            "sessionApproval": self.session_approval,
            "storage": self.storage,
        }


REVIEWED_INVENTORY = PermissionInventory(
    api=REVIEWED_API, events=REVIEWED_EVENTS, session_approval=True, storage=True
)

# --- Canonical forms ------------------------------------------------------------


def api_entry_covers(entry: str, path: str) -> bool:
    """Crew's `permissions.api` match: exact, `p/` children, `p/*`, trailing `*`."""

    if entry.endswith("/*"):
        base = entry[:-2]
        return path == base or path.startswith(base + "/")
    if entry.endswith("*"):
        return path.startswith(entry[:-1])
    return path == entry or path.startswith(entry + "/")


def normalize_permissions(permissions: Mapping[str, Any]) -> dict[str, Any]:
    """Sorted keys and lexically sorted set-like arrays. Values are kept as they are."""

    normal: dict[str, Any] = {}
    for key in sorted(permissions):
        value = permissions[key]
        if key in ("api", "events") and isinstance(value, list) and all(isinstance(v, str) for v in value):
            value = sorted(value)
        normal[key] = value
    return normal


def canonical_permissions_json(permissions: Mapping[str, Any]) -> str:
    """Compact canonical JSON of the normalized permission object."""

    return json.dumps(normalize_permissions(permissions), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def permissions_sha256(permissions: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_permissions_json(permissions).encode("utf-8")).hexdigest()


def manifest_sha256(manifest_bytes: bytes) -> str:
    """Digest of the exact reviewed app.json bytes."""

    return hashlib.sha256(manifest_bytes).hexdigest()


def build_freeze_record(manifest: Mapping[str, Any], manifest_bytes: bytes) -> dict[str, Any]:
    """The record of this manifest. Call it only after `check_manifest` returned nothing."""

    permissions = normalize_permissions(manifest["permissions"])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "appVersion": manifest["version"],
        "frozenOn": FROZEN_ON,
        "permissions": permissions,
        "permissionsSha256": permissions_sha256(permissions),
        "manifestSha256": manifest_sha256(manifest_bytes),
    }


def render_freeze_record(record: Mapping[str, Any]) -> str:
    """Canonical record text: sorted keys, two-space indent, UTF-8, one trailing newline."""

    return json.dumps(record, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


# --- Checks ---------------------------------------------------------------------


def _version(value: Any) -> Optional[tuple[int, int, int]]:
    if not isinstance(value, str) or not _SEMVER.fullmatch(value):
        return None
    major, minor, patch = value.split(".")
    return int(major), int(minor), int(patch)


def _string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _auto_approve(node: Any, where: str) -> Iterable[Finding]:
    if isinstance(node, Mapping):
        for key, value in node.items():
            if "autoapprove" in re.sub(r"[^a-z]", "", str(key).lower()):
                # The path stops at the parent: the key itself is manifest text.
                yield Finding(where, AUTO_APPROVE)
            else:
                yield from _auto_approve(value, f"{where}.{key}" if _safe_key(key) else where)
    elif isinstance(node, list):
        for item in node:
            yield from _auto_approve(item, where)


def _safe_key(key: Any) -> bool:
    return isinstance(key, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,31}", key) is not None


def _is_broad(entry: str) -> bool:
    if "*" in entry[:-1] or not entry.startswith("/"):
        return True
    return sum(1 for probe in _FAMILY_PROBES if api_entry_covers(entry, probe)) > 1


def check_inventory(inventory: PermissionInventory) -> list[Finding]:
    """The implementation must need exactly the reviewed baseline (Requirements 8.1-8.4)."""

    found: set[Finding] = set()
    if frozenset(inventory.api) != REVIEWED_API:
        found.add(Finding("inventory.api", INVENTORY_DRIFT))
    if frozenset(inventory.events) != REVIEWED_EVENTS:
        found.add(Finding("inventory.events", INVENTORY_DRIFT))
    if inventory.session_approval is not True:
        found.add(Finding("inventory.sessionApproval", INVENTORY_DRIFT))
    if inventory.storage is not True:
        found.add(Finding("inventory.storage", INVENTORY_DRIFT))
    if inventory.resources != GATEWAY:
        found.add(Finding("inventory.resources", INVENTORY_DRIFT))
    if inventory.lifecycle != GATEWAY:
        found.add(Finding("inventory.lifecycle", INVENTORY_DRIFT))
    floor = _version(inventory.min_crew_version)
    if floor is None or floor < MIN_CREW_FLOOR:
        found.add(Finding("inventory.minKiroCrewVersion", INVENTORY_DRIFT))
    return sorted(found)


def check_manifest(manifest: Any, inventory: PermissionInventory) -> list[Finding]:
    """The manifest must declare exactly what the inventory needs, and nothing prohibited."""

    if not isinstance(manifest, Mapping):
        return [Finding("manifest", PERMISSIONS_SHAPE)]
    found: set[Finding] = set()
    if manifest.get("resources") != inventory.resources or manifest.get("resources") != GATEWAY:
        found.add(Finding("resources", RESOURCE))
    if manifest.get("lifecycle") != inventory.lifecycle or manifest.get("lifecycle") != GATEWAY:
        found.add(Finding("lifecycle", LIFECYCLE))
    crew = _version(manifest.get("minKiroCrewVersion"))
    needed = _version(inventory.min_crew_version) or MIN_CREW_FLOOR
    if crew is None or crew < MIN_CREW_FLOOR or crew < needed:
        found.add(Finding("minKiroCrewVersion", CREW_VERSION))
    if _version(manifest.get("version")) is None:
        found.add(Finding("version", APP_VERSION))
    found.update(_auto_approve(manifest, "manifest"))
    for key in ("sessionApproval", "storage", "api", "events"):
        if key in manifest:
            found.add(Finding(key, MISPLACED_GRANT))

    permissions = manifest.get("permissions")
    if not isinstance(permissions, Mapping):
        found.add(Finding("permissions", PERMISSIONS_SHAPE))
        return sorted(found)
    if set(permissions) - PERMISSION_KEYS:
        found.add(Finding("permissions", UNDECLARED_FIELD))

    api = permissions.get("api")
    if not _string_list(api):
        found.add(Finding("permissions.api", API_SHAPE))
    else:
        if len(set(api)) != len(api):
            found.add(Finding("permissions.api", API_DUPLICATE))
        if inventory.api - set(api):
            found.add(Finding("permissions.api", API_MISSING))
        if set(api) - inventory.api:
            found.add(Finding("permissions.api", API_EXTRA))
        if any(api_entry_covers(entry, path) for entry in api for path in PROHIBITED_PATHS):
            found.add(Finding("permissions.api", API_PROHIBITED))
        if any(_is_broad(entry) for entry in api):
            found.add(Finding("permissions.api", API_BROAD))

    events = permissions.get("events")
    if not _string_list(events):
        found.add(Finding("permissions.events", EVENTS_SHAPE))
    else:
        if len(set(events)) != len(events):
            found.add(Finding("permissions.events", EVENTS_DUPLICATE))
        if inventory.events - set(events):
            found.add(Finding("permissions.events", EVENTS_MISSING))
        if set(events) - inventory.events:
            found.add(Finding("permissions.events", EVENTS_EXTRA))
        if any("*" in entry for entry in events):
            found.add(Finding("permissions.events", EVENTS_WILDCARD))

    if permissions.get("sessionApproval") is not True or inventory.session_approval is not True:
        found.add(Finding("permissions.sessionApproval", SESSION_APPROVAL))
    if permissions.get("storage") is not True or inventory.storage is not True:
        found.add(Finding("permissions.storage", STORAGE))
    return sorted(found)


def check_record(record_text: Optional[str], manifest: Mapping[str, Any], manifest_bytes: bytes) -> list[Finding]:
    """The record must be the canonical freeze of exactly this manifest.

    Requirement 8.8: when the manifest's permissions differ from the frozen
    ones and the app version does not, the change is reported as such. Any
    difference needs a newly generated record.
    """

    where = FREEZE_RECORD_LINK
    if record_text is None:
        return [Finding(where, RECORD_MISSING)]
    try:
        record = json.loads(record_text)
    except ValueError:
        return [Finding(where, RECORD_INVALID)]
    if not isinstance(record, dict) or set(record) != RECORD_KEYS:
        return [Finding(where, RECORD_INVALID)]

    found: set[Finding] = set()
    if record["schemaVersion"] != SCHEMA_VERSION or isinstance(record["schemaVersion"], bool):
        found.add(Finding(where, RECORD_SCHEMA))
    if record["frozenOn"] != FROZEN_ON:
        found.add(Finding(where, RECORD_DATE))
    for key in ("permissionsSha256", "manifestSha256"):
        if not isinstance(record[key], str) or not _SHA256.fullmatch(record[key]):
            found.add(Finding(where, RECORD_INVALID))
    frozen = record["permissions"]
    if not isinstance(frozen, dict):
        found.add(Finding(where, RECORD_INVALID))
        return sorted(found)

    permissions = manifest.get("permissions")
    current = normalize_permissions(permissions) if isinstance(permissions, Mapping) else {}
    permissions_changed = frozen != current
    version_changed = record["appVersion"] != manifest.get("version")
    if permissions_changed:
        found.add(Finding(where, RECORD_PERMISSIONS))
        if not version_changed:
            found.add(Finding("version", CHANGE_WITHOUT_VERSION))
    if version_changed:
        found.add(Finding(where, RECORD_VERSION))
    if record["permissionsSha256"] != permissions_sha256(frozen):
        found.add(Finding(where, RECORD_PERMISSIONS_HASH))
    if record["manifestSha256"] != manifest_sha256(manifest_bytes):
        found.add(Finding(where, RECORD_MANIFEST_HASH))
    if not found and record_text != render_freeze_record(record):
        found.add(Finding(where, RECORD_NONCANONICAL))
    return sorted(found)


def check_readme(readme_text: str, permissions: Mapping[str, Any]) -> list[Finding]:
    """Trust copy evidence: the README links the freeze record and names each API path in backticks."""

    found: set[Finding] = set()
    if FREEZE_RECORD_LINK not in readme_text:
        found.add(Finding("README.md", README_LINK))
    api = permissions.get("api")
    for entry in api if _string_list(api) else ():
        if f"`{entry}`" not in readme_text:
            found.add(Finding("README.md", README_PATH))
    return sorted(found)


def check_freeze_state(
    *,
    inventory: PermissionInventory,
    manifest: Any,
    manifest_bytes: bytes,
    record_text: Optional[str],
    readme_text: Optional[str] = None,
) -> tuple[Finding, ...]:
    """The whole gate. Empty means the freeze is accepted.

    `readme_text` is checked only when given, so the manifest and record can be
    gated before the judge-facing README exists.
    """

    found: set[Finding] = set(check_inventory(inventory))
    found.update(check_manifest(manifest, inventory))
    if isinstance(manifest, Mapping):
        found.update(check_record(record_text, manifest, manifest_bytes))
        permissions = manifest.get("permissions")
        if readme_text is not None and isinstance(permissions, Mapping):
            found.update(check_readme(readme_text, permissions))
    return tuple(sorted(found))


def describe(findings: Sequence[Finding]) -> list[str]:
    return [str(finding) for finding in findings]
