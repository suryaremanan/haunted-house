"""Property 8 for haunted_house.core.mansion_requests.

Bodies are arbitrary JSON-compatible values: scalars, arrays and objects,
nested, plus objects built around the ``name`` key (extra keys, wrong value
types, near-miss key spellings). A small dispatcher mirrors the handler
order (parse, then call the service) with a spy standing in for
Mansion_Service and the pure request model standing in for its state.
"""

import copy
import json
from pathlib import PurePosixPath

import pytest
from hypothesis import example, given
from hypothesis import strategies as st

from haunted_house.core.mansion_planner import (
    EntryFact,
    EntryKind,
    ModelState,
    ProjectSnapshot,
    apply_model_create_request,
    apply_model_open_request,
)
from haunted_house.core.mansion_requests import (
    INVALID_REQUEST_CODE,
    InvalidRequest,
    MansionRequest,
    parse_mansion_request,
)

pytestmark = pytest.mark.core

# Feature: mansion-lifecycle, Property 8: Request parsing accepts only the exact body shape

json_scalars = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(max_size=20),
)
json_values = st.recursive(
    json_scalars,
    lambda children: st.one_of(
        st.lists(children, max_size=4),
        st.dictionaries(st.text(max_size=8), children, max_size=4),
    ),
    max_leaves=12,
)
name_keys = st.sampled_from(
    ["name", "Name", "NAME", "name ", " name", "names", "nam", "", "nаme", "path"]
)
name_objects = st.dictionaries(name_keys, json_values, max_size=3)
exact_objects = st.builds(lambda value: {"name": value}, json_values)
string_named = st.builds(
    lambda name, extra: {"name": name, **extra},
    st.text(max_size=45),
    st.one_of(
        st.just({}),
        st.just({}),
        st.dictionaries(
            st.sampled_from(["path", "root", "projectSpec", "cwd", "force", "Name"]),
            json_values,
            min_size=1,
            max_size=2,
        ),
    ),
)
bodies = st.one_of(json_values, name_objects, exact_objects, string_named, string_named)


def reference_request_name(value: object) -> str | None:
    """Return the name when ``value`` is exactly ``{"name": <string>}``."""
    if type(value) is not dict:
        return None
    keys = list(value.keys())
    if keys != ["name"]:
        return None
    candidate = value["name"]
    if type(candidate) is not str:
        return None
    return candidate


class ServiceSpy:
    def __init__(self) -> None:
        self.commands: list[MansionRequest] = []

    def __call__(self, command: MansionRequest) -> None:
        self.commands.append(command)


def dispatch(body: object, service: ServiceSpy) -> str:
    """Parse first; only a parsed command may reach the service."""
    try:
        command = parse_mansion_request(body)
    except InvalidRequest as error:
        return error.code
    service(command)
    return "dispatched"


def absent_state() -> ModelState:
    base = PurePosixPath("/approved/mansions/weather-station")

    def missing(path: PurePosixPath) -> EntryFact:
        return EntryFact(lexical=path, canonical=path, kind=EntryKind.MISSING)

    return ModelState(
        project=ProjectSnapshot(
            target=missing(base),
            kiro=missing(base / ".kiro"),
            specs=missing(base / ".kiro" / "specs"),
            project_spec=missing(base / ".kiro" / "specs" / "weather-station"),
        )
    )


