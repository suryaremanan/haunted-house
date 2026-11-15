"""Property test for the Publication_Gate classifier (scripts/lib/publication_contract.py).

Feature: replay-and-submission, Property 5: Publication classification rejects every prohibited disclosure or transport

For all bounded fixture and static-artifact file sets, planting a recognized
credential or encoded credential, absolute macOS/Linux/Windows Home_Path,
localhost Gateway origin, external runtime asset, path-escaping reference,
executable live SDK/Gateway transport, symlink, or hard link causes
Publication_Gate to return a non-empty category-only finding and no accepted
artifact; clean canonical synthetic fixture and relative regular-file asset
graphs remain accepted, and findings contain none of the planted sensitive
value.

**Validates: Requirements 4.9, 5.3, 5.5, 11.5**

Every credential and home path is generated at run time, and rule keywords are
split into fragments, so this file never trips the repository scan itself.
Nothing is written: the artifact is a list of in-memory file facts.
"""

from __future__ import annotations

import base64
import string
import sys
from dataclasses import dataclass, replace
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from hypothesis import given, settings
from hypothesis import strategies as st

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

import publication_contract as contract  # noqa: E402
from publication_contract import ArtifactFile, classify_publication  # noqa: E402
from publication_io import FIXTURE, fixture_codec, load_scanner  # noqa: E402

SCANNER = load_scanner()
SCAN = SCANNER.scan_text
FIXTURE_BYTES = FIXTURE.read_bytes()
FIXTURE_PATH = "fixtures/replay/demo.jsonl"

ALNUM = string.ascii_letters + string.digits
UPPER = string.ascii_uppercase + string.digits
HASH = st.text(ALNUM, min_size=8, max_size=8)
# Filler a minified bundle is full of. It holds a route constant and the XML
# namespaces React embeds, which are text and not transports or assets.
WORD = st.sampled_from(
    [
        "const a=1;",
        "function render(e){return e}",
        'const ns="http://www.w3.org/2000/svg";',
        'const route="/apps/haunted-house/api/whoami";',
        'const docs="https://react.dev/errors/";',
        "export{render as default};",
        '"Event 3 of 64"',
        "/* séance */",
    ]
)
FILLER = st.lists(WORD, max_size=6).map("".join)


@lru_cache(maxsize=64)
def codec_of(data: bytes):
    return fixture_codec(data)


def gate(files: list[ArtifactFile], fixture: bytes = FIXTURE_BYTES):
    return classify_publication(
        fixture_path=FIXTURE_PATH, fixture=fixture, codec=codec_of(fixture), scan=SCAN, artifact=files
    )


@dataclass(frozen=True)
class Graph:
    """A clean replay build: one page, one module, optional stylesheet and image, the fixture."""

    script: str
    style: str | None
    image: str | None
    files: tuple[ArtifactFile, ...]

    def with_text(self, path: str, change) -> "Graph":
        files = tuple(
            replace(file, data=change(file.data.decode("utf-8")).encode("utf-8")) if file.path == path else file
            for file in self.files
        )
        return replace(self, files=files)

    def with_file(self, file: ArtifactFile) -> "Graph":
        return replace(self, files=(*[kept for kept in self.files if kept.path != file.path], file))


