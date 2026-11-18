"""Pure contract for the Submission Document Set.

Spec 7 (replay-and-submission) task 9.1; Requirements 7.2, 7.3, 7.6, 7.8,
9.1-9.10 and 12.1-12.11.

Everything here is a function of values: document text and a predicate that
says whether a repository-relative path exists go in, findings come out.
Nothing reads a file, a clock, the environment or the network, nothing follows
a URL, and no command text is ever executed or expanded.
scripts/check-submission.py is the thin adapter that reads the repository.

A finding names a file, a one-based line, a fixed category and the name of the
contract element that is missing or wrong (a heading, a column, a checklist
key, a relative path written in the document). It never carries a URL query,
a credential or a local absolute path.

Evidence has three honest states. `complete` needs evidence that exists.
`pending` (and `not_started`, `in_progress`, `blocked`) is accepted by the
normal check and refused by the release check, so the documents can be written
and gated before the public repository, the Pages site, the screenshots and
the video exist, without ever claiming them.

Stdlib only.
"""

from __future__ import annotations

import json
import posixpath
import re
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Mapping, Optional, Sequence

__all__ = [
    "CATEGORIES",
    "DOCUMENTS",
    "Finding",
    "MILESTONES",
    "check_document_set",
    "check_release_ready",
]

# --- Categories -----------------------------------------------------------------

MISSING_FILE = "missing-file"
MISSING_HEADING = "missing-heading"
HEADING_ORDER = "heading-order"
BROKEN_LINK = "broken-link"
LINK_ESCAPES = "link-escapes-repository"
PLACEHOLDER = "placeholder"
LOCAL_PATH = "local-absolute-path"
PROHIBITED_NAME = "prohibited-name"
MISSING_SCRIPT = "missing-script"
INSTALL_COMMAND = "install-command"
CREW_VERSION = "crew-version-mismatch"
MISSING_PREREQUISITE = "missing-prerequisite"
TRUST_STEPS = "trust-steps"
MISSING_DOCUMENT_LINK = "missing-document-link"
MISSING_PHRASE = "missing-required-content"
TABLE_MISSING = "table-missing"
TABLE_COLUMNS = "table-columns"
TABLE_ROW = "table-row-invalid"
MISSING_KEY = "missing-checklist-key"
DUPLICATE_KEY = "duplicate-checklist-key"
INVALID_STATUS = "invalid-status"
EVIDENCE_MISSING = "evidence-missing"
EVIDENCE_NOT_FOUND = "evidence-not-found"
DEMO_MARKER = "demo-marker-invalid"
DEMO_ORDER = "demo-markers-not-contiguous"
DEMO_DURATION = "demo-duration"
DEMO_BEAT = "demo-beat-missing"
MILESTONE_DATE = "milestone-date"
MILESTONE_ORDER = "milestone-order"
STRETCH_BEFORE_MVP = "stretch-before-mvp"
METADATA_INVALID = "publication-metadata-invalid"
UNVERIFIED_URL = "unverified-public-url"
MISSING_PUBLIC_LINK = "missing-public-link"
ASSET_ROW = "asset-row-inconsistent"
UNCREDITED_ASSET = "uncredited-asset"
RELEASE_PENDING = "release-item-pending"

CATEGORIES = frozenset(
    {
        MISSING_FILE, MISSING_HEADING, HEADING_ORDER, BROKEN_LINK, LINK_ESCAPES, PLACEHOLDER, LOCAL_PATH,
        PROHIBITED_NAME, MISSING_SCRIPT, INSTALL_COMMAND, CREW_VERSION, MISSING_PREREQUISITE, TRUST_STEPS,
        MISSING_DOCUMENT_LINK, MISSING_PHRASE, TABLE_MISSING, TABLE_COLUMNS, TABLE_ROW, MISSING_KEY,
        DUPLICATE_KEY, INVALID_STATUS, EVIDENCE_MISSING, EVIDENCE_NOT_FOUND, DEMO_MARKER, DEMO_ORDER,
        DEMO_DURATION, DEMO_BEAT, MILESTONE_DATE, MILESTONE_ORDER, STRETCH_BEFORE_MVP, METADATA_INVALID,
        UNVERIFIED_URL, MISSING_PUBLIC_LINK, ASSET_ROW, UNCREDITED_ASSET, RELEASE_PENDING,
    }
)  # fmt: skip

# --- The fixed contract -----------------------------------------------------------

README = "README.md"
WRITEUP = "docs/writeup.md"
COVERAGE = "docs/kiro-coverage.md"
DEMO = "docs/demo-script.md"
CREDITS = "docs/credits.md"
ASSETS_CHECKLIST = "docs/assets-checklist.md"
SUBMISSION_CHECKLIST = "docs/submission-checklist.md"
ASSETS_MANIFEST = "docs/assets-manifest.json"
PERMISSION_FREEZE = "docs/permission-freeze.json"
PUBLICATION_METADATA = "docs/publication-metadata.json"
LICENSE = "LICENSE"
INSTALL_SCRIPT = "scripts/install-local.sh"

# Every member of the Submission Document Set (design, "Submission documentation contract").
DOCUMENTS = (
    README, WRITEUP, COVERAGE, DEMO, CREDITS, ASSETS_CHECKLIST, SUBMISSION_CHECKLIST,
    ASSETS_MANIFEST, PERMISSION_FREEZE,
)  # fmt: skip
REQUIRED_FILES = DOCUMENTS + (PUBLICATION_METADATA, LICENSE, INSTALL_SCRIPT, "app/app.json", "app/ui/dist/index.mjs")

