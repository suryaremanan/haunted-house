"""Property test for scripts/secret_scan.py: home paths in fixtures are flagged.

**Validates: Requirements 10.3**

What counts as an absolute home-directory path
  `/Users/<name>`, `/home/<name>`, `<drive>:\\Users\\<name>` or
  `<drive>:/Users/<name>`, where <name> is 1 to 32 characters from
  [A-Za-z0-9._-] not starting with ".", and the character before the path
  does not make it relative: it is not a letter, digit, "_", ".", "~" or "-".
  Anything may follow the name, including nothing. A bare `/Users/al` at the
  end of a string is the home folder of user "al", so it counts. `/Users/`
  with no name is the folder that holds the homes, and does not.

How a fixture holds one
  Raw on a plain text line, or inside a JSON string value written by Python's
  json module (with or without ensure_ascii) or with "/" escaped as "\\/".
  In JSON a newline, tab or carriage return just before the path is written
  as \\n, \\t or \\r. It is still the character before the path, so the path
  is still absolute.

Chunked output
  Crew streams agent text in chunks, so a recorded path can be split across
  two JSONL lines. The spike fixture had "DONE /Users/" and the first letters
  of the name on one line and the rest of the name on the next. The first line holds `/Users/<name>` with a
  shorter name and must be flagged; the generators reach this case whenever
  the name ends its JSON value. A split at or before the slash after "Users"
  leaves no home path on either line. A line-based scan can't see it, and
  the property does not claim it.

This file is not a fixture, so the home paths written in it are allowed.
"""

from __future__ import annotations

import importlib.util
import json
import string
import sys
from pathlib import Path
from typing import List, NamedTuple, Optional, Set, Tuple, Union

import pytest
from hypothesis import assume, given
from hypothesis import strategies as st

SCRIPT = Path(__file__).resolve().parents[1] / "secret_scan.py"


