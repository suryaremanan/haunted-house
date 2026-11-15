"""Pure asset provenance and media-source rules for the submission package.

Spec 7 (replay-and-submission) task 9.4; Requirements 9.6, 9.7, 10.1-10.6.

Everything here is a function of values: the parsed `docs/assets-manifest.json`,
a list of repository-relative media paths, and source text go in; findings come
out. Nothing reads a file, a clock, the environment or the network;
scripts/check-assets.py is the thin adapter that walks the repository.

A finding names a repository-relative file, a one-based line (or manifest entry
number) and a fixed category. It has no field for the matched text.

Three checks:

  validate_manifest()  schema and provenance rules of the asset manifest
  check_coverage()     every distributed media file has exactly one entry,
                       no entry names a missing file, and the MVP ships no audio
  scan_source()        UI source and bundle text: external SVG images and uses,
                       remote runtime media/fonts/styles, raster data URIs,
                       SVG script/animation elements, audio APIs and imports,
                       and prohibited product names

These scans supplement the human originality review in
docs/assets-checklist.md. A static scan cannot prove authorship.

Stdlib only.
"""

from __future__ import annotations

import posixpath
import re
from dataclasses import dataclass
from typing import Any, Iterable, Sequence
from urllib.parse import urlsplit

__all__ = [
    "AssetFinding",
    "CATEGORIES",
    "KINDS",
    "check_coverage",
    "is_audio_path",
    "is_media_path",
    "manifest_paths",
    "scan_source",
    "validate_manifest",
]

# --- Categories ---------------------------------------------------------------

MANIFEST_INVALID = "manifest-invalid"
MANIFEST_SCHEMA_VERSION = "manifest-schema-version"
ENTRY_INVALID = "entry-invalid"
ENTRY_UNKNOWN_FIELD = "entry-unknown-field"
ENTRY_MISSING_FIELD = "entry-missing-field"
INVALID_PATH = "invalid-path"
DUPLICATE_PATH = "duplicate-path"
UNSORTED_PATHS = "unsorted-paths"
INVALID_KIND = "invalid-kind"
KIND_MISMATCH = "kind-mismatch"
INVALID_PROVENANCE = "invalid-provenance"
MISSING_CREATOR = "missing-creator"
MISSING_ALT_TEXT = "missing-alt-text"
MISSING_MODIFICATIONS = "missing-modifications"
INVALID_LICENSE = "invalid-license"
MISSING_SOURCE = "missing-source"
MISSING_LICENSE_URL = "missing-license-url"
INSECURE_URL = "insecure-url"
FALSE_ATTRIBUTION = "false-attribution"
UNMANIFESTED_MEDIA = "unmanifested-media"
MISSING_FILE = "missing-file"
MVP_AUDIO = "mvp-audio"
EXTERNAL_SVG_REFERENCE = "external-svg-reference"
REMOTE_ASSET = "remote-asset"
RASTER_DATA_URI = "raster-data-uri"
SVG_SCRIPT = "svg-script"
SVG_ANIMATION = "svg-animation"
AUDIO_API = "audio-api"
PROHIBITED_NAME = "prohibited-name"

CATEGORIES = frozenset(
    {
        MANIFEST_INVALID,
        MANIFEST_SCHEMA_VERSION,
        ENTRY_INVALID,
        ENTRY_UNKNOWN_FIELD,
        ENTRY_MISSING_FIELD,
        INVALID_PATH,
        DUPLICATE_PATH,
        UNSORTED_PATHS,
        INVALID_KIND,
        KIND_MISMATCH,
        INVALID_PROVENANCE,
        MISSING_CREATOR,
        MISSING_ALT_TEXT,
        MISSING_MODIFICATIONS,
        INVALID_LICENSE,
        MISSING_SOURCE,
        MISSING_LICENSE_URL,
        INSECURE_URL,
        FALSE_ATTRIBUTION,
        UNMANIFESTED_MEDIA,
        MISSING_FILE,
        MVP_AUDIO,
        EXTERNAL_SVG_REFERENCE,
        REMOTE_ASSET,
        RASTER_DATA_URI,
        SVG_SCRIPT,
        SVG_ANIMATION,
        AUDIO_API,
        PROHIBITED_NAME,
    }
)

SCHEMA_VERSION = 1
KINDS = ("icon", "screenshot", "hero", "thumbnail", "audio", "video")
ENTRY_FIELDS = (
    "path",
    "kind",
    "provenance",
    "creator",
    "sourceUrl",
    "licenseName",
    "licenseUrl",
    "modifications",
    "altText",
)
ORIGINAL = "original"
CC0 = "cc0"
LICENSE_BY_PROVENANCE = {ORIGINAL: "Original", CC0: "CC0-1.0"}

IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".ico", ".svg", ".tif", ".tiff"})
AUDIO_EXTENSIONS = frozenset({".mp3", ".ogg", ".oga", ".wav", ".flac", ".m4a", ".aac", ".opus", ".mid", ".midi"})
VIDEO_EXTENSIONS = frozenset({".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"})
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | AUDIO_EXTENSIONS | VIDEO_EXTENSIONS

_MAX_TEXT = 2000


@dataclass(frozen=True, order=True)
class AssetFinding:
    """One reason the asset package is refused. Has no field for the matched text."""

    path: str
    line: int
    category: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.category}"


# --- Paths --------------------------------------------------------------------


def _extension(path: str) -> str:
    return posixpath.splitext(path)[1].lower()


def is_media_path(path: str) -> bool:
    """True for an image, audio or video file name."""

    return _extension(path) in MEDIA_EXTENSIONS


def is_audio_path(path: str) -> bool:
    return _extension(path) in AUDIO_EXTENSIONS


def _valid_relative_path(value: Any) -> bool:
    """A repository-relative POSIX path with no empty, `.` or `..` segment."""

    if not isinstance(value, str) or not value or len(value) > 400:
        return False
    if "\\" in value or "\x00" in value or value.startswith("/") or ":" in value:
        return False
    return all(segment not in ("", ".", "..") for segment in value.split("/"))


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip()) and len(value) <= _MAX_TEXT