# Second-level headings each Markdown document must have, in this order.
HEADINGS: Mapping[str, tuple[str, ...]] = {
    README: (
        "Static replay",
        "Live app requirements",
        "Install",
        "One-time trust step",
        "Permissions",
        "Demo",
        "Tests",
        "Repository layout",
        "Documents",
        "Related work",
        "License",
    ),
    WRITEUP: (
        "Problem",
        "Spatial approach",
        "Architecture",
        "Canonical log and replay",
        "Visible authority and guardrails",
        "Accessibility",
        "How Kiro was used",
        "Related work",
        "Original work",
        "Trade-offs",
        "MVP and stretch",
        "Verification status",
    ),
    COVERAGE: ("Coverage table", "How to read this table"),
    DEMO: ("Before recording", "Script", "Fallbacks"),
    CREDITS: ("Visual assets", "Audio", "Software acknowledgements", "Related work"),
    ASSETS_CHECKLIST: ("Assets", "Capture steps", "Human review"),
    SUBMISSION_CHECKLIST: ("Schedule", "Checklist", "Feature freeze rule", "Stretch queue"),
}

COVERAGE_COLUMNS = ("Feature", "Kiro capability", "Implementation evidence", "Test evidence", "Demo evidence", "Scope", "Completion")
ASSET_COLUMNS = ("Asset", "Path", "Dimensions", "Theme", "Alt text", "Provenance", "Status")
CHECKLIST_COLUMNS = ("ID", "Item", "Due", "Status", "Evidence")
SCHEDULE_COLUMNS = ("Date", "ID", "Gate", "Scope", "Status")

SCOPES = ("MVP", "Stretch")
COMPLETION_STATES = ("Complete", "Tests pass; live Crew check pending", "In progress", "Pending", "Not started")
STATUSES = ("not_started", "in_progress", "pending", "complete", "blocked")

# Asset rows the checklist must track (Requirement 9.7). The last two are optional assets
# but their rows are required, so "not made" is a recorded decision.
ASSET_KEYS = ("icon", "house-light", "house-dark", "attic-replay", "door-approval", "hero-light", "video-thumbnail")

# Submission checklist keys (Requirement 9.8).
CHECKLIST_KEYS = (
    "repository-public", "license-detected", "links", "permission-freeze", "clean-install", "trust-step",
    "pages-smoke", "ci", "tests", "accessibility", "screenshots", "video", "credits", "secret-scan",
    "feature-freeze", "submission",
)  # fmt: skip
# Keys that need the public repository or the public site and cannot be complete before RS-S1.
PUBLIC_KEYS = frozenset({"repository-public", "license-detected", "links", "pages-smoke", "ci", "submission"})

# Requirement 12: (date, id). The deadline row carries the time as well.
MILESTONES = (
    ("2026-11-15", "planning"),
    ("2026-11-22", "replay-engine"),
    ("2026-11-26", "attic-and-pages-candidate"),
    ("2026-11-29", "permission-freeze-and-rehearsal"),
    ("2026-11-30", "feature-freeze"),
    ("2026-12-01", "media-and-checklist-close"),
    ("2026-12-02", "video"),
    ("2026-12-03", "submission"),
    ("2026-12-04 14:00 PT", "deadline"),
)
STRETCH_DATE = "after MVP rehearsal"
MAX_DEMO_SECONDS = 180
DEMO_BEATS = ("static replay", "live", "approv", "workshop", "attic")
PREREQUISITES = ("Node.js", "bun", "git", "curl", "gateway")
TRUST_WORDS = ("Apps", "Library", "Haunted House", "Enable", "Trust")
RELATED_WORK = ("Spec Builder", "Agent Worlds")


@dataclass(frozen=True, order=True)
class Finding:
    path: str
    line: int
    category: str
    detail: str = ""

    def __str__(self) -> str:
        tail = f": {self.detail}" if self.detail else ""
        return f"{self.path}:{self.line}: {self.category}{tail}"


Exists = Callable[[str], bool]

# --- Markdown reading ---------------------------------------------------------------

