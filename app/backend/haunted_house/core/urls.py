"""Request targets for gateway calls.

Pure: no network, filesystem or clock.
"""

from __future__ import annotations

from urllib.parse import quote, unquote_plus

__all__ = ["TOKEN_PARAM", "with_token"]

TOKEN_PARAM = "token"


def with_token(path_and_query: str, token: str) -> str:
    """Return ``path_and_query`` with exactly one ``token`` query parameter.

    - The path (everything before the first ``?``) is kept byte for byte.
    - Every existing parameter whose name decodes to ``token`` is removed,
      including encoded spellings such as ``tok%65n``, so the gateway can
      never see two tokens.
    - All other parameters keep their order and their raw encoding, including
      repeated keys and keys without ``=``. Empty pieces left by ``&&``, a
      leading or trailing ``&``, or a bare ``?`` are dropped.
    - The token is percent-encoded with no safe characters and appended last.
    - A fragment (``#...``) is dropped. A request target never carries one,
      so the gateway would not see it anyway. Callers should not pass one.
    """
    target = path_and_query.split("#", 1)[0]
    path, _, query = target.partition("?")
    kept = [
        piece
        for piece in query.split("&")
        if piece and _param_name(piece) != TOKEN_PARAM
    ]
    kept.append(f"{TOKEN_PARAM}={quote(token, safe='')}")
    return f"{path}?{'&'.join(kept)}"


def _param_name(piece: str) -> str:
    # Decode the way servers parse query strings (urllib.parse.parse_qsl).
    return unquote_plus(piece.partition("=")[0])
