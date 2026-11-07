# App module contract

An app is a directory under `custom_components/app_hub/www/apps/<id>/`. The hub reads `app.json` eagerly for every app and
imports `index.js` only when that app is opened.

## app.json

The app's manifest is named `app.json`, not `manifest.json`: the HACS default-store checks walk
`custom_components/` and expect exactly one `*manifest.json` in the whole integration, so a second
one inside the bundle fails the submission with "No manifest".


```json
{
  "id": "homeconnect",
  "name": "Home Connect",
  "replaces": "Home Connect (Siemens) 6.x",
  "trademark_owner": "BSH Hausgeräte GmbH",
  "version": "0.1.0",
  "icon": "img/icon.svg",
  "artwork": "required",

  "requires": [
    { "integration": "homeconnect_ws", "hint": "chris-mc1/homeconnect_local_hass" }
  ],

  "palette": {
    "primary-background-color": "#fafbfe",
    "card-background-color": "#fff",
    "primary-text-color": "#2e3845",
    "secondary-text-color": "#6b7482",
    "divider-color": "#dfe3ea",
    "primary-color": "#4a82e8",
    "error-color": "#e8384f"
  },

  "config": {
    "devices": {
      "shape": "objects",
      "fields": {
        "type": { "type": "select", "options": ["coffeemaker", "dishwasher"], "required": true },
        "prefix": { "type": "entity_prefix", "anchor": "switch.{prefix}_power", "required": true }
      }
    },
    "options": {
      "theme": { "type": "select", "options": ["ha", "app"], "default": "ha" },
      "dry_run": { "type": "boolean", "default": false }
    }
  },

  "screens": ["start", "appliance", "control", "programs", "care", "info", "settings"],
  "locales": ["pl", "en"],

  "blueprints": [
    { "domain": "automation", "path": "app_hub/homeconnect_finished.yaml", "name": "Powiadom po zakonczeniu programu" }
  ],

  "not_covered": [
    "zdalny start bez wcisnietego przycisku na urzadzeniu, blokada po stronie producenta",
    "Home Connect Store i zamawianie srodkow"
  ]
}
```

Field notes:

- `requires` is checked against the loaded integrations. An unsatisfied requirement makes the app
  visible in the launcher but not openable, with `hint` shown as the way to satisfy it. The app is not
  hidden, because a hidden app looks like a missing feature.
- An app only ever reads entities, so **working entities satisfy a requirement whose integration is
  missing**: a fork, a rename, or states fed in by hand on a test instance all keep the app usable.
  The check is the configured devices' anchors, or `requires[].probe`, a path in the app's own config
  (`"entities.soc"`) whose entity has to exist. Both the card and the dashboard strategy apply it.
- `config.options.<name>.default` is merged into the card config before the module sees it, objects
  one level deep. That is how an app with an entity map (`config.entities`) ships 60 defaults and the
  user overrides one of them. The per-app block of the hub config (`apps: {<id>: {...}}`) wins over
  the card-wide options, so one hub card can host several apps with their own devices.
- `fallback_locale` names the language a missing key falls back to, for an app whose producer texts
  exist in one language only. Without it the fallback is `en`, which shows bare keys.
- `palette` keys are Home Assistant CSS variable names. The core turns them into the
  `:host([theme="app"])` block. An app module never writes these variables itself.
- `config.devices.shape` is `objects`, the one shape. A bare entity id list is still accepted on
  input and normalised, so a card written against an older card config keeps working, but every new
  app declares objects.
- `config.devices.anchor` is the entity template that identifies the device in the registry, with
  `{prefix}` substituted, for example `switch.{prefix}_power`. A device given as a bare entity id is
  its own anchor.
- Entities are not declared in the manifest. The module asks for them by `"<domain>.<suffix>"`
  through `ctx.e(dev, key)`, which resolves `<domain>.<prefix>_<suffix>` first and then any entity of
  the same device whose object id ends in `_<suffix>`. A key that resolves to nothing returns
  `undefined`, and the module omits that row, which is how one module serves several models.
- `artwork` is `required` or `optional`. With `optional`, the core falls back to its own vector icons
  when the image files are absent.
- `blueprints` are the producer app's non-screen features (a schedule, a finished-program
  notification) as importable Home Assistant blueprints. The hub installs them on request through the
  `blueprint/save` websocket command (`domain`, `path`, `yaml`), never silently, and never as an
  automation written directly into the user's config.
- `not_covered` is the honest list of producer features this module does not reproduce, shown in the
  app. An empty list is a claim of full parity and needs the coverage table to back it.

## index.js

