from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

SPIKE_ROOT = Path(__file__).resolve().parents[1]
if str(SPIKE_ROOT) not in sys.path:
    sys.path.insert(0, str(SPIKE_ROOT))

from backend_service import (  # noqa: E402
    APP_DATA_LABEL,
    AppDataUnverified,
    SYNTHETIC_REGISTRY,
    StandaloneRegistryService,
    resolve_standalone_app_data,
)
from probe import _validate_success_report, _write_source  # noqa: E402


def _app_root(tmp_path: Path) -> Path:
    root = tmp_path / "installed-app"
    root.mkdir()
    (root / "app.json").write_text("{}\n", encoding="utf-8")
    (root / "data").mkdir()
    return root


def test_resolver_accepts_only_the_real_app_data_child(tmp_path: Path) -> None:
    root = _app_root(tmp_path)

    app_root, data_dir = resolve_standalone_app_data(root)

    assert app_root == root.resolve()
    assert data_dir == (root / "data").resolve()
    assert APP_DATA_LABEL == "<app-root>/data"
    assert str(Path.home()) not in APP_DATA_LABEL


def test_resolver_fails_closed_when_crew_data_is_missing(tmp_path: Path) -> None:
    root = _app_root(tmp_path)
    (root / "data").rmdir()

    with pytest.raises(AppDataUnverified, match="app-data directory is unavailable"):
        resolve_standalone_app_data(root)


def test_resolver_rejects_a_linked_data_directory(tmp_path: Path) -> None:
    root = _app_root(tmp_path)
    target = tmp_path / "foreign-data"
    target.mkdir()
    (root / "data").rmdir()
    try:
        (root / "data").symlink_to(target, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("directory symlinks are unavailable")

    with pytest.raises(AppDataUnverified, match="app-data directory is unavailable"):
        resolve_standalone_app_data(root)


def test_fresh_service_loads_equivalent_relative_registry(tmp_path: Path) -> None:
    root = _app_root(tmp_path)
    writer = StandaloneRegistryService.from_cwd(root)

    written_digest = writer.write_synthetic_registry()
    loaded, loaded_digest = StandaloneRegistryService.from_cwd(root).load_synthetic_registry()

    assert loaded == SYNTHETIC_REGISTRY
    assert loaded_digest == written_digest
    record = loaded["mansions"][0]  # type: ignore[index]
    assert isinstance(record, dict)
    relative_path = record["relativePath"]
    assert isinstance(relative_path, str)
    assert not Path(relative_path).is_absolute()


def test_probe_sources_never_ship_or_share_a_data_directory(tmp_path: Path) -> None:
    v1 = tmp_path / "v1"
    v2 = tmp_path / "v2"

    _write_source(v1, "0.0.1", "v1")
    _write_source(v2, "0.0.2", "v2")

    assert not (v1 / "data").exists()
    assert not (v2 / "data").exists()
    assert json.loads((v1 / "app.json").read_text(encoding="utf-8"))["permissions"] == {
        "storage": True
    }
    assert (v1 / "generation.txt").read_text(encoding="utf-8") == "v1\n"
    assert (v2 / "generation.txt").read_text(encoding="utf-8") == "v2\n"


def test_success_report_is_path_free_and_exact() -> None:
    report = {
        "status": "verified",
        "crewVersion": "0.12.2",
        "verifiedPersistentLocation": "<app-root>/data",
        "registrySchemaVersion": 1,
        "registryEquivalent": True,
        "backendRestartPreserved": True,
        "updateLifecycle": "exercised",
        "updatePreserved": True,
        "isolatedDataHome": True,
        "decision": "implementation_may_proceed",
    }

    assert _validate_success_report(report) == report


@pytest.mark.parametrize("unsafe_location", ["/tmp/app/data", str(Path.home() / "app" / "data")])
def test_success_report_rejects_absolute_locations(unsafe_location: str) -> None:
    report = {
        "status": "verified",
        "crewVersion": "0.12.2",
        "verifiedPersistentLocation": unsafe_location,
        "registrySchemaVersion": 1,
        "registryEquivalent": True,
        "backendRestartPreserved": True,
        "updateLifecycle": "exercised",
        "updatePreserved": True,
        "isolatedDataHome": True,
        "decision": "implementation_may_proceed",
    }

    with pytest.raises(ValueError):
        _validate_success_report(report)


def test_probe_module_import_has_no_side_effects() -> None:
    spec = importlib.util.spec_from_file_location("persistence_probe_import", SPIKE_ROOT / "probe.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert not any(path.name.startswith(".probe-work-") for path in SPIKE_ROOT.iterdir())
