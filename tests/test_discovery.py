"""Finding the devices the form offers.

Both passes are asserted against the shape the production registry really has: a Dreame
vacuum addressed by its entity, a Home Connect appliance addressed by the prefix of its
power switch with the type read off the device model, and the entity-only case the test
instance runs in, where the integration is absent and the states were fed in by hand.
"""

from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.app_hub.apps import load_manifests
from custom_components.app_hub.discovery import async_candidates

MANIFESTS = load_manifests()


@pytest.fixture
def integration(hass: HomeAssistant):
    """Register a device of some integration, with one entity, as that integration would."""

    def _make(domain: str, name: str, model: str, entity_id: str) -> None:
        entry = MockConfigEntry(domain=domain)
        entry.add_to_hass(hass)
        device = dr.async_get(hass).async_get_or_create(
            config_entry_id=entry.entry_id,
            identifiers={(domain, name)},
            name=name,
            model=model,
        )
        er.async_get(hass).async_get_or_create(
            entity_id.split(".")[0],
            domain,
            f"unique-{entity_id}",
            suggested_object_id=entity_id.split(".", 1)[1],
            device_id=device.id,
        )

    return _make


async def test_registry_pass_offers_a_vacuum_by_entity(hass: HomeAssistant, integration) -> None:
    integration("dreame_vacuum", "Robot Upstairs", "dreame.vacuum.r5039h", "vacuum.robot_upstairs")
    found = async_candidates(hass, MANIFESTS["dreame"])
    assert [c.key for c in found] == ["vacuum.robot_upstairs"]
    assert found[0].device == {"entity": "vacuum.robot_upstairs", "name": "Robot Upstairs"}
    assert "Robot Upstairs" in found[0].label


async def test_registry_pass_reads_the_prefix_off_the_anchor(
    hass: HomeAssistant, integration
) -> None:
    """Home Connect is addressed by prefix, which only the anchor entity carries."""
    integration(
        "homeconnect_ws", "Siemens CoffeeMaker", "CoffeeMaker", "switch.siemens_coffeemaker_power"
    )
    found = async_candidates(hass, MANIFESTS["homeconnect"])
    assert [c.key for c in found] == ["siemens_coffeemaker"]
    # The model answers the type select, so the user picks a device and nothing else.
    assert found[0].device == {
        "prefix": "siemens_coffeemaker",
        "type": "coffeemaker",
        "name": "Siemens CoffeeMaker",
    }


async def test_a_device_without_the_anchor_is_not_offered(
    hass: HomeAssistant, integration
) -> None:
    integration("homeconnect_ws", "Siemens Dishwasher", "Dishwasher", "sensor.siemens_dishwasher_door")
    assert async_candidates(hass, MANIFESTS["homeconnect"]) == []


async def test_entity_pass_runs_when_the_integration_is_absent(hass: HomeAssistant) -> None:
    """States fed in by hand satisfy the app, so they have to reach the form too."""
    hass.states.async_set("vacuum.robot_ground", "docked", {"friendly_name": "Robot Ground"})
    found = async_candidates(hass, MANIFESTS["dreame"])
    assert [c.key for c in found] == ["vacuum.robot_ground"]
    assert found[0].label == "Robot Ground (vacuum.robot_ground)"


async def test_entity_pass_stays_out_of_the_way_once_the_registry_answers(
    hass: HomeAssistant, integration
) -> None:
    """A loaded integration decides the list; a stray fan of another brand is not a Dreame."""
    integration("dreame_vacuum", "Robot Ground", "dreame.vacuum.r9515a", "vacuum.robot_ground")
    hass.states.async_set("fan.bathroom_fan", "off", {"friendly_name": "Bathroom fan"})
    assert [c.key for c in async_candidates(hass, MANIFESTS["dreame"])] == ["vacuum.robot_ground"]


async def test_an_app_without_device_fields_offers_nothing(hass: HomeAssistant) -> None:
    """FoxESS configures one inverter through its entity map, so there is nothing to pick."""
    hass.states.async_set("sensor.foxess_soc", "97")
    assert async_candidates(hass, MANIFESTS["foxess"]) == []
