/*
 * App Hub: one Lovelace card that hosts app modules replacing manufacturer apps.
 *
 *   type: custom:app-hub-card          -> launcher, a grid of the installed apps
 *   type: custom:app-hub-card
 *   app: homeconnect                   -> that one app, full screen
 *
 * Options: theme (ha|app), dry_run, kiosk, hide_sidebar, hide_header, back_button, height.
 * App modules live in apps/<id>/ and are imported only when opened.
 */
const VERSION = "0.2.2";
const BASE = new URL(".", import.meta.url).href;

// The integration's sidebar panel carries the per-app configuration, and Home Assistant hands
// every client the panel's config. A card placed on a dashboard has only what its own config
// says, which for a strategy-generated launcher is nothing: without this fallback a configured
// device looked absent and a working app was drawn as "integration missing".
const PANEL_URL = "app-hub";

// Home Assistant serves /local with a long cache lifetime. The resource URL carries ?v=,
// but app modules, manifests, locales and images are fetched by this file, so they would be
// cached across an update and a stale app module would survive it. Every such URL therefore
// carries the same version as the resource that loaded this file.
const V = new URL(import.meta.url).searchParams.get("v") || VERSION;
const Q = `?v=${encodeURIComponent(V)}`;
const asset = (path) => `${BASE}${path}${Q}`;

// The core is loaded through asset() for the same reason, which rules out a static import:
// a static specifier cannot carry the version, so the browser would keep the previous core
// for a month after an update.
const {
  CORE_VERSION, esc, fmt, makeSvg, makeUi, baseCss, paletteCss, I18n,
  normalizeDevices, resolveEntity, deviceEntities, history, stats, ChromeControl, stateText,
} = await import(asset("core/index.js"));

/* ---------- app registry ---------- */
let REGISTRY = null;
async function registry() {
  if (REGISTRY) return REGISTRY;
  const index = await fetch(asset("apps/index.json")).then((r) => r.json());
  const apps = {};
  await Promise.all(
    (index.apps || []).map(async (id) => {
      try {
        apps[id] = await fetch(asset(`apps/${id}/app.json`)).then((r) => r.json());
      } catch (e) {
        console.warn("[app-hub] manifest unreadable", id, e);
      }
    })
  );
  REGISTRY = { order: index.apps || [], apps };
  return REGISTRY;
}

const MODULES = {};
async function loadModule(id) {
  if (!MODULES[id]) MODULES[id] = (await import(asset(`apps/${id}/index.js`))).default;
  return MODULES[id];
}

async function loadLocales(id, list) {
  const out = {};
  await Promise.all(
    (list || []).map(async (lang) => {
      try {
        out[lang] = await fetch(asset(`apps/${id}/locales/${lang}.json`)).then((r) => r.json());
      } catch (e) {
        /* an app may ship one language only */
      }
    })
  );
  return out;
}

// defaults from the manifest < the card config < the per-app block. An object option (an
// entity map) is merged one level deep, so a user who renames one entity keeps the rest.
function appConfig(cfg, id, manifest) {
  const per = (cfg.apps && cfg.apps[id]) || {};
  const out = { ...cfg, ...per };
  const opts = manifest?.config?.options || {};
  for (const [k, spec] of Object.entries(opts)) {
    if (spec?.default === undefined) continue;
    const given = per[k] !== undefined ? per[k] : cfg[k];
    if (given === undefined) out[k] = spec.default;
    else if (spec.default && typeof spec.default === "object" && !Array.isArray(spec.default) && given && typeof given === "object" && !Array.isArray(given))
      out[k] = { ...spec.default, ...given };
  }
  return out;
}

