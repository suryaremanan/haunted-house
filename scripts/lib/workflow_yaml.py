"""A strict reader for the YAML subset used by this repo's GitHub workflow files.

The workflow policy tests (scripts/tests/test_pages_workflow.py and
test_ci_contract.py) must read .github/workflows/*.yml, and the repo's test
dependencies hold no YAML library. This reader accepts only what those two
files use and raises `WorkflowYamlError` on anything else, so a construct it
cannot read can never pass a policy test unread:

  - block mappings and block sequences, indented with spaces;
  - `- key: value` sequence items that continue as a mapping;
  - plain, single-quoted and double-quoted scalars; `true`, `false`, integers;
  - an empty value (null) and one-line flow sequences `[a, b]`;
  - literal block scalars (`|`);
  - full-line and trailing comments.

Anchors, aliases, tags, flow mappings, folded scalars, multi-document files,
tabs and duplicate keys are refused. Every key is kept as a string, so the
`on` key stays `"on"`.

Stdlib only. Pure: text in, plain values out.
"""

from __future__ import annotations

import re
from typing import Any

__all__ = ["WorkflowYamlError", "parse_workflow"]


class WorkflowYamlError(ValueError):
    """The text uses YAML this reader does not accept."""


_KEY = re.compile(r"""(?P<key>[A-Za-z_][A-Za-z0-9_.-]*|'[^']*'|"[^"]*")\s*:(?:\s+(?P<value>.*)|\s*)$""")
_INT = re.compile(r"-?(?:0|[1-9][0-9]*)")
_FORBIDDEN_START = ("&", "*", "!", "{", ">", "%", "@", "`", "?")


def _strip_comment(text: str) -> str:
    """Remove a trailing ` # comment` that is outside quotes."""

    quote = ""
    for index, char in enumerate(text):
        if quote:
            if char == quote:
                quote = ""
        elif char in "'\"":
            quote = char
        elif char == "#" and (index == 0 or text[index - 1] in " \t"):
            return text[:index].rstrip()
    return text.rstrip()


def _scalar(text: str, line: int) -> Any:
    text = text.strip()
    if text == "" or text in ("~", "null"):
        return None
    if text[0] in "'\"":
        if len(text) < 2 or text[-1] != text[0]:
            raise WorkflowYamlError(f"line {line}: unterminated quoted scalar")
        body = text[1:-1]
        if text[0] == "'":
            return body.replace("''", "'")
        if "\\" in body:
            raise WorkflowYamlError(f"line {line}: escapes in double quotes are not supported")
        return body
    if text.startswith("["):
        if not text.endswith("]"):
            raise WorkflowYamlError(f"line {line}: a flow sequence must end on its own line")
        inner = text[1:-1].strip()
        if not inner:
            return []
        if any(char in inner for char in "[]{}"):
            raise WorkflowYamlError(f"line {line}: nested flow collections are not supported")
        return [_scalar(part, line) for part in inner.split(",")]
    if text.startswith("${{"):
        return text
    if text[0] in _FORBIDDEN_START or text in ("|", ">") or text.startswith(("|", ">")):
        raise WorkflowYamlError(f"line {line}: unsupported YAML construct")
    if text == "true":
        return True
    if text == "false":
        return False
    if _INT.fullmatch(text):
        return int(text)
    return text


