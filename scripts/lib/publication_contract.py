"""Pure Publication_Gate classifier for the replay fixture and the static replay build.

Spec 7 (replay-and-submission) task 5.2; Requirements 4.9, 5.3, 5.5, 11.5.

Everything here is a function of values: file contents and file metadata go
in, category-only findings come out. Nothing reads a file, a clock, the
environment or the network; scripts/check-replay-publication.py is the thin
adapter that walks a folder and prints the findings.

A finding names a file, a one-based line and a fixed category. It has no field
for the matched text, so a credential or a home folder name that fails the
gate is never stored, printed or logged. An artifact is accepted only when
there is no finding at all.

Credential and home-path rules are not copied here. The classifier calls the
foundation scanner (scripts/secret_scan.py) through the `ScanText` port, then
applies the same rules again to decoded forms (base64, hex, percent and
backslash escapes) so an encoded credential fails too.

Static scans supplement the DOM transport traps of the UI tests. A substring
scan of minified code does not by itself prove transport isolation.

Stdlib only.
"""

from __future__ import annotations

import base64
import binascii
import posixpath
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Callable, Iterable, Optional, Protocol, Sequence
from urllib.parse import unquote, urlsplit

__all__ = [
    "ArtifactFile",
    "CATEGORIES",
    "CanonicalLine",
    "FixtureCodec",
    "PublicationFinding",
    "PublicationReport",
    "ScanText",
    "classify_artifact",
    "classify_fixture",
    "classify_publication",
    "classify_text",
]

# --- Categories ---------------------------------------------------------------

CREDENTIAL = "credential"
ENCODED_CREDENTIAL = "encoded-credential"
HOME_PATH = "home-path"
LOCALHOST_ORIGIN = "localhost-origin"
REMOTE_ASSET = "remote-asset"
ABSOLUTE_REFERENCE = "absolute-reference"
PATH_ESCAPE = "path-escape"
MISSING_ASSET = "missing-asset"
LIVE_TRANSPORT = "live-transport"
LIVE_SDK_IMPORT = "live-sdk-import"
SERVICE_WORKER = "service-worker"
SYMLINK = "symlink"
HARD_LINK = "hard-link"
NOT_REGULAR_FILE = "not-regular-file"
INVALID_PATH = "invalid-path"
MISSING_ENTRY = "missing-entry"
FIXTURE_MISSING = "fixture-missing"
FIXTURE_MISMATCH = "fixture-mismatch"
FIXTURE_INVALID_RECORD = "fixture-invalid-record"
FIXTURE_INTEGRITY = "fixture-integrity"
FIXTURE_NONCANONICAL = "fixture-noncanonical"
FIXTURE_EMPTY = "fixture-empty"
FIXTURE_FOREIGN_SCOPE = "fixture-foreign-scope"

CATEGORIES = frozenset(
    {
        CREDENTIAL,
        ENCODED_CREDENTIAL,
        HOME_PATH,
        LOCALHOST_ORIGIN,
        REMOTE_ASSET,
        ABSOLUTE_REFERENCE,
        PATH_ESCAPE,
        MISSING_ASSET,
        LIVE_TRANSPORT,
        LIVE_SDK_IMPORT,
        SERVICE_WORKER,
        SYMLINK,
        HARD_LINK,
        NOT_REGULAR_FILE,
        INVALID_PATH,
        MISSING_ENTRY,
        FIXTURE_MISSING,
        FIXTURE_MISMATCH,
        FIXTURE_INVALID_RECORD,
        FIXTURE_INTEGRITY,
        FIXTURE_NONCANONICAL,
        FIXTURE_EMPTY,
        FIXTURE_FOREIGN_SCOPE,
    }
)

ENTRY_FILE = "index.html"
FIXTURE_FILE = "fixture.jsonl"
# The scanner's name for its absolute home path rule; every other rule is a credential rule.
_SCANNER_HOME_RULE = "home-path"
# A path the scanner treats as a recorded fixture, so the home-path rule applies to every text.
_SCAN_AS = "fixtures/publication"


@dataclass(frozen=True, order=True)
class PublicationFinding:
    """One reason an artifact is refused. Deliberately has no field for the matched text."""

    path: str
    line: int
    category: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.category}"


