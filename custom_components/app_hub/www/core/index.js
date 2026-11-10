/*
 * App Hub core: the SDK every app module builds on.
 * Owns the card shell, navigation, entity resolution, service calls, theming, i18n,
 * Home Assistant chrome control (kiosk) and the data helpers.
 * An app module owns its screens and nothing else.
 */
export const CORE_VERSION = "0.2.1";

/* ---------- text ---------- */
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const slug = (s) => String(s ?? "").toLowerCase().replace(/[\s-]+/g, "_");

/* ---------- icons ---------- */
export const BASE_ICONS = {
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  plug: '<path d="M9 3v6M15 3v6M6 9h12v3a6 6 0 0 1-12 0zM12 18v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  device: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h5"/>',
};

export const makeSvg = (icons) => (n, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n] || BASE_ICONS[n] || ""}</svg>`;

/* ---------- formatters ---------- */
const p2 = (n) => String(n).padStart(2, "0");
export const fmt = {
  num: (s, d = 1) => (Number.isFinite(Number(s)) ? Number(Number(s).toFixed(d)) : null),
  kW: (s) => (Number.isFinite(Number(s)) ? `${(Number(s) / 1000).toFixed(2)} kW` : "--"),
  kWh: (s) => (Number.isFinite(Number(s)) ? `${Number(s).toFixed(1)} kWh` : "--"),
  pct: (s) => (Number.isFinite(Number(s)) ? `${Math.round(Number(s))} %` : "--"),
  dur: (min) => {
    const m = Math.round(Number(min));
    if (!Number.isFinite(m)) return "--";
    return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
  },
  hhmm: (t) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; },
  ymd: (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; },
};

/* ---------- state text ----------
   A producer app names an option differently from the integration ("sweeping" -> "Odkurzacz").
   The app ships those names in its locale under a dictionary key, and this falls back to Home
   Assistant's own translation when the dictionary has no entry. */
export function stateText(hass, t, st, opt, dict) {
  const v = opt ?? st?.state;
  if (dict && v != null) {
    const key = `${dict}.${v}`;
    const got = t(key);
    if (got !== key) return got;
  }
  if (st && hass?.formatEntityState) {
    try { return hass.formatEntityState(st, opt == null ? undefined : opt); } catch (e) { /* older HA */ }
  }
  return v;
}

/* ---------- theme ---------- */
// An app declares its producer palette in the manifest; the core turns it into the one
// CSS block that overrides the Home Assistant variables. No app module writes these.
export function paletteCss(palette) {
  if (!palette) return "";
  const body = Object.entries(palette).map(([k, v]) => `${k.startsWith("--") ? k : "--" + k}:${v}`).join(";");
  return `:host([theme="app"]){${body}}`;
}

/* ---------- i18n ---------- */
export class I18n {
  constructor(dicts = {}, lang = "en", fallback = "en") {
    this.dicts = dicts;
    this.lang = dicts[lang] ? lang : dicts[String(lang).split("-")[0]] ? String(lang).split("-")[0] : fallback;
    this.fallback = fallback;
  }
  t(key, vars) {
    const pick = (d) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), d);
    let v = pick(this.dicts[this.lang]);
    if (v == null) v = pick(this.dicts[this.fallback]);
    if (v == null) return key;
    return vars ? String(v).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : v;
  }
}

/* ---------- entity resolution ---------- */
// A device in the config is either an entity id (shape "entities", legacy) or an object
// {type, prefix} / {type, entity} (shape "objects"). The core normalises both into one form.
export function normalizeDevices(raw, manifest) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((d, i) => {
    const o = typeof d === "string" ? { entity: d } : { ...d };
    if (!o.prefix && o.entity) o.prefix = String(o.entity).split(".")[1];
    if (!o.type && o.entity) o.type = String(o.entity).split(".")[0];
    const tpl = manifest?.config?.devices?.anchor;
    o.anchor = o.entity || (tpl ? tpl.replace("{prefix}", o.prefix) : `switch.${o.prefix}_power`);
    o.i = i;
    return o;
  });
}

export function deviceIdOf(hass, dev) {
  const ents = hass?.entities;
  if (!ents) return null;
  return ents[dev.anchor]?.device_id || null;
}

// "<domain>.<prefix>_<suffix>" first, then any entity of the same device whose object id
// ends in "_<suffix>". A key that already holds a dot and no prefix placeholder is a domain
// plus suffix, which is how the existing cards address entities.
export function resolveEntity(hass, dev, key) {
  if (!hass || !key) return null;
  if (hass.states[key]) return key;
  const dot = key.indexOf(".");
  const domain = dot > 0 ? key.slice(0, dot) : null;
  const suffix = dot > 0 ? key.slice(dot + 1) : key;
  if (!domain) return null;
  const direct = `${domain}.${dev.prefix}_${suffix}`;
  if (hass.states[direct]) return direct;
  const devId = deviceIdOf(hass, dev);
  const ents = hass.entities;
  if (!ents || !devId) return null;
  for (const [eid, e] of Object.entries(ents)) {
    if (e.device_id === devId && eid.startsWith(domain + ".") && eid.endsWith("_" + suffix) && hass.states[eid]) return eid;
  }
  return null;
}

export function deviceEntities(hass, dev) {
  const ids = [];
  const ents = hass?.entities;
  const devId = deviceIdOf(hass, dev);
  if (ents && devId) {
    for (const [eid, e] of Object.entries(ents)) if (e.device_id === devId) ids.push(eid);
  } else if (hass?.states) {
    for (const eid of Object.keys(hass.states)) if (dev.prefix && eid.includes(dev.prefix)) ids.push(eid);
  }
  return ids;
}

/* ---------- data: history and statistics ---------- */
// The REST and websocket history calls both need an explicit end. Without one the period
// endpoint answers a single day, and a truncated series reads as a dead integration.
export async function history(hass, ids, start, end = new Date()) {
  if (!hass?.callWS || !ids?.length) return {};
  return hass.callWS({
    type: "history/history_during_period",
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    entity_ids: ids,
    minimal_response: true,
    no_attributes: true,
  });
}

export async function stats(hass, ids, start, end = new Date(), period = "hour") {
  if (!hass?.callWS || !ids?.length) return {};
  return hass.callWS({
    type: "recorder/statistics_during_period",
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    statistic_ids: ids,
    period,
  });
}

/* ---------- Home Assistant chrome (kiosk) ---------- */
// Hiding the sidebar and the dashboard toolbar means reaching outside this card's shadow
// root into the frontend's own shadow roots and injecting a style element there, the same
// place kiosk-mode puts it. Everything is reversed on disconnect, and a MutationObserver
// re-applies it after the panel re-renders.
const CHROME_ID = "app-hub-chrome-style";

function shadowChain(path) {
  let el = document;
  for (const sel of path) {
    const next = (el.shadowRoot || el).querySelector?.(sel);
    if (!next) return null;
    el = next;
  }
  return el;
}

function injectStyle(host, css) {
  const root = host?.shadowRoot;
  if (!root) return false;
  let st = root.querySelector(`#${CHROME_ID}`);
  if (!st) {
    st = document.createElement("style");
    st.id = CHROME_ID;
    root.appendChild(st);
  }
  if (st.textContent !== css) st.textContent = css;
  return true;
}

