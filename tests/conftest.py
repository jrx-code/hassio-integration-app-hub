"""Shared fixtures. Nothing here talks to a device: the integration has none.

The per-app configuration is the only payload that matters, and it is the same JSON the
card takes in YAML, so the fixture below is shaped like a real `apps:` block with the
entity ids replaced by example ones.
"""

from __future__ import annotations

from typing import Any

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.app_hub.const import (
    CONF_APPS,
    CONF_DRY_RUN,
    CONF_SIDEBAR,
    CONF_SIDEBAR_ICON,
    CONF_SIDEBAR_TITLE,
    CONF_THEME,
    DOMAIN,
)

APPS: dict[str, Any] = {
    "foxess": {"entities": {"soc": "sensor.example_soc", "pv": "sensor.example_pv"}},
    "dreame": {"devices": [{"prefix": "example_robot"}]},
}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture
def entry() -> MockConfigEntry:
    """A hub entry with the sidebar on and apps configured."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="App Hub",
        data={
            CONF_SIDEBAR: True,
            CONF_SIDEBAR_TITLE: "App-HUB",
            CONF_SIDEBAR_ICON: "mdi:apps",
            CONF_THEME: "app",
            CONF_DRY_RUN: False,
            CONF_APPS: APPS,
        },
    )