@dataclass(frozen=True)
class PublicationReport:
    findings: tuple[PublicationFinding, ...]
    # Paths that were examined. Published only when `accepted`.
    paths: tuple[str, ...] = ()

    @property
    def accepted(self) -> bool:
        return not self.findings

    @property
    def accepted_paths(self) -> tuple[str, ...]:
        """The artifact to publish: every examined path, or nothing when any check failed."""

        return self.paths if self.accepted else ()

    @property
    def categories(self) -> frozenset[str]:
        return frozenset(finding.category for finding in self.findings)


class ScanFinding(Protocol):
    line: int
    pattern: str


# `scan_text(path, text)` of scripts/secret_scan.py: the one credential and home-path rule table.
ScanText = Callable[[str, str], Sequence[ScanFinding]]


@dataclass(frozen=True)
class ArtifactFile:
    """One entry of a build folder, as plain facts.

    `path` is POSIX and relative to the artifact root. `kind` is `file` for a
    regular file, `symlink` for a symbolic link and `other` for anything else.
    `link_count` is the number of hard links to the file (`st_nlink`). `data`
    is the content of a regular file and may be None otherwise.
    """

    path: str
    kind: str = "file"
    link_count: int = 1
    data: Optional[bytes] = None


@dataclass(frozen=True)
class CanonicalLine:
    """What the Spec 2 Canonical_Parser and serializer say about one fixture line."""

    line: int
    # The canonical bytes of the parsed record with its newline, or None when the line was refused.
    canonical: Optional[bytes]
    # The Mansion the record belongs to, or None when the line was refused.
    mansion_id: Optional[str] = None


@dataclass(frozen=True)
class FixtureCodec:
    """The Spec 2 parser's verdict on fixture bytes, supplied by the adapter.

    `lines` has one entry per physical line that holds a record or was refused.
    `integrity_line` is the one-based line of the first Sequence or hash-chain
    failure, or None. `record_count` counts the authoritative records.
    """

    lines: tuple[CanonicalLine, ...]
    integrity_line: Optional[int]
    record_count: int


# --- Text rules ---------------------------------------------------------------

_BASE64_RUN = re.compile(r"[A-Za-z0-9+/_-]{24,}={0,2}")
_HEX_RUN = re.compile(r"(?:[0-9A-Fa-f]{2}){12,}")
_BACKSLASH_ESCAPE = re.compile(r"\\u([0-9A-Fa-f]{4})|\\x([0-9A-Fa-f]{2})")

_LOCALHOST = re.compile(
    r"(?:https?|wss?):(?:\\?/){2}(?:[^/\s\"'@]*@)?"
    r"(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\]|[A-Za-z0-9-]+\.localhost)(?![A-Za-z0-9.-])",
    re.IGNORECASE,
)

# Browser APIs that open a connection the static replay must never open. They
# are matched as whole identifiers anywhere in a script or page.
_TRANSPORT_WORDS = re.compile(
    r"(?<![\w$])(?:WebSocket|EventSource|XMLHttpRequest|sendBeacon|WebTransport|RTCPeerConnection|SharedWorker)(?![\w$])"
)
_SERVICE_WORKER = re.compile(r"(?<![\w$])(?:serviceWorker|importScripts)(?![\w$])")
_LIVE_SDK = re.compile("@kirocrew" + r"/app-sdk")

_REMOTE = r"(?:https?:)?(?:\\?/){2}[A-Za-z0-9\[]"
_QUOTE = r"[\"'`]"
_ASSET_EXTENSION = (
    r"(?:m?js|css|json|jsonl|wasm|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp3|ogg|wav|mp4|webm)"
)
_REMOTE_SCRIPT_RULES = (
    # import "https://…", import("//cdn…"), … from "https://…"
    re.compile(r"(?:\bimport\s*\(?\s*|\bfrom\s*)" + _QUOTE + _REMOTE),
    # fetch("https://…"), new Worker("https://…"), new URL("https://…"), .src = "https://…"
    re.compile(r"(?:\bfetch\s*\(\s*|\bnew\s+(?:Shared)?Worker\s*\(\s*|\bnew\s+URL\s*\(\s*|\.(?:src|href)\s*=\s*)" + _QUOTE + _REMOTE),
    # Any remote URL literal that names a loadable file.
    re.compile(_QUOTE + _REMOTE + r"[^\"'`\s]*\." + _ASSET_EXTENSION + r"(?:[?#][^\"'`\s]*)?" + _QUOTE, re.IGNORECASE),
)
_CSS_URL = re.compile(r"url\(\s*([\"']?)([^\"')]*)\1\s*\)|@import\s+([\"'])([^\"']*)\3", re.IGNORECASE)
# A module specifier or `new URL(…, import.meta.url)` resolves against the module's own folder.
_MODULE_REFERENCE = re.compile(
    r"(?:\bimport\s*\(?\s*|\bfrom\s*|\bnew\s+URL\s*\(\s*)([\"'`])((?:\.{1,2}|\\?/)[^\"'`\s]*)\1"
)
# A fetch resolves against the page, which is the entry file at the artifact root.
_FETCH_REFERENCE = re.compile(r"\bfetch\s*\(\s*([\"'`])((?:\.{1,2}|\\?/)[^\"'`\s]*)\1")

