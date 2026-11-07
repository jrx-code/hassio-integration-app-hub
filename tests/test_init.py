"""Setup, the frontend registrations, and what an options change does to them.

The integration has no entities and no device, so everything it does is visible in two
places only: the panel registry and the extra module urls. Both are asserted here, and so
is the one rule that is easy to break by accident: the static path and the card url are
registered once per Home Assistant run, because neither can be unregistered.
"""

from __future__ import annotations

from homeassistant.components import frontend
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.app_hub import panel_config
from custom_components.app_hub.const import (
    CARD_FILE,
    CONF_APPS,
    CONF_DRY_RUN,
    CONF_SIDEBAR,
    CONF_SIDEBAR_ICON,
    CONF_SIDEBAR_TITLE,
    CONF_THEME,
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_FILE,
    PANEL_URL,
    STATIC_URL,
)

from .conftest import APPS


def _panels(hass: HomeAssistant) -> dict:
    return hass.data[frontend.DATA_PANELS]


def _module_urls(hass: HomeAssistant) -> set[str]:
    return set(hass.data[frontend.DATA_EXTRA_MODULE_URL].urls)


async def _setup(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_entry_loads(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await _setup(hass, entry)
    assert entry.state is ConfigEntryState.LOADED


async def test_card_url_is_registered_with_a_version(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    await _setup(hass, entry)
    urls = _module_urls(hass)
    card = [u for u in urls if u.startswith(f"{STATIC_URL}/{CARD_FILE}")]
    assert len(card) == 1
    # The version is the cache buster: without it an update leaves the old bundle in place.
    assert "?v=" in card[0]
    assert card[0].split("?v=")[1]


async def test_static_path_is_served(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await _setup(hass, entry)
    assert hass.data[f"{DOMAIN}_static_registered"] is True
    assert hass.data[f"{DOMAIN}_card_registered"] is True


async def test_panel_is_registered_from_the_options(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    await _setup(hass, entry)
    panel = _panels(hass)[PANEL_URL]
    assert panel.sidebar_title == "App-HUB"
    assert panel.sidebar_icon == "mdi:apps"
    assert panel.require_admin is False
    # panel_custom hands the element its own config, so the frontend needs no round trip.
    assert panel.config["_panel_custom"]["name"] == PANEL_ELEMENT
    assert panel.config["_panel_custom"]["module_url"].startswith(f"{STATIC_URL}/{PANEL_FILE}?v=")
    assert panel.config[CONF_APPS] == APPS
    assert panel.config[CONF_THEME] == "app"
    assert panel.config[CONF_DRY_RUN] is False


async def test_sidebar_off_means_no_panel(hass: HomeAssistant) -> None:
    off = MockConfigEntry(domain=DOMAIN, data={CONF_SIDEBAR: False, CONF_APPS: {}})
    await _setup(hass, off)
    assert PANEL_URL not in _panels(hass)


async def test_unload_removes_the_panel(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await _setup(hass, entry)
    assert PANEL_URL in _panels(hass)

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.NOT_LOADED
    assert PANEL_URL not in _panels(hass)
    # The card url stays: add_extra_js_url cannot be undone, and a half-loaded card is worse.
    assert any(u.startswith(f"{STATIC_URL}/{CARD_FILE}") for u in _module_urls(hass))


async def test_options_change_reregisters_the_panel(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    await _setup(hass, entry)
    hass.config_entries.async_update_entry(
        entry,
        options={
            CONF_SIDEBAR: True,
            CONF_SIDEBAR_TITLE: "Launcher",
            CONF_SIDEBAR_ICON: "mdi:rocket",
            CONF_THEME: "ha",
            CONF_DRY_RUN: True,
            CONF_APPS: {"dreame": {}},
        },
    )
    await hass.async_block_till_done()

    panel = _panels(hass)[PANEL_URL]
    assert panel.sidebar_title == "Launcher"
    assert panel.sidebar_icon == "mdi:rocket"
    assert panel.config[CONF_APPS] == {"dreame": {}}
    assert panel.config[CONF_DRY_RUN] is True
    # One registration, not two: the panel is removed before it is added again.
    assert len([k for k in _panels(hass) if k == PANEL_URL]) == 1


async def test_options_change_does_not_duplicate_the_card_url(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    await _setup(hass, entry)
    before = _module_urls(hass)
    hass.config_entries.async_update_entry(entry, options={CONF_THEME: "ha"})
    await hass.async_block_till_done()
    assert _module_urls(hass) == before


async def test_sidebar_turned_off_through_options_removes_the_panel(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    await _setup(hass, entry)
    hass.config_entries.async_update_entry(entry, options={CONF_SIDEBAR: False})
    await hass.async_block_till_done()
    assert PANEL_URL not in _panels(hass)


async def test_panel_config_holds_only_what_the_card_needs(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """The sidebar title and icon are for Home Assistant, not for the card."""
    assert set(panel_config(entry)) == {CONF_APPS, CONF_THEME, CONF_DRY_RUN}
    assert CONF_SIDEBAR_TITLE not in panel_config(entry)
    assert CONF_SIDEBAR_ICON not in panel_config(entry)


async def test_options_win_over_data(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    hass.config_entries.async_update_entry(entry, options={CONF_THEME: "ha"})
    assert panel_config(entry)[CONF_THEME] == "ha"
    assert entry.data[CONF_THEME] == "app"
