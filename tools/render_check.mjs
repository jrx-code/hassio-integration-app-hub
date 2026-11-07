/*
 * Render check: loads an app module the way the hub does and renders every screen and sheet
 * against the app's fixture, outside a browser. It catches what a PoC page cannot: a thrown
 * screen, a raw locale key, an "undefined" printed into the HTML.
 *
 *   node tools/render_check.mjs dreame
 *   node tools/render_check.mjs dreame --screen vac --dump
 */
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const root = new URL("../custom_components/app_hub/www/", import.meta.url);
const core = await import(new URL("core/index.js", root));

const app = argv[2];
if (!app) { console.error("usage: node tools/render_check.mjs <app> [--screen X] [--dump]"); exit(2); }
const only = argv.includes("--screen") ? argv[argv.indexOf("--screen") + 1] : null;
const dump = argv.includes("--dump");

const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const manifest = read(`apps/${app}/manifest.json`);
const fixture = read(`apps/${app}/fixture.json`);
const locales = {};
for (const lang of manifest.locales || []) {
  try { locales[lang] = read(`apps/${app}/locales/${lang}.json`); } catch (e) { /* one language is allowed */ }
}
const mod = (await import(new URL(`apps/${app}/index.js`, root))).default;

const hass = {
  states: fixture.states || {},
  entities: fixture.entities || {},
  devices: fixture.devices || {},
  language: manifest.fallback_locale || "pl",
  config: { components: (manifest.requires || []).map((r) => r.integration).filter(Boolean) },
  user: { is_admin: true },
  callService: () => {},
  callWS: async () => ({}),
  formatEntityState: (st, opt) => String(opt ?? st?.state ?? ""),
};

// The fixture carries the card config it was captured with ("card_config"), which is what the
// screens were recorded against. Without one, fall back to the manifest default and finally to
// the vacuums and fans found in the states, vacuums first.
// Same merge the hub does: manifest option defaults < the fixture's card config, objects one
// level deep, so an app that reads config.entities or config.buy_price sees what it would in HA.
const cfg = { ...(fixture.card_config || {}) };
for (const [k, spec] of Object.entries(manifest.config?.options || {})) {
  if (spec?.default === undefined) continue;
  const given = cfg[k];
  if (given === undefined) cfg[k] = spec.default;
  else if (spec.default && typeof spec.default === "object" && !Array.isArray(spec.default) && given && typeof given === "object" && !Array.isArray(given))
    cfg[k] = { ...spec.default, ...given };
}
const guess = Object.keys(hass.states)
  .filter((id) => /^(vacuum|fan)\./.test(id))
  .sort((x, y) => (x.startsWith("vacuum.") ? 0 : 1) - (y.startsWith("vacuum.") ? 0 : 1));
const devices = core.normalizeDevices(cfg.devices ?? manifest.config?.devices?.default ?? guess, manifest);

const i18n = new core.I18n(locales, manifest.fallback_locale || "pl", manifest.fallback_locale || "en");
const t = (k, v) => i18n.t(k, v);
const svg = core.makeSvg(mod.icons || {});
const chrome = { back: true, kiosk: false };
let navStack = [{ app, screen: mod.home, params: { i: 0 } }];
const state = {};
const calls = [];

const ctx = {
  chrome, hass, config: { ...cfg, devices }, manifest, devices,
  state,
  dev: (i) => devices[i],
  nav: () => navStack[navStack.length - 1],
  e: (d, k) => core.resolveEntity(hass, d, k),
  st: (id) => id && hass.states[id],
  v: (d, k) => hass.states[core.resolveEntity(hass, d, k)]?.state,
  is: (d, k) => hass.states[core.resolveEntity(hass, d, k)]?.state === "on",
  attr: (d, k, a) => hass.states[core.resolveEntity(hass, d, k)]?.attributes?.[a],
  entities: (d) => core.deviceEntities(hass, d),
  call: (dom, svc, data) => calls.push([dom, svc, data]),
  more: () => {},
  go: () => {}, back: () => {},
  sheet: () => {}, closeSheet: () => {}, sheetOpen: false,
  refresh: () => {},
  toast: () => {},
  t, svg, esc: core.esc, fmt: core.fmt,
  fmtState: (st, opt, dict) => core.stateText(hass, t, st, opt, dict),
  ui: core.makeUi(svg, t, chrome),
  img: (name) => `/app_hub_static/apps/${app}/img/${name}`,
  history: async () => ({}), stats: async () => ({}),
};

const KEY = new RegExp(`\\b(${Object.keys(locales[manifest.fallback_locale || "pl"] || {}).join("|")})\\.[A-Za-z0-9_@.]+`, "g");

let bad = 0;
function check(label, html) {
  const problems = [];
  if (typeof html !== "string") problems.push("no string returned");
  else {
    if (/undefined/.test(html)) problems.push("prints 'undefined'");
    if (/\bNaN\b/.test(html)) problems.push("prints 'NaN'");
    const keys = [...new Set((html.match(KEY) || []).filter((k) => !/^(row|rowdesc)\./.test(k)))];
    if (keys.length) problems.push(`raw locale keys: ${keys.slice(0, 5).join(", ")}`);
  }
  if (problems.length) { bad++; console.log(`FAIL ${label}: ${problems.join("; ")}`); }
  else console.log(`ok   ${label} (${html.length} chars)`);
  if (dump) console.log(html);
}

for (const screen of manifest.screens || []) {
  if (only && screen !== only) continue;
  const fn = mod.screens?.[screen];
  if (!fn) { console.log(`FAIL screen ${screen}: not implemented`); bad++; continue; }
  // The sub-page screen needs a page id; try every page the module knows through the locale.
  const paramSets = screen === "vsub"
    ? Object.keys(locales[manifest.fallback_locale || "pl"]?.page || {}).map((id) => ({ i: 0, id }))
    : [{ i: screen.startsWith("fan") ? devices.findIndex((d) => d.entity.startsWith("fan.")) : 0 }];
  for (const params of paramSets) {
    navStack = [{ app, screen, params }];
    try { check(`screen ${screen}${params.id ? ":" + params.id : ""}`, fn(ctx, params)); }
    catch (e) { bad++; console.log(`FAIL screen ${screen}${params.id ? ":" + params.id : ""}: ${e.message}`); }
  }
}

for (const name of manifest.sheets || []) {
  const fn = mod.sheets?.[name];
  if (!fn) { console.log(`FAIL sheet ${name}: not implemented`); bad++; continue; }
  const firstSelect = Object.keys(hass.states).find((id) => id.startsWith("select.") && hass.states[id].attributes?.options);
  const params = { i: 0, k: firstSelect, o: "", rt: "test", e: "@backup", l: "test", u: "x.png" };
  navStack = [{ app, screen: "vac", params: { i: 0 } }];
  try { check(`sheet ${name}`, fn(ctx, params)); }
  catch (e) { bad++; console.log(`FAIL sheet ${name}: ${e.message}`); }
}

const css = mod.css ? mod.css() : "";
if (/@media/.test(css)) { bad++; console.log("FAIL css: uses @media, the contract wants @container apphub"); }
else console.log(`ok   css (${css.length} chars, ${(css.match(/@container/g) || []).length} container queries)`);

console.log(bad ? `\n${bad} problem(s)` : "\nall screens and sheets render");
exit(bad ? 1 : 0);
