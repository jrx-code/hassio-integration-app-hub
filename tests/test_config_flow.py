"""The config flow and the options flow.

The hub has one step and one entry. The only input that can be wrong is the per-app JSON,
and it is a free-text field, so both of its rejections are asserted here: a string that is
not JSON at all, and JSON that is not an object.
"""

from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.app_hub.const import (
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

from .conftest import APPS

FORM = {
    CONF_SIDEBAR: True,
    CONF_SIDEBAR_TITLE: "App-HUB",
    CONF_SIDEBAR_ICON: "mdi:apps",
    CONF_THEME: "app",
    CONF_DRY_RUN: False,
}


async def _start(hass: HomeAssistant):
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    return result


async def test_user_step_shows_the_form(hass: HomeAssistant) -> None:
    result = await _start(hass)
    assert result["errors"] in (None, {})


async def test_user_step_creates_the_entry(hass: HomeAssistant) -> None:
    result = await _start(hass)
    done = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**FORM, CONF_APPS: '{"foxess": {"entities": {"soc": "sensor.x"}}}'}
    )
    assert done["type"] is FlowResultType.CREATE_ENTRY
    assert done["title"] == "App Hub"
    assert done["data"][CONF_APPS] == {"foxess": {"entities": {"soc": "sensor.x"}}}
    assert done["data"][CONF_THEME] == "app"


async def test_empty_apps_block_is_an_empty_object(hass: HomeAssistant) -> None:
    """A blank field is not an error: a hub with no app configured still has a launcher."""
    result = await _start(hass)
    done = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**FORM, CONF_APPS: "   "}
    )
    assert done["type"] is FlowResultType.CREATE_ENTRY
    assert done["data"][CONF_APPS] == {}


async def test_apps_block_that_is_not_json(hass: HomeAssistant) -> None:
    result = await _start(hass)
    again = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**FORM, CONF_APPS: "{not json"}
    )
    assert again["type"] is FlowResultType.FORM
    assert again["errors"] == {CONF_APPS: "invalid_json"}


async def test_apps_block_that_is_json_but_not_an_object(hass: HomeAssistant) -> None:
    result = await _start(hass)
    again = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**FORM, CONF_APPS: '["foxess"]'}
    )
    assert again["type"] is FlowResultType.FORM
    assert again["errors"] == {CONF_APPS: "not_an_object"}


async def test_a_bad_value_keeps_the_entry_count_at_zero(hass: HomeAssistant) -> None:
    result = await _start(hass)
    await hass.config_entries.flow.async_configure(
        result["flow_id"], {**FORM, CONF_APPS: "{not json"}
    )
    assert hass.config_entries.async_entries(DOMAIN) == []


async def test_single_config_entry(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """The manifest says single_config_entry, so the second flow has nowhere to go."""
    entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def _menu(hass: HomeAssistant, entry: MockConfigEntry, step: str):
    """Open the options menu and pick one of its entries."""
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.MENU
    assert set(result["menu_options"]) == {"hub", "apps", "advanced"}
    return await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": step}
    )


