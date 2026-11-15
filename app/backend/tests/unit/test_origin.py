"""Example tests for haunted_house.core.origin.is_loopback_origin."""

import pytest

from haunted_house.core.origin import is_loopback_origin

pytestmark = pytest.mark.core


@pytest.mark.parametrize(
    "origin",
    [
        "http://127.0.0.1:5476",
        "http://127.0.0.1:5476/",
        "http://localhost:1",
        "http://[::1]:65535",
    ],
)
def test_accepts_loopback_origins(origin):
    assert is_loopback_origin(origin)


@pytest.mark.parametrize(
    "origin",
    [
        None,
        "",
        "http://127.0.0.1",  # no port
        "http://127.0.0.1:",
        "http://127.0.0.1:0",
        "http://127.0.0.1:65536",
        "http://127.0.0.1:05476",
        "https://127.0.0.1:5476",
        "http://127.0.0.2:5476",
        "http://0.0.0.0:5476",
        "http://example.com:5476",
        "http://localhost.example.com:5476",
        "http://127.0.0.1.example.com:5476",
        "http://user@127.0.0.1:5476",
        "http://127.0.0.1:5476@example.com",
        "http://127.0.0.1:5476/api",
        "http://127.0.0.1:5476//",
        "http://127.0.0.1:5476?x=1",
        "http://127.0.0.1:5476#x",
        "http://127.0.0.1:5476\n",
        " http://127.0.0.1:5476",
        "http://::1:5476",
        "http://127.0.0.1:\u0665\u0664\u0667\u0666",  # non-ASCII digits
    ],
)
def test_rejects_everything_else(origin):
    assert not is_loopback_origin(origin)
