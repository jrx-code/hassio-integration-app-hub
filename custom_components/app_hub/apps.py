"""The app manifests, read from Python.

The card reads the same files over HTTP; the integration needs them too, because the
configuration form is generated from `config.devices.fields` and `config.options` rather
than written per app. Reading is tolerant on purpose: one unreadable manifest must cost
its own app, never the config entry.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

WWW_APPS = Path(__file__).parent / "www" / "apps"
_CACHE = f"{DOMAIN}_manifests"


def _read(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        _LOGGER.warning("app hub: cannot read %s (%s)", path, err)
        return None


def load_manifests(root: Path = WWW_APPS) -> dict[str, dict]:
    """Every app the bundle ships, by id, in the order the index lists them."""
    index = _read(root / "index.json") or {}
    out: dict[str, dict] = {}
    for app_id in index.get("apps") or []:
        manifest = _read(root / str(app_id) / "manifest.json")
        if isinstance(manifest, dict) and manifest.get("id"):
            out[manifest["id"]] = manifest
    return out


async def async_manifests(hass: HomeAssistant) -> dict[str, dict]:
    """The manifests, read once and kept until the config entry is set up again."""
    cached = hass.data.get(_CACHE)
    if cached is None:
        cached = await hass.async_add_executor_job(load_manifests)
        hass.data[_CACHE] = cached
    return cached


def invalidate(hass: HomeAssistant) -> None:
    """Forget the cached manifests.

    An app arrives as a directory, so a hub update that ships a new app, or an app dropped in
    by hand, is invisible to a cache that lives for the whole Home Assistant run: the setup
    form would list yesterday's apps. Reloading the entry is the cheap way to pick them up.
    """
    hass.data.pop(_CACHE, None)


def device_fields(manifest: dict) -> dict[str, dict]:
    return ((manifest.get("config") or {}).get("devices") or {}).get("fields") or {}


def option_fields(manifest: dict) -> dict[str, dict]:
    return (manifest.get("config") or {}).get("options") or {}


def device_anchor(manifest: dict) -> str | None:
    return ((manifest.get("config") or {}).get("devices") or {}).get("anchor")


def key_field(manifest: dict) -> tuple[str | None, str | None]:
    """The field that identifies a device, and its type.

    An app addresses a device either by entity id or by entity prefix; everything else in
    the device row is decoration. The form, the discovery pass and the round trip all key
    on this one field, so it is derived in a single place.
    """
    fields = device_fields(manifest)
    for name, field in fields.items():
        if field.get("type") == "entity_prefix":
            return name, "entity_prefix"
    for name, field in fields.items():
        if field.get("type") == "entity":
            return name, "entity"
    return None, None


def device_key(manifest: dict, device: dict) -> str | None:
    """The identifying value of a configured device row."""
    name, _ = key_field(manifest)
    if name and device.get(name):
        return str(device[name])
    # A row written before the field existed, or a bare entity id normalised by the card.
    for fallback in ("entity", "prefix"):
        if device.get(fallback):
            return str(device[fallback])
    return None