def _https(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parts = urlsplit(value.strip())
    return parts.scheme == "https" and bool(parts.netloc) and " " not in value.strip()


# --- Prohibited names ---------------------------------------------------------

# The two product names barred by .kiro/steering/product.md ("Legal and
# originality"). They are assembled here so that this file, its tests and the
# documents never spell them out.
_PROHIBITED_TERMS = ("".join(("mi", "cro", "soft")), "".join(("b", "o", "b")))
# A name counts only as a whole word: not as part of a longer identifier.
_PROHIBITED_RE = re.compile(
    r"(?<![A-Za-z0-9_$])(?:" + "|".join(_PROHIBITED_TERMS) + r")(?![A-Za-z0-9_$])",
    re.IGNORECASE,
)


def _names_prohibited(text: str) -> bool:
    # File names separate words with `-`, `_` and `.`; treat those as spaces.
    return bool(_PROHIBITED_RE.search(text)) or bool(_PROHIBITED_RE.search(re.sub(r"[-_./]", " ", text)))


# --- Manifest -----------------------------------------------------------------


def manifest_paths(data: Any) -> list[str]:
    """Every string `path` of the manifest's entries, in file order."""

    if not isinstance(data, dict) or not isinstance(data.get("assets"), list):
        return []
    return [entry["path"] for entry in data["assets"] if isinstance(entry, dict) and isinstance(entry.get("path"), str)]


def _kind_matches(kind: str, path: str) -> bool:
    extension = _extension(path)
    if kind == "audio":
        return extension in AUDIO_EXTENSIONS
    if kind == "video":
        return extension in VIDEO_EXTENSIONS
    return extension in IMAGE_EXTENSIONS


def _validate_entry(entry: Any, number: int, where: str) -> list[AssetFinding]:
    def finding(category: str) -> AssetFinding:
        return AssetFinding(where, number, category)

    if not isinstance(entry, dict):
        return [finding(ENTRY_INVALID)]
    found: list[AssetFinding] = []
    if any(key not in ENTRY_FIELDS for key in entry):
        found.append(finding(ENTRY_UNKNOWN_FIELD))
    if any(key not in entry for key in ENTRY_FIELDS):
        found.append(finding(ENTRY_MISSING_FIELD))

    path = entry.get("path")
    path_ok = _valid_relative_path(path)
    if not path_ok:
        found.append(finding(INVALID_PATH))

    kind = entry.get("kind")
    if not isinstance(kind, str) or kind not in KINDS:
        found.append(finding(INVALID_KIND))
    elif path_ok and not _kind_matches(kind, path):
        found.append(finding(KIND_MISMATCH))

    if not _text(entry.get("creator")):
        found.append(finding(MISSING_CREATOR))
    if not _text(entry.get("altText")):
        found.append(finding(MISSING_ALT_TEXT))

    provenance = entry.get("provenance")
    source, license_url = entry.get("sourceUrl"), entry.get("licenseUrl")
    modifications = entry.get("modifications")
    if not isinstance(provenance, str) or provenance not in LICENSE_BY_PROVENANCE:
        found.append(finding(INVALID_PROVENANCE))
    else:
        if entry.get("licenseName") != LICENSE_BY_PROVENANCE[provenance]:
            found.append(finding(INVALID_LICENSE))
        if provenance == ORIGINAL:
            # An original asset claims no third-party source.
            if source is not None or license_url is not None:
                found.append(finding(FALSE_ATTRIBUTION))
            if not isinstance(modifications, str) or len(modifications) > _MAX_TEXT:
                found.append(finding(MISSING_MODIFICATIONS))
        else:
            for value, missing in ((source, MISSING_SOURCE), (license_url, MISSING_LICENSE_URL)):
                if not _text(value):
                    found.append(finding(missing))
                elif not _https(value):
                    found.append(finding(INSECURE_URL))
            if not _text(modifications):
                found.append(finding(MISSING_MODIFICATIONS))

    for key in ("path", "creator", "modifications", "altText"):
        value = entry.get(key)
        if isinstance(value, str) and _names_prohibited(value):
            found.append(finding(PROHIBITED_NAME))
            break
    return found


def validate_manifest(data: Any, where: str = "docs/assets-manifest.json") -> list[AssetFinding]:
    """Schema and provenance findings. `line` is the one-based entry number (1 for the document)."""

    if not isinstance(data, dict) or set(data) != {"schemaVersion", "assets"} or not isinstance(data.get("assets"), list):
        return [AssetFinding(where, 1, MANIFEST_INVALID)]
    found: set[AssetFinding] = set()
    version = data["schemaVersion"]
    if isinstance(version, bool) or version != SCHEMA_VERSION:
        found.add(AssetFinding(where, 1, MANIFEST_SCHEMA_VERSION))

    seen: set[str] = set()
    for number, entry in enumerate(data["assets"], start=1):
        found.update(_validate_entry(entry, number, where))
        path = entry.get("path") if isinstance(entry, dict) else None
        if isinstance(path, str):
            if path in seen:
                found.add(AssetFinding(where, number, DUPLICATE_PATH))
            seen.add(path)

    paths = manifest_paths(data)
    if paths != sorted(paths):
        found.add(AssetFinding(where, 1, UNSORTED_PATHS))
    return sorted(found)


# --- Coverage -----------------------------------------------------------------


def check_coverage(
    data: Any,
    media_files: Iterable[str],
    *,
    where: str = "docs/assets-manifest.json",
    allow_audio: bool = False,
) -> list[AssetFinding]:
    """Compare manifest entries with the distributed media files.

    `media_files` are repository-relative POSIX paths of the files that exist.
    Every one needs exactly one entry; an entry needs its file. The MVP ships
    no audio, so an audio file or an `audio` entry is a finding unless the
    Sound_Feature stretch work passes `allow_audio=True`.
    """

    files = sorted(set(media_files))
    listed = manifest_paths(data)
    found: set[AssetFinding] = set()
    for path in files:
        if path not in listed:
            found.add(AssetFinding(path, 1, UNMANIFESTED_MEDIA))
        if _names_prohibited(path):
            found.add(AssetFinding(path, 1, PROHIBITED_NAME))
        if not allow_audio and is_audio_path(path):
            found.add(AssetFinding(path, 1, MVP_AUDIO))
    present = set(files)
    for number, path in enumerate(listed, start=1):
        if path not in present:
            found.add(AssetFinding(where, number, MISSING_FILE))
    if not allow_audio and isinstance(data, dict) and isinstance(data.get("assets"), list):
        for number, entry in enumerate(data["assets"], start=1):
            if isinstance(entry, dict) and entry.get("kind") == "audio":
                found.add(AssetFinding(where, number, MVP_AUDIO))
    return sorted(found)


# --- Source scanning ----------------------------------------------------------

_REMOTE = r"(?:https?:)?//[^\s\"'`)<>]+"
_QUOTE = r"[\"'`]"
_MEDIA_EXT = r"(?:png|jpe?g|gif|webp|avif|bmp|ico|svg|mp3|ogg|oga|wav|flac|m4a|aac|opus|mp4|webm|mov|woff2?|ttf|otf|eot|css)"

# <image href="https://...">, <feImage xlink:href="//...">, and the compiled jsx("image", { href: "..." }).
_SVG_IMAGE_MARKUP = re.compile(
    r"<(?:image|feImage)\b[^>]*?\b(?:xlink:href|xlinkHref|href)\s*=\s*\{?\s*" + _QUOTE + r"\s*(?:(?:https?:)?//|data:)",
    re.IGNORECASE | re.DOTALL,
)
_SVG_IMAGE_COMPILED = re.compile(
    _QUOTE + r"(?:image|feImage)" + _QUOTE + r"\s*,\s*\{[^{}]*?\b(?:xlinkHref|href)\s*:\s*" + _QUOTE + r"\s*(?:(?:https?:)?//|data:)",
    re.DOTALL,
)
# <use> may only point at a fragment of the same document.
_SVG_USE_MARKUP = re.compile(
    r"<use\b[^>]*?\b(?:xlink:href|xlinkHref|href)\s*=\s*\{?\s*" + _QUOTE + r"\s*(?!#)[^\"'`\s]",
    re.IGNORECASE | re.DOTALL,
)
_SVG_USE_COMPILED = re.compile(
    _QUOTE + r"use" + _QUOTE + r"\s*,\s*\{[^{}]*?\b(?:xlinkHref|href)\s*:\s*" + _QUOTE + r"\s*(?!#)[^\"'`\s]",
    re.DOTALL,
)

_REMOTE_PATTERNS = (
    # Any remote URL that names a media, font or style file.
    re.compile(_REMOTE + r"\." + _MEDIA_EXT + r"(?![A-Za-z0-9])", re.IGNORECASE),
    # CSS url(...) and @import of a remote origin.
    re.compile(r"url\(\s*[\"']?\s*(?:https?:)?//", re.IGNORECASE),
    re.compile(r"@import\s+(?:url\(\s*)?[\"']?\s*(?:https?:)?//", re.IGNORECASE),
    # Element sources: src, srcSet, poster.
    re.compile(r"\b(?:src|srcset|poster)\s*[=:]\s*\{?\s*" + _QUOTE + r"\s*(?:https?:)?//", re.IGNORECASE),
    # <link href="https://..."> (stylesheets, fonts, preloads).
    re.compile(r"<link\b[^>]*?\bhref\s*=\s*\{?\s*" + _QUOTE + r"\s*(?:https?:)?//", re.IGNORECASE | re.DOTALL),
)

# Raster, audio, video and font payloads inlined as data URIs. Inline SVG data is not raster.
_DATA_URI = re.compile(r"data:(?:image/(?!svg\+xml)[a-z0-9.+-]+|audio/|video/|font/|application/(?:font|x-font|octet-stream))", re.IGNORECASE)

_SVG_SCRIPT_RE = re.compile(r"<script\b", re.IGNORECASE)
_SVG_ANIMATION_MARKUP = re.compile(r"<(?:animate|animateTransform|animateMotion|animateColor|set)\b(?=[\s/>])")
_SVG_ANIMATION_COMPILED = re.compile(r"\(\s*" + _QUOTE + r"(?:animate|animateTransform|animateMotion|animateColor)" + _QUOTE + r"\s*,")

_AUDIO_PATTERNS = (
    re.compile(r"\bnew\s+Audio\s*\("),
    re.compile(r"\b(?:webkit)?AudioContext\b"),
    re.compile(r"\bOfflineAudioContext\b"),
    re.compile(r"\bHTMLAudioElement\b"),
    re.compile(r"\bspeechSynthesis\b"),
    re.compile(r"<audio\b", re.IGNORECASE),
    re.compile(r"createElement\(\s*" + _QUOTE + r"audio" + _QUOTE),
    re.compile(r"\(\s*" + _QUOTE + r"audio" + _QUOTE + r"\s*,"),
    # A quoted reference to an audio file: an import, a require or a URL.
    re.compile(r"\.(?:mp3|ogg|oga|wav|flac|m4a|aac|opus)(?:\?[^\"'`]*)?" + _QUOTE, re.IGNORECASE),
)


def _line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _all(patterns: Sequence[re.Pattern[str]], text: str) -> Iterable[int]:
    for pattern in patterns:
        for match in pattern.finditer(text):
            yield match.start()


def scan_source(path: str, text: str) -> list[AssetFinding]:
    """Findings for one source, bundle, markup or style text.

    `path` is repository-relative and is used for reporting and to tell an SVG
    document from other source: a `<script>` element is a finding only inside
    an `.svg` file (an HTML entry page needs its module script).
    """

    found: set[AssetFinding] = set()

    def add(offsets: Iterable[int], category: str) -> None:
        for offset in offsets:
            found.add(AssetFinding(path, _line_of(text, offset), category))

    add(
        _all((_SVG_IMAGE_MARKUP, _SVG_IMAGE_COMPILED, _SVG_USE_MARKUP, _SVG_USE_COMPILED), text),
        EXTERNAL_SVG_REFERENCE,
    )
    add(_all(_REMOTE_PATTERNS, text), REMOTE_ASSET)
    add(_all((_DATA_URI,), text), RASTER_DATA_URI)
    add(_all((_SVG_ANIMATION_MARKUP, _SVG_ANIMATION_COMPILED), text), SVG_ANIMATION)
    add(_all(_AUDIO_PATTERNS, text), AUDIO_API)
    add(_all((_PROHIBITED_RE,), text), PROHIBITED_NAME)
    if _extension(path) == ".svg":
        add(_all((_SVG_SCRIPT_RE,), text), SVG_SCRIPT)
    return sorted(found)
