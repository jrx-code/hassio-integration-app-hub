"""Replay recorded entity states on the test instance, every time Home Assistant starts.

This is NOT part of the hub and never ships with it. It exists because the three producer
integrations cannot be duplicated onto the test VM without damaging production: the FoxESS
Modbus adapter is shared with the real inverter, each Home Connect appliance accepts one local
connection at a time, and the Dreame cloud account is the production one. States pushed with
POST /api/states solve that, but they live in memory and every restart wipes them, which makes
the hub look broken on the test instance.

So the same states are written to a file once and set again on every start. No credentials, no
network, no device: the file is a recording.

    /config/app_hub_sim_states.json    {"<entity_id>": {"state": ..., "attributes": {...}}}
    configuration.yaml                 app_hub_sim:
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

DOMAIN = "app_hub_sim"
STATE_FILE = "app_hub_sim_states.json"
_LOGGER = logging.getLogger(__name__)


def _load(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    path = Path(hass.config.path(STATE_FILE))

    async def _apply(_event=None) -> None:
        if not path.exists():
            _LOGGER.warning("%s is missing, no states to replay", path)
            return
        try:
            data = await hass.async_add_executor_job(_load, path)
        except (OSError, ValueError) as err:
            _LOGGER.error("could not read %s: %s", path, err)
            return
        for entity_id, payload in data.items():
            # An entity a real integration owns is left alone: the recording is a stand-in,
            # never an override.
            if hass.states.get(entity_id) is not None:
                continue
            hass.states.async_set(entity_id, payload.get("state"), payload.get("attributes") or {})
        _LOGGER.info("replayed %s recorded states", len(data))

    # Both: at setup for a reload, and after start so nothing overwrites them later in the boot.
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _apply)
    await _apply()
    return True
