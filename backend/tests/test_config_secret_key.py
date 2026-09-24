"""Security tests for runtime SECRET_KEY loading."""

from app.core.config import Settings

import pytest


SAFE_SECRET_KEY_VALUE = "-".join(["test", "signing", "value", "with", "32", "chars"])
DEFAULT_SECRET_KEY_VALUE = "-".join(["your", "secret", "key", "change", "in", "production"])


def test_settings_requires_secret_key(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)

    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(_env_file=None)


@pytest.mark.parametrize(
    "secret_key",
    [
        "",
        "   ",
        "short-secret",
        DEFAULT_SECRET_KEY_VALUE,
    ],
)
def test_settings_rejects_unsafe_secret_key_values(secret_key):
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(secret_key=secret_key, _env_file=None)


def test_settings_accepts_strong_secret_key():
    settings = Settings(secret_key=SAFE_SECRET_KEY_VALUE, _env_file=None)

    assert settings.secret_key == SAFE_SECRET_KEY_VALUE