async def test_options_hub_step_saves(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """The hub step carries no apps field: the apps are configured one at a time."""
    form = await _menu(hass, entry, "hub")
    assert form["type"] is FlowResultType.FORM
    assert CONF_APPS not in form["data_schema"].schema

    done = await hass.config_entries.options.async_configure(
        form["flow_id"],
        {
            CONF_SIDEBAR: False,
            CONF_SIDEBAR_TITLE: "Launcher",
            CONF_SIDEBAR_ICON: "mdi:rocket",
            CONF_THEME: "ha",
            CONF_DRY_RUN: True,
        },
    )
    await hass.async_block_till_done()
    assert done["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options[CONF_SIDEBAR] is False
    assert entry.options[CONF_DRY_RUN] is True
    # The apps are untouched by the hub step, which is the point of splitting them off.
    assert entry.options[CONF_APPS] == APPS


async def test_options_advanced_step_saves_json(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    form = await _menu(hass, entry, "advanced")
    done = await hass.config_entries.options.async_configure(
        form["flow_id"], {CONF_APPS: '{"dreame": {}}'}
    )
    await hass.async_block_till_done()
    assert done["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options[CONF_APPS] == {"dreame": {}}


async def test_options_advanced_rejects_bad_json_and_changes_nothing(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    form = await _menu(hass, entry, "advanced")
    again = await hass.config_entries.options.async_configure(
        form["flow_id"], {CONF_APPS: "{{"}
    )
    assert again["type"] is FlowResultType.FORM
    assert again["errors"] == {CONF_APPS: "invalid_json"}
    assert entry.options == {}
    assert entry.data[CONF_APPS] == APPS


async def test_options_app_step_lists_the_shipped_apps(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """The app picker is built from the manifests, not from a list in the integration."""
    form = await _menu(hass, entry, "apps")
    assert form["type"] is FlowResultType.FORM
    assert form["step_id"] == "apps"
    selector = next(iter(form["data_schema"].schema.values()))
    values = {o["value"] for o in selector.config["options"]}
    assert values == {"homeconnect", "dreame", "foxess", "linktap"}


async def test_options_app_form_writes_devices_without_json(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """Picking a vacuum in the form is the whole configuration of the Dreame app."""
    hass.states.async_set("vacuum.robot_salon", "docked", {"friendly_name": "Robot"})
    form = await _menu(hass, entry, "apps")
    app_form = await hass.config_entries.options.async_configure(
        form["flow_id"], {"app": "dreame"}
    )
    assert app_form["step_id"] == "app"
    assert app_form["description_placeholders"]["app"] == "Dreame"

    keys = {str(k) for k in app_form["data_schema"].schema}
    assert "devices" in keys
    done = await hass.config_entries.options.async_configure(
        app_form["flow_id"], {"devices": ["vacuum.robot_salon"]}
    )
    await hass.async_block_till_done()
    assert done["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options[CONF_APPS]["dreame"]["devices"] == [{"entity": "vacuum.robot_salon"}]
    # The other app's block survives a save that only touched Dreame.
    assert entry.options[CONF_APPS]["foxess"] == APPS["foxess"]


async def test_options_app_form_keeps_a_configured_row_whole(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """A row carries fields the form does not edit; re-saving must not drop them."""
    entry_apps = {"dreame": {"devices": [{"entity": "vacuum.robot", "weather": "weather.home"}]}}
    configured = MockConfigEntry(
        domain=DOMAIN, title="App Hub", data={**entry.data, CONF_APPS: entry_apps}
    )
    form = await _menu(hass, configured, "apps")
    app_form = await hass.config_entries.options.async_configure(
        form["flow_id"], {"app": "dreame"}
    )
    chosen = next(
        key.default() for key in app_form["data_schema"].schema if str(key) == "devices"
    )
    assert chosen == ["vacuum.robot"]
    done = await hass.config_entries.options.async_configure(
        app_form["flow_id"], {"devices": chosen}
    )
    await hass.async_block_till_done()
    assert done["type"] is FlowResultType.CREATE_ENTRY
    assert configured.options[CONF_APPS]["dreame"]["devices"] == entry_apps["dreame"]["devices"]


async def test_options_app_form_leaves_untouched_defaults_out(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """A manifest default submitted unchanged is not frozen into the configuration."""
    form = await _menu(hass, entry, "apps")
    app_form = await hass.config_entries.options.async_configure(
        form["flow_id"], {"app": "foxess"}
    )
    submitted = {
        str(key): key.default()
        for key in app_form["data_schema"].schema
        if getattr(key, "default", vol.UNDEFINED) is not vol.UNDEFINED
    }
    assert submitted["currency"] == "PLN"  # the manifest default reaches the form
    done = await hass.config_entries.options.async_configure(app_form["flow_id"], submitted)
    await hass.async_block_till_done()
    assert done["type"] is FlowResultType.CREATE_ENTRY
    assert "currency" not in entry.options[CONF_APPS]["foxess"]


async def test_defaults_are_the_constants(hass: HomeAssistant) -> None:
    """The form offers the shipped sidebar title and icon when nothing is configured.

    The expected values are spelled out rather than taken from the constants: comparing
    the schema against the same constant it is built from passes however the constant
    drifts, which a mutation of DEFAULT_SIDEBAR_TITLE confirmed.
    """
    assert (DEFAULT_SIDEBAR_TITLE, DEFAULT_SIDEBAR_ICON) == ("Aplikacje", "mdi:apps")

    result = await _start(hass)
    schema = result["data_schema"].schema
    defaults = {str(key): key.default() for key in schema if hasattr(key, "default")}
    assert defaults[CONF_SIDEBAR_TITLE] == "Aplikacje"
    assert defaults[CONF_SIDEBAR_ICON] == "mdi:apps"
    assert defaults[CONF_SIDEBAR] is True
    assert defaults[CONF_THEME] == "ha"
    assert defaults[CONF_DRY_RUN] is False
    assert defaults[CONF_APPS] == ""
