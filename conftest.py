"""Shared pytest setup for every test under the repo.

Registers the Hypothesis profiles. Every property test runs at least 100
examples unless it sets fewer itself (Property 4 uses 50). Deadlines are off
because tests that drive an aiohttp server have uneven timing.

Profiles:
  dev  default for local runs
  ci   loaded automatically when the CI environment variable is set;
       derandomized, no example database, prints reproduction blobs
Override with HYPOTHESIS_PROFILE=<name>.
"""

import os

from hypothesis import settings

settings.register_profile("dev", max_examples=100, deadline=None)
settings.register_profile(
    "ci",
    parent=settings.get_profile("dev"),
    derandomize=True,
    database=None,
    print_blob=True,
)

settings.load_profile(
    os.environ.get("HYPOTHESIS_PROFILE") or ("ci" if os.environ.get("CI") else "dev")
)