const CORE_STRINGS = {
  pl: {
    core: { back: "Wstecz", launcher: "Aplikacje", unavailable: "Brak integracji {what}", missing_app: "Nie znam aplikacji {id}", loading: "Ładowanie...", apps_count: "{n} aplikacji", setup: "Ustawienia huba" },
    setup: {
      intro: "Wybierz, jak zapisać dashboardy. Dostępnych aplikacji: {n}.",
      views_title: "Jeden dashboard, apki jako widoki",
      views_body: "Ten dashboard dostaje strategię App Hub. Widoki powstają przy każdym otwarciu, nic nie jest zapisywane, a nowa apka pojawia się sama.",
      dash_title: "Osobny dashboard na apkę",
      dash_body: "Każda apka dostaje własny wpis w pasku bocznym i własny adres. Zapisuje wpisy dashboardów w konfiguracji Home Assistant.",
      apps_title: "Wskaż urządzenia aplikacjom",
      apps_body: "Otwiera ustawienia integracji: aplikacja po aplikacji, z listą znalezionych urządzeń do zaznaczenia. Bez pisania JSON-a.",
      admin_only: "Tylko administrator może zapisywać dashboardy.",
      done_views: "Dashboard przestawiony na strategię App Hub",
      done_dashboards: "Utworzono lub zaktualizowano {n} dashboardów",
    },
  },
  en: {
    core: { back: "Back", launcher: "Apps", unavailable: "Integration {what} is missing", missing_app: "Unknown app {id}", loading: "Loading...", apps_count: "{n} apps", setup: "Hub setup" },
    setup: {
      intro: "Choose how the dashboards are saved. Available apps: {n}.",
      views_title: "One dashboard, apps as views",
      views_body: "This dashboard gets the App Hub strategy. Views are generated on every open, nothing is stored, and a new app shows up by itself.",
      dash_title: "One dashboard per app",
      dash_body: "Each app gets its own sidebar entry and its own URL. This writes dashboard entries into the Home Assistant configuration.",
      apps_title: "Point the apps at your devices",
      apps_body: "Opens the integration options: one app at a time, with the devices found in this instance to pick from. No JSON.",
      admin_only: "Only an administrator can save dashboards.",
      done_views: "Dashboard switched to the App Hub strategy",
      done_dashboards: "Created or updated {n} dashboards",
    },
  },
};

/* ---------- the card ---------- */
/* ---------- readable text on somebody else's theme ---------- */
// Both pairs are measured against the surfaces a theme actually produces, not picked by eye.
const FG_ON_DARK = ["#f3f5f8", "rgba(243,245,248,.72)"];
const FG_ON_LIGHT = ["#1a1d22", "rgba(26,29,34,.68)"];

