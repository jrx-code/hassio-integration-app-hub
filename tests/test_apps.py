"""Reading the manifests from Python.

The form is generated from these files, so a manifest that cannot be read has to cost its
own app and nothing else: the config entry still loads, the other apps still configure.
"""

from __future__ import annotations

import json
from pathlib import Path

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.app_hub.apps import (
    async_manifests,
    device_key,
    key_field,
    load_manifests,
    option_fields,
)

SHIPPED = {"homeconnect", "dreame", "foxess", "linktap"}


def test_the_shipped_manifests_load() -> None:
    manifests = load_manifests()
    assert set(manifests) == SHIPPED
    assert manifests["dreame"]["name"] == "Dreame"


def test_an_unreadable_manifest_costs_only_its_own_app(tmp_path: Path) -> None:
    (tmp_path / "index.json").write_text(json.dumps({"apps": ["good", "broken", "absent"]}))
    (tmp_path / "good").mkdir()
    (tmp_path / "good" / "app.json").write_text(json.dumps({"id": "good", "name": "Good"}))
    (tmp_path / "broken").mkdir()
    (tmp_path / "broken" / "app.json").write_text("{ not json")
    assert set(load_manifests(tmp_path)) == {"good"}


def test_a_missing_index_is_no_apps_rather_than_a_crash(tmp_path: Path) -> None:
    assert load_manifests(tmp_path) == {}


async def test_manifests_are_read_once(hass: HomeAssistant) -> None:
    first = await async_manifests(hass)
    assert await async_manifests(hass) is first


async def test_setting_the_entry_up_rereads_the_manifests(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """An app ships as a directory, so a reload has to pick up one that was not there yet."""
    cached = await async_manifests(hass)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert await async_manifests(hass) is not cached


def test_each_app_declares_how_it_addresses_a_device() -> None:
    """The key field is what the form, the discovery pass and the round trip agree on."""
    manifests = load_manifests()
    assert key_field(manifests["dreame"]) == ("entity", "entity")
    assert key_field(manifests["homeconnect"]) == ("prefix", "entity_prefix")
    # FoxESS reads one inverter through an entity map and declares no device fields.
    assert key_field(manifests["foxess"]) == (None, None)


def test_device_key_reads_a_row_written_either_way() -> None:
    manifests = load_manifests()
    assert device_key(manifests["dreame"], {"entity": "vacuum.robot"}) == "vacuum.robot"
    assert device_key(manifests["homeconnect"], {"prefix": "siemens_coffeemaker"}) == (
        "siemens_coffeemaker"
    )
    # A Dreame row carried over from an older card config, keyed by prefix.
    assert device_key(manifests["dreame"], {"prefix": "robot"}) == "robot"
    assert device_key(manifests["dreame"], {}) is None


def test_option_fields_are_typed() -> None:
    options = option_fields(load_manifests()["foxess"])
    assert options["alarm_days"]["type"] == "number"
    assert options["entities"]["type"] == "entity_map"
    assert options["currency"]["default"] == "PLN"
