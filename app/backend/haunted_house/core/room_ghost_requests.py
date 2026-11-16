"""Strict parsers for the Room Ghosts routes.

Browser values are untrusted.  Every body is checked for exact shape, type,
length, and enumeration before a service is called: an unknown or missing
field, a wrong type, an identifier outside its alphabet, or feedback that is
empty, oversized, or carries control characters is refused with a fixed
code.  A refusal never echoes the rejected value.

Whether a command is *allowed* (the run exists, the Door is not open, the
view is current) is decided afterwards against the canonical fold.

Pure: no filesystem, network, clock, or logging.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import cast

from haunted_house.core.ghost_result import is_task_id
from haunted_house.core.guardrail_events import Phase, is_identifier
from haunted_house.core.path_policy import is_valid_spec_name
from haunted_house.core.prompts import MAX_FEEDBACK_BYTES
from haunted_house.core.room_ghost_events import MAX_SELECTED_TASKS
from haunted_house.core.workflow_requests import (
    COMMON_FIELDS,
    RequestError,
    parse_command_header,
    parse_mansion_id,
    parse_object,
)

__all__ = [
    "FeedbackBody",
    "RunCommandBody",
    "WorkshopStartBody",
    "parse_feedback",
    "parse_run_command",
    "parse_run_id",
    "parse_spec_name",
    "parse_workshop_start",
]

_REVISABLE = (Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS)
_UNSAFE = frozenset({"Cc", "Cs", "Co", "Cn", "Zl", "Zp"})


@dataclass(frozen=True, slots=True)
class FeedbackBody:
    command_id: str
    expected_version: int
    phase: Phase
    feedback: str


@dataclass(frozen=True, slots=True)
class WorkshopStartBody:
    command_id: str
    expected_version: int
    task_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RunCommandBody:
    command_id: str
    expected_version: int
    mansion_id: str


def parse_spec_name(value: object) -> str:
    if not is_valid_spec_name(value):
        raise RequestError("spec")
    return cast(str, value)


def parse_run_id(value: object) -> str:
    if not is_identifier(value):
        raise RequestError("run_id")
    return cast(str, value)


def parse_feedback(value: object) -> FeedbackBody:
    """``{"command_id", "expected_version", "phase", "feedback"}``."""

    record = parse_object(value, COMMON_FIELDS | {"phase", "feedback"})
    command_id, expected_version = parse_command_header(record)
    phase = record["phase"]
    if type(phase) is not str or phase not in {item.value for item in _REVISABLE}:
        raise RequestError("phase")
    text = record["feedback"]
    if type(text) is not str or not text.strip():
        raise RequestError("feedback")
    try:
        size = len(text.encode("utf-8"))
    except UnicodeEncodeError:
        raise RequestError("feedback") from None
    if size > MAX_FEEDBACK_BYTES or any(
        unicodedata.category(char) in _UNSAFE and char not in "\n\t" for char in text
    ):
        raise RequestError("feedback")
    return FeedbackBody(command_id, expected_version, Phase(phase), text)


def parse_workshop_start(value: object) -> WorkshopStartBody:
    """``{"command_id", "expected_version", "task_ids": [...]}``."""

    record = parse_object(value, COMMON_FIELDS | {"task_ids"})
    command_id, expected_version = parse_command_header(record)
    raw = record["task_ids"]
    if type(raw) is not list or not 1 <= len(cast(list, raw)) <= MAX_SELECTED_TASKS:
        raise RequestError("task_ids")
    items = cast(list[object], raw)
    if not all(is_task_id(item) for item in items) or len(set(cast(list[str], items))) != len(items):
        raise RequestError("task_ids")
    return WorkshopStartBody(command_id, expected_version, tuple(cast(list[str], items)))


def parse_run_command(value: object) -> RunCommandBody:
    """``{"command_id", "expected_version", "mansion_id"}`` (cancel, retry)."""

    record = parse_object(value, COMMON_FIELDS | {"mansion_id"})
    command_id, expected_version = parse_command_header(record)
    return RunCommandBody(command_id, expected_version, parse_mansion_id(record["mansion_id"]))