function parseColor(value) {
  const s = String(value || "").trim();
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return n.length >= 3 && n.every((v) => !Number.isNaN(v)) ? n : null;
  }
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return null;
  const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(c) {
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

class AppHubCard extends HTMLElement {
  static getStubConfig() { return { app: "" }; }
  static getConfigElement() { return document.createElement("app-hub-card-editor"); }

  constructor() {
    super();
    this._nav = [];
    this._chrome = new ChromeControl();
    this._ready = false;
  }

  setConfig(config) {
    this._cfg = {
      theme: "ha",
      dry_run: false,
      back_button: "auto",
      kiosk: false,
      ...config,
    };
    if (this._cfg.kiosk) {
      if (this._cfg.hide_sidebar === undefined) this._cfg.hide_sidebar = true;
      if (this._cfg.hide_header === undefined) this._cfg.hide_header = true;
    }
    this.setAttribute("theme", this._cfg.theme === "app" ? "app" : "ha");
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._nav = this._cfg.app ? [{ app: this._cfg.app, screen: null }] : [{ app: null, screen: null }];
    this._boot();
  }

  async _boot() {
    this._reg = await registry();
    const id = this._cfg.app;
    if (id) {
      if (!this._reg.apps[id]) { this._err = this._t("core.missing_app", { id }); this._ready = true; return this._render(); }
      await this._enter(id, false);
    }
    this._ready = true;
    this._render();
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    if (!this._ready) return;
    if (!old || this._changed(old)) this._render();
  }

  connectedCallback() {
    this._applyChrome();
    // Home Assistant applies a theme by writing custom properties onto this element, and it
    // can do that after the first render or when the user switches theme. Remeasure then.
    this._themeObs = new MutationObserver(() => this._autoContrast());
    this._themeObs.observe(this, { attributes: true, attributeFilter: ["style"] });
  }

  disconnectedCallback() {
    try { if (this._appId) this._module?.teardown?.(this._ctx()); } catch (e) { /* leaving anyway */ }
    this._chrome.release();
    this._themeObs?.disconnect();
    clearTimeout(this._tt);
  }

  getCardSize() { return 12; }

  _applyChrome() {
    const { hide_sidebar, hide_header } = this._cfg || {};
    if (hide_sidebar || hide_header) this._chrome.apply({ sidebar: !!hide_sidebar, header: !!hide_header });
    else this._chrome.release();
  }

  _changed(old) { return (this._watch || []).some((id) => old.states[id] !== this._hass.states[id]); }

  _t(key, vars) {
    const lang = this._hass?.language || this._cfg?.language || "en";
    const dicts = {};
    for (const l of new Set([...Object.keys(CORE_STRINGS), ...Object.keys(this._locales || {})])) {
      dicts[l] = { ...(CORE_STRINGS[l] || {}), ...((this._locales || {})[l] || {}) };
    }
    // An app that ships one language declares it as its fallback, so a missing key shows the
    // producer's own wording instead of a bare key.
    const fb = this._manifest?.fallback_locale || "en";
    return new I18n(dicts, this._cfg?.language || lang, dicts[fb] ? fb : "en").t(key, vars);
  }

  /* ---------- entering and leaving an app ---------- */
  async _enter(id, render = true) {
    const manifest = this._reg.apps[id];
    if (!manifest) return;
    this._manifest = manifest;
    this._locales = await loadLocales(id, manifest.locales);
    this._module = await loadModule(id);
    this._appId = id;
    this._icons = { ...(this._module.icons || {}) };
    // One hub card can host several apps, each with its own devices and options, so the
    // per-app block wins over the card-wide one, and the manifest defaults fill the rest.
    this._appCfg = appConfig(this._withApps(), id, manifest);
    this._appState = {};
    this._sheet = null;
    this._devices = normalizeDevices(this._appCfg.devices ?? manifest.config?.devices?.default ?? [], manifest);
    this._nav = [{ app: id, screen: this._module.home || manifest.screens?.[0] || "start", params: {} }];
    this._module.setup?.(this._ctx());
    if (render) this._render();
  }

  _leave() {
    // An app with a frame loop or a timer has to be able to stop it, or it keeps running
    // behind the launcher.
    try { this._module?.teardown?.(this._ctx()); } catch (e) { console.warn("[app-hub] teardown failed", e); }
    this._appId = null;
    this._appCfg = null;
    this._appState = null;
    this._sheet = null;
    this._module = null;
    this._manifest = null;
    this._nav = [{ app: null, screen: null }];
    this._render();
  }

  /* ---------- the app context ---------- */
  // Whether the hub bar draws a back control. An app reads it through ctx.chrome.back so it
  // does not draw a second one on the same screen.
  _backShown() {
    const mode = this._cfg.back_button;
    const auto = this._nav.length > 1 || (!this._cfg.app && !!this._appId) || !!this._cfg.hide_header || !!this._setupOpen;
    if (mode === true || mode === "always") return true;
    if (mode === false || mode === "never") return false;
    return auto;
  }

  _ctx() {
    const card = this;
    const svg = makeSvg(this._icons || {});
    const t = (k, v) => card._t(k, v);
    const chrome = { back: this._backShown(), kiosk: !!(this._cfg.hide_header || this._cfg.hide_sidebar) };
    return {
      chrome,
      get hass() { return card._hass; },
      config: card._appCfg || card._cfg,
      // Per card instance, not per module: the module object is shared by every card on the
      // dashboard, so screen-local state (selection, tabs, drawn zones) lives here.
      get state() { return (card._appState = card._appState || {}); },
      refresh: () => card._render(),
      manifest: card._manifest,
      devices: card._devices || [],
      dev: (i) => (card._devices || [])[i],
      nav: () => card._nav[card._nav.length - 1],
      e: (dev, key) => resolveEntity(card._hass, dev, key),
      st: (id) => id && card._hass?.states[id],
      v: (dev, key) => { const s = card._hass?.states[resolveEntity(card._hass, dev, key)]; return s ? s.state : undefined; },
      is: (dev, key) => { const s = card._hass?.states[resolveEntity(card._hass, dev, key)]; return s?.state === "on"; },
      attr: (dev, key, a) => card._hass?.states[resolveEntity(card._hass, dev, key)]?.attributes?.[a],
      entities: (dev) => deviceEntities(card._hass, dev),
      call: (domain, service, data) => card._call(domain, service, data),
      more: (id) => card.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true })),
      go: (screen, params = {}) => card._go(screen, params),
      back: () => card._back(),
      sheet: (name, params = {}) => { card._sheet = { name, params }; card._render(); },
      closeSheet: () => { card._sheet = null; card._render(); },
      get sheetOpen() { return !!card._sheet; },
      fmtState: (st, opt, dict) => stateText(card._hass, t, st, opt, dict),
      toast: (text) => card._toast(text),
      t,
      svg,
      esc,
      fmt,
      ui: makeUi(svg, t, chrome),
      img: (name) => asset(`apps/${card._appId}/img/${name}`),
      history: (ids, start, end) => history(card._hass, ids, start, end),
      stats: (ids, start, end, period) => stats(card._hass, ids, start, end, period),
    };
  }

  _call(domain, service, data) {
    if ((this._appCfg || this._cfg).dry_run || !this._hass?.callService) {
      console.info("[app-hub]", domain, service, data);
      this._toast(`${domain}.${service}`);
      return;
    }
    return this._hass.callService(domain, service, data);
  }

  _toast(text) {
    this._toastText = text;
    this._render();
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { this._toastText = null; this._render(); }, 2200);
  }

  _go(screen, params = {}) {
    this._nav.push({ app: this._appId, screen, params });
    this._render();
    this.shadowRoot.querySelector(".scroll")?.scrollTo(0, 0);
  }

  _back() {
    if (this._sheet) { this._sheet = null; return this._render(); }
    if (this._setupOpen) { this._setupOpen = false; return this._render(); }
    if (this._nav.length > 1) { this._nav.pop(); return this._render(); }
    // Depth 1: leave the app if the launcher is reachable, otherwise step out of the view.
    if (!this._cfg.app && this._appId) return this._leave();
    const target = this._cfg.back_target;
    if (target) {
      window.history.pushState(null, "", target);
      window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
      return;
    }
    if (window.history.length > 1) return window.history.back();
    this._toast(this._t("core.back"));
  }

  /* ---------- availability ---------- */
  // An app only ever reads entities, so working entities are the real requirement. The
  // integration name is the usual way to check for them, but it fails for a fork, a rename
  // and for states fed in by hand on a test instance, which is why the entities win.
  // The card config wins; the panel's `apps` block only fills in when the card has none.
  // The integration's own per-app configuration, reachable from any dashboard through the
  // panel, merged under whatever this card carries: an app the card's own block does not
  // mention still gets its devices instead of looking like a missing integration.
  _withApps() {
    const fromPanel = this._hass?.panels?.[PANEL_URL]?.config?.apps;
    if (!fromPanel) return this._cfg;
    return { ...this._cfg, apps: { ...fromPanel, ...(this._cfg?.apps || {}) } };
  }

  _available(manifest) {
    const comps = this._hass?.config?.components;
    const req = manifest.requires || [];
    if (!comps || !Array.isArray(comps)) return { ok: true, unknown: true };
    const missing = req.filter((r) => r.integration && !comps.includes(r.integration));
    if (!missing.length) return { ok: true, missing: [] };
    if (this._probed(manifest, req)) return { ok: true, missing: [], via: "entities" };
    return { ok: false, missing };
  }

  _probed(manifest, req) {
    const hass = this._hass;
    if (!hass?.states) return false;
    const cfg = appConfig(this._withApps(), manifest.id, manifest);
    // Either every configured device resolves, or every requirement names a config path
    // (for example "entities.soc") whose entity exists.
    const devs = normalizeDevices(cfg.devices ?? manifest.config?.devices?.default ?? [], manifest);
    if (devs.length && devs.every((d) => hass.states[d.anchor])) return true;
    const probes = req.map((r) => r.probe).filter(Boolean);
    if (!probes.length) return false;
    return probes.every((path) => {
      const id = path.split(".").reduce((o, k) => (o == null ? o : o[k]), cfg);
      return typeof id === "string" && !!hass.states[id];
    });
  }

  /* ---------- render ---------- */
  _render() {
    if (!this.shadowRoot || !this._cfg) return;
    const sy = this.shadowRoot.querySelector(".scroll")?.scrollTop || 0;
    this._watch = [];
    let body = "";
    let title = "";

    if (this._err) {
      body = `<div class="scroll"><div class="pad"><div class="note">${esc(this._err)}</div></div></div>`;
    } else if (!this._ready || !this._hass) {
      body = `<div class="scroll"><div class="pad"><p class="fine">${esc(this._t("core.loading"))}</p></div></div>`;
    } else if (!this._appId) {
      body = this._setupOpen ? this._setupScreen() : this._launcher();
      title = this._setupOpen ? this._t("core.setup") : this._t("core.launcher");
    } else {
      const ctx = this._ctx();
      this._lastCtx = ctx;
      const top = this._nav[this._nav.length - 1];
      (this._devices || []).forEach((d) => this._watch.push(...deviceEntities(this._hass, d)));
      this._watch.push(...(this._module.watch?.(ctx) || []));
      const screen = this._module.screens?.[top.screen];
      body = screen ? screen(ctx, top.params || {}) : `<div class="scroll"><div class="pad"><p class="fine">${esc(top.screen)}</p></div></div>`;
      // The hub bar names the app; the screen's own bar or hero names the screen or device,
      // so putting the device name in both just prints it twice.
      title = this._manifest.name;
    }

    const css = `${baseCss()}${LAUNCHER_CSS}${paletteCss(this._manifest?.palette)}${this._module?.css ? this._module.css() : ""}${this._heightCss()}`;
    const kiosk = this._cfg.hide_header || this._cfg.hide_sidebar;
    const sheetFn = this._sheet && this._module?.sheets?.[this._sheet.name];
    const sheet = sheetFn
      ? `<div class="veil" data-a="closesheet"></div><div class="sheet${this._sheet.tall ? " tall" : ""}">${sheetFn(this._lastCtx || this._ctx(), this._sheet.params || {})}</div>`
      : "";
    this.shadowRoot.innerHTML =
      `<style>${css}</style><ha-card><div class="wrap${kiosk ? " kiosk" : ""}">` +
      `${this._hubBar(title)}${body}${sheet}${this._toastText ? `<div class="toast">${esc(this._toastText)}</div>` : ""}` +
      `</div></ha-card>`;
    const sc = this.shadowRoot.querySelector(".scroll");
    if (sc) sc.scrollTop = sy;
    this._bind();
    // A canvas, an image whose natural size matters, a drag handler: things an app can only
    // wire up once its own HTML is in the shadow root.
    if (this._appId) {
      try { this._module?.afterRender?.(this._lastCtx || this._ctx(), this.shadowRoot); }
      catch (e) { console.warn("[app-hub] afterRender failed", e); }
    }
    this._applyChrome();
    this._autoContrast();
    // Home Assistant writes the theme onto the card element after it is in the tree, so the
    // first measurement can land before any colour exists. Measure again once painted.
    requestAnimationFrame(() => this._autoContrast());
  }

  // A third-party theme can hand the card a dark surface and a dark text colour at the same
  // time (a glass theme over a light base does exactly that), and the card then renders
  // unreadable through no fault of the app. Measure what the browser actually resolved and
  // override the two text variables when the pair fails WCAG AA.
  _autoContrast() {
    const card = this.shadowRoot?.querySelector("ha-card");
    if (!card) return;
    const bg = parseColor(getComputedStyle(card).backgroundColor);
    // The theme's own text colour, read one level up, where this card's override cannot reach
    // it. Reading it off the card would measure the previous answer and never settle.
    const scope = this.parentElement || this.getRootNode()?.host || document.documentElement;
    const fg = parseColor(getComputedStyle(scope).getPropertyValue("--primary-text-color"));
    if (!bg || !fg) return;
    if (bg.length > 3 && bg[3] < 0.4) return;  // see-through surface: nothing to measure against
    const pair = contrast(fg, bg) >= 4.5 ? null : (luminance(bg) < 0.4 ? FG_ON_DARK : FG_ON_LIGHT);
    // Idempotent: the theme observer fires on our own writes, so write only on a real change.
    if ((pair ? pair[0] : "") === this.style.getPropertyValue("--primary-text-color")) return;
    if (!pair) {
      for (const p of ["--primary-text-color", "--secondary-text-color"]) this.style.removeProperty(p);
      return;
    }
    this.style.setProperty("--primary-text-color", pair[0]);
    this.style.setProperty("--secondary-text-color", pair[1]);
  }

  _heightCss() {
    return this._cfg.height ? `:host{--app-hub-height:${this._cfg.height}}` : "";
  }

  // The hub bar carries the optional back button. With the Home Assistant header hidden it is
  // the only way out of the view, which is why hiding the header turns it on.
  _hubBar(title) {
    if (!this._backShown()) return "";
    const svg = makeSvg(this._icons || {});
    return `<div class="hubbar"><button class="ib" data-a="back" aria-label="${esc(this._t("core.back"))}">${svg("back")}</button>` +
      `<span class="ht">${esc(title)}</span>` +
      `${this._appId && !this._cfg.app ? `<button class="ib" data-a="home" aria-label="${esc(this._t("core.launcher"))}">${svg("grid")}</button>` : ""}</div>`;
  }

  /* ---------- how the dashboards are saved ---------- */
  // Two shapes, the user's choice:
  //   views      one dashboard, one view per app, written as a strategy so nothing is stored
  //   dashboards one dashboard per app, each its own sidebar entry and URL
  async _provision(kind) {
    const hass = this._hass;
    if (!hass?.callWS) return this._toast("brak połączenia");
    if (!hass.user?.is_admin) return this._toast(this._t("setup.admin_only"));
    const reg = this._reg;
    const ids = reg.order.filter((id) => reg.apps[id] && this._available(reg.apps[id]).ok);
    try {
      if (kind === "views") {
        const path = window.location.pathname.split("/")[1] || null;
        await hass.callWS({
          type: "lovelace/config/save",
          url_path: path,
          config: { strategy: { type: "custom:app-hub", kiosk: !!this._cfg.hide_header } },
        });
        this._toast(this._t("setup.done_views"));
      } else {
        const existing = await hass.callWS({ type: "lovelace/dashboards/list" });
        for (const id of ids) {
          const m = reg.apps[id];
          const url_path = `app-${id}`;
          if (!existing.some((d) => d.url_path === url_path)) {
            await hass.callWS({
              type: "lovelace/dashboards/create",
              title: m.name,
              url_path,
              icon: m.view_icon || "mdi:application",
              show_in_sidebar: true,
            });
          }
          await hass.callWS({
            type: "lovelace/config/save",
            url_path,
            config: {
              views: [{
                title: m.name,
                type: "panel",
                cards: [{ type: "custom:app-hub-card", app: id, ...(this._cfg.hide_header ? { kiosk: true } : {}) }],
              }],
            },
          });
        }
        this._toast(this._t("setup.done_dashboards", { n: ids.length }));
      }
    } catch (e) {
      console.error("[app-hub] provision failed", e);
      this._toast(String(e?.message || e));
    }
  }

  _openOptions() {
    // window.history, not history: the core exports a `history` helper into this module.
    const url = "/config/integrations/integration/app_hub";
    window.history.pushState(null, "", url);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }

  _setupScreen() {
    const reg = this._reg;
    const n = reg.order.filter((id) => reg.apps[id] && this._available(reg.apps[id]).ok).length;
    const admin = !!this._hass?.user?.is_admin;
    return `<div class="scroll"><div class="pad"><h1>${esc(this._t("core.setup"))}</h1>` +
      `<p class="fine">${esc(this._t("setup.intro", { n }))}</p>` +
      `<button class="setupcard" data-a="prov" data-kind="views"><b>${esc(this._t("setup.views_title"))}</b>` +
      `<span>${esc(this._t("setup.views_body"))}</span></button>` +
      `<button class="setupcard" data-a="prov" data-kind="dashboards"><b>${esc(this._t("setup.dash_title"))}</b>` +
      `<span>${esc(this._t("setup.dash_body"))}</span></button>` +
      (admin ? `<button class="setupcard" data-a="apps"><b>${esc(this._t("setup.apps_title"))}</b>` +
      `<span>${esc(this._t("setup.apps_body"))}</span></button>` : "") +
      `${admin ? "" : `<p class="fine">${esc(this._t("setup.admin_only"))}</p>`}</div></div>`;
  }

  _launcher() {
    const svg = makeSvg({});
    const reg = this._reg;
    const tiles = reg.order.map((id) => {
      const m = reg.apps[id];
      if (!m) return "";
      const av = this._available(m);
      const icon = m.icon ? `<img src="${asset(`apps/${id}/${m.icon}`)}" alt="">` : svg("device");
      const sub = av.ok ? esc(m.replaces || "") : esc(this._t("core.unavailable", { what: (av.missing[0] || {}).integration || "" }));
      return av.ok
        ? `<button class="atile" data-a="app" data-id="${esc(id)}"><span class="ai">${icon}</span><b>${esc(m.name)}</b><small>${sub}</small></button>`
        : `<div class="atile off"><span class="ai">${icon}</span><b>${esc(m.name)}</b><small class="bad">${sub}</small>${(av.missing[0] || {}).hint ? `<small>${esc(av.missing[0].hint)}</small>` : ""}</div>`;
    }).join("");
    const n = reg.order.length;
    return `<div class="scroll"><div class="pad"><h1>${esc(this._t("core.launcher"))}</h1>` +
      `<p class="fine">${esc(this._t("core.apps_count", { n }))}</p><div class="atiles">${tiles}</div>` +
      `<button class="lrow" data-a="setup" style="margin-top:18px">${svg("gear")}<span>${esc(this._t("core.setup"))}</span>${svg("chev", "chev")}</button>` +
      `</div></div>`;
  }

  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-a]").forEach((el) =>
      el.addEventListener("click", (ev) => { ev.stopPropagation(); this._act(el.dataset.a, el.dataset); })
    );
    root.querySelectorAll("input[data-num]").forEach((el) =>
      el.addEventListener("change", () => this._call("number", "set_value", { entity_id: el.dataset.num, value: Number(el.value) }))
    );
  }

  _act(a, d) {
    switch (a) {
      case "back": return this._back();
      case "home": this._setupOpen = false; return this._leave();
      case "app": this._setupOpen = false; return this._enter(d.id);
      case "setup": this._setupOpen = true; return this._render();
      case "prov": return this._provision(d.kind);
      // The per-app form lives in the integration options, where Home Assistant draws the
      // entity pickers; the hub sends the user there rather than keeping a second form.
      case "apps": return this._openOptions();
      case "sheet": this._sheet = { name: d.s, params: { ...d }, tall: d.tall === "1" }; return this._render();
      case "closesheet": this._sheet = null; return this._render();
      case "go": return this._go(d.screen, { ...d });
      case "toggle": return this._call("homeassistant", "toggle", { entity_id: d.e });
      case "sel": return this._call("select", "select_option", { entity_id: d.e, option: d.v });
      case "opt": return this._call("select", "select_option", { entity_id: d.e, option: d.v });
      case "pick": this._call("select", "select_option", { entity_id: d.e, option: d.v }); return this._back();
      case "more": return this._ctx().more(d.e);
      default: {
        const fn = this._module?.actions?.[a];
        if (fn) return fn(this._ctx(), { ...d });
        console.warn("[app-hub] unhandled action", a, d);
      }
    }
  }
}

