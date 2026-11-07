"""One step to add the hub, then a menu: the hub itself, one app at a time, or raw JSON.

The per-app form is generated from the app's own manifest, which already declares every
field with a type because the card validates against it. Nothing here is written per app:
a new app brings its form with it. The JSON field stays as the advanced path, because an
app ships fields no form renders well (an entity map of sixty keys) and a configuration
written by hand has to keep working.
"""

from __future__ import annotations

import json
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    BooleanSelector,
    IconSelector,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    ObjectSelector,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .apps import async_manifests, device_key, key_field, option_fields
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
from .discovery import async_candidates

THEMES = ["ha", "app"]
# The hub owns these two for every app, so the per-app form leaves them out.
HUB_WIDE = {"theme", "dry_run"}
CONF_DEVICES = "devices"


def _hub_schema(current: dict[str, Any], with_apps: bool = False) -> vol.Schema:
    fields: dict[Any, Any] = {
        vol.Optional(CONF_SIDEBAR, default=current.get(CONF_SIDEBAR, True)): BooleanSelector(),
        vol.Optional(
            CONF_SIDEBAR_TITLE, default=current.get(CONF_SIDEBAR_TITLE, DEFAULT_SIDEBAR_TITLE)
        ): TextSelector(),
        vol.Optional(
            CONF_SIDEBAR_ICON, default=current.get(CONF_SIDEBAR_ICON, DEFAULT_SIDEBAR_ICON)
        ): IconSelector(),
        vol.Optional(CONF_THEME, default=current.get(CONF_THEME, "ha")): SelectSelector(
            SelectSelectorConfig(options=THEMES, mode=SelectSelectorMode.DROPDOWN)
        ),
        vol.Optional(CONF_DRY_RUN, default=current.get(CONF_DRY_RUN, False)): BooleanSelector(),
    }
    if with_apps:
        fields[vol.Optional(CONF_APPS, default=_dumps(current.get(CONF_APPS)))] = TextSelector(
            TextSelectorConfig(type=TextSelectorType.TEXT, multiline=True)
        )
    return vol.Schema(fields)


def _field_selector(spec: dict[str, Any]) -> Any:
    """A manifest field as the selector that edits it."""
    kind = spec.get("type")
    if kind == "boolean":
        return BooleanSelector()
    if kind == "number":
        return NumberSelector(
            NumberSelectorConfig(
                min=spec.get("min", 0),
                max=spec.get("max", 1000000),
                step=spec.get("step", "any"),
                mode=NumberSelectorMode.BOX,
            )
        )
    if kind == "select":
        return SelectSelector(
            SelectSelectorConfig(
                options=[str(o) for o in spec.get("options") or []],
                mode=SelectSelectorMode.DROPDOWN,
                custom_value=False,
            )
        )
    if kind in ("object", "entity_map"):
        return ObjectSelector()
    return TextSelector()


def _app_schema(
    manifest: dict, current: dict[str, Any], candidates: list[Any]
) -> tuple[vol.Schema, dict[str, Any]]:
    """The form for one app: its devices as a picker, then the fields it declares.

    The second element is the manifest defaults, so the submit step can leave a value that
    was not touched out of the stored configuration instead of freezing a default into it.
    """
    keyname, _ = key_field(manifest)
    chosen = [k for k in (device_key(manifest, d) for d in current.get(CONF_DEVICES) or []) if k]
    options = [SelectOptionDict(value=c.key, label=c.label) for c in candidates]
    for key in chosen:  # a configured device the discovery pass no longer sees stays listed
        if all(o["value"] != key for o in options):
            options.append(SelectOptionDict(value=key, label=key))

    fields: dict[Any, Any] = {}
    if keyname:
        fields[vol.Optional(CONF_DEVICES, default=chosen)] = SelectSelector(
            SelectSelectorConfig(
                options=options,
                multiple=True,
                custom_value=True,
                mode=SelectSelectorMode.LIST,
            )
        )
    defaults: dict[str, Any] = {}
    for name, spec in option_fields(manifest).items():
        if name in HUB_WIDE or not isinstance(spec, dict):
            continue
        defaults[name] = spec.get("default")
        value = current.get(name, spec.get("default"))
        if value is None:
            fields[vol.Optional(name)] = _field_selector(spec)
        else:
            fields[vol.Optional(name, default=value)] = _field_selector(spec)
    return vol.Schema(fields), defaults


