"""Entry point Crew runs for the Haunted House backend.

Crew starts it as `<gateway python> -s backend/main.py` with the working
directory at the app root. The backend uses the aiohttp that ships with
Crew's own Python, so enabling the app installs nothing.
"""

import logging
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent

log = logging.getLogger("haunted_house")


def run() -> int:
    # Make `haunted_house` importable whatever the working directory is.
    sys.path.insert(0, str(BACKEND_DIR))
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    try:
        import aiohttp  # noqa: F401
    except ImportError:
        log.error(
            "aiohttp cannot be imported by %s. The backend expects the aiohttp "
            "bundled with Kiro Crew's Python. Fallback: add app/requirements.txt "
            "with 'aiohttp>=3.14,<3.15' so Crew installs it when the app is enabled.",
            sys.executable,
        )
        return 1

    from haunted_house.server import main

    return main()


if __name__ == "__main__":
    raise SystemExit(run())
