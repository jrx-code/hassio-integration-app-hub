# HA App Hub, design

One Lovelace card that replaces manufacturer mobile apps with Home Assistant dashboards, and a module
contract that makes adding the next app a scaffold plus a capture pass instead of a new project.

Status: design, nothing implemented. Written 2026-11-04.

## Why one repository

Three cards exist today and were built independently:

| Card | Lines of JS | Images | Remote | Published |
|---|---|---|---|---|
| `homeconnect-app-card` | 524 | 55K | Forgejo | no |
| `dreame-app-card` | 922 | 93K | Forgejo | no |
| `foxcloud-flow-card` | 1794 | 2.8M | Forgejo | no |
| `weber-grill-card` | n/a, different shape | none | Forgejo + GitHub | HACS custom repo |

All three carry the same skeleton (`_st`, `_dev`, `_e`, `_call`, `_toast`, `_go`, `_back`, `_render`,
`_bind`, `_act`, `_row`, `_css`, `svg`, `esc`, an icon dictionary, a label dictionary), and all three
received the same `theme: ha|app` option in their last commit, each as its own copy of a
`:host([theme="app"])` block overriding Home Assistant CSS variables. The palette is the only thing
that differs. That duplication is the direct argument for a shared core.

The distribution argument is harder: the HACS default store accepts **one ordinary pull request per
author at a time** (confirmed 2026-11-04). With one repository per app, ten apps mean ten queues.
One repository means one pull request and one update for the user. HACS downloads the whole
integration directory, so an app module can be fetched lazily from a relative URL at runtime while
still arriving with the install.

## Layout

```
ha-app-hub/
  hacs.json                 render_readme, minimum Home Assistant version
  custom_components/app_hub/brand/icon.png icon@2x.png   the hub's own mark, where HACS looks
  NOTICE                    trademark and imagery disclaimer, generated from the manifests
  custom_components/app_hub/
    manifest.json           domain app_hub, single_config_entry, no requirements
    __init__.py             the config entry: bundle, card and panel registration
    frontend.py             StaticPathConfig, add_extra_js_url, panel_custom
    config_flow.py          one step, plus the options flow (sidebar, palette, apps JSON)
    const.py strings.json translations/{en,pl}.json
    www/                    the bundle, served at /app_hub_static
      app-hub-card.js       the hub: launcher, app registry, module loader, setup screen
      app-hub-panel.js      the sidebar panel: a host that builds the card
      app-hub-strategy.js   the dashboard and view strategies
      core/index.js         the SDK every app module builds on: entities, services, i18n,
                            UI primitives, formatters, history and statistics, chrome control
      apps/
        index.json          the app list the hub reads first
        <id>/
          manifest.json     declarative, read by the hub without loading the module
          index.js          the module, lazily imported
          img/              producer artwork plus the launcher icon
          locales/pl.json en.json
          fixture.json      states, registries and the card config, for the checks
  tools/
    new_app.py              scaffolds apps/<id>/ from the template
    notice.py               regenerates the trademark table in NOTICE
    render_check.mjs        every screen and sheet of an app, from its fixture, no browser
    chart_check.mjs         the chart code against real recorder statistics
    vm103_deploy.py         install on the test VM, restart, config entry, dashboards
    vm103_sim_states.py     mirror the production states onto the test VM
    vm103_browser_session.py  a signed-in frontend on the test VM over the debugging protocol
  poc/
    index.html              one harness for every app, app chosen by query string
  docs/
    APP-CONTRACT.md         the module contract
    CAPTURE.md              how an app's screens, geometry and strings are captured
```

## The hub

`custom:app-hub-card` has two modes, and the second one keeps the current production dashboard
working unchanged in substance:

- `type: custom:app-hub-card` renders a launcher, a grid of app icons like a phone home screen.
  Entering an app is a navigation push inside the card.
- `type: custom:app-hub-card` with `app: dreame` enters one app directly. This is what the three
  views of the `aplikacje-app` dashboard do today, so migrating production is a change of `type:`
  and nothing else.

The hub reads every `apps/*/app.json` at startup. It never imports an app module until that app
is opened. From the manifests alone it builds:

- the launcher, with the apps sorted and grouped
- availability gating: an app whose `requires` are not satisfied by the installed integrations is
  shown as unavailable with the reason, not hidden
- the card's GUI editor, whose schema comes from the manifest's `config` section
- the generated `NOTICE` and the README app table

## The core

What the core owns, taken from what the three cards already duplicate:

- `HubCard`, the base custom element: shadow DOM, navigation stack, bottom sheets, toast, delegated
  event binding through `data-a` attributes, scroll reset on navigation, back behaviour
