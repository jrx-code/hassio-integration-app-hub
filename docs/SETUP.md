# Setting the hub up without writing JSON

How a user configures the apps today, what it would take to make that a form, and how someone who
wants an app the hub does not have gets one. Written 2026-11-06, against hub 0.3.4.

## 1. What setup costs today

The integration has one config entry with five form fields (sidebar on/off, title, icon, palette,
dry run) and a sixth, `apps`, which is a multiline text field holding JSON. Everything that names a
device is in that JSON. The production configuration of the three shipped apps is 606 characters of
it:

```json
{"dreame": {"devices": [{"entity": "vacuum.robot_upstairs"}, {"entity": "fan.fan_mf10", "weather": "weather.home"}]},
 "homeconnect": {"devices": [{"type": "coffeemaker", "prefix": "siemens_coffeemaker"}]},
 "foxess": {"inverter_sn": "<inverter serial>", "logger": {"sn": "<logger serial>", "model": "L3"}}}
```

To write that a user has to know: the key is the app id, devices live under `devices`, a Dreame
device is addressed by entity id while a Home Connect device is addressed by an entity *prefix*, and
which of the ~20 FoxESS options exist at all. None of it is discoverable from the form: the field is
a blank text box, a typo fails as `invalid_json` or silently as an app with no devices, and nothing
offers the entities that are already in the instance.

The decision is written at the top of `config_flow.py`: a generated form "would have to be rebuilt
for every app and would still not cover them".

## 2. Why that is no longer true

Every app already declares its configuration shape in `app.json`, because the card validates
against it (`config.devices.fields`, `config.options`, `config.devices.anchor`,
`requires[].integration`, `requires[].probe`). Across the three shipped apps the field vocabulary is
closed, with eight types and 35 declared fields:

| Type | Count | Rendered as |
|---|---|---|
| `number` | 11 | `NumberSelector` |
| `text` | 10 | `TextSelector` |
| `boolean` | 5 | `BooleanSelector` |
| `select` | 5 | `SelectSelector` with the declared options |
| `entity` | 3 | `EntitySelector`, filtered by the declared `domains` |
| `object` | 2 | `ObjectSelector` (YAML box), or its own sub-step |
| `entity_prefix` | 1 | `SelectSelector` built from the registry (see §4) |
| `entity_map` | 1 | `ObjectSelector`, 60 entity keys with manifest defaults |

Six of the eight map one to one onto a Home Assistant selector, present in every version this
integration supports (checked against the test harness, HA 2026.2.3: `EntitySelector`,
`NumberSelector`, `ObjectSelector`, `SelectSelector`, `TextSelector`, `BooleanSelector`,
`DeviceSelector`). The two that do not, `object` and `entity_map`, are the expert fields: an app ships
defaults for them and a user who overrides one is editing YAML either way.

So the form does not have to be written per app. It is generated once from the manifest the app
already ships, and a new app gets its form for free the moment its manifest lands.

## 3. The three surfaces, and which one leads