```js
export default {
  /** The screen the app opens on. */
  home: "start",

  /** Icon markup this app adds to the core set, name: "<svg path markup>". */
  icons: { cup: '<path d="..."/>' },

  /** Optional. Called once after the module is loaded. */
  setup(ctx) {},

  /** The name the hub bar shows while this app is open. */
  title: (ctx, top) => ctx.manifest.name,

  /**
   * One entry per screen named in the manifest. Returns the HTML of the screen body,
   * usually wrapped in <div class="scroll">. The hub owns the hub bar and the toast.
   */
  screens: {
    start: (ctx) => `...`,
    dev: (ctx, params) => `...`,
  },

  /**
   * Actions dispatched from `data-a` attributes in that HTML. The core already handles
   * back, go, home, toggle, sel, opt, pick and more; everything else lands here.
   * Every other data- attribute of the element arrives in `data`.
   */
  actions: {
    start: (ctx, data) => ctx.call("button", "press", { entity_id: ctx.e(ctx.dev(0), "button.start") }),
  },

  /** Extra entity ids whose changes force a re-render, beyond the devices' own entities. */
  watch: (ctx) => [],

  /** Bottom sheets, by name. The hub draws the veil and the sheet; `ctx.sheet("mode", {i: 0})`
      opens one and the back control closes it. */
  sheets: {
    mode: (ctx, params) => `...`,
  },

  /** Optional. Called after every render with the shadow root: a canvas to size, an image
      whose natural size matters, a drag handler, a chart to draw into an empty <svg>. Guard
      the listeners with a flag (`el.dataset.bound`), because it runs on every render. */
  afterRender(ctx, root) {},

  /** Optional. Called when the app is left or the card is removed: cancel a frame loop, clear
      an interval. Without it an animation keeps running behind the launcher. */
  teardown(ctx) {},

  /** CSS for this app's own classes. The core ships the shared primitives. */
  css: () => `...`,
};
```

`ctx` is per card instance and carries:

| Member | Purpose |
|---|---|
| `ctx.chrome` | `{back, kiosk}`: whether the hub bar already draws a back control, and whether the Home Assistant chrome is hidden |
| `ctx.hass` | the Home Assistant object |
| `ctx.config` | the card config, validated against the manifest `config` schema |
| `ctx.devices` | the resolved device list, each with its entity map |
| `ctx.e(dev, key)` | entity id for a manifest `entities` key on a device, or undefined |
| `ctx.st(id)`, `ctx.v(dev, key)`, `ctx.is(dev, key)` | state object, state string, boolean |
| `ctx.call(domain, service, data)` | service call, honours `dry_run` |
| `ctx.more(id)` | open the more-info dialog |
| `ctx.go(screen, params)`, `ctx.back()` | navigation |
| `ctx.sheet(name, params)`, `ctx.closeSheet()`, `ctx.sheetOpen` | the bottom sheet, drawn by the hub over the screen |
| `ctx.state` | a scratch object per card instance: screen-local state (selection, tabs, drawn zones, loaded chart data). The module object itself is shared by every card on the dashboard, so nothing mutable belongs in module scope |
| `ctx.refresh()` | re-render after changing `ctx.state`, when no entity changed |
| `ctx.fmtState(state, option, dict)` | the producer's own name for an option (`"sweeping"` -> `"Odkurzacz"`) from the app's locale, falling back to Home Assistant's own translation |
| `ctx.toast(text)` | transient message |
| `ctx.t(key, vars)` | localised string from the app's locales |
| `ctx.ui` | row, listRow, bar, quickGrid, statusChip, svg, esc |
| `ctx.fmt` | kW, kWh, dur, hhmm, grouped |
| `ctx.history(ids, start, end)` | history, always with an explicit end |
| `ctx.stats(ids, start, end, period)` | recorder statistics |
| `ctx.img(name)` | URL of a file in the app's `img/`, honouring `artwork: optional` |

## Rules an app module must follow

0. No second back control. When `ctx.chrome.back` is true the hub bar owns it, so a hero or a custom
   bar must not draw its own; `ctx.ui.bar` already defaults to that.
1. No direct `hass.callService`. Every call goes through `ctx.call`, or `dry_run` is a lie.
2. No CSS variable definitions for the producer palette. The manifest owns the palette.
3. No hardcoded user-visible strings. Every one goes through `ctx.t`.
4. No absolute asset paths. Every asset goes through `ctx.img`.
5. A history read always passes an explicit end. The core enforces it, an app must not work around it.
6. An entity that may be absent on some models is checked for `undefined` before use.
7. `fixture.json` carries `states`, the `entities` and `devices` registries, and `card_config`, the
   card config it was captured with. `tools/render_check.mjs <app>` renders every screen and sheet
   from it outside a browser and fails on a thrown screen, a raw locale key or a printed
   "undefined". It covers every screen and every notable state, because the PoC is the only place the
   screens can be checked without the physical device in that state.
8. Breakpoints are `@container apphub (max-width: ...)`, never `@media`. The card can be narrow on a
   wide screen, and a viewport media query misses that.
9. Screen-local state lives in `ctx.state`, never in module scope. The module object is shared by
   every card instance on the dashboard, so a module-level variable leaks one card's selection into
   another and survives leaving the app.
10. A frame loop, an interval or an observer started in `afterRender` is stopped in `teardown`, and
   every listener it adds is guarded against being added twice, because `afterRender` runs on every
   render.
11. The app surface is `var(--app-hub-surface)`, never `--primary-background-color`. A glass theme sets
   that variable to `transparent`, and the dashboard wallpaper then shows through the whole app.
   Text colours stay on `--primary-text-color` and `--secondary-text-color`: the hub remeasures the
   pair against the surface the browser actually resolved and overrides both when the contrast falls
   below WCAG AA, so an app that hardcodes a colour opts out of that correction.
