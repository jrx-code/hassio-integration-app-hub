/*
 * Chart check: runs the FoxESS chart drawing against real recorder statistics, outside a
 * browser. The test instance has no recorder history for the mirrored states, so the charts
 * there can only be seen empty; this feeds the production series into the same functions.
 *
 *   node tools/chart_check.mjs <stats.json>
 * where stats.json holds {power48h, energyWeek, ids} as recorder/statistics_during_period
 * returns them.
 */
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const root = new URL("../custom_components/app_hub/www/", import.meta.url);
const core = await import(new URL("core/index.js", root));
const file = argv[2];
if (!file) { console.error("usage: node tools/chart_check.mjs <stats.json>"); exit(2); }
const stats = JSON.parse(readFileSync(file, "utf8"));
const manifest = JSON.parse(readFileSync(new URL("apps/foxess/manifest.json", root), "utf8"));
const locales = { pl: JSON.parse(readFileSync(new URL("apps/foxess/locales/pl.json", root), "utf8")) };
const mod = (await import(new URL("apps/foxess/index.js", root))).default;

// The drawing functions only ever call root.querySelector and write innerHTML, so a stub is
// enough to run them and read what they produced.
const nodes = {};
const stub = (sel) => (nodes[sel] = nodes[sel] || { innerHTML: "", hidden: true, style: {}, dataset: {},
  getBoundingClientRect: () => ({ left: 0, width: 700 }), addEventListener: () => {} });
const rootStub = { querySelector: (s) => stub(s), querySelectorAll: () => [] };

// Node has no frame loop and no ResizeObserver; the home branch asks for both.
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || (() => {});
globalThis.window = globalThis.window || { devicePixelRatio: 1 };

const i18n = new core.I18n(locales, "pl", "pl");
const cfg = {};
for (const [k, spec] of Object.entries(manifest.config.options)) if (spec.default !== undefined) cfg[k] = spec.default;
const hass = { states: {}, callWS: async () => ({}), formatEntityState: (s) => s?.state };
const ctx = {
  hass, config: cfg, manifest, devices: [], state: {},
  t: (k, v) => i18n.t(k, v), esc: core.esc, fmt: core.fmt,
  st: (id) => hass.states[id], e: () => null, call: () => {}, more: () => {},
  go: () => {}, back: () => {}, refresh: () => {}, toast: () => {}, sheet: () => {}, closeSheet: () => {},
  svg: core.makeSvg({}), ui: core.makeUi(core.makeSvg({}), (k) => k, {}), chrome: {},
  img: (n) => n, history: async () => ({}), stats: async () => ({}),
  nav: () => ({ screen: "inv_analysis", params: {} }),
  fmtState: (s) => s?.state,
};

// The module keeps its page state in ctx.state; reach it the same way the module does.
function page(name, patch) {
  const s = (ctx.state.fx = ctx.state.fx || { pages: {}, vis: {}, tracks: null });
  s.pages[name] = { tab: "h48", open: new Set(), date: Date.now(), sel: null, data: null, ...patch };
  return s.pages[name];
}

const norm = (res, type) => {
  const out = {};
  for (const [id, rows] of Object.entries(res)) {
    out[id] = rows.map((r) => ({ t: typeof r.start === "number" ? r.start : new Date(r.start).getTime(),
      v: r.mean !== undefined ? r.mean : null, start: r.start, change: r.change }));
  }
  return out;
};

let bad = 0;
function check(label, html, must) {
  const ok = typeof html === "string" && html.length > 200 && must.every((m) => html.includes(m)) && !/undefined|NaN/.test(html);
  if (ok) console.log(`ok   ${label} (${html.length} chars)`);
  else { bad++; console.log(`FAIL ${label}: len=${html?.length} missing=${must.filter((m) => !html?.includes(m))} ` +
    `${/undefined|NaN/.test(html || "") ? "prints undefined/NaN" : ""}`); }
}

// 1. power lines, 48 h, the shape the h48 tab draws
const e = cfg.entities;
const powerStats = norm(stats.power48h);
const pg = page("inv_analysis", {
  tab: "h48",
  sel: new Set(["pv", "bat", "ac", "eps"]),
  data: { kind: "inv", energy: false, rg: { t0: Date.now() - 48 * 3600000, t1: Date.now() }, stats: powerStats },
});
mod.afterRender === undefined && console.log("note: module has no afterRender");
// drawAnalysis is not exported; the module calls it from afterRender, so go through that.
ctx.nav = () => ({ screen: "inv_analysis", params: {} });
mod.afterRender(ctx, rootStub);
check("power chart, 48 h of production data", stub('svg[data-chart="main"]').innerHTML, ["<path", "stroke", "class=\"ax\""]);
const tip = stub(".tip");
check("tooltip beside the power chart", tip.innerHTML, ["kW", "<b>"]);

// 2. energy bars, one week
const energyStats = {};
for (const [id, rows] of Object.entries(stats.energyWeek)) energyStats[id] = rows;
page("inv_analysis", {
  tab: "week",
  sel: new Set(["acout", "chg", "dis", "sol"]),
  data: { kind: "inv", energy: true, rg: { t0: Date.now() - 7 * 86400000, t1: Date.now(), period: "day", n: 7 }, stats: energyStats },
});
stub('svg[data-chart="main"]').innerHTML = "";
mod.afterRender(ctx, rootStub);
check("energy bars, one week of production data", stub('svg[data-chart="main"]').innerHTML, ["<rect", "fill=", "class=\"ax\""]);

// 3. battery SoC chart under the power chart
page("bat_analysis", {
  tab: "h48",
  sel: new Set(["bat"]),
  data: { kind: "bat", energy: false, rg: { t0: Date.now() - 48 * 3600000, t1: Date.now() }, stats: powerStats },
});
ctx.nav = () => ({ screen: "bat_analysis", params: {} });
stub('svg[data-chart="soc"]').innerHTML = "";
mod.afterRender(ctx, rootStub);
check("battery SoC chart", stub('svg[data-chart="soc"]').innerHTML, ["<path", "stroke"]);

// 4. the home screen's seven-day bars and SoC strip
const s = ctx.state.fx;
s.bars = { prod: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, v: (i + 1) * 3.5 })),
           cons: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, v: (7 - i) * 2.5 })) };
s.soc = { soc: powerStats[e.soc].map((r) => ({ t: r.t, v: r.v })),
          bat: powerStats[e.battery].map((r) => ({ t: r.t, v: r.v })), t0: Date.now() - 48 * 3600000 };
ctx.nav = () => ({ screen: "home", params: {} });
stub("#prodc").innerHTML = "";
stub("#socsvg").innerHTML = "";
// afterRender's home branch touches the canvas; without one it returns after the charts.
mod.afterRender(ctx, rootStub);
check("home screen daily bars", stub("#prodc").innerHTML, ["<path", "fill="]);
check("home screen SoC strip", stub("#socsvg").innerHTML, ["<path", "fill-opacity"]);
clearInterval(ctx.state.fx.tick);

console.log(bad ? `\n${bad} problem(s)` : "\nevery chart drew from the production series");
exit(bad ? 1 : 0);
