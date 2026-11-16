"""Feature brief on mansion creation, end to end (decision 2026-11-16).

`POST /api/mansions` with `{name, brief}` writes the normalised brief once to
`<mansion>/.kiro/specs/<projectSpec>/brief.md` through the confined filesystem
adapter; a re-create keeps the original; the Archivist's first prompt carries
it. Real aiohttp server, real signature middleware, temporary directories.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from haunted_house.adapters.guarded_filesystem import GuardedFilesystem
from haunted_house.adapters.mansion_filesystem import MansionFilesystem, MansionFilesystemError
from haunted_house.adapters.session_bindings import RoomBinding, new_capability
from haunted_house.core.guardrail_events import Phase
from haunted_house.services.canonical_port import CanonicalRunPort
from haunted_house.services.room_prompts import RoomPromptBuilder
from tests.guardrail_support import MemoryWriter
from tests.unit.test_mansion_api import Real, error_body, exchange, post, tree

APP_ROOT = Path(__file__).resolve().parents[3]
NAME = "guest-book"


def brief_path(real: Real, name: str = NAME) -> Path:
    return real.root / name / ".kiro" / "specs" / name / "brief.md"


def test_create_with_brief_writes_it_once_and_recreate_keeps_the_original(tmp_path):
    real = Real(tmp_path)
    results = exchange(
        real.app(),
        [
            post("/api/mansions", {"name": NAME, "brief": "  Keep a guest book.\r\nShow the last 50.  "}),
            post("/api/mansions", {"name": NAME, "brief": "Something else entirely."}),
            post("/api/mansions", {"name": NAME}),
        ],
    )
    assert [status for status, _, _ in results] == [201, 200, 200]
    assert [body["outcome"] for _, body, _ in results] == ["created", "existing_compatible", "existing_compatible"]
    assert brief_path(real).read_bytes() == b"Keep a guest book.\nShow the last 50.\n"
    # The response shape is unchanged: no brief echoed.
    assert set(results[0][1]["mansion"]) == {"name", "projectSpec", "displayPath", "status"}


def test_create_without_or_with_blank_brief_writes_no_file(tmp_path):
    real = Real(tmp_path)
    results = exchange(
        real.app(),
        [post("/api/mansions", {"name": NAME}), post("/api/mansions", {"name": "alpha", "brief": " \n\t "})],
    )
    assert [status for status, _, _ in results] == [201, 201]
    assert not brief_path(real).exists() and not brief_path(real, "alpha").exists()


def test_existing_mansion_without_a_brief_gets_one_on_create(tmp_path):
    real = Real(tmp_path)
    exchange(real.app(), [post("/api/mansions", {"name": NAME})])
    results = exchange(real.app(), [post("/api/mansions", {"name": NAME, "brief": "Late brief."})])
    assert results[0][0] == 200
    assert brief_path(real).read_text(encoding="utf-8") == "Late brief.\n"


@pytest.mark.parametrize(
    "body",
    [
        {"name": NAME, "brief": "bell \x07"},
        {"name": NAME, "brief": "a" * 2001},
        {"name": NAME, "brief": None},
        {"name": NAME, "brief": "ok", "path": "/tmp"},
    ],
)
def test_invalid_brief_is_refused_before_anything_is_written(tmp_path, body):
    real = Real(tmp_path)
    before = tree(tmp_path)
    results = exchange(real.app(), [post("/api/mansions", body)])
    assert (results[0][0], results[0][1]) == (400, error_body("invalid_request"))
    assert tree(tmp_path) == before


def test_a_planted_brief_link_is_never_written_through(tmp_path):
    real = Real(tmp_path)
    exchange(real.app(), [post("/api/mansions", {"name": NAME})])
    outside = tmp_path / "outside.txt"
    outside.write_bytes(b"keep")
    brief_path(real).symlink_to(outside)
    results = exchange(real.app(), [post("/api/mansions", {"name": NAME, "brief": "Overwrite?"})])
    assert results[0][0] == 200
    assert outside.read_bytes() == b"keep"
    assert brief_path(real).is_symlink()


def test_write_brief_refuses_a_project_that_is_not_ready(tmp_path):
    real = Real(tmp_path)
    filesystem = MansionFilesystem(real.root, (real.approved,))
    with pytest.raises(MansionFilesystemError) as refused:
        filesystem.write_brief(filesystem.resolve(NAME), "No tree yet.")
    assert refused.value.code == "mansion_conflict"
    assert not (real.root / NAME).exists()


def test_the_archivist_prompt_carries_the_brief_written_at_create(tmp_path):
    real = Real(tmp_path)
    exchange(real.app(), [post("/api/mansions", {"name": NAME, "brief": "Keep a guest book.\nShow the last 50."})])
    root = Path(os.path.realpath(real.root))
    builder = RoomPromptBuilder(APP_ROOT, lambda mansion_id: GuardedFilesystem(root, mansion_id))
    assert asyncio.run(builder.brief(NAME, NAME)) == "Keep a guest book.\nShow the last 50."
    read = asyncio.run(CanonicalRunPort(MemoryWriter()).read(NAME))
    binding = RoomBinding(
        slot="slot-1", ghost="archivist", role="archivist", room="study", mansion=NAME,
        mansion_root=str(root), spec=NAME, phase=Phase.REQUIREMENTS, run_id="requirements-1",
        run_sequence=1, capability=new_capability(),
    )
    prompt = asyncio.run(builder.phase(read, binding))
    data = next(line for line in prompt.splitlines() if line.startswith("DATA feature_brief"))
    assert "Keep a guest book." in data and "Show the last 50." in data