def _app_config(
    manifest: dict,
    current: dict[str, Any],
    defaults: dict[str, Any],
    candidates: list[Any],
    user_input: dict[str, Any],
) -> dict[str, Any]:
    """The submitted form as the app's configuration block.

    A device already configured keeps its whole row, because the form edits the identity
    of a device, not the optional fields an app may carry on it (a weather entity, a photo).
    """
    form = dict(user_input)
    keys = form.pop(CONF_DEVICES, None)
    keyname, _ = key_field(manifest)
    out = {k: v for k, v in form.items() if v is not None and v != defaults.get(k)}

    if keys is not None and keyname:
        known = {device_key(manifest, d): d for d in current.get(CONF_DEVICES) or []}
        found = {c.key: c.device for c in candidates}
        out[CONF_DEVICES] = [
            known.get(key) or found.get(key) or {keyname: key} for key in keys
        ]
    elif current.get(CONF_DEVICES) is not None:
        out[CONF_DEVICES] = current[CONF_DEVICES]
    return out


def _dumps(value: Any) -> str:
    if not value:
        return ""
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2)


def _parse(user_input: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    """Turn the form into options, with the apps block parsed, or an error for the form."""
    out = dict(user_input)
    raw = (out.get(CONF_APPS) or "").strip()
    if not raw:
        out[CONF_APPS] = {}
        return out, {}
    try:
        parsed = json.loads(raw)
    except ValueError:
        return out, {CONF_APPS: "invalid_json"}
    if not isinstance(parsed, dict):
        return out, {CONF_APPS: "not_an_object"}
    out[CONF_APPS] = parsed
    return out, {}


class AppHubConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            data, errors = _parse(user_input)
            if not errors:
                return self.async_create_entry(title="App Hub", data=data)
            return self.async_show_form(
                step_id="user", data_schema=_hub_schema(user_input, with_apps=True), errors=errors
            )
        return self.async_show_form(step_id="user", data_schema=_hub_schema({}, with_apps=True))

    @staticmethod
    @callback
    def async_get_options_flow(entry: ConfigEntry) -> OptionsFlow:
        return AppHubOptionsFlow()


class AppHubOptionsFlow(OptionsFlow):
    """A menu, because the apps are what gets configured and they are one per step."""

    def __init__(self) -> None:
        self._app: str | None = None
        self._candidates: list[Any] = []
        self._defaults: dict[str, Any] = {}

    @property
    def _current(self) -> dict[str, Any]:
        return {**self.config_entry.data, **self.config_entry.options}

    def _save(self, apps: dict[str, Any] | None = None) -> ConfigFlowResult:
        data = dict(self._current)
        if apps is not None:
            data[CONF_APPS] = apps
        return self.async_create_entry(data=data)

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return self.async_show_menu(step_id="init", menu_options=["hub", "apps", "advanced"])

    async def async_step_hub(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data={**self._current, **user_input})
        return self.async_show_form(step_id="hub", data_schema=_hub_schema(self._current))

    async def async_step_apps(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Pick the app to configure; its own form is generated from its manifest."""
        manifests = await async_manifests(self.hass)
        if not manifests:
            return await self.async_step_advanced()
        if user_input is not None:
            self._app = user_input["app"]
            return await self.async_step_app()

        configured = self._current.get(CONF_APPS) or {}
        options = [
            SelectOptionDict(
                value=app_id,
                label=f"{manifest.get('name', app_id)}"
                + (" ✓" if configured.get(app_id) else ""),
            )
            for app_id, manifest in manifests.items()
        ]
        return self.async_show_form(
            step_id="apps",
            data_schema=vol.Schema(
                {
                    vol.Required("app", default=next(iter(manifests))): SelectSelector(
                        SelectSelectorConfig(options=options, mode=SelectSelectorMode.LIST)
                    )
                }
            ),
        )

    async def async_step_app(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        manifests = await async_manifests(self.hass)
        manifest = manifests.get(self._app or "")
        if manifest is None:
            return await self.async_step_apps()

        apps = dict(self._current.get(CONF_APPS) or {})
        current = dict(apps.get(manifest["id"]) or {})
        if user_input is not None:
            apps[manifest["id"]] = _app_config(
                manifest, current, self._defaults, self._candidates, user_input
            )
            return self._save(apps)

        self._candidates = async_candidates(self.hass, manifest)
        schema, self._defaults = _app_schema(manifest, current, self._candidates)
        return self.async_show_form(
            step_id="app",
            data_schema=schema,
            description_placeholders={
                "app": manifest.get("name", manifest["id"]),
                "found": str(len(self._candidates)),
            },
        )

    async def async_step_advanced(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            data, errors = _parse(user_input)
            if not errors:
                return self.async_create_entry(data={**self._current, **data})
            return self.async_show_form(
                step_id="advanced",
                data_schema=vol.Schema(
                    {
                        vol.Optional(CONF_APPS, default=user_input.get(CONF_APPS, "")): TextSelector(
                            TextSelectorConfig(type=TextSelectorType.TEXT, multiline=True)
                        )
                    }
                ),
                errors=errors,
            )
        return self.async_show_form(
            step_id="advanced",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_APPS, default=_dumps(self._current.get(CONF_APPS))
                    ): TextSelector(TextSelectorConfig(type=TextSelectorType.TEXT, multiline=True))
                }
            ),
        )
