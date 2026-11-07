"""App Hub: dashboards that replace manufacturer apps.

The integration has no entities and talks to no device. It exists so that one install
brings the whole hub: the bundle is served from here, the card and the dashboard strategy
are registered for every dashboard, and the launcher gets a sidebar entry of its own.
Everything the apps show still comes from the integrations that own the devices.
"""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .apps import invalidate
from .const import (
    CONF_APPS,
    CONF_DRY_RUN,
    CONF_SIDEBAR,
    CONF_SIDEBAR_ICON,
    CONF_SIDEBAR_TITLE,
    CONF_THEME,
    DEFAULT_SIDEBAR_ICON,
    DEFAULT_SIDEBAR_TITLE,
    DOMAIN,
)
from .frontend import async_register, async_register_panel, async_remove_panel

_LOGGER = logging.getLogger(__name__)


def panel_config(entry: ConfigEntry) -> dict:
    """The card config the panel element builds its launcher from."""
    options = {**entry.data, **entry.options}
    return {
        CONF_APPS: options.get(CONF_APPS) or {},
        CONF_THEME: options.get(CONF_THEME, "ha"),
        CONF_DRY_RUN: options.get(CONF_DRY_RUN, False),
    }


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # A reload is how a newly shipped or newly dropped-in app becomes visible to the setup form.
    invalidate(hass)
    integration = await async_get_integration(hass, DOMAIN)
    version = str(integration.version)
    await async_register(hass, version)

    options = {**entry.data, **entry.options}
    if options.get(CONF_SIDEBAR, True):
        await async_register_panel(
            hass,
            options.get(CONF_SIDEBAR_TITLE) or DEFAULT_SIDEBAR_TITLE,
            options.get(CONF_SIDEBAR_ICON) or DEFAULT_SIDEBAR_ICON,
            version,
            panel_config(entry),
        )
    else:
        async_remove_panel(hass)

    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Options changed: the panel carries its config, so it is registered again."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # The static path and the card URL stay for this Home Assistant run: neither can be
    # unregistered, and a half-loaded card is worse than one that is simply there.
    async_remove_panel(hass)
    return True