- entity resolution: `<domain>.<prefix>_<key>`, falling back to any entity of the same device whose
  object id ends in `_<key>`, with `required: false` meaning the row disappears instead of erroring.
  This is how one card already serves the X60, X50 and L50s.
- `call(domain, service, data)` with a hub-wide `dry_run` that logs instead of sending
- `more(entity_id)`, the `hass-more-info` dispatch
- theming: the app declares a palette in its manifest, the core generates the `:host([theme="app"])`
  block. No app module contains CSS variables for the producer palette.
- localisation: the app ships `locales/*.json`, the core picks by `hass.language` with a per-card
  override. Polish and English are the baseline.
- UI primitives and formatters, so two apps cannot drift on what a settings row looks like
- data access: one helper for `history/history_during_period` and one for
  `recorder/statistics_during_period`. The history helper always sends `end_time`, because the REST
  endpoint without it returns a single day and a truncated series reads as a dead integration.

What the core does not own: the rendering of an app's own screens. FoxESS draws a canvas with animated
power-flow comets and runs its own frame loop. The contract gives an app the chrome, the data and the
primitives, then gets out of the way. If porting FoxESS breaks the contract, the contract is wrong and
gets fixed at app number three, not at app number ten.

## Adding an app

1. `tools/new_app.py <id>` scaffolds the directory: manifest, one stub screen, locales, fixture, and
   the PoC entry.
2. Capture, per `docs/CAPTURE.md`: pull the APK from the phone, decompile it, take geometry, animation
   constants, colours and strings from the decompiled sources rather than from eyeballed screenshots;
   use `uiautomator dump` where `screencap` returns black, which is what a `FLAG_SECURE` window or a
   multi display foldable does; pixel diff the card against a screenshot of the real app.
3. Acceptance gate, all of it before the app is listed:
   - coverage table in the app's README, app screen against card screen against HA source
   - the PoC renders correctly at 360, 700 and 1000 px. One layout state proves nothing about the
     others, which is how a parity claim has already been wrong once.
   - taps verified with real pointer events, not synthetic `dispatchEvent`, which passes through an
     ancestor with `pointer-events: none`
   - contrast checked in both `theme: ha` and `theme: app`, on the light and the dark HA theme
   - `dry_run: true` run that exercises every action and logs no unexpected service call

A user request becomes an issue from a template naming the manufacturer app, its package name, the
Home Assistant integration that already exposes the device, and screenshots. Without an integration
that exposes the device there is no app to build, only an integration to write first.

## Trademarks and imagery

The repository ships the producer palettes, the producer app layouts and device imagery taken from the
apps, and names each app after the device it serves. The decision is deliberate: fidelity to the app
being replaced is the point of the project.

Consequence to state plainly, because it is a known risk and not a solved problem: imagery cut from a
manufacturer app is not licensed material, and the HACS default store reviews repositories for
branding. The pull request can be rejected on that basis, and a trademark holder can object.

Mitigation carried in the repository:

- `NOTICE` and a README section stating that the project is not affiliated with, endorsed by or
  sponsored by any manufacturer, that product names, logos and brands are the property of their
  respective owners, and that they are used only to identify the device a dashboard serves
- every manifest carries `trademark_owner`, and `NOTICE` is generated from those fields, so the
  disclaimer cannot fall behind the app list
- an app can declare `artwork: optional`, in which case the card falls back to its own vector icons
  when the image files are absent. This keeps the brand neutral path available per app without a
  second code path.

## Phases

1. Core extracted from `homeconnect-app-card`, the smallest of the three at 524 lines, plus the hub
   and the launcher, with Home Connect as the first app on the contract. Verified in the PoC and on
   VM 103 before production.
2. Dreame ported, a straightforward port of the same skeleton. Then FoxESS, the special case, which is
   what proves or breaks the contract.
3. `tools/new_app.py`, `docs/APP-CONTRACT.md` and `docs/CAPTURE.md` finished, which is the point where
   adding an app no longer needs the person who wrote the core.
4. Publication: GitHub `jrx-code/hassio-integration-app-hub`, mirrored from Forgejo, then the pull request to
   `hacs/default`.
5. **Dashboard strategy.** `ll-strategy-dashboard-app-hub` in the same bundle, so a user who has
   downloaded the card gets a generated dashboard from Settings, Dashboards, Add, without writing a
   line of configuration. See "Generating the dashboard" below.
6. **View strategy per app**, `ll-strategy-view-app-hub`, so the dashboard strategy produces only the
   list of views and each view generates its own cards when opened. The frontend documentation
   recommends exactly this split for first-load size, and it lines up with the lazy module import.
7. **Parity beyond the screens**: the blueprints an app ships, and the honest list of what it does not
   cover. See "What a manufacturer app actually does" below.

