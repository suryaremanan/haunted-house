"""Example tests for haunted_house.adapters.settings."""

import pytest

from haunted_house.adapters.settings import DEFAULT_APP_NAME, Settings, SettingsError

KEY = "k3y-for-tests"  # short on purpose: not a real credential


def test_reads_the_four_crew_variables():
    settings = Settings.from_env(
        {
            "PORT": "50123",
            "KIROCREW_PROXY_SECRET": KEY,
            "KIROCREW_GATEWAY_ORIGIN": "http://127.0.0.1:5476",
            "KIROCREW_APP_NAME": "haunted-house",
            "UNRELATED": "ignored",
        }
    )
    assert settings == Settings(
        port=50123,
        secret=KEY,
        gateway_origin="http://127.0.0.1:5476",
        app_name="haunted-house",
    )


def test_empty_or_missing_optional_values_fall_back():
    settings = Settings.from_env(
        {"PORT": "8080", "KIROCREW_PROXY_SECRET": "", "KIROCREW_GATEWAY_ORIGIN": ""}
    )
    assert settings.secret is None
    assert settings.gateway_origin is None
    assert settings.app_name == DEFAULT_APP_NAME


def test_origin_is_stored_as_given_without_validation():
    settings = Settings.from_env({"PORT": "1", "KIROCREW_GATEWAY_ORIGIN": "https://example.com"})
    assert settings.gateway_origin == "https://example.com"


@pytest.mark.parametrize("port", ["1", "65535"])
def test_accepts_ports_at_the_range_ends(port):
    assert Settings.from_env({"PORT": port}).port == int(port)


@pytest.mark.parametrize(
    "env",
    [
        pytest.param({}, id="missing"),
        pytest.param({"PORT": ""}, id="empty"),
        pytest.param({"PORT": "abc"}, id="not a number"),
        pytest.param({"PORT": "0"}, id="zero"),
        pytest.param({"PORT": "65536"}, id="too big"),
        pytest.param({"PORT": "+80"}, id="sign"),
        pytest.param({"PORT": " 80"}, id="whitespace"),
        pytest.param({"PORT": "\u0668\u0660"}, id="non-ascii digits"),
    ],
)
def test_bad_port_raises_a_clear_error(env):
    with pytest.raises(SettingsError, match="PORT"):
        Settings.from_env(env)


def test_repr_does_not_show_the_secret():
    settings = Settings.from_env({"PORT": "1", "KIROCREW_PROXY_SECRET": KEY})
    assert KEY not in repr(settings)


def test_mansion_paths_default_to_the_verified_workspace_roots():
    settings = Settings.from_env({"PORT": "8080"})

    assert settings.mansion_root == (
        settings.approved_roots[0] / "haunted-house" / "mansions"
    )
    assert tuple(path.name for path in settings.approved_roots) == (
        "workspace",
        "workspaces",
        "workplace",
        "workplaces",
    )


def test_mansion_paths_can_be_injected_without_environment_authority(tmp_path):
    approved = tmp_path / "workspace"
    root = approved / "test-mansions"

    settings = Settings.from_env(
        {
            "PORT": "8080",
            "MANSION_ROOT": "/client-controlled/path",
        },
        mansion_root=root,
        approved_roots=(approved,),
    )

    assert settings.mansion_root == root
    assert settings.approved_roots == (approved,)