function removeStyle(host) {
  host?.shadowRoot?.querySelector(`#${CHROME_ID}`)?.remove();
}

export class ChromeControl {
  constructor() {
    this.opts = null;
    this._obs = null;
    this._tick = null;
  }

  // opts: {sidebar: boolean hide, header: boolean hide}
  apply(opts) {
    this.opts = opts;
    this._write();
    if (!this._obs) {
      const main = shadowChain(["home-assistant", "home-assistant-main"]);
      const target = main?.shadowRoot;
      if (target) {
        this._obs = new MutationObserver(() => {
          clearTimeout(this._tick);
          this._tick = setTimeout(() => this._write(), 50);
        });
        this._obs.observe(target, { childList: true, subtree: true });
      }
    }
  }

  _write() {
    if (!this.opts) return;
    const { sidebar, header } = this.opts;
    const main = shadowChain(["home-assistant", "home-assistant-main"]);
    if (main) {
      injectStyle(
        main,
        sidebar
          ? "ha-sidebar{display:none !important}.sidebar-shell{display:none !important}" +
            ".mdc-drawer-app-content,.content{margin-inline-start:0 !important;margin-left:0 !important;width:100% !important}"
          : ""
      );
    }
    const huiRoot = shadowChain([
      "home-assistant", "home-assistant-main", "partial-panel-resolver", "ha-panel-lovelace", "hui-root",
    ]);
    if (huiRoot) injectStyle(huiRoot, header ? ".header{display:none !important}" : "");
  }

