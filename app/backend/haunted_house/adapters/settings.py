"""Backend settings, read from the environment Crew gives the backend.

Crew starts the backend with these variables:

    PORT                     port to listen on (Crew picks it: `"port": "auto"`)
    KIROCREW_PROXY_SECRET    per-app secret the gateway signs proxied requests with
    KIROCREW_GATEWAY_ORIGIN  gateway base URL, for example http://127.0.0.1:5476
    KIROCREW_APP_NAME        the app's manifest name

The origin is stored as given. The gateway client checks it with
`haunted_house.core.origin.is_loopback_origin` before sending anything.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field

__all__ = ["DEFAULT_APP_NAME", "Settings", "SettingsError"]

DEFAULT_APP_NAME = "haunted-house"

_PORT = re.compile(r"[0-9]{1,5}")


class SettingsError(ValueError):
    """The environment does not describe a backend we can start."""


@dataclass(frozen=True)
class Settings:
    port: int
    # Kept out of repr so printing or logging Settings never shows it.
    secret: str | None = field(repr=False)
    gateway_origin: str | None
    app_name: str

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Settings:
        """Build Settings from an environment mapping such as `os.environ`.

        Raises SettingsError if PORT is missing or is not a whole number from
        1 to 65535. Empty values for the other variables count as missing:
        the secret and origin become None and the app name falls back to
        DEFAULT_APP_NAME. The secret is never put in an error message.
        """
        return cls(
            port=_parse_port(env.get("PORT")),
            secret=env.get("KIROCREW_PROXY_SECRET") or None,
            gateway_origin=env.get("KIROCREW_GATEWAY_ORIGIN") or None,
            app_name=env.get("KIROCREW_APP_NAME") or DEFAULT_APP_NAME,
        )


def _parse_port(raw: str | None) -> int:
    if raw is None or raw == "":
        raise SettingsError("PORT is not set; Crew sets it when it starts the backend")
    if _PORT.fullmatch(raw) is None or not 1 <= int(raw) <= 65535:
        raise SettingsError(f"PORT must be a whole number from 1 to 65535, got {raw[:20]!r}")
    return int(raw)