@given(body=bodies)
@example(body={"name": "weather-station"})
@example(body={"name": ""})
@example(body={"name": "../../etc"})
@example(body={"name": "weather-station", "path": "/tmp/x"})
@example(body={"name": None})
@example(body={"name": 7})
@example(body={"name": True})
@example(body={"name": ["weather-station"]})
@example(body={"name": {"name": "weather-station"}})
@example(body={"Name": "weather-station"})
@example(body={})
@example(body=[])
@example(body=[{"name": "weather-station"}])
@example(body="weather-station")
@example(body='{"name": "weather-station"}')
@example(body=None)
@example(body=0)
@example(body=False)
def test_only_the_exact_name_object_becomes_a_service_command(body):
    # Every generated body really is JSON-compatible, and parsing sees what a
    # decoder would hand the route.
    decoded = json.loads(json.dumps(body))
    before = copy.deepcopy(decoded)
    expected_name = reference_request_name(decoded)
    service = ServiceSpy()
    state = absent_state()
    state_before = copy.deepcopy(state)

    outcome = dispatch(decoded, service)

    if expected_name is None:
        # Rejected: the stable code, no command, no model transition.
        assert outcome == INVALID_REQUEST_CODE == "invalid_request"
        assert service.commands == []
        with pytest.raises(InvalidRequest) as caught:
            parse_mansion_request(decoded)
        assert caught.value.code == "invalid_request"
        # The error text is the fixed code, never an echo of the body.
        assert str(caught.value) == "invalid_request"
        assert caught.value.args == ("invalid_request",)
    else:
        # Accepted: one command carrying the caller's exact string.
        assert outcome == "dispatched"
        assert service.commands == [MansionRequest(name=expected_name)]
        command = service.commands[0]
        assert type(command) is MansionRequest
        assert command.name == expected_name
        assert type(command.name) is str
        # Shape parsing does not judge the name language; that is the
        # service's next step, which may still refuse the command.
        for apply in (apply_model_create_request, apply_model_open_request):
            apply(state, command.name)

    # Parsing never mutates the body, and a rejected body leaves the model
    # state untouched because nothing downstream ran.
    assert decoded == before
    assert state == state_before
    # The parser is total: the same input always gives the same answer.
    assert dispatch(decoded, ServiceSpy()) == outcome


@given(name=st.text(max_size=60))
def test_accepted_names_are_passed_through_without_coercion(name):
    request = parse_mansion_request({"name": name})

    assert request == MansionRequest(name=name)
    assert request.name == name
    assert len(request.name) == len(name)


@given(
    name=st.text(max_size=20),
    extra_key=st.text(max_size=8).filter(lambda key: key != "name"),
    extra_value=json_values,
)
def test_one_extra_or_missing_key_always_rejects(name, extra_key, extra_value):
    for body in ({"name": name, extra_key: extra_value}, {extra_key: name}, {}):
        with pytest.raises(InvalidRequest):
            parse_mansion_request(body)


# Design decision 2026-11-16 (feature brief): creation also accepts exactly
# {"name": <string>, "brief": <string>}. Open keeps the single-key shape above.

brief_texts = st.one_of(
    st.text(max_size=40),
    st.text(alphabet=st.characters(codec="utf-8"), max_size=40),
    st.builds(lambda n: "b" * n, st.integers(min_value=1995, max_value=2005)),
)
create_bodies = st.one_of(
    bodies,
    st.builds(lambda name, brief: {"name": name, "brief": brief}, st.text(max_size=20), brief_texts),
    st.builds(lambda name, brief: {"name": name, "brief": brief}, st.text(max_size=20), json_values),
    st.builds(
        lambda name, brief, extra: {"name": name, "brief": brief, **extra},
        st.text(max_size=20),
        brief_texts,
        st.dictionaries(st.sampled_from(["path", "Brief", "cwd"]), json_values, min_size=1, max_size=1),
    ),
)


def reference_brief(value: str) -> str | None | InvalidRequest:
    import unicodedata

    text = value.replace("\r\n", "\n").replace("\r", "\n")
    if any(
        (unicodedata.category(c) == "Cc" and c not in "\n\t") or unicodedata.category(c) == "Cs"
        for c in text
    ):
        return InvalidRequest()
    text = text.strip()
    if len(text) > 2000:
        return InvalidRequest()
    return text or None


@given(body=create_bodies)
@example(body={"name": "lab", "brief": "x"})
@example(body={"name": "lab", "brief": "\x00"})
@example(body={"name": "lab", "brief": None})
@example(body={"brief": "x"})
def test_create_accepts_only_name_or_name_and_valid_brief(body):
    from haunted_house.core.mansion_requests import parse_create_mansion_request

    decoded = json.loads(json.dumps(body))
    before = copy.deepcopy(decoded)
    expected: MansionRequest | None = None
    if type(decoded) is dict and type(decoded.get("name")) is str:
        if list(decoded) == ["name"]:
            expected = MansionRequest(name=decoded["name"])
        elif sorted(decoded) == ["brief", "name"] and type(decoded["brief"]) is str:
            brief = reference_brief(decoded["brief"])
            if not isinstance(brief, InvalidRequest):
                expected = MansionRequest(name=decoded["name"], brief=brief)

    if expected is None:
        with pytest.raises(InvalidRequest) as caught:
            parse_create_mansion_request(decoded)
        assert str(caught.value) == "invalid_request"
    else:
        command = parse_create_mansion_request(decoded)
        assert command == expected
        assert command.brief is None or (command.brief == command.brief.strip() != "")
    assert decoded == before