  release() {
    this._obs?.disconnect();
    this._obs = null;
    clearTimeout(this._tick);
    this.opts = null;
    const main = shadowChain(["home-assistant", "home-assistant-main"]);
    if (main) removeStyle(main);
    const huiRoot = shadowChain([
      "home-assistant", "home-assistant-main", "partial-panel-resolver", "ha-panel-lovelace", "hui-root",
    ]);
    if (huiRoot) removeStyle(huiRoot);
  }

  // kiosk-mode is a separate HACS plugin that does the same job from its own config.
  static kioskModePresent() {
    return typeof window !== "undefined" && !!window.KioskMode;
  }
}

/* ---------- UI primitives ---------- */
// `chrome.back` says the hub bar already draws a back control. An app must not draw a second
// one, so every primitive that can carry one defaults to off in that case.
export function makeUi(svg, t, chrome = {}) {
  const ui = {
    bar: (title, { back = !chrome.back, right = "" } = {}) =>
      `<div class="bar">${back ? `<button class="ib" data-a="back" aria-label="${esc(t("core.back"))}">${svg("back")}</button>` : ""}<div class="bt">${esc(title)}</div>${right}</div>`,
    row: (ic, label, screen, extra = "") =>
      `<button class="lrow" data-a="go" data-screen="${esc(screen)}">${svg(ic)}<span>${esc(label)}</span>${extra}${svg("chev", "chev")}</button>`,
    chip: (text, cls = "") => `<span class="chip ${cls}">${esc(text)}</span>`,
    bar_pct: (pct) => `<div class="prog"><i style="width:${Math.max(0, Math.min(100, Number(pct) || 0))}%"></i></div>`,
    note: (text, kind = "info") => `<div class="note">${svg(kind === "info" ? "info" : "warn", kind)}<span>${esc(text)}</span></div>`,
    toggle: (entity, label, on) =>
      `<button class="srow" data-a="toggle" data-e="${esc(entity)}"><span>${esc(label)}</span><i class="sw ${on ? "on" : ""}"></i></button>`,
    seg: (entity, options, current, labeller = (o) => o) =>
      `<div class="seg">${(options || []).map((o) => `<button class="${o === current ? "on" : ""}" data-a="sel" data-e="${esc(entity)}" data-v="${esc(o)}">${esc(labeller(o))}</button>`).join("")}</div>`,
  };
  return ui;
}