## Generating the dashboard

A Home Assistant dashboard can be generated at render time by a **strategy**, and this does not need a
Python integration. Verified against the current frontend documentation and this installation:

- a strategy is a custom element extending `HTMLElement` with `static async generate(config, hass)`;
  a dashboard strategy returns the whole config with its `views` array
- the tag is `ll-strategy-dashboard-<name>`, and a dashboard references it as
  `strategy: {type: "custom:<name>"}`; a view uses the same shape inside `views`
- `static getCreateSuggestions(hass)` offers a title and icon in the create dialog
- since Home Assistant 2026.5 a strategy registers itself for discovery by pushing
  `{type, strategyType: "dashboard", name, description?, documentationURL?}` onto
  `window.customStrategies`, which lists it in the dashboard dialog under Community dashboards.
  Production here runs core 2026.10.4, so this path is available.
- the mechanism is already in use on this installation: `lovelace.dashboard_mapa` holds exactly
  `{"strategy": {"type": "map"}}`, the built-in map strategy

What that buys, compared with a companion integration whose config flow writes `.storage`:

- it ships in the same bundle as the card, under the same HACS entry and the same single default-store
  pull request, instead of a second repository in a second queue
- it writes nothing. The dashboard is generated from the integrations and devices present at render
  time, so an app that appears later appears in the dashboard with no migration and no repair step
- a user who wants to pin one app gets it as a normal view with its own URL, which is the whole
  benefit of generated views, without the hub having to create them

So the launcher and the generated views are not a choice between two designs. The launcher is what the
card does on its own in version 1; the strategy is what generates a view per app later, and each of
those views is the same card in its single-app mode.

## What a manufacturer app actually does

A producer app does three things, and only the first is a dashboard: screens, schedules and
automation, notifications. Version 1 replaces the screens. The next layer:

- an app module declares `blueprints`, and the hub installs them from the frontend through the
  blueprint websocket commands, which exist as `blueprint/import` (a `url`) and `blueprint/save`
  (`domain`, `path`, `yaml`). So the producer app's "schedule" and "notify me when it finishes" stop
  being gaps the user has to rebuild by hand.
- an app module declares `not_covered`, the producer features it deliberately does not reproduce, and
  the hub shows that list in the app. This is also what turns user requests into a backlog with
  evidence instead of guesses.
- a device detected with no integration behind it names the integration it needs, from
  `requires[].hint`. Today that case is a dead tile reading "brak integracji weber".

## Decided

- **Device config shape**: one shape for every app, typed objects. The Dreame config on production is
  a bare entity list and gets migrated; the core also reads the old shape in a compatibility path, so
  a card installed from a custom repository does not break on update. Two shapes in the GUI editor
  would be a cost paid at every new app, against one migration of three lines paid once.
- **Icons**: the producer icon per app, from the app's `img/icon.svg`, with the core's own vector set
  as the fallback when an app declares `artwork: optional` or the file is absent. One mechanism, not
  two code paths.

## Settled while building phase 1

- **The launcher alongside generated views**: the strategy puts the launcher in as the first view and
  the per-app views after it, switchable with `launcher: false`. An app view carries the card in
  single-app mode, so the two are the same card with a different config, not two designs.
- **Core as one module, imported dynamically**: `core/index.js` holds the SDK. The card imports it
  through the same versioned URL helper as everything else, because a static import specifier cannot
  carry the `?v=`, and Home Assistant serves `/local` with `Cache-Control: public, max-age=2678400`.
  Without that, a HACS update would leave the previous core in the browser for a month. The same
  applies to app modules, manifests, locales and images, so every one of them goes through the helper.
- **Breakpoints are container queries**, `@container apphub (...)`, not viewport media queries: a card
  can be narrow on a wide screen, and the viewport query misses it. Caught by an 8 px overflow on the
  coffee maker screen at 360 px card width.
- **One back control**: the hub bar owns it when shown, and the app reads `ctx.chrome.back` so it does
  not draw a second. Caught as two stacked back arrows on the first render.
- **The card draws its own surface**, `--app-hub-surface`, resolved from `--ha-card-background` and
  `--card-background-color`. Not from `--primary-background-color`: a glass theme sets that to
  `transparent`, and the dashboard wallpaper then shows through every screen.
- **Contrast is measured, not assumed**: a theme can hand the card a dark surface and the base theme's
  dark text at the same time, which no palette of ours can fix in advance. After each render the card
  reads the colours the browser resolved and overrides the two text variables when the pair falls
  below WCAG AA. The theme's own colour is read one level up, where the override cannot reach it,
  because reading it off the card measures the previous answer and never settles.

## Integration, not a dashboard plugin and not an app

