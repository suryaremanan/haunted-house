"""Contract tests for the committed replay fixture and its Publication_Gate (Spec 7 task 5.4).

**Validates: Requirements 1.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

The fixture is read with the backend's real Canonical_Parser, serializer and
folds. Damaged copies exist only in memory or under pytest's temporary folder.
Planted credentials and home paths are assembled at run time.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from dataclasses import asdict, replace
from pathlib import Path

import pytest

from haunted_house.core.ghost_state import fold_ghost_events
from haunted_house.core.seance_log_parser import parse_event_log
from haunted_house.core.seance_persistence import GENESIS_HASH, build_app_event, prepare_candidates, serialize_app_event
from haunted_house.core.workflow import fold_workflow
from haunted_house.core.workflow_dto import workflow_projection_to_json

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

import publication_contract as contract  # noqa: E402
from publication_contract import ArtifactFile, classify_fixture, classify_publication  # noqa: E402
from publication_io import FIXTURE, fixture_codec, load_scanner, read_artifact  # noqa: E402

CLI = REPO_ROOT / "scripts" / "check-replay-publication.py"
EXPECTED = REPO_ROOT / "fixtures" / "replay" / "demo.expected.json"
SHOWN = "fixtures/replay/demo.jsonl"
SCANNER = load_scanner()
SCAN = SCANNER.scan_text
DATA = FIXTURE.read_bytes()
LINES = DATA.split(b"\n")[:-1]
PARSED = parse_event_log(DATA)

AWS_KEY = "AK" + "IA" + "Q7Z2M4X8P1L5N3B6"
HOME_PATH = "/".join(["", "Users", "zqjudge", "notes"])


def _load_builder():
    if "build_replay_fixture" in sys.modules:
        return sys.modules["build_replay_fixture"]
    spec = importlib.util.spec_from_file_location("build_replay_fixture", REPO_ROOT / "scripts" / "build_replay_fixture.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["build_replay_fixture"] = module
    spec.loader.exec_module(module)
    return module


def findings(data: bytes) -> list[str]:
    return [f"{finding.line}: {finding.category}" for finding in classify_fixture(SHOWN, data, fixture_codec(data), SCAN)]


def joined(lines: list[bytes]) -> bytes:
    return b"\n".join(lines) + b"\n"


# --- The committed fixture ---------------------------------------------------------


def test_every_line_is_a_supported_canonical_record() -> None:
    assert PARSED.ok and PARSED.diagnostics == ()
    assert PARSED.integrity_failure_line is None
    assert len(PARSED.events) == len(LINES) > 0
    assert PARSED.integrity_linked is True
    for raw, event in zip(LINES, PARSED.events, strict=True):
        assert event.schema_version == 1
        # Canonical bytes: the serializer reproduces the line exactly.
        assert serialize_app_event(event) == raw + b"\n"


def test_record_identity_and_order_are_unique_and_contiguous() -> None:
    events = PARSED.events
    assert [event.sequence for event in events] == list(range(1, len(events) + 1))
    assert len({event.record_id for event in events}) == len(events)
    assert len({event.event_id for event in events}) == len(events)
    assert events[0].prev_hash == GENESIS_HASH
    assert {event.scope.mansion_id for event in events} == {"demo-mansion"}


def test_the_fixture_passes_the_publication_gate() -> None:
    assert findings(DATA) == []
    report = classify_publication(fixture_path=SHOWN, fixture=DATA, codec=fixture_codec(DATA), scan=SCAN)
    assert report.accepted and report.accepted_paths == (SHOWN,)


def test_the_backend_folds_reach_the_expected_final_projection() -> None:
    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    folded = fold_ghost_events(PARSED.events)
    assert [event.record_id for event in folded.selection.events] == expected["selected_record_ids"]
    assert folded.selection.diagnostics == ()
    as_json = lambda items: json.loads(json.dumps([asdict(item) for item in items]))  # noqa: E731
    assert as_json(folded.snapshots) == expected["projection"]["ghosts"]
    assert as_json(folded.transitions) == expected["projection"]["transitions"]
    workflow = workflow_projection_to_json(fold_workflow(PARSED.events), mansion_id="demo-mansion", events=PARSED.events)
    assert json.loads(json.dumps(workflow)) == expected["projection"]["workflow"]


def test_the_final_projection_shows_the_judge_narrative() -> None:
    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    states = {ghost["ghost_id"]: ghost["state"] for ghost in expected["projection"]["ghosts"]}
    assert len(states) >= 2
    assert "done" in states.values()
    assert {"blocked", "failed"} & set(states.values())
    phases = {phase["phase"]: phase for phase in expected["projection"]["workflow"]["phases"]}
    assert phases["requirements"]["door"]["status"] == "open"
    told = expected["narrative"]
    assert told["tool_started"] >= 1 and told["tool_finished"] >= 1
    assert told["approval_requested"] >= 1 and told["approval_decided"] >= 1
    assert told["door_decisions"] >= 1 and told["run_completed"] >= 1
    assert told["run_blocked"] + told["run_failed"] >= 1


def test_the_scanner_passes_the_source_and_generated_copies() -> None:
    text = DATA.decode("utf-8")
    # The committed file, the copy the replay build emits, and a public copy all get the fixture rules.
    for shown in (SHOWN, "app/ui/dist-replay/fixture.jsonl", "replay/public/fixture.jsonl"):
        assert SCANNER.is_fixture_path(shown)
        assert SCAN(shown, text) == []
    for name in ("demo.workflow.json", "demo.expected.json", "mansions.json"):
        path = REPO_ROOT / "fixtures" / "replay" / name
        assert SCAN(f"fixtures/replay/{name}", path.read_text(encoding="utf-8")) == []


def test_the_fixture_holds_no_absolute_path_or_document_body() -> None:
    text = DATA.decode("utf-8")
    home = os.path.expanduser("~")
    assert home not in text and home.replace("/", "\\/") not in text
    for event in PARSED.events:
        # Evidence of a document write is content-free: a path, a revision, a digest and a size.
        payload = json.dumps(event.payload)
        assert len(payload) < 2_000
        assert "\\n" not in payload


# --- Damaged and edited copies -------------------------------------------------------


def test_a_malformed_line_is_reported_by_number() -> None:
    lines = [*LINES[:3], b'{"not":"a record"', *LINES[3:]]
    assert "4: fixture-invalid-record" in findings(joined(lines))
    assert "4: fixture-invalid-record" in findings(joined([*LINES[:3], b"", *LINES[3:]]))


def test_an_unsupported_schema_line_is_refused() -> None:
    record = json.loads(LINES[0])
    record["schema_version"] = 2
    edited = json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")
    reported = findings(joined([edited, *LINES[1:]]))
    assert "1: fixture-invalid-record" in reported
    # The next record no longer continues an accepted one.
    assert any(entry.endswith("fixture-integrity") for entry in reported)


def test_a_hand_edit_breaks_integrity_even_when_the_json_is_valid() -> None:
    edited = LINES[5].replace(b'"sequence":6', b'"sequence":7')
    assert edited != LINES[5]
    assert "6: fixture-integrity" in findings(joined([*LINES[:5], edited, *LINES[6:]]))
    assert "6: fixture-integrity" in findings(joined([*LINES[:5], *LINES[6:]]))


def test_reordered_keys_and_spacing_are_not_canonical_bytes() -> None:
    record = json.loads(LINES[0])
    spaced = json.dumps(record, sort_keys=True).encode("utf-8")
    assert json.loads(spaced) == record
    assert "1: fixture-noncanonical" in findings(joined([spaced, *LINES[1:]]))
    assert any(entry.endswith("fixture-noncanonical") for entry in findings(DATA[:-1]))
    assert findings(b"") == ["1: fixture-empty"]


def test_a_record_of_an_unrelated_session_is_refused() -> None:
    """A foreign record appended with a valid Sequence and hash link still fails the gate."""

    builder = _load_builder()
    story = builder.Story()
    story.add(999_000, builder.scope("visitor", "other-run", mansion="someone-elses-mansion"), "run_started", {"reason": "elsewhere"})
    prepared = prepare_candidates([candidate for candidate, _ in story.entries])
    assert prepared.ok
    last = PARSED.events[-1]
    foreign = build_app_event(
        prepared.candidates[0], sequence=last.sequence + 1, persisted_at_ms=last.persisted_at_ms + 10, prev_hash=last.hash
    )
    data = DATA + serialize_app_event(foreign)
    assert parse_event_log(data).ok
    assert findings(data) == [f"{len(LINES) + 1}: fixture-foreign-scope"]


@pytest.mark.parametrize(
    ("planted", "category", "secret"),
    [
        (AWS_KEY, contract.CREDENTIAL, AWS_KEY),
        (HOME_PATH, contract.HOME_PATH, "zqjudge"),
        (HOME_PATH.replace("/", "\\/"), contract.HOME_PATH, "zqjudge"),
        ("\\\\".join(["C:", "Users", "zqjudge", "Desktop"]), contract.HOME_PATH, "zqjudge"),
        (AWS_KEY.encode().hex(), contract.ENCODED_CREDENTIAL, AWS_KEY),
        ("http://localhost:4317/api/chat", contract.LOCALHOST_ORIGIN, "4317"),
    ],
)
def test_a_planted_sensitive_value_fails_the_gate_without_being_echoed(planted: str, category: str, secret: str) -> None:
    edited = LINES[2].replace(b'"payload":{', b'"payload":{"note":"' + planted.encode("utf-8") + b'",', 1)
    assert edited != LINES[2]
    data = joined([*LINES[:2], edited, *LINES[3:]])
    report = classify_publication(fixture_path=SHOWN, fixture=data, codec=fixture_codec(data), scan=SCAN)
    assert not report.accepted and report.accepted_paths == ()
    assert category in report.categories
    assert PublicationLine(3, category) in {PublicationLine(finding.line, finding.category) for finding in report.findings}
    assert secret not in "\n".join(str(finding) for finding in report.findings)


class PublicationLine(tuple):
    def __new__(cls, line: int, category: str):
        return super().__new__(cls, (line, category))


# --- The command -------------------------------------------------------------------


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(CLI), *args], cwd=REPO_ROOT, capture_output=True, text=True, timeout=60)


def write_build(root: Path) -> Path:
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text(
        '<!doctype html>\n<html lang="en">\n<head>\n<script type="module" crossorigin src="./assets/index-a1b2c3d4.js"></script>\n'
        '</head>\n<body><div id="root"></div></body>\n</html>\n',
        encoding="utf-8",
    )
    (root / "assets" / "index-a1b2c3d4.js").write_text('const log=fetch("./fixture.jsonl");\n', encoding="utf-8")
    (root / "fixture.jsonl").write_bytes(DATA)
    (root / ".nojekyll").write_bytes(b"")
    return root


def test_the_command_accepts_the_committed_fixture() -> None:
    result = run_cli()
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout == "check-replay-publication: accepted 1 file(s).\n"


def test_the_command_accepts_a_clean_build(tmp_path) -> None:
    result = run_cli("--artifact", str(write_build(tmp_path / "dist-replay")))
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout == "check-replay-publication: accepted 5 file(s).\n"


def test_the_command_refuses_a_build_and_prints_categories_only(tmp_path) -> None:
    root = write_build(tmp_path / "dist-replay")
    module = root / "assets" / "index-a1b2c3d4.js"
    module.write_text(
        module.read_text(encoding="utf-8") + f"const key='{AWS_KEY}';\nconst home='{HOME_PATH}';\nnew WebSocket('ws://127.0.0.1:8787/ws');\n",
        encoding="utf-8",
    )
    (root / "fixture.jsonl").write_bytes(DATA + b"\n")
    os.symlink(module, root / "assets" / "linked.js")
    os.link(root / "index.html", root / "copy.html")

    result = run_cli("--artifact", str(root))
    assert result.returncode == 1
    assert result.stdout.splitlines() == [
        "assets/index-a1b2c3d4.js:2: credential",
        "assets/index-a1b2c3d4.js:3: home-path",
        "assets/index-a1b2c3d4.js:4: live-transport",
        "assets/index-a1b2c3d4.js:4: localhost-origin",
        "assets/linked.js:1: symlink",
        "copy.html:1: hard-link",
        "fixture.jsonl:1: fixture-mismatch",
        "index.html:1: hard-link",
    ]
    assert result.stderr == "check-replay-publication: 8 finding(s); nothing is accepted.\n"
    for secret in (AWS_KEY, "zqjudge", str(tmp_path)):
        assert secret not in result.stdout + result.stderr


def test_the_command_reads_links_as_facts_and_never_follows_them(tmp_path) -> None:
    root = write_build(tmp_path / "dist-replay")
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.js").write_text(f"const key='{AWS_KEY}';\n", encoding="utf-8")
    os.symlink(outside, root / "linked-folder")
    files = {file.path: file for file in read_artifact(root)}
    assert files["linked-folder"] == ArtifactFile("linked-folder", kind="symlink")
    assert "linked-folder/secret.js" not in files
    assert files["index.html"].kind == "file" and files["index.html"].link_count == 1


def test_the_command_reports_a_missing_folder_as_a_usage_error(tmp_path) -> None:
    result = run_cli("--artifact", str(tmp_path / "absent"))
    assert result.returncode == 2
    assert str(tmp_path) not in result.stderr
    assert run_cli("--fixture", str(tmp_path / "absent.jsonl")).returncode == 2