/* ---------- base CSS, shared by every app ---------- */
export function baseCss() {
  return `
:host{display:block;
  /* The card draws its own surface. Not --primary-background-color: glass themes set that
     to transparent, which leaves the dashboard wallpaper showing through the whole app. */
  --app-hub-surface:var(--ha-card-background,var(--card-background-color,#fafbfe))}
*{box-sizing:border-box}
ha-card{max-width:var(--app-hub-max-width,760px);margin:0 auto;overflow:hidden;background:var(--app-hub-surface);color:var(--primary-text-color,#2e3845);font-family:Roboto,system-ui,sans-serif;border-radius:var(--ha-card-border-radius,12px)}
.wrap{position:relative;height:var(--app-hub-height,calc(100vh - 56px));min-height:560px;display:flex;flex-direction:column;background:var(--app-hub-surface);container-type:inline-size;container-name:apphub}
.wrap.kiosk{height:var(--app-hub-height,100vh)}
.scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding-bottom:96px}
.pad{padding:0 16px 24px}
h1{font-size:30px;line-height:1.2;margin:28px 0 24px;font-weight:600}
h2{font-size:22px;font-weight:600;margin:26px 0 12px}
.fine{color:var(--secondary-text-color,#6b7482);font-size:13px;line-height:1.4}
button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;text-align:left;padding:0}
.ic{width:24px;height:24px;flex:none}.ic.big{width:34px;height:34px}.ic.chev{color:var(--secondary-text-color,#6b7482);width:20px;height:20px}
.ib{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.ib.light{color:#fff;background:rgba(0,0,0,.25)}
.bar{display:flex;align-items:center;gap:10px;padding:12px 8px;position:sticky;top:0;background:var(--app-hub-surface);z-index:3}
.bt{font-size:22px;font-weight:500;flex:1;min-width:0}
.hubbar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--divider-color,#dfe3ea);background:var(--card-background-color,#fff);position:relative;z-index:4}
.hubbar .ib{width:44px;height:44px}
.hubbar .ht{font-size:16px;font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip{display:inline-block;background:var(--card-background-color,#fff);color:var(--primary-text-color,#2e3845);border-radius:8px;padding:6px 12px;font-size:16px}
.note{display:flex;gap:12px;align-items:center;background:var(--card-background-color,#fff);border-radius:12px;box-shadow:0 1px 5px rgba(30,40,70,.15);padding:14px;margin:8px 0;font-size:17px;font-weight:500}
.note .info{color:var(--primary-color,#4a82e8)}.note .warn{color:var(--warning-color,#c4561d)}
.lrow{display:flex;align-items:center;gap:16px;width:100%;padding:18px 0;border-bottom:1px solid var(--divider-color,#dfe3ea);font-size:22px}.lrow span{flex:1}
.prog{height:8px;background:var(--secondary-background-color,#eceef2);border-radius:4px;margin-top:20px;overflow:hidden}
.prog i{display:block;height:100%;background:var(--primary-color,#4a82e8)}
.srow{display:flex;justify-content:space-between;align-items:center;width:100%;padding:16px 0;border-bottom:1px solid var(--divider-color,#dfe3ea);font-size:19px;gap:12px}
.srow.col{flex-direction:column;align-items:stretch}
.srow input{width:110px;padding:8px;border:1px solid var(--divider-color,#dfe3ea);border-radius:8px;font:inherit;text-align:right;background:var(--card-background-color,#fff);color:var(--primary-text-color,#2e3845)}
.sw{width:46px;height:26px;border-radius:13px;background:var(--disabled-text-color,#c9ceda);position:relative;flex:none}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.15s}
.sw.on{background:var(--primary-color,#4a82e8)}.sw.on::after{left:23px}
.seg{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.seg button{border:1.5px solid var(--divider-color,#dfe3ea);border-radius:20px;padding:8px 14px;font-size:16px;min-height:38px}
.seg button.on{background:var(--primary-color,#4a82e8);border-color:var(--primary-color,#4a82e8);color:#fff}
/* Bottom sheet, shared: three apps needed the same modal, so the hub owns it. */
.veil{position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:5}
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--secondary-background-color,#eef0f8);border-radius:20px 20px 0 0;padding:14px 14px 18px;z-index:6;max-height:88%;overflow-y:auto;box-sizing:border-box}
.toast{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);background:var(--primary-text-color,#2e3845);color:var(--card-background-color,#fff);padding:10px 16px;border-radius:20px;font-size:15px;z-index:9;white-space:nowrap}
/* A card can be narrow on a wide screen (sidebar, columns), so the breakpoints key on the
   card width, not the viewport. */
@container apphub (max-width:420px){h1{font-size:26px}h2{font-size:20px}.lrow{font-size:19px}.bt{font-size:19px}}
`;
}