| Surface | What it can do | What it costs | Verdict |
|---|---|---|---|
| **Options flow** (Settings / Devices and services / App Hub / Configure) | Native dialog, free translations, real entity pickers, validation, works without the panel and without an admin dashboard | A menu step plus a generated schema per app, Python only, no new UI code | **Lead surface.** Everything a user has to name lives here |
| **Hub panel setup screen** (already exists, writes dashboards over websocket) | Setup where the user already is, can show "3 Dreame vacuums found, add them?" with the app's own look | Needs a form renderer and a writer for the entry options inside the card | Links to the options flow, plus the discovery preview; no second form |
| **JSON / YAML** (today's field, and a card written by hand in a dashboard) | Everything, including fields no manifest declares | Nothing new | Stays, behind "Advanced". A hand-written card config must keep working |

The rule: the options flow is the only place that has to be complete, the panel is where setup is
*offered*, and JSON is the escape hatch, never the first path.

## 4. Discovery: filling the form before the user touches it

Nothing in the shape above removes the hard part, which is knowing *which* entity. That comes from
the registries, and it works on real data today (read from the production registry, 2026-11-06):

| App | `requires[].integration` | Devices found | What is derivable |
|---|---|---|---|
| Dreame | `dreame_vacuum` | 3 robots (models `dreame.vacuum.r5039h`, `r9515a`, `r2489s`) | `entity` from the device's `vacuum.*` entity, `name` from the device name, `image` from the model code |
| Dreame fan | `dreame_fan` | 1 (`Dreame Bladeless Fan MF10`) | `entity` from the device's `fan.*` entity |
| Home Connect | `homeconnect_ws` | 2 (`Siemens CoffeeMaker`, `Siemens Dishwasher`) | `prefix` from the device's anchor entity `switch.{prefix}_power`, `type` from the device model (`CoffeeMaker` → `coffeemaker`) |
| FoxESS | `foxess_modbus` | 1 (model `H3-10.0-E - AUX`) | `inverter_model` from the model string; `entities` keep the manifest defaults. The serials are **not** in the registry (`serial_number: null`, checked) and stay text fields |

Two passes, in this order:

1. **Registry pass.** For each `requires[].integration` that is loaded, take its devices, and for each
   device resolve the manifest's anchor: `config.devices.anchor` with `{prefix}` substituted, or the
   first entity in the declared `domains` of the `entity` field. One candidate row per device.
2. **Entity pass**, for the case the integration is absent but the entities exist — a fork, a rename,
   or states fed in by hand, which is exactly how the test instance runs. Match entity ids against
   the same anchor pattern. This is the pass that keeps the "entities satisfy the requirement"
   promise of the app contract from falling apart in the setup form.

The user sees the candidates as a multi-select with everything preselected, and leaves the form at
that, or opens a row and edits the optional fields.

## 5. How a user gets an app the hub does not have

Three tiers, cheapest first. All three are the same contract, so an app that starts as a local
folder can be contributed later without a rewrite.

**Tier 1, ask for it.** An entry at the bottom of the launcher, "Request an app", opens a prefilled
issue on the public repository with the fields the triage actually needs: the producer app it would
replace, the device model, the Home Assistant integration that already exposes it (or "none"), and
what the producer app does that Home Assistant does not. The repository carries that as an issue
form (`.github/ISSUE_TEMPLATE/app-request.yml`), so the fields are enforced by GitHub rather than by
a paragraph of prose, and the hub only has to build the URL.

**Tier 2, build it locally.** `tools/new_app.py` scaffolds `app.json`, `index.js`, locales and a
fixture. The missing half is where a local app lives on a running instance: today the app list is
`www/apps/index.json` inside the integration, so an app added by hand is deleted by the next HACS
update. The fix is a second source: `/config/app_hub_apps/<id>/`, served next to the bundle and
merged into the index by the integration at startup. That directory survives updates, needs no fork,
and a local app is then a HACS-free way to run one.

**Tier 3, contribute it.** The same directory, moved into the repository as a pull request, with the
coverage table and the capture pass from `docs/CAPTURE.md`. What a contributor needs that does not
exist yet is a one-page quickstart (`docs/ADDING-AN-APP.md`): scaffold, name the devices, write the
first screen, run `tools/render_check.mjs`, open the pull request.

## 6. Implementation, in slices

Each slice is usable on its own and testable without a browser.

1. **Manifest reader in Python** (`apps.py`) — done in 0.4.0. Reads every manifest the bundle ships
   and answers the one question the rest of the code asks: which field identifies a device.
   An unreadable manifest costs its own app and nothing else.
2. **Generated options flow** — done in 0.4.0. The options dialog is a menu: *Hub settings*,
   *Set up an app*, *Advanced: edit the JSON*. The per-app step is generated from the manifest, the
   devices are a picker, and a device row already configured keeps the fields the form does not
   edit. A value left at its manifest default is not written into the configuration.
3. **Discovery** (`discovery.py`) — done in 0.4.0, both passes, used to fill the picker. Tested
   against registry fixtures for the three integrations and against the entity-only case. Not built:
   the websocket command, because the panel sends the user to the options flow rather than drawing
   a second form; it is only needed if the panel ever previews the candidates itself.
4. **Panel** — the setup screen has a third card, *Point the apps at your devices*, which opens the
   integration options (admin only). The discovery preview inside the panel is not built.
5. **Local apps directory**: static path, index merge, and a documented layout. Open.
6. **Request channel**: the issue form plus the launcher entry (needs the public repository, so it
   lands with publication). Open.

What is left after 0.4.0: a per-app field still shows its raw name unless `tools/gen_strings.py`
has written a label for it, which it does from the manifest and which a test asserts; the optional
fields of a single device row (a weather entity, a photo) are kept but not editable in the form, so
they remain an advanced-path edit; and an `object` or `entity_map` field is a YAML box rather than a
form.

## 7. Verified on the test instance, 2026-11-06

Hub 0.4.0 on VM 103, in a logged-in browser: the options dialog opens as the three-entry menu,
*Set up an app* lists the three apps with a tick on the configured ones, the Dreame step reports
"5 device(s) found" and opens with the four configured devices already picked (their registry names resolved), and submitting it writes the same configuration back, including the
`weather` entity carried on the fan row, which no form field edits. The hub-wide settings the user
had set, sidebar title `App-HUB` and palette `app`, came through untouched. The launcher still shows
three apps on both hosts, the sidebar panel and the `aplikacje-app` dashboard. The entities on that
instance are the production states replayed by `app_hub_sim`, so the device list there comes from
the entity pass, with no integration loaded.
