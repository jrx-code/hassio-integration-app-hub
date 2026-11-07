"""Finding the devices an app can be pointed at, so the form opens filled in.

Two passes, in order. The registry pass asks the integrations the app declares in
`requires` for their devices, which is the normal case and the one that also yields a
name and a model. The entity pass runs only when the registry pass found nothing, for the
case the app contract already allows: a fork, a renamed integration, or states fed in by
hand on a test instance, where working entities satisfy a requirement no integration does.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .apps import device_anchor, device_fields, key_field


@dataclass
class Candidate:
    """One device the form can offer, keyed by whatever the app addresses it with."""

    key: str
    label: str
    device: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {"key": self.key, "label": self.label, "device": dict(self.device)}


def _normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _anchor_pattern(anchor: str) -> re.Pattern[str]:
    """`switch.{prefix}_power` as a regular expression with a named prefix group."""
    head, _, tail = anchor.partition("{prefix}")
    return re.compile(f"^{re.escape(head)}(?P<prefix>.+){re.escape(tail)}$")


def _decorate(manifest: dict, device: dict[str, Any], name: str | None, model: str | None) -> None:
    """Fill the fields a device registry entry can answer: the name, and a model select."""
    fields = device_fields(manifest)
    keyname, _ = key_field(manifest)
    if name and fields.get("name", {}).get("type") == "text":
        device.setdefault("name", name)
    if not model:
        return
    flat = _normalise(model)
    for field_name, spec in fields.items():
        if field_name == keyname or spec.get("type") != "select":
            continue
        for option in spec.get("options") or []:
            if _normalise(str(option)) in flat:
                device.setdefault(field_name, option)
                break


def _registry_pass(hass: HomeAssistant, manifest: dict) -> list[Candidate]:
    keyname, keytype = key_field(manifest)
    if not keyname:
        return []
    anchor = device_anchor(manifest)
    pattern = _anchor_pattern(anchor) if anchor else None
    domains = device_fields(manifest).get(keyname, {}).get("domains") or []
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)

    out: list[Candidate] = []
    for requirement in manifest.get("requires") or []:
        domain = requirement.get("integration")
        if not domain:
            continue
        for entry in hass.config_entries.async_entries(domain):
            for device in dr.async_entries_for_config_entry(dev_reg, entry.entry_id):
                entities = [
                    e.entity_id
                    for e in er.async_entries_for_device(ent_reg, device.id)
                    if not e.disabled_by
                ]
                key = None
                if keytype == "entity_prefix" and pattern:
                    for entity_id in entities:
                        match = pattern.match(entity_id)
                        if match:
                            key = match.group("prefix")
                            break
                elif keytype == "entity":
                    for entity_id in entities:
                        if not domains or entity_id.split(".")[0] in domains:
                            key = entity_id
                            break
                if not key:
                    continue
                name = device.name_by_user or device.name
                row: dict[str, Any] = {keyname: key}
                _decorate(manifest, row, name, device.model)
                out.append(Candidate(key=key, label=f"{name or key} ({key})", device=row))
    return out


def _entity_pass(hass: HomeAssistant, manifest: dict) -> list[Candidate]:
    keyname, keytype = key_field(manifest)
    if not keyname:
        return []
    anchor = device_anchor(manifest)
    pattern = _anchor_pattern(anchor) if anchor else None
    domains = device_fields(manifest).get(keyname, {}).get("domains") or []

    out: list[Candidate] = []
    for state in hass.states.async_all():
        entity_id = state.entity_id
        key = None
        if keytype == "entity_prefix" and pattern:
            match = pattern.match(entity_id)
            if match:
                key = match.group("prefix")
        elif keytype == "entity" and (not domains or entity_id.split(".")[0] in domains):
            key = entity_id
        if not key:
            continue
        name = state.attributes.get("friendly_name") or key
        out.append(Candidate(key=key, label=f"{name} ({key})", device={keyname: key}))
    return out


def async_candidates(hass: HomeAssistant, manifest: dict) -> list[Candidate]:
    """Devices this app can be pointed at, registry first, entities as the fallback."""
    found = _registry_pass(hass, manifest)
    if not found:
        found = _entity_pass(hass, manifest)
    seen: set[str] = set()
    unique: list[Candidate] = []
    for candidate in found:
        if candidate.key in seen:
            continue
        seen.add(candidate.key)
        unique.append(candidate)
    return unique
