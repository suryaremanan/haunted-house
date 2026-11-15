"""Which gateway paths the app may call.

``path_allowed`` matches a path against the manifest's ``permissions.api``
prefixes with the same rules as the Crew 0.12.1 dashboard SDK (verified), and
refuses any path that could step outside the gateway's own API.

Pure: no network, filesystem or clock.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from urllib.parse import unquote

__all__ = ["path_allowed"]

# A URL scheme ("http:", "javascript:") or a scheme-relative start ("//",
# "\\", "/\\", "\\/"). Either would let a "path" name another host.
_SCHEME_OR_AUTHORITY = re.compile(r"^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|[/\\]{2})")
# C0 controls and DEL. URL parsers strip or split on some of these, which
# could turn a refused path into a different, accepted one.
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_QUERY_OR_FRAGMENT = re.compile(r"[?#]")


def path_allowed(prefixes: Iterable[str], path: str) -> bool:
    """Return True if ``path`` is inside one of ``prefixes``.

    ``path`` may carry a query or fragment; only the part before the first
    ``?`` or ``#`` is matched. Each prefix is trimmed, and empty or non-string
    prefixes are skipped. For a prefix ``p``:

    - ``p`` ends with ``/*``: the path equals ``p[:-2]`` or starts with
      ``p[:-2] + "/"``.
    - otherwise ``p`` ends with ``*``: the path starts with ``p[:-1]``.
    - otherwise: the path equals ``p`` or starts with ``p + "/"``.

    Whatever the prefixes, the path is refused if the raw input starts with
    a URL scheme or ``//``, contains a backslash or a control character, or
    does not start with ``/``; or if its path part has a ``.`` or ``..``
    segment or an empty segment (``//``). A trailing ``/`` is allowed. The
    path-part checks run on the path as written and again after
    percent-decoding, so ``%2e%2e`` counts as ``..`` and ``%2F%2F`` as ``//``.
    """
    if not isinstance(path, str) or not _input_ok(path):
        return False
    path_only = _QUERY_OR_FRAGMENT.split(path, maxsplit=1)[0]
    if not (_segments_ok(path_only) and _segments_ok(unquote(path_only))):
        return False
    for prefix in prefixes:
        if not isinstance(prefix, str):
            continue
        p = prefix.strip()
        if p and _matches(p, path_only):
            return True
    return False


def _input_ok(raw: str) -> bool:
    return (
        raw.startswith("/")
        and not _SCHEME_OR_AUTHORITY.match(raw)
        and "\\" not in raw
        and not _CONTROL.search(raw)
    )


def _segments_ok(path: str) -> bool:
    if "\\" in path or "//" in path or _CONTROL.search(path):
        return False
    return not any(segment in (".", "..") for segment in path.split("/"))


def _matches(prefix: str, path: str) -> bool:
    if prefix.endswith("/*"):
        base = prefix[:-2]
        return path == base or path.startswith(base + "/")
    if prefix.endswith("*"):
        return path.startswith(prefix[:-1])
    return path == prefix or path.startswith(prefix + "/")
