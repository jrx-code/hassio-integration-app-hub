/*
 * App Hub dashboard strategy: generates the dashboard instead of the user writing it.
 *
 *   strategy:
 *     type: custom:app-hub
 *     layout: views          # views (default) | launcher
 *     launcher: true         # keep a launcher view in front of the app views
 *     kiosk: false           # hide the Home Assistant sidebar and toolbar
 *
 * It writes nothing. Views are generated at render time from the integrations present, so an
 * app whose integration appears later appears in the dashboard with no migration step.
 * Saving one dashboard per app is a different thing, an action rather than a strategy: the
 * hub's setup screen does that with lovelace/dashboards/create.
 */
// The card hands its own `registry` to register() rather than this file importing it: a
// static import of the card would be a second, unversioned copy of that module.
const STRATEGY_VERSION = "0.2.2";
let registry = async () => ({ order: [], apps: {} });

// Same rule as the card: the integration is the usual evidence, working entities are the
// requirement. A probe is a path in the app's config ("entities.soc"); a configured device
// list is checked through its own entity ids.
function available(manifest, hass, cfg = {}) {
  const comps = hass?.config?.components;
  const req = manifest.requires || [];
  if (!Array.isArray(comps)) return true;
  if (req.every((r) => !r.integration || comps.includes(r.integration))) return true;
  const states = hass?.states || {};
  const per = (cfg.apps && cfg.apps[manifest.id]) || {};
  const devices = per.devices || (cfg.devices || {})[manifest.id];
  if (Array.isArray(devices) && devices.length) {
    // A device is an entity id, or an object with its own entity, or one addressed by prefix,
    // whose anchor the manifest names ("switch.{prefix}_power"). The card resolves it the same
    // way; a strategy that only understood the first shape hid every prefix-addressed app.
    const tpl = manifest.config?.devices?.anchor || "switch.{prefix}_power";
    const anchor = (d) => {
      if (typeof d === "string") return d;
      if (d.entity) return d.entity;
      return d.prefix ? tpl.replace("{prefix}", d.prefix) : "";
    };
    return devices.every((d) => states[anchor(d)]);
  }
  const ents = { ...(manifest.config?.options?.entities?.default || {}), ...(per.entities || {}) };
  const probes = req.map((r) => r.probe).filter(Boolean);
  if (!probes.length) return false;
  const scope = { ...per, entities: ents };
  return probes.every((path) => {
    const id = path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), scope);
    return typeof id === "string" && !!states[id];
  });
}

// One card config per app, in the card's single-app mode. `devices` is left out on purpose:
// without it the app module falls back to the manifest default and shows what it can resolve.
function appCard(id, cfg, manifest) {
  const card = { type: "custom:app-hub-card", app: id };
  if (cfg.theme) card.theme = cfg.theme;
  if (cfg.kiosk) card.kiosk = true;
  if (cfg.height) card.height = cfg.height;
  if (cfg.back_button !== undefined) card.back_button = cfg.back_button;
  // Per-app block of the strategy config, the shape the card reads as well.
  const per = (cfg.apps && cfg.apps[id]) || {};
  const devices = per.devices || (cfg.devices || {})[id];
  if (devices) card.devices = devices;
  for (const [k, v] of Object.entries(per)) if (k !== "devices") card[k] = v;
  return card;
}

function appView(id, cfg, manifest) {
  return {
    title: manifest.name,
    path: id,
    type: "panel",
    icon: manifest.view_icon || "mdi:application",
    cards: [appCard(id, cfg, manifest)],
  };
}

function launcherView(cfg) {
  const card = { type: "custom:app-hub-card" };
  if (cfg.theme) card.theme = cfg.theme;
  if (cfg.kiosk) card.kiosk = true;
  if (cfg.height) card.height = cfg.height;
  // The launcher decides per app whether it is available, and that decision reads the
  // configured devices. Without this block it saw none and drew a working app as
  // "integration missing", while the same app opened fine from its own view.
  if (cfg.apps) card.apps = cfg.apps;
  if (cfg.devices) card.devices = cfg.devices;
  return { title: "Aplikacje", path: "apps", type: "panel", icon: "mdi:view-grid", cards: [card] };
}

class AppHubDashboardStrategy extends HTMLElement {
  static async generate(config, hass) {
    const cfg = { layout: "views", launcher: true, ...config };
    // The hub's setup screen saves a dashboard as four lines of strategy and keeps the
    // per-app configuration where it belongs, in the integration. The panel carries that
    // configuration to every client, so the strategy takes what it has no block for from
    // there rather than treating every configured device as absent. The merge is per app,
    // not all-or-nothing: a dashboard written before an app existed carries a block for the
    // older apps only, and that used to hide every newer one behind "integration missing".
    const fromPanel = hass?.panels?.["app-hub"]?.config?.apps;
    if (fromPanel) cfg.apps = { ...fromPanel, ...(cfg.apps || {}) };
    const reg = await registry();
    const ids = reg.order.filter((id) => reg.apps[id] && available(reg.apps[id], hass, cfg));

    if (cfg.layout === "launcher") {
      return { title: cfg.title || "Aplikacje", views: [launcherView(cfg)] };
    }

    const views = [];
    if (cfg.launcher !== false) views.push(launcherView(cfg));
    for (const id of ids) views.push(appView(id, cfg, reg.apps[id]));

    if (!views.length) {
      views.push({
        title: "Aplikacje",
        cards: [{ type: "markdown", content: "### App Hub\nŻadna aplikacja nie ma zainstalowanej integracji." }],
      });
    }
    return { title: cfg.title || "Aplikacje", views };
  }

  static getCreateSuggestions() {
    return { title: "Aplikacje", icon: "mdi:view-grid" };
  }
}

// A view strategy keeps the dashboard strategy cheap: it returns only the list of views, and
// each view builds its own cards when it is opened.
class AppHubViewStrategy extends HTMLElement {
  static async generate(config, hass) {
    const reg = await registry();
    const id = config.app;
    const manifest = reg.apps[id];
    if (!manifest) return { cards: [{ type: "markdown", content: `App Hub: nie znam aplikacji \`${id}\`.` }] };
    return { type: "panel", cards: [appCard(id, config, manifest)] };
  }
}

export function register(deps) {
  if (deps?.registry) registry = deps.registry;

  if (!customElements.get("ll-strategy-dashboard-app-hub")) {
    customElements.define("ll-strategy-dashboard-app-hub", AppHubDashboardStrategy);
  }
  if (!customElements.get("ll-strategy-view-app-hub")) {
    customElements.define("ll-strategy-view-app-hub", AppHubViewStrategy);
  }

  // Registration for the dashboard dialog, Community dashboards section (HA 2026.5+).
  window.customStrategies = window.customStrategies || [];
  if (!window.customStrategies.some((s) => s.type === "app-hub")) {
    window.customStrategies.push({
      type: "app-hub",
      strategyType: "dashboard",
      name: "App Hub",
      description: "Dashboard z widokiem na kazda zainstalowana aplikacje-zamiennik.",
      documentationURL: "https://github.com/jrx-code/ha-app-hub",
    });
  }
}

export { AppHubDashboardStrategy, AppHubViewStrategy, STRATEGY_VERSION };
