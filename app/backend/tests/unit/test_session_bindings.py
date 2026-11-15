"""Trusted session binding records (Doors and Guardrails tasks 9.1, 16.1).

Validates: Requirements 6.2, 6.9, 11.7, 11.8.
"""

from __future__ import annotations

import json
import os
import stat
from dataclasses import replace

import pytest

from haunted_house.adapters.session_bindings import (
    BINDING_DIRECTORY,
    ENDPOINT_FILENAME,
    BindingError,
    RoomBinding,
    SessionBindingStore,
    binding_filename,
    new_capability,
    session_label,
)
from haunted_house.core.guardrail_events import Phase
from haunted_house.core.seance_event import EventScope


def _binding(**changes) -> RoomBinding:
    base = RoomBinding(
        slot="slot-abc123",
        ghost="tinker-1",
        role="tinker",
        room="workshop",
        mansion="demo-mansion",
        mansion_root="/tmp/mansions",
        spec="demo-feature",
        phase=Phase.IMPLEMENTATION,
        run_id="implementation-1",
        run_sequence=1,
        capability=new_capability(),
    )
    return replace(base, **changes)


def test_a_binding_round_trips_through_an_owner_only_record(tmp_path):
    store = SessionBindingStore(tmp_path)
    binding = _binding()
    store.write(binding)

    path = tmp_path / BINDING_DIRECTORY / binding_filename("dashboard:slot-abc123")
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    assert set(json.loads(path.read_text())) == {
        "schema", "label", "slot", "ghost", "role", "room", "mansion", "mansionRoot",
        "spec", "phase", "runId", "runSequence", "capability",
    }
    assert store.load(session_label(binding.slot)) == binding
    assert binding.scope == EventScope("demo-mansion", "tinker-1", "slot-abc123", "implementation-1", 1)
    assert binding.capability not in repr(binding)
    assert [item.name for item in path.parent.iterdir()] == [path.name]


def test_only_the_exact_capability_authenticates(tmp_path):
    store = SessionBindingStore(tmp_path)
    binding = _binding()
    store.write(binding)
    label = binding.label
    assert store.authenticate(label, binding.capability) == binding
    for capability in ("", None, "0" * 64, binding.capability[:-1], binding.capability + "0", 7):
        assert store.authenticate(label, capability) is None
    for other in ("dashboard:other", "slot-abc123", "", None, "dashboard:" + "x" * 200):
        assert store.authenticate(other, binding.capability) is None
    store.remove(label)
    assert store.authenticate(label, binding.capability) is None


def test_linked_shared_oversized_or_edited_records_are_refused(tmp_path):
    store = SessionBindingStore(tmp_path)
    binding = _binding()
    store.write(binding)
    path = tmp_path / BINDING_DIRECTORY / binding_filename(binding.label)

    os.chmod(path, 0o644)
    assert store.load(binding.label) is None
    os.chmod(path, 0o600)
    assert store.load(binding.label) == binding

    os.link(path, path.with_name("second-name.json"))
    assert store.load(binding.label) is None
    os.unlink(path.with_name("second-name.json"))

    record = json.loads(path.read_text())
    for change in (
        {"room": "study"},  # a tinker's room is the workshop
        {"role": "operator"},
        {"label": "dashboard:other"},
        {"mansion": "../escape"},
        {"mansionRoot": "relative/root"},
        {"capability": "short"},
        {"runSequence": "1"},
        {"schema": 2},
        {"extra": True},
    ):
        path.write_text(json.dumps({**record, **change}))
        assert store.load(binding.label) is None, change
    path.write_text(json.dumps({key: value for key, value in record.items() if key != "phase"}))
    assert store.load(binding.label) is None
    path.write_text("x" * 5000)
    assert store.load(binding.label) is None

    path.unlink()
    target = tmp_path / "elsewhere.json"
    target.write_text(json.dumps(record))
    os.chmod(target, 0o600)
    path.symlink_to(target)
    assert store.load(binding.label) is None


def test_an_invalid_binding_or_an_unsafe_store_is_never_written(tmp_path):
    store = SessionBindingStore(tmp_path)
    for bad in (
        _binding(room="study"),
        _binding(slot="has space"),
        _binding(ghost="Tinker"),
        _binding(capability="nope"),
        _binding(mansion="Bad_Name"),
    ):
        with pytest.raises(BindingError):
            store.write(bad)
    assert not (tmp_path / BINDING_DIRECTORY).exists() or not list((tmp_path / BINDING_DIRECTORY).iterdir())

    missing = SessionBindingStore(tmp_path / "absent")
    with pytest.raises(BindingError) as error:
        missing.write(_binding())
    assert error.value.code == "binding_store_unavailable"
    assert str(tmp_path) not in str(error.value)


def test_the_backend_endpoint_record(tmp_path):
    store = SessionBindingStore(tmp_path)
    assert store.read_endpoint() is None
    store.write_endpoint(43210)
    assert store.read_endpoint() == 43210
    assert stat.S_IMODE((tmp_path / ENDPOINT_FILENAME).stat().st_mode) == 0o600
    for port in (0, 70000, "80", True):
        with pytest.raises(BindingError):
            store.write_endpoint(port)
    (tmp_path / ENDPOINT_FILENAME).write_text('{"schema": 1, "port": 99999}')
    assert store.read_endpoint() is None
