"""Property 5 for Action_Descriptor canonicalization.

Feature: doors-and-guardrails, Property 5: Action canonicalization is stable and complete

For any valid Action_Descriptor, key order does not change canonical bytes or
Action_Digest, changing any execution-relevant field changes the digest
(except for a cryptographic collision), and parse/canonicalize round trips
preserve bytes.

Validates: Requirements 3.1, 3.4.
"""

from __future__ import annotations

import copy
import hashlib
import json

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from haunted_house.core.action_descriptor import (
    ActionError,
    action_digest,
    canonical_action,
    descriptor_to_json,
    parse_action_descriptor,
    parse_canonical_action,
)

pytestmark = pytest.mark.core

_SEGMENT = st.text(alphabet="abcxyz019_-é", min_size=1, max_size=6)
_PATH = st.lists(_SEGMENT, min_size=1, max_size=3).map("/".join)
_PATHS = st.lists(_PATH, min_size=0, max_size=4, unique=True)
_ARG = st.text(alphabet="abcXYZ019 -=._é", min_size=1, max_size=10)
_SLOT = st.sampled_from(["workshop-slot-1", "workshop-slot-2", "study-slot"])
_MANSION = st.sampled_from(["demo-mansion", "other-mansion", "m1"])
_ROOM = st.sampled_from(["study", "drafting_room", "workshop"])
_WORKDIR = st.one_of(st.just(""), _PATH)


@st.composite
def descriptors(draw) -> dict:
    kind = draw(st.sampled_from(["delete_path", "run_command", "git_write"]))
    base = {
        "schema_version": 1,
        "mansion_id": draw(_MANSION),
        "session_slot": draw(_SLOT),
        "room": draw(_ROOM),
        "kind": kind,
        "working_directory": draw(_WORKDIR),
    }
    if kind == "delete_path":
        path = draw(_PATH)
        base["working_directory"] = ""
        base["arguments"] = {"path": path, "target": draw(st.sampled_from(["file", "empty_directory"]))}
        base["path_intents"] = [{"access": "delete", "path": path}]
    elif kind == "run_command":
        base["arguments"] = {
            "argv": draw(st.lists(_ARG, min_size=1, max_size=5)),
            "timeout_seconds": draw(st.integers(min_value=1, max_value=600)),
        }
        intents = draw(
            st.lists(
                st.tuples(st.sampled_from(["command_read", "command_write"]), _PATH),
                max_size=4,
                unique=True,
            )
        )
        base["path_intents"] = [{"access": access, "path": path} for access, path in intents]
    else:
        operation = draw(st.sampled_from(["add", "commit"]))
        pathspecs = draw(_PATHS)
        if operation == "add":
            assume(pathspecs)
            base["arguments"] = {"operation": "add", "pathspecs": pathspecs}
        else:
            base["arguments"] = {"operation": "commit", "pathspecs": pathspecs, "message": draw(_ARG)}
        base["path_intents"] = [{"access": "git_write", "path": path} for path in pathspecs]
    return base


def _shuffled(value, random):
    """Reorder every object's keys, and the (set-like) path intents."""

    if isinstance(value, dict):
        items = list(value.items())
        random.shuffle(items)
        result = {key: _shuffled(item, random) for key, item in items}
        if "path_intents" in result:
            intents = list(result["path_intents"])
            random.shuffle(intents)
            result["path_intents"] = intents
        return result
    if isinstance(value, list):
        return [_shuffled(item, random) for item in value]
    return value


def _mutations(raw: dict):
    """Yield every single execution-relevant change that stays valid."""

    def variant(**changes):
        mutated = copy.deepcopy(raw)
        mutated.update(changes)
        return mutated

    yield "mansion_id", variant(mansion_id=raw["mansion_id"] + "-b")
    yield "session_slot", variant(session_slot=raw["session_slot"] + "-b")
    yield "room", variant(room="study" if raw["room"] != "study" else "workshop")
    arguments = raw["arguments"]
    if raw["kind"] == "delete_path":
        other = arguments["path"] + "x"
        yield "path", variant(
            arguments={**arguments, "path": other},
            path_intents=[{"access": "delete", "path": other}],
        )
        flipped = "file" if arguments["target"] != "file" else "empty_directory"
        yield "target", variant(arguments={**arguments, "target": flipped})
    elif raw["kind"] == "run_command":
        yield "working_directory", variant(working_directory=raw["working_directory"] + ("/" if raw["working_directory"] else "") + "sub")
        yield "argv_value", variant(arguments={**arguments, "argv": arguments["argv"][:-1] + [arguments["argv"][-1] + "x"]})
        yield "argv_extra", variant(arguments={**arguments, "argv": arguments["argv"] + ["--force"]})
        yield "argv_order", variant(arguments={**arguments, "argv": ["sudo"] + arguments["argv"]})
        yield "timeout", variant(arguments={**arguments, "timeout_seconds": arguments["timeout_seconds"] % 600 + 1})
        yield "intent_added", variant(
            path_intents=raw["path_intents"] + [{"access": "command_write", "path": "zz-added/extra"}])
        if raw["path_intents"]:
            first = raw["path_intents"][0]
            flipped = "command_read" if first["access"] == "command_write" else "command_write"
            if {"access": flipped, "path": first["path"]} not in raw["path_intents"]:
                yield "intent_access", variant(
                    path_intents=[{"access": flipped, "path": first["path"]}] + raw["path_intents"][1:])
            yield "intent_removed", variant(path_intents=raw["path_intents"][1:])
    else:
        yield "working_directory", variant(working_directory=raw["working_directory"] + ("/" if raw["working_directory"] else "") + "sub")
        more = arguments["pathspecs"] + ["zz-added/extra"]
        yield "pathspecs", variant(
            arguments={**arguments, "pathspecs": more},
            path_intents=[{"access": "git_write", "path": path} for path in more],
        )
        if arguments["operation"] == "commit":
            yield "message", variant(arguments={**arguments, "message": arguments["message"] + "!"})
            if arguments["pathspecs"]:
                yield "operation", variant(arguments={"operation": "add", "pathspecs": arguments["pathspecs"]})


@settings(max_examples=300)
@given(raw=descriptors(), random=st.randoms(use_true_random=False))
def test_action_canonicalization_is_stable_and_complete(raw, random):
    descriptor = parse_action_descriptor(raw)
    assert not isinstance(descriptor, ActionError), descriptor
    data = canonical_action(descriptor)
    digest = action_digest(descriptor)
    assert digest == hashlib.sha256(data).hexdigest()

    # Canonical form: UTF-8, sorted keys, no insignificant whitespace, no floats.
    decoded = json.loads(data.decode("utf-8"), parse_float=lambda text: pytest.fail("float"))
    assert data == json.dumps(
        decoded, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")

    # Key order never changes bytes or digest.
    reordered = parse_action_descriptor(_shuffled(copy.deepcopy(raw), random))
    assert reordered == descriptor
    assert canonical_action(reordered) == data
    assert action_digest(reordered) == digest

    # Parse/canonicalize round trips preserve bytes.
    assert parse_canonical_action(data) == descriptor
    assert canonical_action(parse_canonical_action(data)) == data
    assert canonical_action(parse_action_descriptor(descriptor_to_json(descriptor))) == data

    # Every execution-relevant field is covered by the digest.
    seen = {digest}
    for name, mutated in _mutations(raw):
        changed = parse_action_descriptor(mutated)
        assert not isinstance(changed, ActionError), (name, changed)
        assert canonical_action(changed) != data, name
        assert action_digest(changed) != digest, name
        seen.add(action_digest(changed))
    assert len(seen) >= 4