The hub started as a Lovelace plugin, which is how a custom card is normally shipped. The three
shapes Home Assistant offers were compared against what the hub actually needs, on the running
2026.9.1 instance and in the installed HACS 2.0.5, not from memory:

**Plugin (HACS category `lovelace`).** Installation is not the problem: HACS registers and
version-bumps the dashboard resource itself (`repositories/plugin.py`, `async_post_installation`
calls `update_dashboard_resources`, which creates `{"res_type": "module", "url": ...}` and deletes
it on uninstall). What a plugin cannot have is anything outside a dashboard: no sidebar entry, so
the launcher always lives inside somebody's dashboard view; no entry under Settings, Devices and
services, so there is nowhere to configure it but YAML in the card; no Python side, so no served
assets of its own and no room to grow one. The kiosk workaround exists only because of this: the
card hides the Home Assistant chrome because it is a guest in a dashboard.

**App (what used to be called an add-on, Settings, Apps).** An app is "a container image plus a
small configuration file" (contributors.home-assistant.io/apps), managed by the Supervisor on Home
Assistant OS, and it shows its interface through ingress. That is the wrong shape for this: ingress
serves the interface in an iframe with its own origin, so the hub would lose the `hass` object, the
active theme, the more-info dialogs and the free entity subscriptions, and would have to rebuild all
of it on top of the REST and websocket APIs with its own token. It would also stop being a card on a
dashboard, drop everyone not on Home Assistant OS, and HACS cannot distribute it at all: its
categories are `integration`, `lovelace`, `theme`, `template`, `python_script` and `appdaemon`
(`hacs/enums.py`), with no app among them. The ingress cost is not theoretical either: the
seestar app in this household ships a click-through page precisely because the upstream console
emits absolute URLs that ingress cannot rewrite.

**Integration (HACS category `integration`), which is what the hub is now.** A custom integration
can do everything a plugin can and the three things it cannot:

- serve its own bundle (`StaticPathConfig` under `/app_hub_static`), so the card, the strategy, the
  app modules and the artwork arrive in one install with nothing copied into `/config/www`,
- register the card for every dashboard itself (`frontend.add_extra_js_url`), which is also how
  HACS registers its own icon set, so there is no resource for the user to manage,
- own a sidebar panel (`panel_custom.async_register_panel` with a `module_url`), which is a real
  panel: the frontend sets `hass` and the theme on the element and gives it the whole content area
  with no dashboard toolbar, so the launcher looks like an app instead of a card in a view,
- and have a config entry: `single_config_entry`, an options flow for the sidebar entry, the
  palette, dry run and the per-app configuration, which `panel_custom` hands to the panel element
  as `panel.config` so the frontend needs no admin-only read of the entry.

The cost is a Python package plus `custom_components/app_hub/brand/icon.png` (where HACS looks for the integration
category) and a Home Assistant restart on install. The card did not change: the panel is a host
that builds the same `app-hub-card`, so both entry points run the same code.

## What the second and third app changed in the contract

Dreame and FoxESS were ported onto the contract written for one app, and three gaps showed up at
once. All three are now part of the contract, not of an app:

- **Screen state has nowhere to live.** The module object is imported once and shared by every card
  on the dashboard, so a module-level variable is shared state between cards. Dreame needs selected
  rooms, a tab and drawn zones, FoxESS a tab, a date, fold states and loaded series: `ctx.state` is
  per card instance, and `ctx.refresh()` renders after a change no entity caused.
- **Three apps wanted the same modal.** The bottom sheet became a hub primitive: `module.sheets`,
  `ctx.sheet(name, params)`, and the back control closes it before it pops the screen stack.
- **A screen is not only HTML.** A canvas to size, an image whose natural size decides an overlay, a
  pointer drag, an SVG chart drawn from a statistics query: `afterRender(ctx, root)` runs after every
  render, and `teardown(ctx)` stops what it started. Without teardown FoxESS kept a frame loop and a
  15 s interval running behind the launcher.

Two smaller ones: a hub card hosting several apps needs per-app config (`apps: {<id>: {...}}`, which
the strategy passes through as well), and an app whose producer texts exist in one language declares
`fallback_locale`, so a missing key shows the producer's wording instead of a bare key.

**Availability stopped being about integrations.** An app only reads entities, so the gate now
accepts working entities when the named integration is missing: a fork, a rename, or a test instance
fed by hand all keep the app usable. The strategy applies the same rule, and it needed the same
device resolution as the card, or an app addressed by prefix silently never got a view.

## Still open

Nothing in the contract. The kiosk chrome control, the generated dashboard, the contrast pass and all
three apps are verified against the real Home Assistant frontend on the test instance; what remains
is in the handover.
