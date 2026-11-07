"""Serve the App Hub bundle and register the card and the sidebar panel.

The bundle (card, dashboard strategy, core, app modules, artwork) ships inside this
integration, so one install brings everything and no file is copied into /config/www.

Two entry points, from the same JavaScript:
  - the card: add_extra_js_url loads it on every frontend load, so `custom:app-hub-card`
    is in the card picker and the dashboard strategy is registered, with no Lovelace
    resource to manage,
  - the panel: a sidebar entry that opens the launcher full screen. A custom panel gets the
    `hass` object and the active theme like any built-in panel, and it has no dashboard
    toolbar, so the hub needs none of its kiosk workarounds there.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import (
    CARD_FILE,
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_FILE,
    PANEL_URL,
    STATIC_URL,
)

_LOGGER = logging.getLogger(__name__)

WWW = Path(__file__).parent / "www"
_STATIC_DONE = f"{DOMAIN}_static_registered"
_CARD_DONE = f"{DOMAIN}_card_registered"


# The integration version is the cache buster for every bundle URL: browsers cache these
# files eagerly, so an update has to change the URL or the old bundle survives it.
async def async_register(hass: HomeAssistant, version: str) -> None:
    """Register the static path, the card module and the panel. Idempotent."""
    hass.data[f"{DOMAIN}_version"] = version

    # Static paths and extra JS URLs cannot be unregistered, so they are registered once
    # per Home Assistant run and kept across reloads of the config entry.
    if not hass.data.get(_STATIC_DONE):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(WWW), cache_headers=False)]
        )
        hass.data[_STATIC_DONE] = True

    if not hass.data.get(_CARD_DONE):
        frontend.add_extra_js_url(hass, f"{STATIC_URL}/{CARD_FILE}?v={version}")
        hass.data[_CARD_DONE] = True


async def async_register_panel(
    hass: HomeAssistant, title: str, icon: str, version: str, config: dict
) -> None:
    """Add or replace the sidebar panel."""
    frontend.async_remove_panel(hass, PANEL_URL, warn_if_unknown=False)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL,
        webcomponent_name=PANEL_ELEMENT,
        module_url=f"{STATIC_URL}/{PANEL_FILE}?v={version}",
        sidebar_title=title,
        sidebar_icon=icon,
        require_admin=False,
        # The panel is the launcher, so it carries its config with it: panel_custom hands
        # `config` to the element as `panel.config`, which spares the frontend a websocket
        # round trip and an admin-only read of the config entry.
        config=config,
    )


def async_remove_panel(hass: HomeAssistant) -> None:
    frontend.async_remove_panel(hass, PANEL_URL, warn_if_unknown=False)
