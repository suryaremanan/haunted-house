"""Decide whether a gateway origin is on this machine.

The gateway client sends the app secret to the gateway origin, so it must only
ever talk to a loopback address. Crew passes the origin in
`KIROCREW_GATEWAY_ORIGIN`, for example `http://127.0.0.1:5476`.

Pure: no network, filesystem or clock.
"""

from __future__ import annotations

import re

__all__ = ["is_loopback_origin"]

# Scheme and host are matched literally (lowercase), the port is 1 to 5 ASCII
# digits with no leading zero, and only a single trailing "/" may follow.
# Anything else (userinfo, a path, a query, a fragment, whitespace) fails.
_LOOPBACK_ORIGIN = re.compile(
    r"http://(?:127\.0\.0\.1|localhost|\[::1\]):([1-9][0-9]{0,4})/?"
)


def is_loopback_origin(origin: str | None) -> bool:
    """Return True only for `http://127.0.0.1:<port>`, `http://localhost:<port>`
    or `http://[::1]:<port>` with a port from 1 to 65535 and an optional
    trailing `/`. Never raises."""
    if not isinstance(origin, str):
        return False
    match = _LOOPBACK_ORIGIN.fullmatch(origin)
    return match is not None and int(match.group(1)) <= 65535