class _Reader:
    def __init__(self, text: str) -> None:
        if "\t" in text:
            raise WorkflowYamlError("tabs are not supported")
        self.raw = text.split("\n")
        self.index = 0

    def _significant(self) -> tuple[int, str] | None:
        """Indent and stripped text of the next non-blank, non-comment line, without consuming it."""

        while self.index < len(self.raw):
            line = self.raw[self.index]
            stripped = line.strip()
            if stripped == "" or stripped.startswith("#"):
                self.index += 1
                continue
            if stripped in ("---", "..."):
                raise WorkflowYamlError(f"line {self.index + 1}: multi-document files are not supported")
            return len(line) - len(line.lstrip(" ")), _strip_comment(line.strip())
        return None

    def block(self, indent: int) -> Any:
        head = self._significant()
        if head is None or head[0] < indent:
            return None
        if head[1].startswith("- ") or head[1] == "-":
            return self.sequence(head[0])
        return self.mapping(head[0])

    def mapping(self, indent: int) -> dict[str, Any]:
        result: dict[str, Any] = {}
        while True:
            head = self._significant()
            if head is None or head[0] < indent:
                return result
            if head[0] > indent:
                raise WorkflowYamlError(f"line {self.index + 1}: unexpected indentation")
            if head[1].startswith("- "):
                raise WorkflowYamlError(f"line {self.index + 1}: a sequence item where a key was expected")
            key, value = self.pair(head[1], indent)
            if key in result:
                raise WorkflowYamlError(f"line {self.index}: duplicate key")
            result[key] = value

    def pair(self, text: str, indent: int) -> tuple[str, Any]:
        """Consume one `key: value` whose key starts at column `indent`."""

        line = self.index + 1
        match = _KEY.match(text)
        if match is None:
            raise WorkflowYamlError(f"line {line}: expected `key: value`")
        key = match.group("key")
        if key[0] in "'\"":
            key = key[1:-1]
        value = (match.group("value") or "").strip()
        self.index += 1
        if value == "|":
            return key, self.literal(indent)
        if value != "":
            return key, _scalar(value, line)
        head = self._significant()
        if head is not None and head[0] > indent:
            return key, self.block(head[0])
        if head is not None and head[0] == indent and (head[1].startswith("- ") or head[1] == "-"):
            # A sequence may sit at its key's own indentation.
            return key, self.sequence(indent)
        return key, None

    def literal(self, parent_indent: int) -> str:
        lines: list[str] = []
        block_indent: int | None = None
        while self.index < len(self.raw):
            line = self.raw[self.index]
            if line.strip() == "":
                lines.append("")
                self.index += 1
                continue
            indent = len(line) - len(line.lstrip(" "))
            if indent <= parent_indent:
                break
            if block_indent is None:
                block_indent = indent
            if indent < block_indent:
                raise WorkflowYamlError(f"line {self.index + 1}: a block scalar line is indented less than its first line")
            lines.append(line[block_indent:])
            self.index += 1
        while lines and lines[-1] == "":
            lines.pop()
        return "\n".join(lines) + "\n" if lines else ""

    def sequence(self, indent: int) -> list[Any]:
        result: list[Any] = []
        while True:
            head = self._significant()
            if head is None or head[0] < indent:
                return result
            if head[0] > indent or not (head[1].startswith("- ") or head[1] == "-"):
                raise WorkflowYamlError(f"line {self.index + 1}: expected a sequence item")
            raw = self.raw[self.index]
            item = head[1][1:].strip()
            if item == "":
                self.index += 1
                result.append(self.block(indent + 1))
            elif _KEY.match(item) and not item.startswith(("'", '"', "${{")):
                # `- key: value` opens a mapping whose keys align with `key`.
                inner = indent + (len(raw.strip()) - len(raw.strip()[1:].lstrip(" ")))
                key, value = self.pair(item, inner)
                rest = self.mapping(inner) if self._continues(inner) else {}
                if key in rest:
                    raise WorkflowYamlError(f"line {self.index}: duplicate key")
                result.append({key: value, **rest})
            else:
                self.index += 1
                result.append(_scalar(item, self.index))

    def _continues(self, indent: int) -> bool:
        head = self._significant()
        return head is not None and head[0] == indent and not head[1].startswith("- ")


def parse_workflow(text: str) -> dict[str, Any]:
    """The workflow file as plain dicts, lists, strings, booleans, integers and None."""

    reader = _Reader(text.replace("\r\n", "\n"))
    document = reader.block(0)
    if reader._significant() is not None:
        raise WorkflowYamlError(f"line {reader.index + 1}: unexpected content")
    if not isinstance(document, dict):
        raise WorkflowYamlError("a workflow file must be a mapping")
    return document