def _load_scanner():
    if "secret_scan" in sys.modules:
        return sys.modules["secret_scan"]
    spec = importlib.util.spec_from_file_location("secret_scan", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["secret_scan"] = module  # dataclasses look the module up here
    spec.loader.exec_module(module)
    return module


ss = _load_scanner()
RULE = ss.HOME_PATH_RULE
FIXTURE = "fixtures/replay/demo.jsonl"


def _home_findings(path: str, text: str) -> List[object]:
    return [finding for finding in ss.scan_text(path, text) if finding.pattern == RULE]


# --- Fixture file names ------------------------------------------------------

_SLUG = string.ascii_lowercase + string.digits + "_-"


@st.composite
def _fixture_path(draw) -> str:
    """A recorded fixture: under a `fixtures` folder, or named fixture*."""
    stem = draw(st.text(_SLUG, min_size=1, max_size=12))
    ext = draw(st.sampled_from([".jsonl", ".json", ".txt", ".log", ""]))
    folder = draw(
        st.sampled_from(
            [
                "fixtures",
                "fixtures/replay",
                "spikes/fixtures",
                "app/ui/replay",
                "app/ui/replay/public",
                "app/ui/dist-replay",
            ]
        )
    )
    if "fixtures" in folder:
        name = stem + ext
    else:
        name = "fixture" + draw(st.sampled_from(["", "-" + stem, "_" + stem])) + ext
    # Hook mode passes absolute paths, which start with a home folder themselves.
    root = draw(st.sampled_from(["", "./", "/Users/alice/repo/", "/home/bob/src/", "C:\\Users\\dana\\repo\\"]))
    sep = "\\" if root.startswith("C:") else "/"
    return root + sep.join(folder.split("/") + [name])


# --- Surrounding text --------------------------------------------------------

PRINTABLE = "".join(c for c in string.printable if c not in "\n\r\x0b\x0c")

# Pieces of home paths on their own, so the surroundings sit close to a match.
_NEAR_MISSES = st.sampled_from(
    [
        "Users", "home", "/", "\\", "~", "~/", ":", "C:", "file://", "/Users", "/home",
        "~/Users/al", "src/home/al.ts", "./Users/al", "http://127.0.0.1:3000/home/al",
        "\\n", "\\/", '"',
    ]
)
_WORD = st.one_of(
    st.text(PRINTABLE, max_size=12),
    st.text(st.characters(codec="utf-8", exclude_categories=("Cc", "Cs")), max_size=12),
    _NEAR_MISSES,
)
_FILLER = st.lists(_WORD, max_size=6).map("".join)


class JsonLine(NamedTuple):
    """One recorded frame: {"t": ..., "frame": {"type": ..., "data": {...}}}."""

    t: float
    kind: str
    extra: Tuple[Tuple[str, str], ...]
    text: str
    ensure_ascii: bool
    escape_slashes: bool

    def render(self, text: Optional[str] = None) -> str:
        data = dict(self.extra)
        data["text"] = self.text if text is None else text
        frame = {"type": self.kind, "data": data}
        line = json.dumps({"t": self.t, "frame": frame}, ensure_ascii=self.ensure_ascii)
        # "\/" is a legal JSON escape; some encoders write every slash that way.
        return line.replace("/", "\\/") if self.escape_slashes else line


_JSON_LINE = st.builds(
    JsonLine,
    t=st.floats(0, 4e9, allow_nan=False, allow_infinity=False),
    kind=st.sampled_from(["subagent_chunk", "chat_chunk", "tool_call", "session_update"]),
    extra=st.dictionaries(st.sampled_from(["id", "slot", "cwd", "path", "url"]), _FILLER, max_size=2).map(
        lambda extra: tuple(extra.items())
    ),
    text=_FILLER,
    ensure_ascii=st.booleans(),
    escape_slashes=st.booleans(),
)

Line = Union[str, JsonLine]  # a plain text line or a JSON line


def _render(line: Line) -> str:
    return line if isinstance(line, str) else line.render()


# --- Strategy A: one absolute home path in a fixture ---------------------------

NAME_FIRST = string.ascii_letters + string.digits + "_-"
NAME_CHARS = NAME_FIRST + "."
SEGMENT_CHARS = string.ascii_letters + string.digits + "._- "

# Characters that may sit just before an absolute path. In JSON, "\n" is
# written as the escape \n, so the raw character before the path is "n".
BOUNDARIES = [" ", "\t", "\r", '"', "'", "=", ":", "(", "[", "<", ">", ",", ";", "|", "`", "*"]
JSON_BOUNDARIES = BOUNDARIES + ["\n"]


@st.composite
def _user_name(draw) -> str:
    return draw(st.sampled_from(NAME_FIRST)) + draw(st.text(NAME_CHARS, max_size=31))


@st.composite
def _home_path(draw) -> str:
    """/Users/<name>, /home/<name>, X:\\Users\\<name> or X:/Users/<name>, maybe more."""
    drive = draw(st.sampled_from(string.ascii_letters))
    head = draw(st.sampled_from(["/Users/", "/home/", drive + ":\\Users\\", drive + ":/Users/"]))
    sep = "\\" if "\\" in head else "/"
    rest = draw(st.lists(st.text(SEGMENT_CHARS, min_size=1, max_size=10), max_size=3))
    path = head + draw(_user_name()) + "".join(sep + part for part in rest) + draw(st.sampled_from(["", sep]))
    if sep == "/" and draw(st.booleans()):
        path = ("file://" if path.startswith("/") else "file:///") + path
    return path


class Placed(NamedTuple):
    without: str  # the fixture text with the home path left out
    text: str  # the same text with the home path in it
    line: int  # 1-based line that holds the home path


@st.composite
def _fixture_with_home_path(draw) -> Placed:
    home = draw(_home_path())
    lines: List[Line] = draw(st.lists(st.one_of(_FILLER, _JSON_LINE), min_size=1, max_size=6))
    index = draw(st.integers(0, len(lines) - 1))
    target = lines[index]
    if isinstance(target, str):
        column = draw(st.integers(0, len(target)))
        left, right = target[:column], target[column:]
        boundaries, place = BOUNDARIES, (lambda value: value)
    else:
        left, right = draw(_FILLER), draw(_FILLER)
        boundaries, place = JSON_BOUNDARIES, target.render
    # Nothing at all before the path is fine too: start of the line or of the value.
    boundary = draw(st.sampled_from(boundaries if left else [""] + boundaries))
    rendered = [_render(line) for line in lines]
    end = draw(st.sampled_from(["", "\n"]))

    def assemble(target_line: str) -> str:
        return "\n".join(rendered[:index] + [target_line] + rendered[index + 1 :]) + end

    return Placed(assemble(place(left + right)), assemble(place(left + boundary + home + right)), index + 1)


# --- Strategy B: home references written only as ~/ ------------------------------


class Token(NamedTuple):
    text: str  # a ~/ path, or a path or URL that is not an absolute home path


@st.composite
def _tilde_path(draw) -> str:
    segments = draw(
        st.lists(st.one_of(st.sampled_from(["Users", "home", "work", ".kirocrew", "logs"]), _user_name()), max_size=4)
    )
    return "~/" + "/".join(segments) + (draw(st.sampled_from(["", "/"])) if segments else "")


@st.composite
def _not_home_path(draw) -> str:
    name = draw(_user_name())
    return draw(
        st.sampled_from(
            [
                f"src/home/{name}.ts",
                f"./Users/{name}",
                f"../home/{name}",
                f"docs/Users/{name}",
                f"http://127.0.0.1:3000/home/{name}",
                f"https://example.invalid/Users/{name}",
            ]
        )
    )


_TOKEN = st.one_of(_tilde_path(), _tilde_path(), _not_home_path()).map(Token)

# Separators keep a token from gluing to the text beside it. None of them is a
# letter, digit, "/" or "\", so none can start or extend a home path.
SEPARATORS = [" ", "\t", ", ", "; ", " | ", '"', "'", "="]
JSON_SEPARATORS = SEPARATORS + ["\n", "\r"]

Parts = List[Union[str, Token]]


@st.composite
def _parts(draw, separators: List[str]) -> Parts:
    parts: Parts = [draw(_FILLER)]
    for _ in range(draw(st.integers(0, 3))):
        parts += [draw(st.sampled_from(separators)), draw(_TOKEN), draw(st.sampled_from(separators)), draw(_FILLER)]
    return parts


def _join(parts: Parts, keep_tokens: bool) -> str:
    pieces = []
    for part in parts:
        if not isinstance(part, Token):
            pieces.append(part)
        elif keep_tokens:
            pieces.append(part.text)
    return "".join(pieces)


@st.composite
def _fixture_with_tilde_paths(draw) -> Tuple[str, str]:
    """(the text without its tokens, the text with them)."""
    lines: List[Tuple[Optional[JsonLine], Parts]] = list(draw(
        st.lists(
            st.one_of(
                _parts(SEPARATORS).map(lambda parts: (None, parts)),
                st.tuples(_JSON_LINE, _parts(JSON_SEPARATORS)),
            ),
            min_size=1,
            max_size=6,
        )
    ))
    # At least one ~/ reference, so the property is never checked on no input.
    index = draw(st.integers(0, len(lines) - 1))
    frame, parts = lines[index]
    separators = SEPARATORS if frame is None else JSON_SEPARATORS
    tilde = Token(draw(_tilde_path()))
    lines[index] = (frame, parts + [draw(st.sampled_from(separators)), tilde, draw(st.sampled_from(separators)), draw(_FILLER)])
    end = draw(st.sampled_from(["", "\n"]))

    def assemble(keep_tokens: bool) -> str:
        rendered = []
        for frame, parts in lines:
            text = _join(parts, keep_tokens)
            rendered.append(text if frame is None else frame.render(text))
        return "\n".join(rendered) + end

    return assemble(False), assemble(True)


# --- Tests -------------------------------------------------------------------------


def test_this_file_passes_the_scan():
    assert ss.scan_file(__file__) == []


# Feature: crew-app-foundation, Property 10: Home paths in fixtures are flagged
@given(path=_fixture_path(), case=_fixture_with_home_path())
def test_absolute_home_path_in_a_fixture_is_flagged(path, case):
    assume(not _home_findings(path, case.without))
    assert _home_findings(path, case.text) == [ss.Finding(path, case.line, RULE)]


# Feature: crew-app-foundation, Property 10: Home paths in fixtures are flagged
@given(path=_fixture_path(), case=_fixture_with_tilde_paths())
def test_tilde_home_paths_in_a_fixture_are_not_flagged(path, case):
    without, text = case
    assume(not _home_findings(path, without))
    assert _home_findings(path, text) == []


@pytest.mark.parametrize(
    "line",
    [
        "/Users/al",
        "cd /home/a",
        '{"text": "DONE /Users/al"}',
        "C:\\Users\\a",
        '{"cwd": "C:\\\\Users\\\\a"}',
        "C:/Users/a",
    ],
)
def test_bare_home_path_at_the_end_of_a_string_is_flagged(line):
    assert _home_findings(FIXTURE, line) == [ss.Finding(FIXTURE, 1, RULE)]


@pytest.mark.parametrize(
    "line, flagged",
    [
        # Counterexamples Hypothesis found against the first version of the rule.
        ('{"text": "0\\t/Users/a"}', True),  # JSON-escaped tab before the path
        ('{"text": "$ pwd\\n\\/home\\/bob"}', True),  # escaped newline and slashes
        ('{"text": " ~\\/Users\\/Users "}', False),  # ~/ with escaped slashes
        ('{"f": "src\\/home\\/al.ts"}', False),
        ('{"u": "http:\\/\\/127.0.0.1:3000\\/home\\/al"}', False),
    ],
)
def test_json_escapes_before_the_path(line, flagged):
    assert _home_findings(FIXTURE, line) == ([ss.Finding(FIXTURE, 1, RULE)] if flagged else [])


def test_home_path_split_across_chunks_flags_the_chunk_with_the_name():
    def chunk(text: str) -> str:
        data = {"id": "3219cc19a0d80bea", "slot": "", "text": text}
        return json.dumps({"t": 1.5, "frame": {"type": "subagent_chunk", "data": data}})

    text = chunk("DONE /Users/al") + "\n" + chunk("ice/work/app") + "\n"
    assert ss.scan_text(FIXTURE, text) == [ss.Finding(FIXTURE, 1, RULE)]