_TEXT_SUFFIXES = (".html", ".htm", ".js", ".mjs", ".css", ".json", ".jsonl", ".svg", ".txt", ".map", ".webmanifest", ".xml")
_SCRIPT_SUFFIXES = (".js", ".mjs")
_PAGE_SUFFIXES = (".html", ".htm", ".svg")


def _decoded_forms(line: str) -> list[str]:
    """Text a browser, a JSON parser or a person would recover from encoded parts of `line`."""

    forms: list[str] = []
    if "%" in line:
        plain = unquote(line)
        if plain != line:
            forms.append(plain)
    if "\\u" in line or "\\x" in line:
        plain = _BACKSLASH_ESCAPE.sub(lambda match: chr(int(match.group(1) or match.group(2), 16)), line)
        if plain != line:
            forms.append(plain)

    def keep(raw: bytes) -> None:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            return
        if text and sum(1 for char in text if char.isprintable() or char in "\n\t") >= 0.9 * len(text):
            forms.append(text)

    for match in _BASE64_RUN.finditer(line):
        token = match.group(0).rstrip("=")
        padded = token + "=" * (-len(token) % 4)
        for decode in (base64.b64decode, base64.urlsafe_b64decode):
            try:
                keep(decode(padded))
            except (binascii.Error, ValueError):
                continue
    for match in _HEX_RUN.finditer(line):
        try:
            keep(bytes.fromhex(match.group(0)))
        except ValueError:
            continue
    return forms


def classify_text(path: str, text: str, scan: ScanText) -> list[PublicationFinding]:
    """Credential, home-path and localhost findings of one text, by line. Sorted, no duplicates."""

    found: set[PublicationFinding] = set()

    def add(line: int, category: str) -> None:
        found.add(PublicationFinding(path, line, category))

    for hit in scan(_SCAN_AS, text):
        add(hit.line, HOME_PATH if hit.pattern == _SCANNER_HOME_RULE else CREDENTIAL)
    for number, line in enumerate(text.split("\n"), start=1):
        if _LOCALHOST.search(line):
            add(number, LOCALHOST_ORIGIN)
        for form in _decoded_forms(line):
            if _LOCALHOST.search(form):
                add(number, LOCALHOST_ORIGIN)
            for hit in scan(_SCAN_AS, form):
                add(number, HOME_PATH if hit.pattern == _SCANNER_HOME_RULE else ENCODED_CREDENTIAL)
    return sorted(found)


# --- Fixture ------------------------------------------------------------------


def classify_fixture(path: str, data: bytes, codec: FixtureCodec, scan: ScanText) -> list[PublicationFinding]:
    """Findings of the replay fixture: canonical bytes, supported records, integrity, one Mansion, disclosure."""

    found: set[PublicationFinding] = set(classify_text(path, data.decode("utf-8", errors="replace"), scan))
    physical = data.split(b"\n")
    if physical and physical[-1] == b"":
        physical.pop()
    else:
        # A canonical log ends every record with one newline.
        found.add(PublicationFinding(path, max(len(physical), 1), FIXTURE_NONCANONICAL))
    if codec.record_count == 0:
        found.add(PublicationFinding(path, 1, FIXTURE_EMPTY))
    if codec.integrity_line is not None:
        found.add(PublicationFinding(path, codec.integrity_line, FIXTURE_INTEGRITY))

    judged = {entry.line: entry for entry in codec.lines}
    # One Event_Log belongs to one Mansion. A record of another one comes from an unrelated session.
    mansion = next((entry.mansion_id for entry in codec.lines if entry.mansion_id is not None), None)
    for number, raw in enumerate(physical, start=1):
        entry = judged.get(number)
        if entry is None:
            # Blank, or never reached by the parser: neither is a canonical record line.
            if codec.integrity_line is None or number < codec.integrity_line:
                found.add(PublicationFinding(path, number, FIXTURE_NONCANONICAL))
        elif entry.canonical is None:
            found.add(PublicationFinding(path, number, FIXTURE_INVALID_RECORD))
        elif entry.canonical != raw + b"\n":
            found.add(PublicationFinding(path, number, FIXTURE_NONCANONICAL))
        elif entry.mansion_id != mansion:
            found.add(PublicationFinding(path, number, FIXTURE_FOREIGN_SCOPE))
    return sorted(found)