/* ---------- launcher styles, part of the hub rather than any app ---------- */
const LAUNCHER_CSS = `
.atiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px}
.atile{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;border-radius:14px;border:1px solid var(--divider-color,#dfe3ea);background:var(--card-background-color,#fff);text-align:center;min-height:150px}
.atile.off{border-style:dashed;background:transparent}
.atile b{font-size:15px;font-weight:500}
.atile small{font-size:12px;color:var(--secondary-text-color,#6b7482);line-height:1.35}
.atile small.bad{color:var(--error-color,#a1392b);font-weight:500}
.ai{width:68px;height:68px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:var(--secondary-background-color,#eceef2);overflow:hidden}
.ai img{width:100%;height:100%;object-fit:cover}
.ai .ic{width:36px;height:36px;color:var(--secondary-text-color,#6b7482)}
.setupcard{display:block;width:100%;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#dfe3ea);border-radius:12px;padding:16px;margin:12px 0;min-height:44px}
.setupcard b{display:block;font-size:17px;font-weight:500;margin-bottom:6px}
.setupcard span{display:block;font-size:13px;line-height:1.5;color:var(--secondary-text-color,#6b7482)}
`;
if (!customElements.get("app-hub-card")) customElements.define("app-hub-card", AppHubCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "app-hub-card",
  name: "App Hub",
  description: `Dashboards that replace manufacturer apps, ${VERSION} (core ${CORE_VERSION})`,
  preview: true,
  documentationURL: "https://github.com/jrx-code/hassio-integration-app-hub",
});

console.info(`%c APP-HUB %c ${VERSION} `, "color:#fff;background:#4a82e8;border-radius:3px 0 0 3px", "color:#4a82e8;background:#eceef2;border-radius:0 3px 3px 0");

// One HACS resource has to deliver both the card and the dashboard strategy, so the strategy
// is pulled in from here. A dynamic import keeps the module graph acyclic at evaluation time.
import(asset("app-hub-strategy.js"))
  .then((m) => m.register({ registry }))
  .catch((e) => console.warn("[app-hub] strategy not loaded", e));

export { AppHubCard, registry, loadModule, BASE };
