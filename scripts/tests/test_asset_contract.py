"""Asset provenance, coverage and media-source rules (Spec 7 tasks 9.4 and 9.6).

Requirements 9.6, 9.7 and 10.1-10.6: every distributed media file has one
Original or CC0 provenance record, and the shipped UI loads no external,
inlined-raster, scripted, animated or audio media and names no prohibited
product. The pure rules are in scripts/lib/asset_contract.py; the CLI
scripts/check-assets.py walks the repository.

The two prohibited product names are assembled from pieces so this file does
not spell them out.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "check-assets.py"
LIB = REPO_ROOT / "scripts" / "lib"
MANIFEST = "docs/assets-manifest.json"

if str(LIB) not in sys.path:
    sys.path.insert(0, str(LIB))

import asset_contract as contract  # noqa: E402

NAME_ONE = "".join(("Mi", "cro", "soft"))
NAME_TWO = "".join(("B", "o", "b"))


def original(path: str = "app/assets/icon.png", kind: str = "icon") -> dict[str, Any]:
    return {
        "path": path,
        "kind": kind,
        "provenance": "original",
        "creator": "Haunted House contributors",
        "sourceUrl": None,
        "licenseName": "Original",
        "licenseUrl": None,
        "modifications": "",
        "altText": "A small house with a ghost in the doorway.",
    }


def cc0(path: str = "docs/screenshots/paper.png", kind: str = "screenshot") -> dict[str, Any]:
    return {
        "path": path,
        "kind": kind,
        "provenance": "cc0",
        "creator": "A. Synthetic Author",
        "sourceUrl": "https://example.org/works/paper-texture",
        "licenseName": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "modifications": "Cropped and desaturated.",
        "altText": "A sheet of aged paper.",
    }


def manifest(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"schemaVersion": 1, "assets": list(entries)}


def categories(findings) -> set[str]:
    return {finding.category for finding in findings}


# --- Manifest: valid records ----------------------------------------------------


def test_valid_original_and_cc0_records_pass():
    data = manifest(original(), cc0())
    assert contract.validate_manifest(data) == []
    assert contract.check_coverage(data, ["app/assets/icon.png", "docs/screenshots/paper.png"]) == []


def test_an_empty_manifest_is_valid():
    assert contract.validate_manifest(manifest()) == []


def test_every_category_the_module_reports_is_declared():
    names = {value for name, value in vars(contract).items() if name.isupper() and isinstance(value, str) and "-" in value}
    assert names <= contract.CATEGORIES | {"CC0-1.0"}


# --- Manifest: each broken rule -------------------------------------------------


def _set(key: str, value: Any):
    def mutate(entry: dict[str, Any]) -> None:
        entry[key] = value

    return mutate


def _drop(key: str):
    def mutate(entry: dict[str, Any]) -> None:
        del entry[key]

    return mutate


ORIGINAL_CASES = [
    ("source on an original", _set("sourceUrl", "https://example.org/x"), "false-attribution"),
    ("license link on an original", _set("licenseUrl", "https://example.org/l"), "false-attribution"),
    ("wrong license name", _set("licenseName", "CC0-1.0"), "invalid-license"),
    ("no license name", _set("licenseName", None), "invalid-license"),
    ("no alt text", _set("altText", "   "), "missing-alt-text"),
    ("alt text not a string", _set("altText", None), "missing-alt-text"),
    ("no creator", _set("creator", ""), "missing-creator"),
    ("unknown provenance", _set("provenance", "fair-use"), "invalid-provenance"),
    ("unknown kind", _set("kind", "banner"), "invalid-kind"),
    ("audio kind for an image", _set("kind", "audio"), "kind-mismatch"),
    ("absolute path", _set("path", "/app/assets/icon.png"), "invalid-path"),
    ("parent segment", _set("path", "app/../secrets/icon.png"), "invalid-path"),
    ("dot segment", _set("path", "./app/assets/icon.png"), "invalid-path"),
    ("empty segment", _set("path", "app//icon.png"), "invalid-path"),
    ("backslash path", _set("path", "app\\assets\\icon.png"), "invalid-path"),
    ("URL as path", _set("path", "https://example.org/icon.png"), "invalid-path"),
    ("path not a string", _set("path", 7), "invalid-path"),
    ("missing field", _drop("modifications"), "entry-missing-field"),
    ("extra field", _set("approvedBy", "nobody"), "entry-unknown-field"),
    ("modifications not a string", _set("modifications", None), "missing-modifications"),
    ("prohibited name in alt text", _set("altText", f"A ghost named {NAME_TWO}."), "prohibited-name"),
    ("prohibited name in the path", _set("path", f"app/assets/{NAME_ONE.lower()}-logo.png"), "prohibited-name"),
]

CC0_CASES = [
    ("no source", _set("sourceUrl", None), "missing-source"),
    ("empty source", _set("sourceUrl", ""), "missing-source"),
    ("no license link", _set("licenseUrl", None), "missing-license-url"),
    ("http source", _set("sourceUrl", "http://example.org/works/paper"), "insecure-url"),
    ("http license link", _set("licenseUrl", "http://creativecommons.org/publicdomain/zero/1.0/"), "insecure-url"),
    ("source without a host", _set("sourceUrl", "https:///paper"), "insecure-url"),
    ("no modification note", _set("modifications", ""), "missing-modifications"),
    ("wrong license name", _set("licenseName", "Original"), "invalid-license"),
]


@pytest.mark.parametrize(("label", "mutate", "category"), ORIGINAL_CASES, ids=[case[0] for case in ORIGINAL_CASES])
def test_a_broken_original_record_is_reported(label, mutate, category):
    entry = original()
    mutate(entry)
    assert category in categories(contract.validate_manifest(manifest(entry)))


@pytest.mark.parametrize(("label", "mutate", "category"), CC0_CASES, ids=[case[0] for case in CC0_CASES])
def test_a_broken_cc0_record_is_reported(label, mutate, category):
    entry = cc0()
    mutate(entry)
    assert category in categories(contract.validate_manifest(manifest(entry)))


@pytest.mark.parametrize(
    "data",
    [
        None,
        [],
        {"assets": []},
        {"schemaVersion": 1},
        {"schemaVersion": 1, "assets": {}},
        {"schemaVersion": 1, "assets": [], "generatedAt": "today"},
    ],
)
def test_a_malformed_document_is_reported(data):
    assert categories(contract.validate_manifest(data)) == {"manifest-invalid"}


@pytest.mark.parametrize("version", [0, 2, "1", True, None])
def test_only_schema_version_one_is_supported(version):
    data = {"schemaVersion": version, "assets": []}
    assert categories(contract.validate_manifest(data)) == {"manifest-schema-version"}


def test_an_entry_that_is_not_an_object_is_reported():
    assert categories(contract.validate_manifest(manifest("app/assets/icon.png"))) == {"entry-invalid"}  # type: ignore[arg-type]


def test_duplicate_paths_are_reported():
    findings = contract.validate_manifest(manifest(original(), original()))
    assert "duplicate-path" in categories(findings)
    assert {finding.line for finding in findings if finding.category == "duplicate-path"} == {2}


def test_entries_must_sort_by_path():
    data = manifest(cc0(), original())
    assert categories(contract.validate_manifest(data)) == {"unsorted-paths"}


def test_findings_name_the_entry_number_and_never_the_value():
    planted = "https://example.org/PLANTED-SOURCE-VALUE"
    entry = original()
    entry["sourceUrl"] = planted
    findings = contract.validate_manifest(manifest(cc0("app/assets/a.png", "hero"), entry))
    assert [str(finding) for finding in findings] == [f"{MANIFEST}:2: false-attribution"]
    assert all("PLANTED" not in str(finding) for finding in findings)


# --- Coverage -------------------------------------------------------------------


def test_an_unmanifested_media_file_is_reported():
    findings = contract.check_coverage(manifest(original()), ["app/assets/icon.png", "docs/screenshots/extra.png"])
    assert [str(finding) for finding in findings] == ["docs/screenshots/extra.png:1: unmanifested-media"]


def test_an_entry_for_a_missing_file_is_reported():
    findings = contract.check_coverage(manifest(original(), cc0()), ["app/assets/icon.png"])
    assert [str(finding) for finding in findings] == [f"{MANIFEST}:2: missing-file"]


def test_the_mvp_ships_no_audio_file_or_audio_entry():
    entry = original("app/assets/creak.ogg", "audio")
    data = manifest(entry)
    assert contract.validate_manifest(data) == []
    assert categories(contract.check_coverage(data, ["app/assets/creak.ogg"])) == {"mvp-audio"}
    # The Sound_Feature stretch work opts in explicitly.
    assert contract.check_coverage(data, ["app/assets/creak.ogg"], allow_audio=True) == []


def test_a_media_file_with_a_prohibited_name_is_reported():
    path = f"docs/screenshots/{NAME_TWO.lower()}_house.png"
    data = manifest(original(path, "screenshot"))
    assert "prohibited-name" in categories(contract.check_coverage(data, [path]))


@pytest.mark.parametrize(
    ("path", "media"),
    [
        ("app/assets/icon.png", True),
        ("docs/screenshots/a.JPG", True),
        ("app/assets/house.svg", True),
        ("docs/demo.mp4", True),
        ("app/assets/creak.wav", True),
        ("docs/writeup.md", False),
        ("docs/assets-manifest.json", False),
        ("app/ui/src/core/waves.ts", False),
    ],
)
def test_media_files_are_recognised_by_extension(path, media):
    assert contract.is_media_path(path) is media


# --- Source scanning ------------------------------------------------------------

CLEAN_TSX = """
export const HouseArt = () => (
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="House">
    <defs><symbol id="ghost"><path d="M2 2h4v4H2z" /></symbol></defs>
    <use href="#ghost" />
    <a href="https://kiro.dev/docs/crew/">Crew docs</a>
  </svg>
)
const waves = plan.waves.map((wave) => wave.tasks)
const audioOff = settings.sound === 'off'
"""

FLAGGED = [
    ("remote svg image", '<image href="https://example.org/ghost.png" />', "external-svg-reference"),
    ("protocol-relative svg image", '<image xlinkHref="//example.org/ghost.svg" />', "external-svg-reference"),
    ("data svg image", '<image href="data:image/png;base64,AAAA" />', "external-svg-reference"),
    ("external use", '<use href="sprites.svg#ghost" />', "external-svg-reference"),
    ("remote use", '<use xlink:href="https://example.org/s.svg#g" />', "external-svg-reference"),
    ("compiled external use", 'jsx("use", { href: "https://example.org/s.svg#g" })', "external-svg-reference"),
    ("compiled remote image", "e('image',{href:'//example.org/a.png'})", "external-svg-reference"),
    ("remote img", '<img src="https://example.org/house.webp" alt="" />', "remote-asset"),
    ("remote font url", "@font-face { src: url(https://fonts.example.org/spooky.woff2) }", "remote-asset"),
    ("remote stylesheet import", '@import "https://example.org/theme.css";', "remote-asset"),
    ("remote link element", '<link rel="stylesheet" href="https://example.org/a" />', "remote-asset"),
    ("remote video poster", '<video poster="//example.org/p" />', "remote-asset"),
    ("remote media string", 'const art = "https://example.org/files/house.svg"', "remote-asset"),
    ("raster data uri", 'const png = "data:image/png;base64,iVBORw0KGgo="', "raster-data-uri"),
    ("jpeg data uri", "background: url(data:image/jpeg;base64,AAAA)", "raster-data-uri"),
    ("font data uri", "src: url(data:font/woff2;base64,AAAA)", "raster-data-uri"),
    ("smil animate", '<animate attributeName="opacity" dur="1s" />', "svg-animation"),
    ("smil animateTransform", "<animateTransform type='rotate' />", "svg-animation"),
    ("smil set", '<set attributeName="fill" to="red" />', "svg-animation"),
    ("compiled animate", 'jsx("animateMotion", { dur: "2s" })', "svg-animation"),
    ("audio constructor", "const creak = new Audio(src)", "audio-api"),
    ("audio context", "const ctx = new AudioContext()", "audio-api"),
    ("webkit audio context", "new window.webkitAudioContext()", "audio-api"),
    ("audio element", "<audio controls />", "audio-api"),
    ("created audio element", "document.createElement('audio')", "audio-api"),
    ("audio import", "import creak from './creak.mp3'", "audio-api"),
    ("audio url import", 'import boo from "../assets/boo.ogg?url"', "audio-api"),
    ("wav require", "const s = require('./door.wav')", "audio-api"),
    ("first prohibited name", f"const title = '{NAME_ONE} house'", "prohibited-name"),
    ("second prohibited name", f"<h1>{NAME_TWO.upper()}'s home</h1>", "prohibited-name"),
]


def test_the_synthesised_sound_adapter_and_its_bundles_may_use_web_audio_only():
    synth = "const ctx = new AudioContext()"
    assert contract.scan_source("app/ui/src/adapters/house-sound.ts", synth) == []
    assert contract.scan_source("app/ui/dist/index.mjs", synth) == []
    assert contract.scan_source("app/ui/dist-replay/assets/index-abc.js", synth) == []
    # Any other source is still a finding, and so is a sample or an element anywhere.
    assert categories(contract.scan_source("app/ui/src/components/HouseMap.tsx", synth)) == {"audio-api"}
    for planted in ("new Audio(src)", "<audio controls />", "import creak from './creak.mp3'", "speechSynthesis.speak(u)"):
        assert categories(contract.scan_source("app/ui/src/adapters/house-sound.ts", planted)) == {"audio-api"}


def test_clean_source_has_no_finding():
    assert contract.scan_source("app/ui/src/components/house-art.tsx", CLEAN_TSX) == []


@pytest.mark.parametrize(("label", "text", "category"), FLAGGED, ids=[case[0] for case in FLAGGED])
def test_a_prohibited_construct_is_reported(label, text, category):
    findings = contract.scan_source("app/ui/src/sample.tsx", f"// line one\n{text}\n")
    assert category in categories(findings)
    assert all(finding.line == 2 and finding.path == "app/ui/src/sample.tsx" for finding in findings)


def test_inline_svg_data_is_not_a_raster_data_uri():
    text = "background: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E\")"
    assert contract.scan_source("app/ui/src/a.css", text) == []


def test_a_script_element_is_a_finding_only_inside_an_svg_file():
    text = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    assert categories(contract.scan_source("app/assets/house.svg", text)) == {"svg-script"}
    entry = '<script type="module" src="./main.tsx"></script>'
    assert contract.scan_source("app/ui/replay/index.html", entry) == []


def test_a_prohibited_name_inside_a_longer_identifier_is_not_reported():
    name = NAME_TWO.lower()
    text = f"const {name}bin = 1; const kebo{name[1:]} = 2; const _{name} = 3; const {name}$ = 4"
    assert contract.scan_source("app/ui/dist/index.mjs", text) == []


def test_scan_findings_carry_no_matched_text():
    planted = "https://example.org/PLANTED-VALUE/ghost.png"
    findings = contract.scan_source("app/ui/src/a.tsx", f'<img src="{planted}" />')
    assert findings and all("PLANTED" not in str(finding) for finding in findings)
    assert all(set(vars(finding)) == {"path", "line", "category"} for finding in findings)


# --- The CLI on the real repository and on synthetic trees ----------------------


def _load_cli():
    spec = importlib.util.spec_from_file_location("check_assets", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_cli(root: Path | None = None) -> subprocess.CompletedProcess[str]:
    args = [sys.executable, str(SCRIPT)]
    if root is not None:
        args += ["--root", str(root)]
    return subprocess.run(args, capture_output=True, text=True, timeout=120, check=False)


def test_the_repository_passes_the_asset_check():
    result = run_cli()
    assert result.returncode == 0, result.stdout + result.stderr
    assert "have provenance" in result.stdout


def test_the_committed_manifest_is_canonical_and_covers_every_media_file():
    text = (REPO_ROOT / MANIFEST).read_text(encoding="utf-8")
    data = json.loads(text)
    assert text == json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    cli = _load_cli()
    assert contract.manifest_paths(data) == cli.media_files(REPO_ROOT)
    # MVP artwork is original and there is no sound.
    assert all(entry["provenance"] == "original" for entry in data["assets"])
    assert not any(contract.is_audio_path(path) for path in cli.media_files(REPO_ROOT))


def test_the_scan_covers_shipped_source_and_skips_tests():
    sources = _load_cli().source_files(REPO_ROOT)
    assert "app/ui/src/App.tsx" in sources
    assert "app/ui/replay/index.html" in sources
    assert "app/ui/dist/index.mjs" in sources
    assert not any(".test." in path or "/test/" in path or "node_modules" in path or "dist-replay" in path for path in sources)


def _tree(tmp_path: Path, data: Any, files: dict[str, str | bytes]) -> Path:
    (tmp_path / "docs").mkdir()
    (tmp_path / MANIFEST).write_text(json.dumps(data) if not isinstance(data, str) else data, encoding="utf-8")
    for name, content in files.items():
        file = tmp_path / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))
    return tmp_path


def test_the_cli_accepts_a_clean_synthetic_tree(tmp_path: Path):
    root = _tree(tmp_path, manifest(original()), {"app/assets/icon.png": b"\x89PNG", "app/ui/src/App.tsx": CLEAN_TSX})
    result = run_cli(root)
    assert (result.returncode, result.stdout.strip()) == (0, "check-assets: 1 media file(s) have provenance; 1 source file(s) are clean.")


def test_the_cli_reports_sorted_category_only_findings(tmp_path: Path):
    secret_looking = "https://example.org/PLANTED/ghost.png"
    root = _tree(
        tmp_path,
        manifest(original()),
        {
            "app/assets/icon.png": b"\x89PNG",
            "app/assets/creak.mp3": b"ID3",
            "docs/screenshots/unlisted.png": b"\x89PNG",
            "app/assets/art.svg": '<svg><script>1</script><image href="https://example.org/a.png"/></svg>',
            "app/ui/src/App.tsx": f'<img src="{secret_looking}" />\nnew Audio()\n',
            # Test-only and excluded folders are neither scanned nor inventoried.
            "app/ui/src/App.test.tsx": "new Audio()",
            "app/ui/src/test/kit.ts": "new Audio()",
            "app/ui/node_modules/pkg/logo.png": b"\x89PNG",
            "app/ui/dist-replay/assets/x.png": b"\x89PNG",
            "spikes/shot.png": b"\x89PNG",
        },
    )
    result = run_cli(root)
    assert result.returncode == 1
    assert result.stdout.splitlines() == [
        "app/assets/art.svg:1: external-svg-reference",
        "app/assets/art.svg:1: remote-asset",
        "app/assets/art.svg:1: svg-script",
        "app/assets/art.svg:1: unmanifested-media",
        "app/assets/creak.mp3:1: mvp-audio",
        "app/assets/creak.mp3:1: unmanifested-media",
        "app/ui/src/App.tsx:1: remote-asset",
        "app/ui/src/App.tsx:2: audio-api",
        "docs/screenshots/unlisted.png:1: unmanifested-media",
    ]
    assert "PLANTED" not in result.stdout + result.stderr


def test_the_cli_reports_a_manifest_entry_without_a_file(tmp_path: Path):
    root = _tree(tmp_path, manifest(original()), {})
    result = run_cli(root)
    assert (result.returncode, result.stdout.splitlines()) == (1, [f"{MANIFEST}:1: missing-file"])


@pytest.mark.parametrize("text", ["{not json", ""])
def test_the_cli_refuses_an_unreadable_manifest(tmp_path: Path, text: str):
    result = run_cli(_tree(tmp_path, text, {}))
    assert result.returncode == 2 and result.stdout == ""


def test_the_cli_needs_a_manifest(tmp_path: Path):
    result = run_cli(tmp_path)
    assert result.returncode == 2 and "is missing" in result.stderr


def test_the_cli_writes_nothing(tmp_path: Path):
    root = _tree(tmp_path, manifest(original()), {"app/assets/icon.png": b"\x89PNG"})
    before = sorted(path.relative_to(root).as_posix() for path in root.rglob("*"))
    run_cli(root)
    assert sorted(path.relative_to(root).as_posix() for path in root.rglob("*")) == before


def test_validation_does_not_change_its_input():
    data = manifest(cc0(), original())
    snapshot = copy.deepcopy(data)
    contract.validate_manifest(data)
    contract.check_coverage(data, ["app/assets/icon.png"])
    assert data == snapshot