_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
_FENCE = re.compile(r"^(```|~~~)\s*([A-Za-z0-9_+-]*)\s*$")
_LINK = re.compile(r"(?<!\\)\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
_URL = re.compile(r"https?://[^\s<>()\"'`\]]+")
_SCRIPT = re.compile(r"(?<![\w./-])(scripts/[A-Za-z0-9_.-]+\.(?:sh|py|mjs))")
_SAFE = re.compile(r"[^\w ./:+#()&,'-]")
_PLACEHOLDER = re.compile(
    r"\b(?:TODO|TBD|FIXME|XXX|lorem ipsum)\b|<(?:owner|user|username|repo|repository|your[- ][a-z-]+|url|link)>"
    r"|\b(?:your-(?:username|org|repo)|OWNER/REPO|example\.(?:com|org|net))\b",
    re.IGNORECASE,
)
_LOCAL_PATH = re.compile(r"(?:/Users/|/home/)[A-Za-z0-9._-]+/|[A-Za-z]:\\Users\\|file://")
# Assembled so this module does not itself contain the names it rejects.
_PROHIBITED = re.compile(r"\b(?:" + "|".join(("micro" + "soft", "b" + "ob")) + r")\b", re.IGNORECASE)
# The two documents that say what is being resurrected may name it (owner's
# decision, 18 Nov). The app, its assets, its fixtures and every other
# document still may not; scripts/lib/asset_contract.py keeps the app clean.
NAMES_ALLOWED_IN = ("README.md", "docs/writeup.md")


def _safe(text: str) -> str:
    """A contract element name reduced to letters, digits and plain punctuation, at a bounded length."""

    return _SAFE.sub("", text)[:80]


@dataclass(frozen=True)
class _Fence:
    line: int
    language: str
    body: tuple[str, ...]


@dataclass(frozen=True)
class _Markdown:
    lines: tuple[str, ...]
    # (line, level, title) outside fences
    headings: tuple[tuple[int, int, str], ...]
    fences: tuple[_Fence, ...]
    # line numbers (1-based) that are inside a fence, including the fence markers
    fenced: frozenset[int]

    def section(self, title: str) -> tuple[int, int]:
        """(first line, last line) of a level-2 section, both 1-based; (0, -1) when absent."""

        start = next((line for line, level, name in self.headings if level == 2 and name == title), 0)
        if start == 0:
            return 0, -1
        end = next((line - 1 for line, level, _name in self.headings if line > start and level <= 2), len(self.lines))
        return start, end

    def text(self, title: str) -> str:
        start, end = self.section(title)
        return "\n".join(self.lines[start:end]) if start else ""


def _read_markdown(text: str) -> _Markdown:
    lines = tuple(text.replace("\r\n", "\n").split("\n"))
    headings: list[tuple[int, int, str]] = []
    fences: list[_Fence] = []
    fenced: set[int] = set()
    opened: Optional[tuple[int, str, str]] = None
    body: list[str] = []
    for number, line in enumerate(lines, start=1):
        fence = _FENCE.match(line.strip())
        if opened is not None:
            fenced.add(number)
            if fence and fence.group(1) == opened[1] and fence.group(2) == "":
                fences.append(_Fence(opened[0], opened[2], tuple(body)))
                opened, body = None, []
            else:
                body.append(line)
            continue
        if fence:
            opened = (number, fence.group(1), fence.group(2).lower())
            fenced.add(number)
            continue
        heading = _HEADING.match(line)
        if heading:
            headings.append((number, len(heading.group(1)), heading.group(2)))
    if opened is not None:
        fences.append(_Fence(opened[0], opened[2], tuple(body)))
    return _Markdown(lines, tuple(headings), tuple(fences), frozenset(fenced))


def _cells(line: str) -> Optional[list[str]]:
    stripped = line.strip()
    if not (stripped.startswith("|") and stripped.endswith("|")) or len(stripped) < 2:
        return None
    return [cell.strip().replace("\\|", "|") for cell in re.split(r"(?<!\\)\|", stripped[1:-1])]


@dataclass(frozen=True)
class _Table:
    line: int
    columns: tuple[str, ...]
    rows: tuple[tuple[int, tuple[str, ...]], ...]


def _table(markdown: _Markdown, section: str) -> Optional[_Table]:
    """The first pipe table inside a level-2 section."""

    start, end = markdown.section(section)
    number = start + 1
    while start and number <= end:
        header = _cells(markdown.lines[number - 1]) if number not in markdown.fenced else None
        divider = _cells(markdown.lines[number]) if header is not None and number < end else None
        if header and divider and all(re.fullmatch(r":?-{3,}:?", cell) for cell in divider):
            rows: list[tuple[int, tuple[str, ...]]] = []
            cursor = number + 2
            while cursor <= end:
                cells = _cells(markdown.lines[cursor - 1])
                if cells is None:
                    break
                rows.append((cursor, tuple(cells)))
                cursor += 1
            return _Table(number, tuple(header), tuple(rows))
        number += 1
    return None


def _strip_code(cell: str) -> str:
    return cell.strip().strip("`").strip()


def _paths_in(cell: str) -> list[str]:
    """Repository-relative paths written in backticks in a table cell."""

    return [item for item in re.findall(r"`([^`\s]+)`", cell) if "/" in item or "." in item]


# --- Generic document checks -----------------------------------------------------------


def _resolve(target: str, document: str) -> Optional[str]:
    """A relative link target as a repository-relative path, or None when it leaves the repository."""

    target = target.split("#", 1)[0].split("?", 1)[0]
    joined = posixpath.normpath(posixpath.join(posixpath.dirname(document), target))
    if joined.startswith("../") or joined == ".." or joined.startswith("/"):
        return None
    return joined


def check_markdown(path: str, text: str, exists: Exists) -> list[Finding]:
    """Headings, relative links, placeholders, local paths, prohibited names and script references."""

    found: list[Finding] = []
    markdown = _read_markdown(text)
    titles = [name for _line, level, name in markdown.headings if level == 2]
    required = HEADINGS.get(path, ())
    for title in required:
        if title not in titles:
            found.append(Finding(path, 1, MISSING_HEADING, title))
    present = [title for title in titles if title in required]
    if present != [title for title in required if title in present]:
        found.append(Finding(path, 1, HEADING_ORDER))
    if not any(level == 1 for _line, level, _name in markdown.headings):
        found.append(Finding(path, 1, MISSING_HEADING, "document title"))

    for number, line in enumerate(markdown.lines, start=1):
        if _PLACEHOLDER.search(line):
            found.append(Finding(path, number, PLACEHOLDER))
        if _LOCAL_PATH.search(line):
            found.append(Finding(path, number, LOCAL_PATH))
        if _PROHIBITED.search(line) and path not in NAMES_ALLOWED_IN:
            found.append(Finding(path, number, PROHIBITED_NAME))
        for script in _SCRIPT.findall(line):
            if not exists(script):
                found.append(Finding(path, number, MISSING_SCRIPT, _safe(script)))
        if number in markdown.fenced:
            continue
        for target in _LINK.findall(line):
            if re.match(r"[a-z][a-z0-9+.-]*:", target, re.IGNORECASE) or target.startswith(("#", "//")):
                continue  # URLs are never followed here; anchors need no file
            resolved = _resolve(target, path)
            if resolved is None:
                found.append(Finding(path, number, LINK_ESCAPES))
            elif not exists(resolved):
                found.append(Finding(path, number, BROKEN_LINK, _safe(resolved)))
    return found


# --- README ------------------------------------------------------------------------------

_INSTALL_LINE = re.compile(r"(?:\./)?scripts/install-local\.sh")
_VERSION = re.compile(r"\b(\d+\.\d+\.\d+)\b")
_MIN_CREW = re.compile(r'^MIN_CREW_VERSION="(\d+\.\d+\.\d+)"$', re.MULTILINE)


def install_command(readme: str) -> tuple[Optional[str], int]:
    """The one Install Command of the README's Install section and its line, or (None, line).

    The section must hold exactly one fenced block, and that block exactly one
    non-empty line of the form `scripts/install-local.sh`. The text is matched,
    never executed: anything with an argument, a second command, a pipe, a
    substitution or a redirection is refused.
    """

    markdown = _read_markdown(readme)
    start, end = markdown.section("Install")
    fences = [fence for fence in markdown.fences if start and start < fence.line <= end]
    if len(fences) != 1:
        return None, start or 1
    body = [line.strip() for line in fences[0].body if line.strip()]
    if len(body) != 1 or not _INSTALL_LINE.fullmatch(body[0]) or fences[0].language not in ("bash", "sh", "shell", ""):
        return None, fences[0].line
    return body[0], fences[0].line + 1


def check_readme(readme: str, *, manifest: Mapping[str, Any], install_script: str, metadata: Mapping[str, Any]) -> list[Finding]:
    found: list[Finding] = []
    markdown = _read_markdown(readme)

    command, line = install_command(readme)
    if command is None:
        found.append(Finding(README, line, INSTALL_COMMAND))

    # One minimum Crew version in the manifest, the install script and the README (Requirement 11.6).
    minimum = manifest.get("minKiroCrewVersion")
    script_minimum = _MIN_CREW.search(install_script)
    if not isinstance(minimum, str) or script_minimum is None or script_minimum.group(1) != minimum:
        found.append(Finding(INSTALL_SCRIPT, 1, CREW_VERSION))
    requirements = markdown.text("Live app requirements")
    stated = re.search(r"Kiro Crew (\d+\.\d+\.\d+) or later", requirements)
    if stated is None or stated.group(1) != minimum:
        found.append(Finding(README, markdown.section("Live app requirements")[0] or 1, CREW_VERSION))
    for prerequisite in PREREQUISITES:
        if prerequisite.lower() not in requirements.lower():
            found.append(Finding(README, markdown.section("Live app requirements")[0] or 1, MISSING_PREREQUISITE, prerequisite))

    # Apps -> Library -> Haunted House -> Enable -> Trust, in that order (Requirement 7.6).
    trust = markdown.text("One-time trust step")
    cursor = 0
    for word in TRUST_WORDS:
        position = trust.find(word, cursor)
        if position < 0:
            found.append(Finding(README, markdown.section("One-time trust step")[0] or 1, TRUST_STEPS, word))
            break
        cursor = position + len(word)

    # Static Replay comes first and is called read-only (Requirement 7.8).
    replay = markdown.text("Static replay")
    if "read-only" not in replay.lower():
        found.append(Finding(README, markdown.section("Static replay")[0] or 1, MISSING_PHRASE, "read-only"))

    for title, phrases in (("Related work", RELATED_WORK), ("License", ("MIT",)), ("Permissions", (PERMISSION_FREEZE,))):
        section = markdown.text(title)
        for phrase in phrases:
            if phrase not in section:
                found.append(Finding(README, markdown.section(title)[0] or 1, MISSING_PHRASE, phrase))
    permissions = manifest.get("permissions")
    api = permissions.get("api") if isinstance(permissions, Mapping) else None
    for entry in api if isinstance(api, list) else ():
        if isinstance(entry, str) and f"`{entry}`" not in markdown.text("Permissions"):
            found.append(Finding(README, markdown.section("Permissions")[0] or 1, MISSING_PHRASE, "permissions.api path"))

    # Links to every other member of the document set (Requirement 9.1).
    targets = {_resolve(target, README) for target in _LINK.findall(readme)}
    for document in DOCUMENTS[1:] + (LICENSE,):
        if document not in targets:
            found.append(Finding(README, 1, MISSING_DOCUMENT_LINK, document))

    found.extend(_check_public_urls(README, readme, metadata, require_links=True))
    return found


# --- Publication metadata (RS-S1) -------------------------------------------------------------

_REPOSITORY_URL = re.compile(r"https://github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/([A-Za-z0-9._-]{1,100})")
_PUBLIC_HOSTS = re.compile(r"https?://(?:[A-Za-z0-9-]+\.)*(?:github\.com|github\.io|githubusercontent\.com)(?:[/:?#]|$)", re.IGNORECASE)
_METADATA_KEYS = frozenset({"schemaVersion", "status", "repositoryUrl", "defaultBranch", "cloneFolder", "pagesUrl", "public", "license"})


def check_metadata(metadata: Any) -> list[Finding]:
    """docs/publication-metadata.json: `pending` with no URL, or `verified` with the full RS-S1 shape."""

    bad = [Finding(PUBLICATION_METADATA, 1, METADATA_INVALID)]
    if not isinstance(metadata, Mapping) or set(metadata) != _METADATA_KEYS:
        return bad
    if metadata["schemaVersion"] != 1 or isinstance(metadata["schemaVersion"], bool) or metadata["license"] != "MIT":
        return bad
    url_fields = ("repositoryUrl", "defaultBranch", "cloneFolder", "pagesUrl")
    if metadata["status"] == "pending":
        return [] if all(metadata[key] is None for key in url_fields) and metadata["public"] is None else bad
    if metadata["status"] != "verified" or metadata["public"] is not True:
        return bad
    repository = metadata["repositoryUrl"]
    match = _REPOSITORY_URL.fullmatch(repository) if isinstance(repository, str) else None
    pages = metadata["pagesUrl"]
    branch = metadata["defaultBranch"]
    if (
        match is None
        or metadata["cloneFolder"] != match.group(2)
        or not isinstance(branch, str)
        or not re.fullmatch(r"[A-Za-z0-9._/-]{1,100}", branch)
        or not isinstance(pages, str)
        or not re.fullmatch(r"https://[A-Za-z0-9.-]+(?:/[A-Za-z0-9._~/-]*)?", pages)
        or _PLACEHOLDER.search(repository + " " + pages) is not None
    ):
        return bad
    return []


def _check_public_urls(path: str, text: str, metadata: Mapping[str, Any], *, require_links: bool) -> list[Finding]:
    """No repository or Pages URL may appear that RS-S1 has not verified (Requirement 7.9)."""

    found: list[Finding] = []
    verified = metadata.get("status") == "verified" if isinstance(metadata, Mapping) else False
    allowed = tuple(url for url in (metadata.get("repositoryUrl"), metadata.get("pagesUrl")) if isinstance(url, str)) if verified else ()
    for number, line in enumerate(text.split("\n"), start=1):
        for url in _URL.findall(line):
            if _PUBLIC_HOSTS.match(url) and not any(url.rstrip(".,;") == base or url.startswith(base.rstrip("/") + "/") for base in allowed):
                found.append(Finding(path, number, UNVERIFIED_URL))
    if verified and require_links:
        for url in allowed:
            if url not in text:
                found.append(Finding(path, 1, MISSING_PUBLIC_LINK))
    return found


# --- Write-up, coverage, credits ------------------------------------------------------------------


def check_writeup(text: str) -> list[Finding]:
    found = []
    related = _read_markdown(text).text("Related work")
    for name in RELATED_WORK:
        if name not in related:
            found.append(Finding(WRITEUP, 1, MISSING_PHRASE, name))
    return found


def _require_table(path: str, markdown: _Markdown, section: str, columns: Sequence[str]) -> tuple[Optional[_Table], list[Finding]]:
    table = _table(markdown, section)
    if table is None:
        return None, [Finding(path, markdown.section(section)[0] or 1, TABLE_MISSING, section)]
    if table.columns != tuple(columns):
        missing = next((column for column in columns if column not in table.columns), "column order")
        return None, [Finding(path, table.line, TABLE_COLUMNS, missing)]
    found = [Finding(path, line, TABLE_ROW, "cell count") for line, cells in table.rows if len(cells) != len(columns)]
    return (None, found) if found else (table, [])


def check_coverage(text: str, exists: Exists) -> list[Finding]:
    """The Kiro Coverage Table (Requirement 9.4)."""

    table, found = _require_table(COVERAGE, _read_markdown(text), "Coverage table", COVERAGE_COLUMNS)
    if table is None:
        return found
    if not table.rows:
        found.append(Finding(COVERAGE, table.line, TABLE_ROW, "no rows"))
    for line, cells in table.rows:
        row = dict(zip(COVERAGE_COLUMNS, cells))
        if not row["Feature"] or not row["Kiro capability"]:
            found.append(Finding(COVERAGE, line, TABLE_ROW, "Feature"))
        if row["Scope"] not in SCOPES:
            found.append(Finding(COVERAGE, line, INVALID_STATUS, "Scope"))
        if row["Completion"] not in COMPLETION_STATES:
            found.append(Finding(COVERAGE, line, INVALID_STATUS, "Completion"))
        for column in ("Implementation evidence", "Test evidence", "Demo evidence"):
            paths = _paths_in(row[column])
            for path in paths:
                if not exists(path.rstrip("/")):
                    found.append(Finding(COVERAGE, line, EVIDENCE_NOT_FOUND, _safe(path)))
            if row["Completion"] == "Complete" and column != "Demo evidence" and not paths:
                found.append(Finding(COVERAGE, line, EVIDENCE_MISSING, column))
    return found


# --- Demo script -------------------------------------------------------------------------------------

_BEAT = re.compile(r"^(\d+):([0-5]\d)\s*[–-]\s*(\d+):([0-5]\d)\s+\S")


def demo_beats(text: str) -> tuple[list[tuple[int, int, int, str]], list[Finding]]:
    """(line, start seconds, end seconds, body) for each `### m:ss–m:ss Title` beat of the Script section."""

    markdown = _read_markdown(text)
    start, end = markdown.section("Script")
    beats: list[tuple[int, int, int, str]] = []
    found: list[Finding] = []
    marks = [(line, name) for line, level, name in markdown.headings if level == 3 and start < line <= end]
    for index, (line, name) in enumerate(marks):
        match = _BEAT.match(name)
        if match is None:
            found.append(Finding(DEMO, line, DEMO_MARKER))
            continue
        last = marks[index + 1][0] - 1 if index + 1 < len(marks) else end
        body = name + "\n" + "\n".join(markdown.lines[line:last])
        beats.append((line, int(match.group(1)) * 60 + int(match.group(2)), int(match.group(3)) * 60 + int(match.group(4)), body))
    return beats, found


def check_demo(text: str) -> list[Finding]:
    """Elapsed markers, operator actions, expected results and a duration under 180 s (Requirement 9.5)."""

    beats, found = demo_beats(text)
    if not beats:
        return found + [Finding(DEMO, 1, DEMO_MARKER, "no time markers")]
    if beats[0][1] != 0:
        found.append(Finding(DEMO, beats[0][0], DEMO_ORDER))
    for index, (line, begin, finish, body) in enumerate(beats):
        if finish <= begin:
            found.append(Finding(DEMO, line, DEMO_ORDER))
        if index and begin != beats[index - 1][2]:
            found.append(Finding(DEMO, line, DEMO_ORDER))
        for label in ("**Action:**", "**Expect:**"):
            if label not in body:
                found.append(Finding(DEMO, line, DEMO_BEAT, label.strip("*:")))
    total = max(finish for _line, _begin, finish, _body in beats)
    if total >= MAX_DEMO_SECONDS:
        found.append(Finding(DEMO, beats[-1][0], DEMO_DURATION, f"{total} seconds"))
    script = "\n".join(body for _line, _begin, _finish, body in beats).lower()
    for beat in DEMO_BEATS:
        if beat not in script:
            found.append(Finding(DEMO, 1, DEMO_BEAT, beat))
    return found


# --- Asset checklist and credits ---------------------------------------------------------------------------


def _manifest_paths(manifest: Any) -> list[str]:
    assets = manifest.get("assets") if isinstance(manifest, Mapping) else None
    return [asset["path"] for asset in assets if isinstance(asset, Mapping) and isinstance(asset.get("path"), str)] if isinstance(assets, list) else []


def check_assets_checklist(text: str, manifest: Any, exists: Exists) -> list[Finding]:
    """Rows, dimensions, theme, alt text, provenance and honest completion (Requirement 9.7)."""

    table, found = _require_table(ASSETS_CHECKLIST, _read_markdown(text), "Assets", ASSET_COLUMNS)
    if table is None:
        return found
    recorded = set(_manifest_paths(manifest))
    seen: dict[str, int] = {}
    for line, cells in table.rows:
        row = dict(zip(ASSET_COLUMNS, cells))
        key = _strip_code(row["Asset"])
        if key in seen:
            found.append(Finding(ASSETS_CHECKLIST, line, DUPLICATE_KEY, _safe(key)))
        seen[key] = line
        path = _strip_code(row["Path"])
        if not re.fullmatch(r"[1-9]\d{1,4}\s*[x×]\s*[1-9]\d{1,4}", row["Dimensions"]):
            found.append(Finding(ASSETS_CHECKLIST, line, TABLE_ROW, "Dimensions"))
        if row["Theme"] not in ("light", "dark", "both", "n/a"):
            found.append(Finding(ASSETS_CHECKLIST, line, TABLE_ROW, "Theme"))
        if len(row["Alt text"]) < 20:
            found.append(Finding(ASSETS_CHECKLIST, line, TABLE_ROW, "Alt text"))
        if row["Provenance"] not in ("Original", "CC0-1.0"):
            found.append(Finding(ASSETS_CHECKLIST, line, TABLE_ROW, "Provenance"))
        status = _strip_code(row["Status"])
        if status not in ("complete", "pending", "not_planned"):
            found.append(Finding(ASSETS_CHECKLIST, line, INVALID_STATUS, "Status"))
        # A row is complete exactly when its file exists and has a provenance record.
        there = exists(path) and path in recorded
        if status == "complete" and not there:
            found.append(Finding(ASSETS_CHECKLIST, line, ASSET_ROW, "complete without file and provenance"))
        if status != "complete" and (exists(path) or path in recorded):
            found.append(Finding(ASSETS_CHECKLIST, line, ASSET_ROW, "file present but row not complete"))
    for key in ASSET_KEYS:
        if key not in seen:
            found.append(Finding(ASSETS_CHECKLIST, table.line, MISSING_KEY, key))
    listed = {_strip_code(dict(zip(ASSET_COLUMNS, cells))["Path"]) for _line, cells in table.rows}
    for path in sorted(recorded - listed):
        found.append(Finding(ASSETS_CHECKLIST, table.line, ASSET_ROW, "provenance record without a row"))
    return found


def check_credits(text: str, manifest: Any) -> list[Finding]:
    """Every distributed asset is named with its provenance (Requirement 9.6)."""

    found = []
    assets = manifest.get("assets") if isinstance(manifest, Mapping) else None
    visual = _read_markdown(text).text("Visual assets")
    for asset in assets if isinstance(assets, list) else ():
        if not isinstance(asset, Mapping):
            continue
        path, license_name = asset.get("path"), asset.get("licenseName")
        row = next((line for line in visual.split("\n") if isinstance(path, str) and f"`{path}`" in line), None)
        if row is None or not isinstance(license_name, str) or license_name not in row:
            found.append(Finding(CREDITS, 1, UNCREDITED_ASSET, _safe(str(path))))
        elif asset.get("provenance") == "cc0" and not all(
            isinstance(asset.get(key), str) and asset[key] in row for key in ("sourceUrl", "licenseUrl")
        ):
            found.append(Finding(CREDITS, 1, UNCREDITED_ASSET, _safe(str(path))))
    related = _read_markdown(text).text("Related work")
    for name in RELATED_WORK:
        if name not in related:
            found.append(Finding(CREDITS, 1, MISSING_PHRASE, name))
    return found


# --- Submission checklist and schedule ----------------------------------------------------------------------


def check_schedule(text: str) -> list[Finding]:
    """The dated gates of Requirement 12, MVP first, stretch last and undated."""

    table, found = _require_table(SUBMISSION_CHECKLIST, _read_markdown(text), "Schedule", SCHEDULE_COLUMNS)
    if table is None:
        return found
    rows = [(line, dict(zip(SCHEDULE_COLUMNS, cells))) for line, cells in table.rows]
    mvp = [(line, row) for line, row in rows if row["Scope"] == "MVP"]
    by_id = {_strip_code(row["ID"]): (line, row) for line, row in mvp}
    for date, key in MILESTONES:
        if key not in by_id:
            found.append(Finding(SUBMISSION_CHECKLIST, table.line, MILESTONE_DATE, key))
        elif by_id[key][1]["Date"] != date:
            found.append(Finding(SUBMISSION_CHECKLIST, by_id[key][0], MILESTONE_DATE, key))
    dates = [row["Date"] for _line, row in mvp]
    if dates != sorted(dates):
        found.append(Finding(SUBMISSION_CHECKLIST, table.line, MILESTONE_ORDER))
    if len(by_id) != len(mvp):
        found.append(Finding(SUBMISSION_CHECKLIST, table.line, DUPLICATE_KEY, "schedule ID"))
    # Submission lands strictly before the external deadline (Requirement 12.8).
    submission, deadline = by_id.get("submission"), by_id.get("deadline")
    if submission and deadline and not submission[1]["Date"][:10] < deadline[1]["Date"][:10]:
        found.append(Finding(SUBMISSION_CHECKLIST, submission[0], MILESTONE_ORDER, "submission before deadline"))
    last_mvp = max((line for line, _row in mvp), default=0)
    mvp_open = any(_strip_code(row["Status"]) != "complete" for _line, row in mvp if _strip_code(row["ID"]) != "deadline")
    for line, row in rows:
        status = _strip_code(row["Status"])
        if status not in STATUSES:
            found.append(Finding(SUBMISSION_CHECKLIST, line, INVALID_STATUS, "Status"))
        if row["Scope"] not in SCOPES:
            found.append(Finding(SUBMISSION_CHECKLIST, line, INVALID_STATUS, "Scope"))
        if row["Scope"] == "Stretch":
            # Stretch sorts after every MVP gate and stays unscheduled while any MVP gate is open (12.9, 12.11).
            if line < last_mvp or row["Date"] != STRETCH_DATE or (mvp_open and status != "not_started"):
                found.append(Finding(SUBMISSION_CHECKLIST, line, STRETCH_BEFORE_MVP))
    return found


def _checklist_rows(text: str) -> tuple[Optional[_Table], list[Finding]]:
    return _require_table(SUBMISSION_CHECKLIST, _read_markdown(text), "Checklist", CHECKLIST_COLUMNS)


def check_checklist(text: str, metadata: Mapping[str, Any], exists: Exists) -> list[Finding]:
    """Every required key once, a valid status, and evidence for anything marked complete (Requirement 9.8)."""

    table, found = _checklist_rows(text)
    if table is None:
        return found
    verified = isinstance(metadata, Mapping) and metadata.get("status") == "verified"
    dates = {date[:10] for date, _key in MILESTONES}
    seen: set[str] = set()
    for line, cells in table.rows:
        row = dict(zip(CHECKLIST_COLUMNS, cells))
        key = _strip_code(row["ID"])
        if key in seen:
            found.append(Finding(SUBMISSION_CHECKLIST, line, DUPLICATE_KEY, _safe(key)))
        seen.add(key)
        status = _strip_code(row["Status"])
        if status not in STATUSES:
            found.append(Finding(SUBMISSION_CHECKLIST, line, INVALID_STATUS, "Status"))
        if row["Due"] not in dates:
            found.append(Finding(SUBMISSION_CHECKLIST, line, MILESTONE_DATE, "Due"))
        paths = _paths_in(row["Evidence"])
        for path in paths:
            if not exists(path.rstrip("/")):
                found.append(Finding(SUBMISSION_CHECKLIST, line, EVIDENCE_NOT_FOUND, _safe(path)))
        if status == "complete":
            if not paths and not _URL.search(row["Evidence"]):
                found.append(Finding(SUBMISSION_CHECKLIST, line, EVIDENCE_MISSING, _safe(key)))
            if key in PUBLIC_KEYS and not verified:
                found.append(Finding(SUBMISSION_CHECKLIST, line, UNVERIFIED_URL, _safe(key)))
    for key in CHECKLIST_KEYS:
        if key not in seen:
            found.append(Finding(SUBMISSION_CHECKLIST, table.line, MISSING_KEY, key))
    return found


# --- The whole gate --------------------------------------------------------------------------------------------


def _json(files: Mapping[str, Optional[str]], path: str) -> Any:
    text = files.get(path)
    if text is None:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


def check_document_set(files: Mapping[str, Optional[str]], exists: Exists) -> tuple[Finding, ...]:
    """Every rule of the Submission Document Set.

    `files` maps each repository-relative path the contract reads to its text
    (None when the file is absent). `exists` answers for any other path.
    Pending evidence is accepted here; `check_release_ready` refuses it.
    """

    found: set[Finding] = set()
    for path in REQUIRED_FILES:
        if not exists(path):
            found.add(Finding(path, 1, MISSING_FILE))

    metadata = _json(files, PUBLICATION_METADATA)
    found.update(check_metadata(metadata))
    metadata = metadata if isinstance(metadata, Mapping) else {}
    manifest = _json(files, "app/app.json")
    assets = _json(files, ASSETS_MANIFEST)

    for path in HEADINGS:
        text = files.get(path)
        if text is None:
            continue
        found.update(check_markdown(path, text, exists))
        if path != README:
            found.update(_check_public_urls(path, text, metadata, require_links=False))

    def text_of(path: str) -> Optional[str]:
        return files.get(path)

    if text_of(README) is not None:
        found.update(
            check_readme(
                files[README] or "",
                manifest=manifest if isinstance(manifest, Mapping) else {},
                install_script=files.get(INSTALL_SCRIPT) or "",
                metadata=metadata,
            )
        )
    if text_of(WRITEUP) is not None:
        found.update(check_writeup(files[WRITEUP] or ""))
    if text_of(COVERAGE) is not None:
        found.update(check_coverage(files[COVERAGE] or "", exists))
    if text_of(DEMO) is not None:
        found.update(check_demo(files[DEMO] or ""))
    if text_of(CREDITS) is not None:
        found.update(check_credits(files[CREDITS] or "", assets))
    if text_of(ASSETS_CHECKLIST) is not None:
        found.update(check_assets_checklist(files[ASSETS_CHECKLIST] or "", assets, exists))
    if text_of(SUBMISSION_CHECKLIST) is not None:
        found.update(check_schedule(files[SUBMISSION_CHECKLIST] or ""))
        found.update(check_checklist(files[SUBMISSION_CHECKLIST] or "", metadata, exists))
    return tuple(sorted(found))


def check_release_ready(files: Mapping[str, Optional[str]]) -> tuple[Finding, ...]:
    """What still blocks a readiness claim: unverified publication metadata and any open MVP row."""

    found: set[Finding] = set()
    metadata = _json(files, PUBLICATION_METADATA)
    if not isinstance(metadata, Mapping) or metadata.get("status") != "verified":
        found.add(Finding(PUBLICATION_METADATA, 1, RELEASE_PENDING, "RS-S1 publication metadata"))
    checklist = files.get(SUBMISSION_CHECKLIST)
    if checklist is not None:
        table, _ = _checklist_rows(checklist)
        for line, cells in table.rows if table else ():
            row = dict(zip(CHECKLIST_COLUMNS, cells))
            if _strip_code(row["Status"]) != "complete":
                found.add(Finding(SUBMISSION_CHECKLIST, line, RELEASE_PENDING, _safe(_strip_code(row["ID"]))))
    assets = files.get(ASSETS_CHECKLIST)
    if assets is not None:
        table, _ = _require_table(ASSETS_CHECKLIST, _read_markdown(assets), "Assets", ASSET_COLUMNS)
        for line, cells in table.rows if table else ():
            row = dict(zip(ASSET_COLUMNS, cells))
            if _strip_code(row["Status"]) == "pending":
                found.add(Finding(ASSETS_CHECKLIST, line, RELEASE_PENDING, _safe(_strip_code(row["Asset"]))))
    coverage = files.get(COVERAGE)
    if coverage is not None:
        table, _ = _require_table(COVERAGE, _read_markdown(coverage), "Coverage table", COVERAGE_COLUMNS)
        for line, cells in table.rows if table else ():
            row = dict(zip(COVERAGE_COLUMNS, cells))
            if row["Scope"] == "MVP" and row["Completion"] != "Complete":
                found.add(Finding(COVERAGE, line, RELEASE_PENDING, _safe(row["Feature"])))
    return tuple(sorted(found))


def describe(findings: Iterable[Finding]) -> list[str]:
    return [str(finding) for finding in findings]
