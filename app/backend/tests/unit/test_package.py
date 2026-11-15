"""Smoke tests: the backend package imports from app/backend, and the test
tooling is configured as the spec requires."""

import importlib
from pathlib import Path

import pytest
from hypothesis import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.mark.core
def test_core_package_imports_from_the_app_backend():
    core = importlib.import_module("haunted_house.core")
    assert Path(core.__file__).resolve().parent == BACKEND_DIR / "haunted_house" / "core"


def test_adapters_package_imports_from_the_app_backend():
    adapters = importlib.import_module("haunted_house.adapters")
    assert (
        Path(adapters.__file__).resolve().parent
        == BACKEND_DIR / "haunted_house" / "adapters"
    )


def test_property_tests_run_at_least_100_examples_by_default():
    assert settings().max_examples >= 100