# --- Static artifact ----------------------------------------------------------


def _is_text(file: ArtifactFile) -> bool:
    return file.path.lower().endswith(_TEXT_SUFFIXES) and file.data is not None and b"\0" not in file.data[:8192]


def _invalid_path(path: str) -> bool:
    parts = path.split("/")
    return (
        path == ""
        or path.startswith("/")
        or "\\" in path
        or "\0" in path
        or any(part in ("", ".", "..") for part in parts)
        or re.match(r"^[A-Za-z]:", path) is not None
    )


class _References(HTMLParser):
    """Collects (line, url, loads) for every URL attribute. `loads` is false for plain links."""

    _URL_ATTRIBUTES = ("src", "href", "xlink:href", "poster", "data", "action", "formaction", "manifest", "ping")

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: list[tuple[int, str, bool]] = []
        self.inline_css: list[tuple[int, str]] = []
        self.inline_scripts: list[tuple[int, str]] = []
        self._inside: Optional[str] = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        line = self.getpos()[0]
        self._inside = tag if tag in ("script", "style") else None
        for name, value in attrs:
            if value is None:
                continue
            if name in self._URL_ATTRIBUTES:
                # <a href> and <area href> navigate when a person follows them; everything else loads.
                loads = not (tag in ("a", "area") and name == "href")
                self.references.append((line, value.strip(), loads))
            elif name in ("srcset", "imagesrcset"):
                for candidate in value.split(","):
                    url = candidate.strip().split(" ")[0]
                    if url:
                        self.references.append((line, url, True))
            elif name == "style":
                self.inline_css.append((line, value))
            elif name == "content" and tag == "meta" and re.search(r"url\s*=", value, re.IGNORECASE):
                self.references.append((line, re.split(r"url\s*=", value, flags=re.IGNORECASE)[1].strip(" '\""), True))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        self.handle_starttag(tag, attrs)
        self._inside = None

    def handle_endtag(self, tag: str) -> None:
        self._inside = None

    def handle_data(self, data: str) -> None:
        if self._inside == "style":
            self.inline_css.append((self.getpos()[0], data))
        elif self._inside == "script":
            self.inline_scripts.append((self.getpos()[0], data))


def _is_remote(url: str) -> bool:
    plain = url.replace("\\/", "/")
    return plain.startswith("//") or urlsplit(plain).scheme.lower() in ("http", "https", "ws", "wss", "ftp")


def _reference_finding(owner: str, url: str, paths: frozenset[str]) -> Optional[str]:
    """The category that refuses a local reference from `owner`, or None when it resolves inside the artifact."""

    plain = url.replace("\\/", "/")
    split = urlsplit(plain)
    if split.scheme.lower() in ("data", "blob", "about", "javascript", "mailto", "tel"):
        return REMOTE_ASSET if split.scheme.lower() == "javascript" else None
    target = unquote(split.path)
    if target == "":
        return None  # a fragment or query on the page itself
    if "\\" in target or "\0" in target:
        return PATH_ESCAPE
    if target.startswith("/"):
        # A root path leaves a GitHub Pages project site, whose root is /<repository>/.
        return ABSOLUTE_REFERENCE
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(owner), target))
    if resolved == ".." or resolved.startswith("../") or resolved.startswith("/"):
        return PATH_ESCAPE
    if resolved == "." or target.endswith("/"):
        resolved = posixpath.normpath(posixpath.join(resolved, ENTRY_FILE))
    return None if resolved in paths else MISSING_ASSET