@st.composite
def graphs(draw) -> Graph:
    script = f"assets/index-{draw(HASH)}.js"
    style = f"assets/index-{draw(HASH)}.css" if draw(st.booleans()) else None
    image = f"assets/ghost-{draw(HASH)}.svg" if draw(st.booleans()) else None
    head = ['<meta charset="utf-8" />', "<title>Haunted House replay</title>"]
    head.append(f'<script type="module" crossorigin src="./{script}"></script>')
    if style:
        head.append(f'<link rel="stylesheet" crossorigin href="./{style}">')
    body = ['<div id="root"></div>']
    if draw(st.booleans()):
        # A link a person may follow is not a runtime asset.
        body.append('<a href="https://github.com/example/haunted-house">Source</a>')
    page = "<!doctype html>\n<html lang=\"en\">\n<head>\n" + "\n".join(head) + "\n</head>\n<body>\n" + "\n".join(body) + "\n</body>\n</html>\n"

    module = draw(FILLER) + 'const log=fetch("./fixture.jsonl");' + draw(FILLER)
    if image and draw(st.booleans()):
        module += f'const art=new URL("./{image.split("/")[1]}",import.meta.url).href;'
    files = [
        ArtifactFile("index.html", data=page.encode()),
        ArtifactFile(script, data=module.encode()),
        ArtifactFile("fixture.jsonl", data=FIXTURE_BYTES),
    ]
    if draw(st.booleans()):
        files.append(ArtifactFile(".nojekyll", data=b""))
    if style:
        rule = f"body{{background:url(./{image.split('/')[1]})}}" if image else "body{margin:0}"
        files.append(ArtifactFile(style, data=rule.encode()))
    if image:
        files.append(ArtifactFile(image, data=b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M1 1h6v6H1z"/></svg>'))
    return Graph(script, style, image, tuple(files))


@dataclass(frozen=True)
class Planted:
    """One prohibited thing put into a clean build."""

    graph: Graph
    fixture: bytes
    # At least these categories must be reported.
    categories: frozenset[str]
    # Text that must not appear in any finding.
    sensitive: tuple[str, ...] = ()


# --- Sensitive values, built at run time ---------------------------------------


@st.composite
def credentials(draw) -> str:
    kind = draw(st.integers(0, 4))
    if kind == 0:
        return draw(st.sampled_from(["AK" + "IA", "AS" + "IA"])) + draw(st.text(UPPER, min_size=16, max_size=16))
    if kind == 1:
        return "gh" + draw(st.sampled_from("pousr")) + "_" + draw(st.text(ALNUM, min_size=36, max_size=40))
    if kind == 2:
        return "xox" + draw(st.sampled_from("abprs")) + "-" + draw(st.text(ALNUM, min_size=12, max_size=24))
    if kind == 3:
        dashes = "-" * 5
        return f"{dashes}BEGIN {draw(st.sampled_from(['RSA', 'EC', 'OPENSSH']))} PRIVATE KEY{dashes}"
    # The scanner skips masks and placeholders such as 0000… or changeme: those are not secrets.
    value = draw(st.text(ALNUM, min_size=20, max_size=32).filter(lambda text: not SCANNER.is_placeholder(text, True)))
    return draw(st.sampled_from(["pass" + "word", "api" + "_key", "tok" + "en"])) + '="' + value + '"'


def secret_part(credential: str) -> str:
    """The part of a planted credential that is secret: never the rule keyword alone."""

    return credential.split('"')[1] if '"' in credential else credential


HOME_NAME = st.text(string.ascii_lowercase, min_size=6, max_size=10).map(lambda name: "zq" + name)


@st.composite
def home_paths(draw) -> tuple[str, str]:
    name = draw(HOME_NAME)
    rest = draw(st.sampled_from(["notes", "work/project", "Desktop"]))
    shape = draw(st.integers(0, 5))
    if shape == 0:
        return "/".join(["", "Users", name, rest]), name
    if shape == 1:
        return "/".join(["", "home", name, rest]), name
    if shape == 2:
        return "\\".join(["C:", "Users", name, "Desktop"]), name
    if shape == 3:  # JSON-escaped slashes
        return "\\/".join(["", "Users", name, rest]), name
    if shape == 4:  # JSON-escaped backslashes
        return "\\\\".join(["D:", "Users", name, "Desktop"]), name
    return "/".join(["C:", "Users", name, rest]), name


def encode(draw, text: str) -> str:
    how = draw(st.integers(0, 4))
    raw = text.encode("utf-8")
    if how == 0:
        return base64.b64encode(raw).decode()
    if how == 1:
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")
    if how == 2:
        return raw.hex()
    if how == 3:
        return "".join(f"%{byte:02X}" for byte in raw)
    return quote(text, safe="") if quote(text, safe="") != text else "".join(f"\\u{ord(char):04x}" for char in text)


def in_fixture(draw, text: str) -> bytes:
    """The fixture with `text` put inside one record, as a hand edit would."""

    lines = FIXTURE_BYTES.split(b"\n")
    at = draw(st.integers(0, len(lines) - 2))
    lines[at] = lines[at].replace(b'"payload":{', b'"payload":{"note":"' + text.replace('"', "'").encode("utf-8") + b'",', 1)
    return b"\n".join(lines)


@st.composite
def planted(draw) -> Planted:
    graph: Graph = draw(graphs())
    kind = draw(
        st.sampled_from(
            [
                "credential",
                "encoded",
                "home",
                "localhost",
                "remote",
                "escape",
                "transport",
                "symlink",
                "hardlink",
                "fixture",
            ]
        )
    )
    script = graph.script
    append = lambda text: (lambda content: content + text)  # noqa: E731

    def into(text: str, categories: set[str], sensitive: tuple[str, ...]) -> Planted:
        """Puts sensitive text into the module, the page or the fixture."""

        where = draw(st.sampled_from(["script", "page", "fixture"]))
        if where == "fixture":
            data = in_fixture(draw, text)
            return Planted(graph.with_file(ArtifactFile("fixture.jsonl", data=data)), data, frozenset(categories), sensitive)
        if where == "page":
            changed = graph.with_text("index.html", lambda page: page.replace("</body>", f"<!-- {text} -->\n</body>"))
        else:
            changed = graph.with_text(script, append(f"const note='{text}';"))
        return Planted(changed, FIXTURE_BYTES, frozenset(categories), sensitive)

    if kind == "credential":
        credential = draw(credentials())
        return into(credential, {contract.CREDENTIAL}, (secret_part(credential),))
    if kind == "encoded":
        credential = draw(credentials())
        encoded = encode(draw, credential)
        return into(encoded, {contract.ENCODED_CREDENTIAL}, (secret_part(credential), encoded))
    if kind == "home":
        path, name = draw(home_paths())
        if draw(st.booleans()):
            return into(path, {contract.HOME_PATH}, (name,))
        return into(encode(draw, path), {contract.HOME_PATH}, (name,))
    if kind == "localhost":
        scheme = draw(st.sampled_from(["http", "https", "ws", "wss"]))
        host = draw(st.sampled_from(["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "LOCALHOST"]))
        port = draw(st.integers(1024, 65535))
        origin = f"{scheme}://{host}:{port}"
        changed = graph.with_text(script, append(f'const gateway="{origin}/api/chat";'))
        return Planted(changed, FIXTURE_BYTES, frozenset({contract.LOCALHOST_ORIGIN}))
    if kind == "remote":
        host = "cdn-" + draw(st.text(string.ascii_lowercase, min_size=4, max_size=8)) + ".invalid"
        how = draw(st.integers(0, 6))
        if how == 0:
            changed = graph.with_text("index.html", lambda page: page.replace("</head>", f'<script src="https://{host}/lib.js"></script>\n</head>'))
        elif how == 1:
            changed = graph.with_text("index.html", lambda page: page.replace("</head>", f'<link rel="stylesheet" href="//{host}/fonts.css">\n</head>'))
        elif how == 2:
            changed = graph.with_text("index.html", lambda page: page.replace("</body>", f'<img src="https://{host}/ghost.png" alt="">\n</body>'))
        elif how == 3:
            changed = graph.with_text(script, append(f'import("https://{host}/chunk.js");'))
        elif how == 4:
            changed = graph.with_text(script, append(f'const font="https://{host}/f/haunt.woff2";'))
        elif how == 5:
            changed = graph.with_text(script, append(f'fetch("https://{host}/api/events");'))
        else:
            changed = graph.with_file(ArtifactFile("assets/extra.css", data=f"@font-face{{src:url(https://{host}/a.woff2)}}".encode()))
        return Planted(changed, FIXTURE_BYTES, frozenset({contract.REMOTE_ASSET}))
    if kind == "escape":
        how = draw(st.integers(0, 6))
        name = draw(HASH)
        if how == 0:
            changed = graph.with_text("index.html", lambda page: page.replace("</head>", f'<script src="../{name}.js"></script>\n</head>'))
            expected = contract.PATH_ESCAPE
        elif how == 1:
            changed = graph.with_text("index.html", lambda page: page.replace("</body>", f'<img src="./assets/../../{name}.png" alt="">\n</body>'))
            expected = contract.PATH_ESCAPE
        elif how == 2:
            changed = graph.with_text("index.html", lambda page: page.replace("</body>", f'<img src="%2e%2e/{name}.png" alt="">\n</body>'))
            expected = contract.PATH_ESCAPE
        elif how == 3:
            changed = graph.with_text(script, append(f'const art=new URL("../../{name}.svg",import.meta.url);'))
            expected = contract.PATH_ESCAPE
        elif how == 4:
            changed = graph.with_text("index.html", lambda page: page.replace("</head>", f'<script src="/assets/{name}.js"></script>\n</head>'))
            expected = contract.ABSOLUTE_REFERENCE
        elif how == 5:
            changed = graph.with_text("index.html", lambda page: page.replace("</head>", f'<script type="module" src="./assets/missing-{name}.js"></script>\n</head>'))
            expected = contract.MISSING_ASSET
        else:
            changed = graph.with_text(script, append(f'fetch("../{name}.jsonl");'))
            expected = contract.PATH_ESCAPE
        return Planted(changed, FIXTURE_BYTES, frozenset({expected}))
    if kind == "transport":
        code, expected = draw(
            st.sampled_from(
                [
                    ("new WebSocket(u);", contract.LIVE_TRANSPORT),
                    ("const s=new EventSource(u);", contract.LIVE_TRANSPORT),
                    ("const x=new XMLHttpRequest;x.open('GET',u);", contract.LIVE_TRANSPORT),
                    ("navigator.sendBeacon(u,d);", contract.LIVE_TRANSPORT),
                    ("const W=WebSocket;new W(u);", contract.LIVE_TRANSPORT),
                    ("navigator.serviceWorker.register(u);", contract.SERVICE_WORKER),
                    ('import{useAppApi}from"@kiro' + 'crew/app-sdk";', contract.LIVE_SDK_IMPORT),
                ]
            )
        )
        if draw(st.booleans()):
            changed = graph.with_text(script, append(code))
        else:
            changed = graph.with_text("index.html", lambda page: page.replace("</body>", f"<script>{code}</script>\n</body>"))
        return Planted(changed, FIXTURE_BYTES, frozenset({expected}))
    if kind == "symlink":
        target = draw(st.sampled_from([file.path for file in graph.files] + ["assets/linked.js", "linked-folder"]))
        return Planted(graph.with_file(ArtifactFile(target, kind="symlink")), FIXTURE_BYTES, frozenset({contract.SYMLINK}))
    if kind == "hardlink":
        file = draw(st.sampled_from(graph.files))
        linked = replace(file, link_count=draw(st.integers(2, 6)))
        return Planted(graph.with_file(linked), FIXTURE_BYTES, frozenset({contract.HARD_LINK}))
    # The built copy of the fixture is not the approved fixture.
    if draw(st.booleans()):
        other = FIXTURE_BYTES + b"\n" if draw(st.booleans()) else FIXTURE_BYTES[: -draw(st.integers(1, 200))]
        return Planted(graph.with_file(ArtifactFile("fixture.jsonl", data=other)), FIXTURE_BYTES, frozenset({contract.FIXTURE_MISMATCH}))
    return Planted(
        replace(graph, files=tuple(file for file in graph.files if file.path != "fixture.jsonl")),
        FIXTURE_BYTES,
        frozenset({contract.FIXTURE_MISSING}),
    )


@settings(max_examples=200)
@given(clean=graphs(), bad=planted())
def test_publication_gate_fails_closed_and_never_echoes(clean: Graph, bad: Planted) -> None:
    # A clean canonical fixture and a relative regular-file graph are accepted.
    accepted = gate(list(clean.files))
    assert accepted.findings == ()
    assert accepted.accepted
    assert set(accepted.accepted_paths) == {FIXTURE_PATH, *(file.path for file in clean.files)}

    # One planted violation: findings, the expected category, and no accepted artifact.
    report = gate(list(bad.graph.files), bad.fixture)
    assert not report.accepted
    assert report.accepted_paths == ()
    assert report.findings
    assert bad.categories <= report.categories, (sorted(bad.categories), sorted(report.categories))
    assert report.categories <= contract.CATEGORIES

    # Findings are a path, a line and a category: nothing planted is in them.
    shown = "\n".join(str(finding) for finding in report.findings) + repr(report.findings)
    for value in bad.sensitive:
        assert value not in shown
    for finding in report.findings:
        assert set(vars(finding)) == {"path", "line", "category"}
        assert finding.line >= 1


def test_this_file_passes_the_scan() -> None:
    assert SCAN("scripts/tests/property/test_publication_contract.py", Path(__file__).read_text(encoding="utf-8")) == []