def _classify_references(
    file: ArtifactFile, text: str, paths: frozenset[str]
) -> Iterable[PublicationFinding]:
    lower = file.path.lower()

    def judge(line: int, url: str, loads: bool = True, owner: str = file.path) -> Iterable[PublicationFinding]:
        if _is_remote(url):
            if loads:
                yield PublicationFinding(file.path, line, REMOTE_ASSET)
            return
        category = _reference_finding(owner, url, paths)
        if category is not None:
            yield PublicationFinding(file.path, line, category)

    def css(first_line: int, source: str) -> Iterable[PublicationFinding]:
        for offset, line in enumerate(source.split("\n")):
            for match in _CSS_URL.finditer(line):
                yield from judge(first_line + offset, (match.group(2) or match.group(4) or "").strip())

    def script(first_line: int, source: str) -> Iterable[PublicationFinding]:
        for offset, line in enumerate(source.split("\n")):
            number = first_line + offset
            if any(rule.search(line) for rule in _REMOTE_SCRIPT_RULES):
                yield PublicationFinding(file.path, number, REMOTE_ASSET)
            if _TRANSPORT_WORDS.search(line):
                yield PublicationFinding(file.path, number, LIVE_TRANSPORT)
            if _SERVICE_WORKER.search(line):
                yield PublicationFinding(file.path, number, SERVICE_WORKER)
            if _LIVE_SDK.search(line):
                yield PublicationFinding(file.path, number, LIVE_SDK_IMPORT)
            for match in _MODULE_REFERENCE.finditer(line):
                yield from judge(number, match.group(2))
            for match in _FETCH_REFERENCE.finditer(line):
                yield from judge(number, match.group(2), owner=ENTRY_FILE)

    if lower.endswith(_PAGE_SUFFIXES):
        parser = _References()
        parser.feed(text)
        parser.close()
        for line, url, loads in parser.references:
            yield from judge(line, url, loads)
        for line, source in parser.inline_css:
            yield from css(line, source)
        for line, source in parser.inline_scripts:
            yield from script(line, source)
    elif lower.endswith(".css"):
        yield from css(1, text)
    elif lower.endswith(_SCRIPT_SUFFIXES):
        yield from script(1, text)


def classify_artifact(
    files: Sequence[ArtifactFile],
    *,
    approved_fixture: Optional[bytes],
    scan: ScanText,
) -> list[PublicationFinding]:
    """Findings of a static replay build: metadata, disclosure, transport and the local asset graph."""

    found: set[PublicationFinding] = set()
    regular: dict[str, ArtifactFile] = {}
    for file in files:
        if _invalid_path(file.path) or file.path in regular:
            found.add(PublicationFinding(file.path if not _invalid_path(file.path) else "(artifact)", 1, INVALID_PATH))
            continue
        if file.kind == "symlink":
            found.add(PublicationFinding(file.path, 1, SYMLINK))
        elif file.kind != "file" or file.data is None:
            found.add(PublicationFinding(file.path, 1, NOT_REGULAR_FILE))
        else:
            if file.link_count != 1:
                found.add(PublicationFinding(file.path, 1, HARD_LINK))
            regular[file.path] = file

    paths = frozenset(regular)
    if ENTRY_FILE not in paths:
        found.add(PublicationFinding(ENTRY_FILE, 1, MISSING_ENTRY))
    fixture = regular.get(FIXTURE_FILE)
    if fixture is None:
        found.add(PublicationFinding(FIXTURE_FILE, 1, FIXTURE_MISSING))
    elif approved_fixture is None or fixture.data != approved_fixture:
        found.add(PublicationFinding(FIXTURE_FILE, 1, FIXTURE_MISMATCH))

    for file in regular.values():
        if not _is_text(file):
            continue
        assert file.data is not None
        text = file.data.decode("utf-8", errors="replace")
        found.update(classify_text(file.path, text, scan))
        found.update(_classify_references(file, text, paths))
    return sorted(found)


def classify_publication(
    *,
    fixture_path: str,
    fixture: bytes,
    codec: FixtureCodec,
    scan: ScanText,
    artifact: Optional[Sequence[ArtifactFile]] = None,
) -> PublicationReport:
    """The whole gate: the committed fixture, and the built artifact when there is one."""

    findings = classify_fixture(fixture_path, fixture, codec, scan)
    paths = [fixture_path]
    if artifact is not None:
        findings = sorted({*findings, *classify_artifact(artifact, approved_fixture=fixture, scan=scan)})
        paths.extend(file.path for file in artifact)
    return PublicationReport(findings=tuple(findings), paths=tuple(paths))
