/*
 * FoxESS: the FoxCloud 2.0 (v2.2.28) plant home screen and its sub-pages as an App Hub module.
 * Geometry, animation constants and colours come from the decompiled app:
 *   layout   res/layout/fragment_plant_hybrid_flow.xml (ConstraintLayout width_percent / ratio / bias)
 *   comets   ui/view/widget/flow/LineFlowPointView + LineFlowCommonView (+ defpackage/ab4 update listener)
 *   charts   assets/appBarChart.html, assets/batterySOC.html (ECharts options, redrawn here in SVG)
 * Design space: 700 units wide = FoxCloud on the Galaxy Z Fold8 unfolded (screenshots 2256 px wide).
 *
 * Ported from foxcloud-flow-card 0.4.0. Three things changed shape in the port, because the hub
 * owns the card shell:
 *   - the card used to write values straight into nodes (`$("#pvv").textContent`); here every
 *     screen returns HTML and the hub re-renders it when a watched entity changes,
 *   - its own page stack became hub screens with params, and its popups became hub sheets,
 *   - the comet animation keeps its phase in ctx.state, so a re-render does not restart it.
 */

const W = 700;
const FONT = 1.4;                       // app text scale measured on the Fold8 screenshots
const FLOW_H = (W * 465) / 393;         // cl_energy_flow  H,393:465
const HOUSE_H = (W * 391) / 393;        // cl_home_container H,393:391, bottom aligned
const HOUSE_TOP = FLOW_H - HOUSE_H;
const FLOW_TOP = -36;                   // status bar strip hidden above the toolbar
const PT = (1.5 * W) / 2256;            // comet point spacing: 1.5 device px on a 2256 px wide screen

// The scene images are dark skins, so the hero keeps the producer palette in every theme. The
// rest of the card reads the hub variables, which the manifest palette fills in app theme.
const C = {
  path: "#535762", green: "#24a148", blue: "#4589ff", red: "#fa4d56", neutral: "#666a76",
  comet: "#00ff00",                     // LineFlow*View default, no flow_path_color is ever set
  socCharge: "#6fdc8c", socDischarge: "#4589ff", socNone: "#535762",
  bar: "#535762", barLast: "#6929c4",
};
const CS = {
  pv: "#8a3ffc", bat: "#007d79", ac: "#78a9ff", eps: "#d02670", charged: "#42be65",
  discharged: "#007d79", soc: "#42be65", load: "#08bdba", imp: "#ee5396", sav: "#08bdba", feed: "#4589ff",
};

/* ---------- geometry (ConstraintLayout -> design units) ---------- */
function box(wp, a, b, hb, vb) {
  const w = W * wp, h = (w * b) / a;
  return { x: hb * (W - w), y: HOUSE_TOP + vb * (HOUSE_H - h), w, h };
}
const G = {
  grid: box(0.476, 187, 75, 0.106, 0.84),
  load: box(0.105, 42, 12, 0.586, 0.669),
  inv: box(0.148, 58, 17, 0.446, 0.665),
  invpv: box(0.005, 2, 74, 0.385, 0.525),
  bat: box(0.005, 2, 30, 0.385, 0.72),
  pv: box(0.4885, 192, 95, 0.74, 0.46),
  inverter: box(0.195, 77, 40, 0.37, 0.65),
  battery: box(0.195, 77, 74, 0.37, 0.82),
};
G.cross = { w: 9, h: 9, x: 0.528 * (W - 9), y: HOUSE_TOP + 0.681 * (HOUSE_H - 9) };

const LABELS = {
  grid: { x: 0.08 * (W - 0.3 * W), w: 0.3 * W, h: 0.24 * FLOW_H },
  soc: { x: 0.58 * (W - 0.3 * W), w: 0.3 * W, h: 0.22 * FLOW_H },
  load: { x: W - 0.25 * W, w: 0.25 * W, h: 0.26 * FLOW_H },
};
const SOLAR_DIV = (() => {
  const h = 0.18 * FLOW_H;
  return { x: 0.395 * (W - 0.5), y: HOUSE_TOP + 0.27 * (HOUSE_H - h), h };
})();

// Static path vectors (fill #535762, fitXY into their ImageView)
const PATHS = {
  grid: { vw: 187, vh: 75, d: "M0.03,35.1C0.16,34.7 0.58,34.48 0.98,34.61L121.16,72.52C122.79,73.03 124.54,73.03 126.16,72.5L183.68,54.06C184.2,53.89 184.55,53.41 184.55,52.87V0.75C184.55,0.34 184.88,0 185.3,0C185.71,0 186.05,0.34 186.05,0.75V52.87C186.05,54.07 185.28,55.12 184.14,55.49L126.62,73.93C124.7,74.55 122.63,74.55 120.71,73.95L0.52,36.04C0.13,35.91 -0.09,35.49 0.03,35.1Z", grad: true },
  load: { vw: 42, vh: 12, d: "M40.467,0.024C40.868,-0.08 41.277,0.161 41.382,0.561C41.486,0.962 41.245,1.371 40.845,1.476L0.938,11.861C0.538,11.965 0.129,11.726 0.024,11.325C-0.08,10.924 0.161,10.514 0.561,10.41L40.467,0.024Z" },
  inv: { vw: 58, vh: 17, d: "M0.025,0.556C0.133,0.156 0.544,-0.082 0.944,0.025L56.702,14.966C57.102,15.073 57.34,15.485 57.233,15.885C57.126,16.285 56.714,16.522 56.314,16.415L0.556,1.475C0.156,1.367 -0.082,0.956 0.025,0.556Z" },
  invpv: { vw: 2, vh: 41, d: "M1.5,39.951C1.5,40.365 1.164,40.701 0.75,40.701C0.336,40.701 0,40.365 0,39.951V0.354L1.5,1.5V39.951Z" },
  bat: { vw: 2, vh: 41, d: "M1.5,39.951C1.5,40.365 1.164,40.701 0.75,40.701C0.336,40.701 0,40.365 0,39.951V0.354L1.5,1.5V39.951Z" },
};

// Comet tracks: [view rect, local polyline/curve in 0..1 or viewport units, count, tail, ms]
const COMETS = {
  grid: { r: "grid", vw: 187, vh: 75, d: "M0.03,35.1 L122.16,73.52 C123.79,74.03 125.54,74.03 127.16,73.5 L183.68,54.06 C184.2,53.89 184.3,53.41 185.3,52.87 L185.3,0.75", n: 100, t: 80, ms: 1500 },
  inv: { r: "inv", line: [0, 0.05, 1, 0.94], n: 25, t: 20, ms: 1500 },
  load: { r: "load", line: [0, 0.94, 0.98, 0.04], n: 25, t: 20, ms: 1500 },
  invpv: { r: "invpv", line: [0.4, 0, 0.4, 1], n: 40, t: 35, ms: 1000 },
  bat: { r: "bat", line: [0.4, 0, 0.4, 1], n: 40, t: 35, ms: 1000 },
};

const ART = {
  chevron: '<path fill="currentColor" d="M12,13.171L16.95,8.222L18.364,9.636L12,16L5.636,9.636L7.05,8.222L12,13.171Z"/>',
  alarm: '<path fill="currentColor" d="M4,20V14C4,9.582 7.582,6 12,6C16.418,6 20,9.582 20,14V20H21V22H3V20H4ZM6,20H18V14C18,10.686 15.314,8 12,8C8.686,8 6,10.686 6,14V20ZM11,2H13V5H11V2ZM19.778,4.808L21.192,6.222L19.071,8.343L17.657,6.929L19.778,4.808ZM2.808,6.222L4.222,4.808L6.343,6.929L4.929,8.343L2.808,6.222ZM7,14C7,11.239 9.239,9 12,9V11C10.343,11 9,12.343 9,14H7Z"/>',
  more: '<g fill="currentColor"><circle cx="2.5" cy="2.5" r="2.5"/><circle cx="11.5" cy="2.5" r="2.5"/><circle cx="20.5" cy="2.5" r="2.5"/></g>',
  prompt: '<path fill="currentColor" d="M5.5,11.417C2.508,11.417 0.083,8.992 0.083,6C0.083,3.009 2.508,0.583 5.5,0.583C8.492,0.583 10.917,3.009 10.917,6C10.917,8.992 8.492,11.417 5.5,11.417ZM5.5,10.333C6.649,10.333 7.751,9.877 8.564,9.064C9.377,8.252 9.833,7.149 9.833,6C9.833,4.851 9.377,3.749 8.564,2.936C7.751,2.123 6.649,1.667 5.5,1.667C4.351,1.667 3.248,2.123 2.436,2.936C1.623,3.749 1.167,4.851 1.167,6C1.167,7.149 1.623,8.252 2.436,9.064C3.248,9.877 4.351,10.333 5.5,10.333ZM4.958,3.292H6.042V4.375H4.958V3.292ZM4.958,5.458H6.042V8.708H4.958V5.458Z"/>',
  gridBody: "M9.621,1.5C9.308,1.819 9.059,2.201 8.894,2.625H6.426L5.898,4.5H8.733C8.806,4.858 8.937,5.194 9.114,5.5H5.617L4.914,8H11.086L10.788,6.938C11.163,7.085 11.572,7.167 12,7.167C12.006,7.167 12.013,7.166 12.02,7.166L12.255,8H13.75C13.888,8 14,8.112 14,8.25V8.75C14,8.888 13.888,9 13.75,9H12.537L14.323,15.35C14.353,15.457 14.24,15.547 14.143,15.493L8,12.13L1.857,15.493C1.76,15.546 1.647,15.457 1.676,15.35L3.463,9H2.25C2.112,9 2,8.888 2,8.75V8.25C2,8.112 2.112,8 2.25,8H3.745L4.448,5.5H3.75C3.612,5.5 3.5,5.388 3.5,5.25V4.75C3.5,4.612 3.612,4.5 3.75,4.5H4.73L5.497,1.773C5.543,1.612 5.69,1.5 5.858,1.5H9.621ZM3.404,13.364L6.829,11.488L4.319,10.114L3.404,13.364ZM9.171,11.488L12.596,13.364L11.681,10.114L9.171,11.488ZM4.631,9.003L8,10.847L11.369,9.003L11.368,9H4.632L4.631,9.003Z",
  gridImportArrow: "M14.666,3.833L12,6.5V4.5H9.333V3.167H12V1.167L14.666,3.833Z",
  gridExportArrow: "M12,3.167H14.666V4.5H12V6.5L9.333,3.833L12,1.166V3.167Z",
  quick: '<path fill="currentColor" d="M5.329,3.272C6.563,2.833 7.992,3.107 8.979,4.094C10.1,5.215 10.302,6.907 9.584,8.234L20.293,18.944L18.879,20.358L8.17,9.649C6.843,10.367 5.151,10.165 4.03,9.044C3.042,8.057 2.768,6.627 3.207,5.393L5.444,7.63C6.03,8.216 6.979,8.216 7.565,7.63C8.151,7.044 8.151,6.094 7.565,5.509L5.329,3.272ZM15.697,5.155L18.879,3.387L20.293,4.802L18.525,7.984L16.757,8.337L14.636,10.458L13.222,9.044L15.343,6.923L15.697,5.155ZM8.979,13.287L10.394,14.701L5.09,20.004C4.7,20.395 4.066,20.395 3.676,20.004C3.313,19.642 3.287,19.07 3.598,18.677L3.676,18.59L8.979,13.287Z"/>',
  arrow: '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M9,6L15,12L9,18"/>',
  cloudSun: '<path fill="#ffaa44" d="M13.3,1.267C14.476,1.267 15.603,1.734 16.435,2.565C17.266,3.397 17.733,4.524 17.733,5.7C17.733,6.876 17.266,8.003 16.435,8.835C15.603,9.666 14.476,10.133 13.3,10.133C12.124,10.133 10.997,9.666 10.165,8.835C9.334,8.003 8.867,6.876 8.867,5.7C8.867,4.524 9.334,3.397 10.165,2.565C10.997,1.734 12.124,1.267 13.3,1.267Z"/><path fill="#e3e3e4" d="M8.233,4.433C9.467,4.433 10.659,4.884 11.585,5.7C12.51,6.516 13.106,7.642 13.261,8.867H13.933C15.109,8.867 16.237,9.334 17.068,10.165C17.9,10.997 18.367,12.124 18.367,13.3C18.367,14.476 17.9,15.603 17.068,16.435C16.237,17.266 15.109,17.733 13.933,17.733H5.067C4.059,17.734 3.081,17.391 2.295,16.762C1.508,16.133 0.959,15.254 0.738,14.271C0.517,13.288 0.638,12.259 1.08,11.354C1.523,10.449 2.26,9.721 3.171,9.291C3.225,7.985 3.782,6.75 4.725,5.844C5.669,4.939 6.926,4.433 8.233,4.433Z"/>',
};

const WEATHER_MDI = {
  "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", fog: "mdi:weather-fog",
  hail: "mdi:weather-hail", lightning: "mdi:weather-lightning", "lightning-rainy": "mdi:weather-lightning-rainy",
  pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy", snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy", sunny: "mdi:weather-sunny", windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant", exceptional: "mdi:alert-circle-outline",
};

/* ---------- value helpers ---------- */
const num = (s) => {
  if (!s || s.state === "unavailable" || s.state === "unknown" || s.state === "") return null;
  const v = parseFloat(s.state);
  return Number.isFinite(v) ? v : null;
};
const kW = (s) => {
  const v = num(s);
  if (v === null) return null;
  const u = (s.attributes.unit_of_measurement || "kW").toLowerCase();
  return u === "w" ? v / 1000 : v;
};
const kWh = (s) => {
  const v = num(s);
  if (v === null) return null;
  const u = (s.attributes.unit_of_measurement || "kWh").toLowerCase();
  return u === "mwh" ? v * 1000 : u === "wh" ? v / 1000 : v;
};
const p2 = (n) => String(n).padStart(2, "0");
const hhmm = (t) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const dayTime = (t) => { const d = new Date(t); return `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${hhmm(t)}`; };
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const fmt2 = (v) => (v === null ? "--" : Math.abs(v).toFixed(2));
const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? "--" : (Math.round(v * 100) / 100).toFixed(2));
const kwhTxt = (v) => (v === null || v === undefined ? "--" : String(Math.round(v * 10) / 10));
const grouped = (v, d = 1) => (v === null ? "--" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const energyShort = (v) => (v === null ? "--" : String(Math.round(v * 10) / 10));
const statT = (r) => (typeof r.start === "number" ? r.start : new Date(r.start).getTime());

function ago(ctx, ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  const units = [[31536000, "unit_year"], [2592000, "unit_month"], [86400, "unit_day"], [3600, "unit_hour"], [60, "unit_minute"]];
  for (const [n, key] of units) {
    const k = Math.floor(s / n);
    if (k >= 1) return ctx.t("ui.updated_ago", { what: `${k} ${ctx.t(`ui.${key}`)}` });
  }
  return ctx.t("ui.just_now");
}

function niceTicks(min, max, n = 6) {
  if (min === max) max = min + 1;
  const raw = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 3, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}

/* ---------- comet tracks ---------- */
// path data with absolute M/L/C/H/V only -> polyline points in design units
function mapPath(d, vw, vh, r) {
  const sx = r.w / vw, sy = r.h / vh;
  const toks = d.match(/[MLCHVZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const out = [];
  let cmd = null, i = 0, cx = 0, cy = 0;
  const P = (x, y) => [r.x + x * sx, r.y + y * sy];
  while (i < toks.length) {
    if (/[A-Z]/i.test(toks[i])) cmd = toks[i++].toUpperCase();
    if (cmd === "M" || cmd === "L") {
      cx = +toks[i++]; cy = +toks[i++];
      out.push(P(cx, cy));
    } else if (cmd === "C") {
      const x1 = +toks[i++], y1 = +toks[i++], x2 = +toks[i++], y2 = +toks[i++], x3 = +toks[i++], y3 = +toks[i++];
      for (let k = 1; k <= 12; k++) {
        const t = k / 12, m = 1 - t;
        out.push(P(m * m * m * cx + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3,
                   m * m * m * cy + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3));
      }
      cx = x3; cy = y3;
    } else if (cmd === "H") { cx = +toks[i++]; out.push(P(cx, cy)); }
    else if (cmd === "V") { cy = +toks[i++]; out.push(P(cx, cy)); }
    else i++;
  }
  return out;
}

class Track {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++)
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
  }
  at(d) {  // PathMeasure.getPosTan clamps to [0, length]
    if (d <= 0) return this.pts[0];
    if (d >= this.len) return this.pts[this.pts.length - 1];
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] < d) lo = m; else hi = m; }
    const f = (d - this.cum[lo]) / (this.cum[hi] - this.cum[lo] || 1);
    const a = this.pts[lo], b = this.pts[hi];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
}

function buildTracks() {
  const tracks = {};
  for (const [k, c] of Object.entries(COMETS)) {
    const r = G[c.r];
    const pts = c.d
      ? mapPath(c.d, c.vw, c.vh, r)
      : [[r.x + c.line[0] * r.w, r.y + c.line[1] * r.h], [r.x + c.line[2] * r.w, r.y + c.line[3] * r.h]];
    tracks[k] = { fwd: new Track(pts), rev: new Track(pts.slice().reverse()), ...c };
  }
  return tracks;
}

/* ---------- per card instance state ---------- */
const S = (ctx) => (ctx.state.fx = ctx.state.fx || { pages: {}, vis: {}, tracks: null, raf: null, tick: null, canvas: null, scale: 0 });
const PG = (ctx, name) => {
  const s = S(ctx);
  if (!s.pages[name]) {
    const tab = ["plant_analysis", "revenue"].includes(name) ? "day" : name === "revenue_cal" ? "month" : name === "alarm" ? "cur" : "h48";
    s.pages[name] = { tab, open: new Set(), date: Date.now(), sel: null, data: null };
  }
  return s.pages[name];
};

const E = (ctx) => ctx.config.entities || {};
const st = (ctx, key) => { const id = E(ctx)[key]; return id && ctx.hass.states[id]; };

function flags(ctx) {
  const c = ctx.config, db = c.deadband;
  const pv = kW(st(ctx, "pv"));
  let grid = kW(st(ctx, "grid")); if (grid !== null && !c.grid_export_positive) grid = -grid;
  let bat = kW(st(ctx, "battery")); if (bat !== null && !c.battery_discharge_positive) bat = -bat;
  const load = kW(st(ctx, "load"));
  const sgn = (v) => (v === null || Math.abs(v) <= db ? 0 : v > 0 ? 1 : -1);
  const dev = pv === null && bat === null ? null : (pv || 0) + (bat || 0);
  return {
    pv, grid, bat, load,
    solarToDevice: sgn(pv) > 0 ? 1 : 0,
    batToDevice: sgn(bat),                  // 1 discharge (up), -1 charge (down)
    gridToHidden: -sgn(grid),               // 1 import (grid -> junction), -1 export
    deviceToHidden: sgn(dev),               // 1 inverter -> junction
    loadToHidden: sgn(load) > 0 ? -1 : 0,   // -1 junction -> home
  };
}

const workModeName = (ctx, o) => {
  const key = `work_mode.${String(o).toLowerCase()}`;
  const got = ctx.t(key);
  return got === key ? o : got;
};

const noFault = (state) => state === undefined || state === null || /^(none|ok|0|unknown|unavailable|)$/i.test(String(state).trim());

function pill(ctx, stateKey = "status") {
  const online = num(st(ctx, "pv")) !== null;
  const txt = String((st(ctx, stateKey) || {}).state || "").toLowerCase();
  if (!online) return [ctx.t("ui.offline"), C.neutral];
  if (/fault|error|usterka/.test(txt)) return [ctx.t("ui.fault"), C.red];
  return [ctx.t("ui.normal"), C.green];
}

// A value key may hold a list of entity ids (the AC port is R+S+T), which are summed.
function val(ctx, key, digits = 1, unitOverride) {
  const raw = E(ctx)[key];
  const ids = Array.isArray(raw) ? raw : [raw];
  if (!ids[0]) return { v: "--", u: unitOverride || "" };
  let sum = 0, unit = unitOverride;
  for (const id of ids) {
    const s = ctx.hass.states[id];
    const n = num(s);
    if (n === null) return { v: "--", u: unitOverride || (s && s.attributes.unit_of_measurement) || "" };
    sum += n;
    unit = unit || (s.attributes.unit_of_measurement || "");
  }
  return { v: sum.toFixed(digits), u: unit };
}

function energyVal(ctx, key) {   // kWh below 1000, MWh above, like the app
  const v = kWh(st(ctx, key));
  if (v === null) return { v: "--", u: "kWh" };
  return v >= 1000 ? { v: (v / 1000).toFixed(2), u: "MWh" } : { v: String(Math.round(v * 10) / 10), u: "kWh" };
}

const BACK_SVG = '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M15,5L8,12L15,19"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M9,6L15,12L9,18"/></svg>';
const CHEV_DOWN = '<svg class="chev" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M6,9L12,15L18,9"/></svg>';
const ARROW_L = '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M20,12H5M11,6L5,12L11,18"/></svg>';
const ARROW_R = '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M4,12H19M13,6L19,12L13,18"/></svg>';

// The hub bar already carries a back control, so the page head only draws its own when it does not.
function head(ctx, title, right = "") {
  const back = ctx.chrome.back ? "" : `<button class="bk" data-a="back">${BACK_SVG}<span>${ctx.esc(ctx.t("ui.back"))}</span></button>`;
  return `<div class="sh">${back}<div class="st">${ctx.esc(title)}</div>${right}</div>`;
}

const range = (ctx, pg) => {
  const d = new Date(pg.date);
  const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (pg.tab) {
    case "h48": return { t0: Date.now() - 48 * 3600000, t1: Date.now(), label: `${dayTime(Date.now() - 48 * 3600000)} ~ ${ctx.t("ui.now")}` };
    case "day": return { t0: day0.getTime(), t1: day0.getTime() + 86400000, label: ymd(day0) };
    case "week": {
      const mon = new Date(day0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
      return { t0: mon.getTime(), t1: mon.getTime() + 7 * 86400000, label: `${ymd(mon)} ~ ${ymd(sun)}`, period: "day", n: 7 };
    }
    case "month": {
      const m0 = new Date(d.getFullYear(), d.getMonth(), 1), m1 = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return { t0: m0.getTime(), t1: m1.getTime(), label: `${d.getFullYear()}-${p2(d.getMonth() + 1)}`, period: "day", n: Math.round((m1 - m0) / 86400000) };
    }
    case "year": return { t0: new Date(d.getFullYear(), 0, 1).getTime(), t1: new Date(d.getFullYear() + 1, 0, 1).getTime(), label: String(d.getFullYear()), period: "month", n: 12 };
    default: return { t0: new Date(2015, 0, 1).getTime(), t1: Date.now(), label: "", period: "month", n: 0 };
  }
};

function seriesOf(ctx, kind, energy) {
  const e = E(ctx), t = (k) => ctx.t(`ui.${k}`);
  if (kind === "inv") return energy
    ? [{ k: "acout", n: t("ac_out"), c: CS.ac, id: e.yield_total }, { k: "chg", n: t("charged"), c: CS.charged, id: e.battery_charge_total },
       { k: "dis", n: t("discharged"), c: CS.discharged, id: e.battery_discharge_total }, { k: "sol", n: t("solar"), c: CS.pv, id: e.production_total }]
    : [{ k: "pv", n: t("pv_p"), c: CS.pv, id: e.pv }, { k: "bat", n: t("bat_p"), c: CS.bat, id: e.battery },
       { k: "ac", n: t("ac_p"), c: CS.ac, id: e.ac_power }, { k: "eps", n: t("eps_p"), c: CS.eps, id: e.eps }];
  if (kind === "plant") return energy
    // PlantAnalysisActivity S0/T0: supply (PV, grid import, discharge) and usage (load, export, charge)
    ? [{ k: "pv", n: t("pv_prod"), c: CS.pv, id: e.production_total }, { k: "load", n: t("load_cons"), c: CS.load, id: e.consumption_total },
       { k: "imp", n: t("grid_import_l"), c: CS.imp, id: e.purchased_total }, { k: "exp", n: t("grid_export_l"), c: CS.ac, id: e.feed_in_total },
       { k: "chg", n: t("bat_charge"), c: CS.charged, id: e.battery_charge_total }, { k: "dis", n: t("bat_discharge"), c: CS.discharged, id: e.battery_discharge_total }]
    : [{ k: "pv", n: t("pv_p"), c: CS.pv, id: e.pv }, { k: "load", n: t("load_p"), c: CS.load, id: e.load },
       { k: "grid", n: t("grid_p"), c: CS.imp, id: e.grid }, { k: "bat", n: t("bat_p"), c: CS.bat, id: e.battery }];
  if (kind === "rev") return [{ k: "sav", n: t("solar_savings"), c: CS.sav, id: "rev:sav" }, { k: "feed", n: t("feed_revenue"), c: CS.feed, id: "rev:feed" }];
  return energy
    ? [{ k: "chg", n: t("charged"), c: CS.charged, id: e.battery_charge_total }, { k: "dis", n: t("discharged"), c: CS.discharged, id: e.battery_discharge_total }]
    : [{ k: "bat", n: t("bat_p"), c: CS.bat, id: e.battery }];
}

const RING = (pct, col) => {
  const r = 34, c = 2 * Math.PI * r, f = pct === null ? 0 : Math.max(0, Math.min(1, pct / 100));
  return `<svg class="ring" viewBox="0 0 80 80"><circle cx="40" cy="40" r="${r}" fill="none" stroke="#2c2d30" stroke-width="7"/>
    ${f > 0 ? `<circle cx="40" cy="40" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/>` : ""}
    <text x="40" y="45" text-anchor="middle" fill="${col}">${pct === null ? "--" : Math.round(pct)}%</text></svg>`;
};

/* ---------- chart drawing (SVG, filled in after render) ---------- */
function drawBars(ctx, root) {
  const s = S(ctx), bars = s.bars;
  if (!bars) return;
  const draw = (sel, dsel, data, todayVal) => {
    const svg = root.querySelector(sel);
    if (!svg || !data) return;
    const vals = data.map((d) => d.v);
    if (todayVal !== null) vals[6] = todayVal;
    const max = Math.max(...vals, 0.001);
    const top = 30, base = 90, slot = 300 / 7;
    let out = `<line x1="0" x2="300" y1="${base + 0.5}" y2="${base + 0.5}" stroke="rgba(135,141,150,0.32)" stroke-width="1"/>`;
    vals.forEach((v, i) => {
      const cx = slot * i + slot / 2;
      const hgt = Math.max(0, ((base - top) * v) / max);
      if (i === 6) out += `<line x1="${cx}" x2="${cx}" y1="${top - 30}" y2="${base}" stroke="var(--fx-sep)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      if (hgt > 0) out += `<path d="M${cx - 3.5},${base}V${base - hgt + 2}q0,-2 2,-2h3q2,0 2,2V${base}Z" fill="${i === 6 ? C.barLast : C.bar}"/>`;
    });
    svg.innerHTML = out;
    const days = root.querySelector(dsel);
    if (days) days.innerHTML = data.map((d) => `<span>${d.day}</span>`).join("");
  };
  draw("#prodc", "#prodd", bars.prod, kWh(st(ctx, "production_today")));
  draw("#consc", "#consd", bars.cons, kWh(st(ctx, "consumption_today")));
}

function drawSoc(ctx, root) {
  const s = S(ctx);
  const svg = root.querySelector("#socsvg");
  if (!svg || !s.soc) return;
  const batAt = new Map(s.soc.bat.map((r) => [r.t, r.v]));
  const pts = [];
  for (const r of s.soc.soc) {
    if (r.v === null) continue;
    let b = batAt.has(r.t) ? batAt.get(r.t) : null;
    if (b !== null && !ctx.config.battery_discharge_positive) b = -b;
    const state = b === null || Math.abs(b) <= ctx.config.deadband ? 0 : b > 0 ? 1 : -1;
    pts.push({ t: r.t, s: r.v, state });
  }
  if (pts.length < 2) { svg.innerHTML = ""; return; }
  const W2 = 640, H2 = 110, padX = 20, top = 10, base = H2 - 22;
  const x = (i) => padX + ((W2 - 2 * padX) * i) / (pts.length - 1);
  const y = (v) => base - ((base - top) * v) / 100;
  const color = (state) => (state === -1 ? C.socCharge : state === 1 ? C.socDischarge : C.socNone);
  let out = "";
  let segStart = 0;
  // smooth path (Catmull-Rom -> Bezier), split into segments by battery state like the visualMap pieces
  const seg = (a, b, state) => {
    let d = `M${x(a)},${y(pts[a].s)}`;
    for (let i = a; i < b; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      const i0 = Math.max(i - 1, 0), i3 = Math.min(i + 2, pts.length - 1);
      const c1x = x(i) + (x(i + 1) - x(i0)) / 6, c1y = y(p1.s) + (y(p2.s) - y(p0.s)) / 6;
      const c2x = x(i + 1) - (x(i3) - x(i)) / 6, c2y = y(p2.s) - (y(p3.s) - y(p1.s)) / 6;
      d += `C${c1x},${c1y} ${c2x},${c2y} ${x(i + 1)},${y(p2.s)}`;
    }
    const col = color(state);
    out += `<path d="${d}L${x(b)},${base}L${x(a)},${base}Z" fill="${col}" fill-opacity="0.1"/>`;
    out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].state !== pts[i - 1].state || i === pts.length - 1) { seg(segStart, i, pts[segStart].state); segStart = i; }
  }
  out += `<line x1="0" x2="${W2}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="rgba(135,141,150,0.32)" stroke-width="1"/>`;
  svg.innerHTML = out;
  const mid = pts[Math.floor(pts.length / 2)];
  const xs = root.querySelector("#socx");
  if (xs) xs.innerHTML = `<span>${dayTime(pts[0].t)}</span><span>${dayTime(mid.t)}</span><span>${ctx.t("ui.now")}</span>`;
}

function drawAnalysis(ctx, root, screen) {
  const pg = PG(ctx, screen);
  const data = pg.data;
  const svg = root.querySelector('svg[data-chart="main"]');
  if (!svg || !data) return;
  const series = seriesOf(ctx, data.kind, data.energy).filter((s) => pg.sel && pg.sel.has(s.k));
  const tip = root.querySelector(".tip");
  const L = 44, R = 690, T0 = 24, B = 300;
  const grid = (ticks, y, unit) => ticks.map((v) =>
    `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "rgba(135,141,150,0.6)" : "rgba(135,141,150,0.25)"}" stroke-dasharray="${v === 0 ? "" : "3 4"}" vector-effect="non-scaling-stroke"/>` +
    `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${+v.toFixed(2)}</text>`).join("") +
    `<text x="8" y="12" class="ax">${unit}</text>`;
  let out = "";
  if (!data.energy) {
    // power lines: sum list ids (AC port = R+S+T)
    const rows = series.map((s) => {
      const ids = Array.isArray(s.id) ? s.id : [s.id];
      const base = (data.stats[ids[0]] || []).map((r) => ({ t: r.t, v: r.v }));
      for (const extra of ids.slice(1)) {
        const m = new Map((data.stats[extra] || []).map((r) => [r.t, r.v]));
        base.forEach((r) => { r.v = r.v === null || !m.has(r.t) ? null : r.v + m.get(r.t); });
      }
      return { s, pts: base.filter((r) => r.v !== null) };
    });
    const all = rows.flatMap((r) => r.pts.map((p) => p.v));
    if (!all.length) { svg.innerHTML = `<text x="350" y="165" text-anchor="middle" class="nd">${ctx.t("ui.no_data")}</text>`; if (tip) tip.hidden = true; return; }
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const x = (t) => L + ((R - L) * (t - data.rg.t0)) / (data.rg.t1 - data.rg.t0);
    const y = (v) => B - ((B - T0) * (v - lo)) / (hi - lo);
    out += grid(ticks, y, "kW");
    for (const { s, pts } of rows) {
      if (pts.length < 2) continue;
      const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
      out += `<path d="${d}L${x(pts[pts.length - 1].t)},${y(0)}L${x(pts[0].t)},${y(0)}Z" fill="${s.c}" fill-opacity="0.28"/>`;
      out += `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
    }
    const span = data.rg.t1 - data.rg.t0;
    for (let k = 0; k <= 6; k++) {
      const t = data.rg.t0 + (span * k) / 6;
      out += `<text x="${x(t)}" y="${B + 20}" text-anchor="${k === 0 ? "start" : k === 6 ? "end" : "middle"}" class="ax">${pg.tab === "h48" ? dayTime(t) : k === 6 ? "23:59" : hhmm(t)}</text>`;
    }
    // tooltip at the hover position (default: latest sample, as the app locks it there)
    const withPts = rows.filter((r) => r.pts.length);
    if (!withPts.length) { svg.innerHTML = out; return; }
    const lastT = Math.max(...withPts.map((r) => r.pts[r.pts.length - 1].t));
    const tt = pg.hover !== undefined ? data.rg.t0 + pg.hover * span : lastT;
    const near = (pts) => pts.reduce((a, p) => (Math.abs(p.t - tt) < Math.abs(a.t - tt) ? p : a), pts[0]);
    const ref = near(withPts[0].pts);
    out += `<line x1="${x(ref.t)}" x2="${x(ref.t)}" y1="${T0 - 14}" y2="${B}" stroke="#e9ebf0" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    const lines = withPts.map(({ s, pts }) => `<div><i style="background:${s.c}"></i>${ctx.esc(s.n)}<b>${near(pts).v.toFixed(2)}</b> kW</div>`);
    if (data.kind === "bat") {
      const socPts = (data.stats[E(ctx).soc] || []).filter((r) => r.v !== null);
      if (socPts.length) lines.push(`<div><i style="background:${CS.soc}"></i>${ctx.t("ui.soc_short")}<b>${near(socPts).v.toFixed(2)}</b> %</div>`);
    }
    if (tip) {
      tip.innerHTML = `<p>${ctx.esc(new Date(ref.t).toLocaleString("sv-SE"))}</p>${lines.join("")}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(62, Math.max(2, (x(ref.t) / 700) * 100 - 22))}%`;
    }
    svg.innerHTML = out;
    const ssvg = root.querySelector('svg[data-chart="soc"]');
    if (ssvg) {
      const sp = (data.stats[E(ctx).soc] || []).filter((r) => r.v !== null);
      const ys = (v) => 100 - (85 * v) / 100;
      let so = [0, 50, 100].map((v) =>
        `<line x1="${L}" x2="${R}" y1="${ys(v)}" y2="${ys(v)}" stroke="rgba(135,141,150,${v ? 0.25 : 0.6})" stroke-dasharray="${v ? "3 4" : ""}" vector-effect="non-scaling-stroke"/>` +
        `<text x="${L - 8}" y="${ys(v) + 4}" text-anchor="end" class="ax">${v}</text>`).join("");
      if (sp.length > 1) so += `<path d="${sp.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${ys(p.v).toFixed(1)}`).join("")}" fill="none" stroke="${CS.soc}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
      so += `<line x1="${x(ref.t)}" x2="${x(ref.t)}" y1="0" y2="100" stroke="#e9ebf0" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      ssvg.innerHTML = so;
    }
    return;
  }
  // energy bars
  const rg = data.rg;
  const bucket = (t) => {
    const d = new Date(t);
    if (pg.tab === "day") return d.getHours();
    if (pg.tab === "year") return d.getMonth();
    if (pg.tab === "total") return d.getFullYear();
    return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - rg.t0) / 86400000);
  };
  const cols = new Map();
  for (const s of series) {
    for (const r of data.stats[s.id] || []) {
      const b = bucket(statT(r));
      if (!cols.has(b)) cols.set(b, {});
      cols.get(b)[s.k] = (cols.get(b)[s.k] || 0) + (r.change || 0);
    }
  }
  const keys = pg.tab === "total" ? [...cols.keys()].sort() : Array.from({ length: rg.n }, (_, i) => i);
  if (!keys.length || ![...cols.values()].some((c) => Object.values(c).some((v) => v > 0))) {
    svg.innerHTML = `<text x="350" y="165" text-anchor="middle" class="nd">${ctx.t("ui.no_data")}</text>`;
    if (tip) tip.hidden = true;
    return;
  }
  const stacked = data.kind === "rev";  // revenue: savings + feed-in stacked per slot, like the app
  const vals = stacked
    ? [...cols.values()].map((c) => series.reduce((a, s) => a + Math.max(0, c[s.k] || 0), 0))
    : [...cols.values()].flatMap((c) => Object.values(c));
  const ticks = niceTicks(0, Math.max(...vals, stacked ? 0.5 : 1));
  const hi = ticks[ticks.length - 1];
  const y = (v) => B - ((B - T0) * v) / hi;
  out += grid(ticks, y, data.unit || "kWh");
  const slot = (R - L) / keys.length, bw = stacked ? Math.min(18, slot * 0.6) : Math.min(10, (slot * 0.7) / series.length);
  const wd = ctx.t("wd"), months = ctx.t("months");
  keys.forEach((k, i) => {
    const c = cols.get(k) || {};
    let acc = 0;
    series.forEach((s, j) => {
      const v = c[s.k] || 0;
      if (v <= 0) return;
      if (stacked) {
        out += `<rect x="${(L + slot * i + slot / 2 - bw / 2).toFixed(1)}" y="${y(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(acc) - y(acc + v)).toFixed(1)}" fill="${s.c}"/>`;
        acc += v;
        return;
      }
      const x0 = L + slot * i + slot / 2 - (bw * series.length) / 2 + j * bw;
      out += `<rect x="${x0.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${(B - y(v)).toFixed(1)}" fill="${s.c}"/>`;
    });
    const lab = pg.tab === "day" ? (i % 4 === 0 ? i : "")
      : pg.tab === "week" ? (Array.isArray(wd) ? wd[i] : "")
      : pg.tab === "month" ? (i % 5 === 0 ? i + 1 : "")
      : pg.tab === "year" ? (Array.isArray(months) ? months[i] : "")
      : k;
    if (lab !== "") out += `<text x="${L + slot * i + slot / 2}" y="${B + 20}" text-anchor="middle" class="ax">${lab}</text>`;
  });
  if (tip) tip.hidden = true;
  svg.innerHTML = out;
}

/* ---------- data loaders ---------- */
// recorder statistics: 5-minute rows inside the short-term window, hourly otherwise (and as fallback)
async function stats5(ctx, ids, t0, t1, types = ["mean"]) {
  const list = [].concat(...ids.map((i) => (Array.isArray(i) ? i : [i]))).filter(Boolean);
  const call = (period) => ctx.hass.callWS({
    type: "recorder/statistics_during_period", start_time: new Date(t0).toISOString(), end_time: new Date(t1).toISOString(),
    statistic_ids: list, period, types, units: { energy: "kWh", power: "kW" },
  });
  const norm = (res) => {
    const out = {};
    for (const id of list) out[id] = ((res && res[id]) || []).map((r) => ({ t: statT(r), v: r[types[0]] !== undefined ? r[types[0]] : null }));
    return out;
  };
  let res = Date.now() - t0 < 9 * 86400000 ? norm(await call("5minute")) : null;
  const enough = res && list.every((id) => res[id].length >= Math.min(12, (t1 - t0) / 600000));
  if (!enough) {
    const hr = norm(await call("hour"));
    if (!res) res = hr;
    else for (const id of list) if (res[id].length < hr[id].length * 6) res[id] = hr[id];
  }
  return res;
}

async function loadHomeCharts(ctx) {
  const s = S(ctx), e = E(ctx);
  if (!ctx.hass?.callWS) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - 6 * 86400000);
  try {
    const ids = [e.production_total, e.consumption_total].filter(Boolean);
    const res = await ctx.hass.callWS({
      type: "recorder/statistics_during_period", start_time: start.toISOString(),
      statistic_ids: ids, period: "day", types: ["change"], units: { energy: "kWh" },
    });
    const series = (id) => {
      const rows = (res && res[id]) || [];
      const out = [];
      for (let d = 0; d < 7; d++) {
        const day0 = start.getTime() + d * 86400000;
        const row = rows.find((r) => statT(r) >= day0 && statT(r) < day0 + 86400000);
        out.push({ day: new Date(day0).getDate(), v: row && row.change !== null ? row.change : 0 });
      }
      return out;
    };
    s.bars = { prod: series(e.production_total), cons: series(e.consumption_total) };
  } catch (err) { console.warn("[app-hub/foxess] statistics", err); }
  try {
    const end = Date.now(), t0 = end - ctx.config.soc_hours * 3600000;
    const res = await stats5(ctx, [e.soc, e.battery], t0, end);
    s.soc = { soc: res[e.soc] || [], bat: res[e.battery] || [], t0 };
  } catch (err) { console.warn("[app-hub/foxess] soc", err); }
  ctx.refresh();
}

async function loadAnalysis(ctx, screen) {
  const pg = PG(ctx, screen);
  const kind = screen.startsWith("inv") ? "inv" : screen.startsWith("plant") ? "plant" : "bat";
  const energy = !["h48", "day"].includes(pg.tab);
  const series = seriesOf(ctx, kind, energy);
  if (!pg.sel || pg.selFor !== `${kind}${energy}`) {
    pg.sel = new Set(kind === "inv" ? series.slice(0, energy ? 2 : 4).map((s) => s.k)
      : kind === "plant" && energy ? ["pv", "load"] : series.map((s) => s.k));
    pg.selFor = `${kind}${energy}`;
  }
  const rg = range(ctx, pg);
  const req = pg.reqId = (pg.reqId || 0) + 1;
  if (kind === "plant") loadPlantSums(ctx, screen, rg, req);
  try {
    let data;
    if (!energy) {
      const ids = series.map((s) => s.id).concat(kind === "bat" ? [E(ctx).soc] : []);
      data = { kind, energy, rg, stats: await stats5(ctx, ids, rg.t0, Math.min(rg.t1, Date.now())) };
    } else {
      const ids = series.map((s) => s.id).filter(Boolean);
      const res = await ctx.hass.callWS({
        type: "recorder/statistics_during_period", start_time: new Date(rg.t0).toISOString(), end_time: new Date(rg.t1).toISOString(),
        statistic_ids: ids, period: rg.period, types: ["change"], units: { energy: "kWh" },
      });
      data = { kind, energy, rg, stats: res || {} };
    }
    if (req !== pg.reqId) return;
    pg.data = data;
  } catch (err) {
    console.warn("[app-hub/foxess] analysis", err);
    pg.data = { kind, energy, rg, stats: {} };
  }
  ctx.refresh();
}

async function loadPlantSums(ctx, screen, rg, req) {
  const pg = PG(ctx, screen), e = E(ctx);
  const keys = { pv: e.production_total, load: e.consumption_total, imp: e.purchased_total, exp: e.feed_in_total,
    chg: e.battery_charge_total, dis: e.battery_discharge_total };
  const live = { pv: e.production_today, load: e.consumption_today, imp: e.purchased_today, exp: e.feed_in_today,
    chg: e.battery_charge_today, dis: e.battery_discharge_today };
  const sums = {};
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  try {
    const ids = Object.values(keys).filter(Boolean);
    const res = await ctx.hass.callWS({
      type: "recorder/statistics_during_period", start_time: new Date(rg.t0).toISOString(),
      end_time: new Date(Math.min(rg.t1, Date.now())).toISOString(),
      statistic_ids: ids, period: pg.tab === "total" ? "month" : "day", types: ["change"], units: { energy: "kWh" },
    });
    for (const [k, id] of Object.entries(keys)) {
      // today's row lags the hourly compile: the live daily counter replaces it
      const rows = ((res && res[id]) || []).filter((r) => statT(r) < day0.getTime());
      sums[k] = rows.length ? rows.reduce((a, r) => a + (r.change || 0), 0) : null;
      if (rg.t1 > day0.getTime() && rg.t0 <= day0.getTime()) {
        const t = kWh(ctx.hass.states[live[k]]);
        if (t !== null) sums[k] = (sums[k] || 0) + t;
      }
    }
  } catch (err) { console.warn("[app-hub/foxess] plant sums", err); }
  if (req !== pg.reqId) return;
  pg.sums = sums;
  ctx.refresh();
}

const revOf = (ctx, yieldKWh, feedKWh) => {
  const c = ctx.config;
  const feed = Math.max(0, feedKWh || 0);
  return { sav: Math.max(0, (yieldKWh || 0) - feed) * c.buy_price, feed: feed * c.sell_price };
};

async function revStats(ctx, t0, t1, period) {
  const e = E(ctx);
  const ids = [e.yield_total, e.feed_in_total].filter(Boolean);
  const res = await ctx.hass.callWS({
    type: "recorder/statistics_during_period", start_time: new Date(t0).toISOString(),
    end_time: new Date(Math.min(t1, Date.now())).toISOString(),
    statistic_ids: ids, period, types: ["change"], units: { energy: "kWh" },
  });
  const feedAt = new Map(((res && res[e.feed_in_total]) || []).map((r) => [statT(r), r.change || 0]));
  const sav = [], feed = [];
  for (const r of (res && res[e.yield_total]) || []) {
    const v = revOf(ctx, r.change || 0, feedAt.get(statT(r)) || 0);
    sav.push({ start: statT(r), change: v.sav });
    feed.push({ start: statT(r), change: v.feed });
  }
  return { sav, feed };
}

async function loadRevenue(ctx) {
  const pg = PG(ctx, "revenue");
  const rg = range(ctx, pg);
  if (pg.tab === "day") Object.assign(rg, { period: "hour", n: 24 });
  if (pg.tab === "total") rg.period = "month";
  const req = pg.reqId = (pg.reqId || 0) + 1;
  if (!pg.sel) pg.sel = new Set(["sav", "feed"]);
  try {
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const mon = new Date(day0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const [r, wk] = await Promise.all([
      revStats(ctx, rg.t0, rg.t1, rg.period),
      pg.week ? null : revStats(ctx, mon.getTime(), mon.getTime() + 7 * 86400000, "day"),
    ]);
    if (req !== pg.reqId) return;
    if (wk) {
      pg.week = Array.from({ length: 7 }, (_, i) => {
        const t = mon.getTime() + i * 86400000;
        const ix = wk.sav.findIndex((x) => x.start >= t && x.start < t + 86400000);
        return { t, v: ix < 0 ? (t > Date.now() ? null : 0) : wk.sav[ix].change + wk.feed[ix].change };
      });
      // today from the live counters (the daily statistic is compiled with a lag)
      const ti = pg.week.findIndex((d) => d.t === day0.getTime());
      if (ti >= 0) { const v = revOf(ctx, kWh(st(ctx, "yield_today")), kWh(st(ctx, "feed_in_today"))); pg.week[ti].v = v.sav + v.feed; }
    }
    const sum = (a) => a.reduce((s, x) => s + x.change, 0);
    pg.data = { kind: "rev", energy: true, rg, unit: ctx.config.currency, stats: { "rev:sav": r.sav, "rev:feed": r.feed } };
    pg.box = { sav: sum(r.sav), feed: sum(r.feed) };
    const day00 = new Date(); day00.setHours(0, 0, 0, 0);
    if (rg.t1 > day00.getTime() && rg.t0 <= day00.getTime() && pg.tab === "day") {
      pg.box = revOf(ctx, kWh(st(ctx, "yield_today")), kWh(st(ctx, "feed_in_today")));
    }
  } catch (err) {
    console.warn("[app-hub/foxess] revenue", err);
    pg.data = { kind: "rev", energy: true, rg, unit: ctx.config.currency, stats: {} };
  }
  ctx.refresh();
}

async function loadRevCal(ctx) {
  const pg = PG(ctx, "revenue_cal");
  const d = new Date(pg.date), m0 = new Date(d.getFullYear(), d.getMonth(), 1), m1 = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const req = pg.reqId = (pg.reqId || 0) + 1;
  let days = {};
  try {
    const r = await revStats(ctx, m0.getTime(), m1.getTime(), "day");
    r.sav.forEach((x, i) => { days[new Date(x.start).getDate()] = x.change + r.feed[i].change; });
    const today = new Date();
    if (today >= m0 && today < m1) { const v = revOf(ctx, kWh(st(ctx, "yield_today")), kWh(st(ctx, "feed_in_today"))); days[today.getDate()] = v.sav + v.feed; }
  } catch (err) { console.warn("[app-hub/foxess] calendar", err); days = {}; }
  if (req !== pg.reqId) return;
  pg.data = { days };
  ctx.refresh();
}

async function loadAlarm(ctx) {
  const pg = PG(ctx, "alarm"), id = E(ctx).fault;
  if (!id) return;
  const req = pg.reqId = (pg.reqId || 0) + 1;
  let rows = [];
  try {
    const res = await ctx.history([id], Date.now() - ctx.config.alarm_days * 86400000, new Date());
    rows = ((res && res[id]) || []).map((r) => ({ s: r.s, t: (r.lu || r.lc) * 1000 })).filter((r) => !noFault(r.s));
  } catch (err) { console.warn("[app-hub/foxess] alarm", err); }
  if (req !== pg.reqId) return;
  pg.data = { rows: rows.reverse() };
  ctx.refresh();
}

/* ---------- the module ---------- */
export default {
  home: "home",

  icons: {},

  title: (ctx) => ctx.manifest.name,

  // The flow scene reads these every render; the hub re-renders when any of them changes.
  watch: (ctx) => {
    const e = E(ctx);
    const keys = ["pv", "grid", "battery", "soc", "load", "status", "work_mode", "weather", "sun",
      "production_today", "consumption_today", "yield_total", "fault", "eps"];
    return keys.map((k) => e[k]).filter((v) => typeof v === "string");
  },

  screens: {
    /* ---------- plant home ---------- */
    home: (ctx) => {
      const esc = ctx.esc, c = ctx.config;
      const f = flags(ctx);
      const u = (n) => `calc(var(--u) * ${+n.toFixed(3)})`;
      const rect = (r) => `left:${u(r.x)};top:${u(r.y)};width:${u(r.w)};height:${u(r.h)}`;
      const svgPath = (k, p) =>
        `<svg class="abs" style="${rect(G[k])}" viewBox="0 0 ${p.vw} ${p.vh}" preserveAspectRatio="none">${
          p.grad ? `<defs><linearGradient id="gg" gradientUnits="userSpaceOnUse" x1="102.7" y1="66.94" x2="0.75" y2="34.19"><stop offset="0" stop-color="#535762"/><stop offset="1" stop-color="#535762" stop-opacity="0"/></linearGradient></defs>` : ""
        }<path d="${p.d}" fill="${p.grad ? "url(#gg)" : C.path}"/></svg>`;
      const sun = st(ctx, "sun");
      const day = !sun || sun.state !== "below_horizon";
      const v = day ? "day" : "night";
      const soc = num(st(ctx, "soc"));

      // grid label: direction decides the wording and the arrow colour
      let gridLabel = ctx.t("ui.grid"), gridIcon = "";
      if (f.gridToHidden === 1) {
        gridLabel = ctx.t("ui.grid_import");
        gridIcon = `<svg viewBox="0 0 16 17"><path fill="${C.green}" d="${ART.gridBody}"/><path fill="${C.green}" d="${ART.gridImportArrow}"/></svg>`;
      } else if (f.gridToHidden === -1) {
        gridLabel = ctx.t("ui.grid_export");
        gridIcon = `<svg viewBox="0 0 16 17"><path fill="${C.blue}" d="${ART.gridBody}"/><path fill="${C.blue}" d="${ART.gridExportArrow}"/></svg>`;
      }
      const batLabel = f.batToDevice === -1 ? ctx.t("ui.charging") : f.batToDevice === 1 ? ctx.t("ui.discharging") : ctx.t("ui.battery");

      const [pillTxt, pillCol] = pill(ctx);
      // freshest of the flow readings: PV alone stays unchanged for hours at night
      const last = ["pv", "battery", "load", "grid"].map((k) => st(ctx, k)).filter(Boolean)
        .map((x) => x.last_updated).sort().pop() || null;
      const fresh = last && (Date.now() - new Date(last).getTime()) / 1000 < c.stale_seconds;

      const wx = st(ctx, "weather");
      const cond = wx ? wx.state : "partlycloudy";
      const wxIcon = cond === "partlycloudy" || !WEATHER_MDI[cond]
        ? `<svg viewBox="0 0 19 19">${ART.cloudSun}</svg>`
        : `<ha-icon icon="${WEATHER_MDI[cond]}"></ha-icon>`;

      const wm = st(ctx, "work_mode");
      const yieldKWh = kWh(st(ctx, "yield_total"));
      const rev = yieldKWh === null ? null : yieldKWh * c.revenue_price;
      const revTxt = rev === null ? "--" : rev >= 1000 ? (rev / 1000).toFixed(2) + ctx.t("ui.thousand") : rev.toFixed(2);

      const lbl = (k, inner) => {
        const b = LABELS[k];
        const hook = k === "soc" ? 'data-a="page" data-p="battery"' : k === "load" ? 'data-a="loadpop"' : `data-a="ent" data-k="${k}"`;
        return `<div class="lbl" ${hook} style="left:${u(b.x)};top:${u(FLOW_H - b.h)};width:${u(b.w)};height:${u(b.h)}"><i></i><div class="lt">${inner}</div></div>`;
      };

      return `<div class="scroll fx">
 <div class="flow" style="height:${u(FLOW_H + FLOW_TOP)}">
  <div class="scene" style="top:${u(FLOW_TOP)};height:${u(FLOW_H)}">
   <img class="abs bg" style="left:0;top:0;width:100%;height:100%" src="${ctx.img(`flow_home_bg_${v}_dark.webp`)}" alt="">
   <img class="abs home" style="left:0;top:${u(HOUSE_TOP)};width:100%;height:${u(HOUSE_H)}" src="${ctx.img(`flow_home_${v}_dark.webp`)}" alt="">
   ${svgPath("grid", PATHS.grid)}${svgPath("load", PATHS.load)}${svgPath("inv", PATHS.inv)}
   ${svgPath("invpv", PATHS.invpv)}${svgPath("bat", PATHS.bat)}
   <img class="abs pv" style="${rect(G.pv)};object-fit:contain;object-position:bottom" src="${ctx.img(`flow_pv_${v}_dark.webp`)}" alt="">
   <img class="abs inverter" style="${rect(G.inverter)}" src="${ctx.img(`flow_inverter_ac_${v}_dark.webp`)}" alt="">
   <img class="abs battery" style="${rect(G.battery)}" src="${ctx.img(`flow_battery_${v}_dark.webp`)}" alt="">
   <div class="abs hot" data-a="page" data-p="inverter" style="${rect(G.inverter)}"></div>
   <div class="abs hot" data-a="page" data-p="battery" style="${rect(G.battery)}"></div>
   <svg class="abs" style="${rect(G.cross)}" viewBox="0 0 9 9"><circle cx="4.168" cy="4.02" r="2.5" fill="#5e7b89" stroke="#fff" stroke-width="1"/></svg>
   <canvas id="comets" class="abs" style="left:0;top:0;width:100%;height:100%"></canvas>
   <div class="vline" style="left:${u(SOLAR_DIV.x)};top:${u(SOLAR_DIV.y)};height:${u(SOLAR_DIV.h)}"></div>
   <div class="solar" data-a="page" data-p="inverter" style="left:${u(SOLAR_DIV.x)};top:${u(SOLAR_DIV.y + 8)};--sv:${day ? "#141414" : "#e9ebf0"};--st:${day ? "#40444f" : "#9fa2ac"}">
     <div class="t">${esc(ctx.t("ui.pv"))}</div><div class="v"><b>${fmt2(f.pv)}</b><span>kW</span></div></div>
   ${lbl("grid", `<div class="t">${esc(gridLabel)}</div><div class="v"><b>${fmt2(f.grid)}</b><span>kW</span>${gridIcon}</div>`)}
   ${lbl("soc", `<div class="t">${esc(batLabel)}</div><div class="v soc"><b>${soc === null ? "--" : Math.round(soc)}</b><span>%</span></div><div class="v"><b>${fmt2(f.bat)}</b><span>kW</span></div>`)}
   ${lbl("load", `<div class="t">${esc(ctx.t("ui.home"))}<svg class="pr" viewBox="0 0 11 12">${ART.prompt}</svg></div><div class="v"><b>${fmt2(f.load)}</b><span>kW</span></div>`)}
  </div>
  <div class="head">
   <svg class="alarm" data-a="page" data-p="alarm" viewBox="0 0 24 24">${ART.alarm}</svg>
   <svg class="more" data-a="page" data-p="devices" viewBox="0 0 23 5">${ART.more}</svg>
   <div class="status" data-a="statuspop" style="background:${pillCol}">${esc(pillTxt)}</div>
   ${fresh
     ? `<div class="refr"><i class="spin"></i><span>${esc(ctx.t("ui.refreshing"))}</span></div>`
     : `<div class="upd">${last ? esc(ago(ctx, last)) : ""}</div>`}
   <div class="wx" data-a="ent" data-k="weather"><span>${wxIcon}</span><span>${wx && wx.attributes.temperature !== undefined ? Math.round(wx.attributes.temperature) : "--"}</span><span class="deg">&deg;C</span></div>
  </div>
 </div>
 <div class="quick" data-a="quick"><svg viewBox="0 0 24 24">${ART.quick}</svg><span>${esc(ctx.t("ui.quick"))}</span><svg class="chev" viewBox="0 0 24 24">${ART.arrow}</svg></div>
 <div class="row">
  <div class="tile" data-a="page" data-p="workmode"><div class="tt">${esc(ctx.t("ui.work_mode"))}<svg class="chev" viewBox="0 0 24 24">${ART.arrow}</svg></div>
    <div class="tv" id="wm">${esc(wm && wm.state !== "unavailable" ? workModeName(ctx, wm.state) : "-")}</div></div>
  <div class="tile" data-a="page" data-p="revenue"><div class="tt">${esc(ctx.t("ui.revenue"))}<svg class="chev" viewBox="0 0 24 24">${ART.arrow}</svg></div>
    <div class="tv"><b>${esc(revTxt)}</b><span>${esc(c.currency)}</span></div></div>
 </div>
 <div class="row">
  <div class="tile chart" data-a="page" data-p="plant_analysis"><div class="tt">${esc(ctx.t("ui.production"))}<svg class="chev" viewBox="0 0 24 24">${ART.arrow}</svg></div>
    <div class="tv"><b>${esc(energyShort(kWh(st(ctx, "production_today"))))}</b><span>kWh</span><em>${esc(ctx.t("ui.today"))}</em></div>
    <svg class="bars" id="prodc" viewBox="0 0 300 92" preserveAspectRatio="none"></svg><div class="days" id="prodd"></div></div>
  <div class="tile chart" data-a="page" data-p="plant_analysis"><div class="tt">${esc(ctx.t("ui.consumption"))}<svg class="chev" viewBox="0 0 24 24">${ART.arrow}</svg></div>
    <div class="tv"><b>${esc(energyShort(kWh(st(ctx, "consumption_today"))))}</b><span>kWh</span><em>${esc(ctx.t("ui.today"))}</em></div>
    <svg class="bars" id="consc" viewBox="0 0 300 92" preserveAspectRatio="none"></svg><div class="days" id="consd"></div></div>
 </div>
 <div class="tile wide socc" data-a="page" data-p="plant_analysis"><div class="tt">${esc(ctx.t("ui.soc"))}<svg class="chev" viewBox="0 0 24 24">${ART.arrow}</svg></div>
  <div class="legend"><span><i style="background:${C.socCharge}"></i>${esc(ctx.t("ui.charge_legend"))}</span><span><i style="background:${C.socDischarge}"></i>${esc(ctx.t("ui.discharge_legend"))}</span></div>
  <div class="tv"><b>${soc === null ? "0" : Math.round(soc)}</b><span>%</span></div>
  <svg class="socsvg" id="socsvg" viewBox="0 0 640 110" preserveAspectRatio="none"></svg><div class="socx" id="socx"></div></div>
 <div class="tile wide impact"><div class="tt">${esc(ctx.t("ui.impact"))}</div>
  <div class="imp">
   <div><img src="${ctx.img("image_environment_co2.png")}" alt=""><p>${esc(ctx.t("ui.co2"))}</p><div class="tv"><b>${esc(yieldKWh === null ? "--" : grouped(yieldKWh * c.co2_factor))}</b><span>kg</span></div></div>
   <div><img src="${ctx.img("image_environment_planted.png")}" alt=""><p>${esc(ctx.t("ui.trees"))}</p><div class="tv"><b>${esc(yieldKWh === null ? "--" : grouped(yieldKWh * c.tree_factor, 0))}</b></div></div>
   <div><img src="${ctx.img("image_environment_oll.png")}" alt=""><p>${esc(ctx.t("ui.oil"))}</p><div class="tv"><b>${esc(yieldKWh === null ? "--" : grouped(yieldKWh * c.oil_factor))}</b><span>L</span></div></div>
  </div></div>
</div>`;
    },

    /* ---------- inverter ---------- */
    inverter: (ctx) => {
      const esc = ctx.esc;
      const pv = kW(st(ctx, "pv"));
      const pct = pv === null ? 0 : Math.max(0, Math.min(100, (pv / ctx.config.pv_capacity_kw) * 100));
      const watts = pv === null ? "--" : pv < 1 ? String(Math.round(pv * 1000)) : pv.toFixed(2);
      const unit = pv === null || pv < 1 ? "W" : "kW";
      const sweep = 221.7, start = -90 - sweep / 2, r = 50, cx = 60, cy = 58;
      const arc = (a0, a1) => {
        const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
        const [x0, y0] = p(a0), [x1, y1] = p(a1);
        return `M${x0},${y0}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
      };
      const today = energyVal(ctx, "production_today"), total = energyVal(ctx, "production_total");
      const [pt, pc] = pill(ctx);
      const upd = st(ctx, "pv");
      return `<div class="scroll fx">${head(ctx, ctx.t("ui.inverter"))}
        <div class="dpill" style="background:${pc}">${esc(pt)}</div>
        <img class="devimg" src="${ctx.img("dev_inverter.webp")}" alt="">
        <div class="sn"><span>${esc(ctx.config.inverter_sn || "")}</span>${CHEV}</div>
        <div class="dupd">${upd ? esc(ago(ctx, upd.last_updated)) : ""}</div>
        <div class="dgrid inv">
          <div class="dcard gauge"><div class="dt">${esc(ctx.t("ui.pv_power"))}</div>
            <svg viewBox="0 0 120 100"><path d="${arc(start, start + sweep)}" fill="none" stroke="rgba(135,141,150,0.32)" stroke-width="5" stroke-linecap="round"/>
            ${pct > 0 ? `<path d="${arc(start, start + (sweep * pct) / 100)}" fill="none" stroke="${C.blue}" stroke-width="5" stroke-linecap="round"/>` : ""}
            <text x="60" y="60" text-anchor="middle" class="gv">${esc(watts)}</text><text x="60" y="78" text-anchor="middle" class="gu">${unit}</text></svg></div>
          <div class="dcard"><div class="dt">${esc(ctx.t("ui.today_pv"))}</div><div class="dv"><b>${esc(today.v)}</b><span>${esc(today.u)}</span></div></div>
          <div class="dcard"><div class="dt">${esc(ctx.t("ui.total_pv"))}</div><div class="dv"><b>${esc(total.v)}</b><span>${esc(total.u)}</span></div></div>
        </div>
        <div class="dlist"><div class="li" data-a="page" data-p="inv_params">${esc(ctx.t("ui.params"))}${CHEV}</div>
          <div class="li" data-a="page" data-p="inv_analysis">${esc(ctx.t("ui.analysis"))}${CHEV}</div></div></div>`;
    },

    /* ---------- battery ---------- */
    battery: (ctx) => {
      const esc = ctx.esc;
      const soc = num(st(ctx, "soc"));
      const n = soc === null ? 0 : Math.round(soc / 2);
      const segs = Array.from({ length: 50 }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("");
      const bp = val(ctx, "battery", 2, "kW"), bv = val(ctx, "battery_voltage", 1, "V");
      const bt = val(ctx, "battery_temp", 1, "℃"), br = val(ctx, "battery_remaining", 2, "kWh");
      const card = (t, x) => `<div class="dcard"><div class="dt">${esc(t)}</div><div class="dv"><b>${esc(x.v)}</b><span>${esc(x.v === "--" && x.u !== "℃" && x.u !== "kW" ? "" : x.u)}</span></div></div>`;
      const [pt, pc] = pill(ctx);
      const upd = st(ctx, "soc");
      return `<div class="scroll fx">${head(ctx, ctx.t("ui.battery_page"))}
        <div class="dpill" style="background:${pc}">${esc(pt)}</div>
        <img class="devimg" src="${ctx.img("dev_battery.webp")}" alt="">
        <div class="sn" style="margin-top:calc(var(--u) * 7)"><span>${esc(ctx.config.battery_sn || "")}</span>${CHEV}</div>
        <div class="dupd" style="margin-bottom:calc(var(--u) * 4)">${upd ? esc(ago(ctx, upd.last_updated)) : ""}</div>
        <div class="dcard socbar"><div class="srow"><span>${esc(ctx.t("ui.soc_short"))}</span><b>${soc === null ? "--" : Math.round(soc) + "%"}</b></div><div class="segs">${segs}</div></div>
        <div class="dgrid">${card(ctx.t("ui.bat_power"), bp)}${card(ctx.t("ui.voltage_now"), bv)}${card(ctx.t("ui.min_cell"), bt)}${card(ctx.t("ui.remaining"), br)}</div>
        <div class="dlist"><div class="li" data-a="page" data-p="bat_analysis">${esc(ctx.t("ui.analysis"))}${CHEV}</div>
          <div class="li" data-a="page" data-p="bat_params">${esc(ctx.t("ui.params"))}${CHEV}</div></div></div>`;
    },

    /* ---------- inverter: detailed parameters ---------- */
    inv_params: (ctx) => {
      const esc = ctx.esc, pg = PG(ctx, "inv_params");
      const cell = (k, d = 1) => val(ctx, k, d).v;
      const fold = (key, title, body, link) => {
        if (link) return `<div class="fold"><div class="fh" data-a="page" data-p="${link}">${esc(title)}${CHEV}</div></div>`;
        const open = pg.open.has(key);
        return `<div class="fold${open ? " open" : ""}"><div class="fh" data-a="fold" data-k="${key}">${esc(title)}${CHEV_DOWN}</div>${open ? body : ""}</div>`;
      };
      const table = (h, rows) => `<div class="tbl"><div class="tr th">${h.map((x) => `<span>${x}</span>`).join("")}</div>${
        rows.map((r) => `<div class="tr">${r.map((c) => `<span>${c}</span>`).join("")}</div>`).join("")}</div>`;
      const kv = (rows) => rows.map(([t, v]) => `<div class="kv"><span>${esc(t)}</span><b>${esc(v)}</b></div>`).join("");
      const en = (k) => { const x = energyVal(ctx, k); return x.v === "--" ? "--" : `${x.v} ${x.u}`; };
      const pw = (k) => `${val(ctx, k, 2, "kW").v} kW`;
      const pvTot = kW(st(ctx, "pv"));
      const online = num(st(ctx, "pv")) !== null;
      const t = (k) => ctx.t(`ui.${k}`);
      return `<div class="scroll fx">${head(ctx, t("params"))}
        ${fold("pv", t("pv_info"), table(["PV", `${t("voltage")}<br>(V)`, `${t("current")}<br>(A)`, `${t("power")}<br>(kW)`], [
          ["PV", "--", "--", pvTot === null ? "--" : pvTot.toFixed(2)],
          ["PV1", cell("pv1_voltage"), cell("pv1_current"), cell("pv1_power", 2)],
          ["PV2", cell("pv2_voltage"), cell("pv2_current"), cell("pv2_power", 2)]]))}
        ${fold("ac", t("ac_info"), table([t("phase"), `${t("voltage")}<br>(V)`, `${t("current")}<br>(A)`, `${t("power")}<br>(kW)`, `${t("freq")}<br>(Hz)`], [
          ["R", cell("voltage_r"), cell("current_r"), cell("power_r", 2), cell("frequency", 2)],
          ["S", cell("voltage_s"), cell("current_s"), cell("power_s", 2), cell("frequency", 2)],
          ["T", cell("voltage_t"), cell("current_t"), cell("power_t", 2), cell("frequency", 2)]]))}
        ${fold("load", t("load_info"), kv([[t("daily_load"), en("consumption_today")], [t("total_load"), en("consumption_lifetime")],
          [t("total_load_power"), pw("load")], [t("grid_load_power"), pw("grid_import")], [t("eps_load_power"), pw("eps")]]))}
        ${fold("grid", t("grid_info"), kv([[t("grid_status"), online ? t("on_grid") : "--"], [t("daily_feed"), en("feed_in_today")],
          [t("total_feed"), en("feed_in_total")], [t("daily_buy"), en("purchased_today")], [t("total_buy"), en("purchased_total")],
          [t("feed_power"), pw("grid_export")], [t("buy_power"), pw("grid_import")]]))}
        ${fold("bat", t("bat_info"), "", "bat_params")}
        <div class="ptime">${st(ctx, "pv") ? esc(new Date(st(ctx, "pv").last_updated).toLocaleString("sv-SE")) : ""}</div></div>`;
    },

    /* ---------- battery details ---------- */
    bat_params: (ctx) => {
      const esc = ctx.esc, t = (k) => ctx.t(`ui.${k}`);
      const v = (k, d, u) => { const x = val(ctx, k, d, u); return x.v === "--" ? "--" : `${x.v}${u}`; };
      const en = (k) => { const x = energyVal(ctx, k); return x.v === "--" ? "--" : `${x.v}${x.u}`; };
      const b = kW(st(ctx, "battery"));
      const state = b === null ? "--" : Math.abs(b) <= ctx.config.deadband ? t("idle") : b > 0 ? t("discharging") : t("charging");
      const soc = num(st(ctx, "soc"));
      const rows = [[t("nominal"), v("battery_nominal", 2, "kWh")], [t("soc_short"), soc === null ? "--" : `${Math.round(soc)}%`],
        [t("remaining"), v("battery_remaining", 2, "kWh")], [t("status"), state], [t("bat_power"), v("battery", 2, "kW")],
        [t("current"), v("battery_current", 1, "A")], [t("voltage"), v("battery_voltage", 1, "V")], [t("min_bat_temp"), v("battery_temp", 1, "℃")],
        [t("daily_dis"), en("battery_discharge_today")], [t("total_dis"), en("battery_discharge_total")],
        [t("daily_chg"), en("battery_charge_today")], [t("total_chg"), en("battery_charge_total")],
        [t("soh"), v("battery_soh", 0, "%")], [t("cycles"), v("battery_cycles", 0, "")]];
      return `<div class="scroll fx">${head(ctx, t("bat_details"))}<div class="fold open">${
        rows.map(([a, x]) => `<div class="kv"><span>${esc(a)}</span><b>${esc(x)}</b></div>`).join("")}</div>
        <div class="ptime">${st(ctx, "soc") ? esc(new Date(st(ctx, "soc").last_updated).toLocaleString("sv-SE")) : ""}</div></div>`;
    },

    inv_analysis: (ctx) => analysisHtml(ctx, "inv_analysis", "inv"),
    bat_analysis: (ctx) => analysisHtml(ctx, "bat_analysis", "bat"),
    plant_analysis: (ctx) => analysisHtml(ctx, "plant_analysis", "plant"),

    /* ---------- revenue ---------- */
    revenue: (ctx) => {
      const esc = ctx.esc, c = ctx.config, pg = PG(ctx, "revenue"), t = (k) => ctx.t(`ui.${k}`);
      const y = kWh(st(ctx, "yield_total"));
      const total = y === null ? null : y * c.revenue_price;
      const rg = range(ctx, pg);
      const wd1 = ctx.t("wd1");
      const week = (pg.week || []).map((d, i) =>
        `<div class="wd${d.t === new Date().setHours(0, 0, 0, 0) ? " on" : ""}"><span>${Array.isArray(wd1) ? wd1[i] : ""}</span><b>${new Date(d.t).getDate()}</b><em>${d.v === null ? "" : f2(d.v)}</em></div>`).join("");
      const tabs = [["day", "day"], ["week", "week"], ["month", "month"], ["year", "year"], ["total", "total"]];
      const nav = pg.tab === "total" ? "" :
        `<div class="dnav"><button data-a="shift" data-d="-1">${ARROW_L}</button><b>${esc(rg.label)}</b><button data-a="shift" data-d="1">${ARROW_R}</button></div>`;
      const b = pg.box || {};
      const tot = b.sav === undefined ? null : b.sav + b.feed;
      const box = (cls, title, v) => `<div class="rbox ${cls}"><div>${esc(title)}</div><b>${f2(v ?? null)}<span>${esc(c.currency)}</span></b></div>`;
      const series = seriesOf(ctx, "rev", true);
      const sel = pg.sel || new Set(series.map((s) => s.k));
      return `<div class="scroll fx">${head(ctx, t("revenue_short"), `<button class="tr8" data-a="page" data-p="tariff">${esc(t("tariff"))}</button>`)}
        <div class="rhead"><p>${esc(t("since"))} ${esc(c.revenue_since || "")}</p><b>${total === null ? "--" : grouped(total, 2)}<span>${esc(c.currency)}</span></b></div>
        <div class="rweek"><div class="wds">${week}</div><div class="cal" data-a="page" data-p="revenue_cal">${esc(t("calendar"))} ${CHEV}</div></div>
        <div class="tabs">${tabs.map(([k, n]) => `<button data-a="tab" data-t="${k}"${pg.tab === k ? ' class="on"' : ""}>${esc(t(n))}</button>`).join("")}</div>
        ${nav}
        <div class="rboxes">${box("t", t("total_revenue"), tot)}<i>=</i>${box("s", t("solar_savings"), b.sav)}<i>+</i>${box("f", t("feed_revenue"), b.feed)}</div>
        <div class="ahead"><span>${esc(t("rev_analysis"))}</span></div>
        <div class="chips">${series.map((s) => `<button data-a="chip" data-k="${s.k}"${sel.has(s.k) ? ' class="on"' : ""}><i style="${sel.has(s.k) ? `background:${s.c};border-color:${s.c}` : ""}"></i>${esc(s.n)}</button>`).join("")}</div>
        <div class="achart"><svg data-chart="main" viewBox="0 0 700 330" preserveAspectRatio="none"></svg><div class="tip" hidden></div></div>
        <div class="fold open">${[[t("total_revenue"), tot, ""], [t("solar_savings"), b.sav, CS.sav], [t("feed_revenue"), b.feed, CS.feed]]
          .map(([a, v, col]) => `<div class="kv"><span>${col ? `<i class="dot" style="background:${col}"></i>` : ""}${esc(a)}</span><b>${f2(v ?? null)} ${esc(c.currency)}</b></div>`).join("")}</div></div>`;
    },

    revenue_cal: (ctx) => {
      const esc = ctx.esc, pg = PG(ctx, "revenue_cal");
      const d = new Date(pg.date), m0 = new Date(d.getFullYear(), d.getMonth(), 1);
      const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), lead = (m0.getDay() + 6) % 7;
      const days = (pg.data && pg.data.days) || {};
      const wd = ctx.t("wd");
      const cells = Array.from({ length: lead }, () => "<div></div>").concat(Array.from({ length: n }, (_, i) => {
        const v = days[i + 1];
        return `<div class="cd"><b>${i + 1}</b><em>${v === undefined ? "" : f2(v)}</em></div>`;
      })).join("");
      return `<div class="scroll fx">${head(ctx, ctx.t("ui.calendar"))}
        <div class="dnav"><button data-a="shift" data-d="-1">${ARROW_L}</button><b>${d.getFullYear()}-${p2(d.getMonth() + 1)}</b><button data-a="shift" data-d="1">${ARROW_R}</button></div>
        <div class="calg">${(Array.isArray(wd) ? wd : []).map((w) => `<div class="ch">${esc(w)}</div>`).join("")}${cells}</div>
        <div class="ptime">${esc(ctx.config.currency)}</div></div>`;
    },

    tariff: (ctx) => {
      const esc = ctx.esc, c = ctx.config, t = (k) => ctx.t(`ui.${k}`);
      const now = val(ctx, "price_now", 3);
      return `<div class="scroll fx">${head(ctx, t("tou_tariff"))}
        <div class="fold open"><div class="fh">${esc(t("manual_tariff"))}</div>
          <div class="kv"><span>${esc(t("buy_price"))}</span><b>${c.buy_price} ${esc(c.currency)}/kWh</b></div>
          <div class="kv"><span>${esc(t("sell_price"))}</span><b>${c.sell_price} ${esc(c.currency)}/kWh</b></div>
          ${E(ctx).price_now ? `<div class="kv" data-a="ent" data-k="price_now"><span>${esc(t("price_now"))}</span><b>${esc(now.v)} ${esc(now.u)}</b></div>` : ""}</div></div>`;
    },

    /* ---------- quick settings and work mode ---------- */
    quick: (ctx) => {
      const esc = ctx.esc, t = (k) => ctx.t(`ui.${k}`);
      const v = (k, u) => { const x = val(ctx, k, 0); return x.v === "--" ? "--" : `${x.v}${u}`; };
      const row = (title, k, u) => `<div class="li${E(ctx)[k] ? "" : " na"}"${E(ctx)[k] ? ` data-a="ent" data-k="${k}"` : ""}>${esc(title)}<span class="lv">${esc(v(k, u))}${E(ctx)[k] ? CHEV : ""}</span></div>`;
      const lo = num(st(ctx, "min_soc_on_grid")), hi = num(st(ctx, "max_soc")), og = num(st(ctx, "min_soc"));
      const bar = `<svg class="socr" viewBox="0 0 40 70"><rect x="12" y="2" width="16" height="4" rx="1" fill="#525254"/><rect x="4" y="6" width="32" height="62" rx="5" fill="none" stroke="#525254" stroke-width="2"/>
        ${lo !== null && hi !== null ? `<rect x="8" y="${(10 + 54 * (1 - hi / 100)).toFixed(1)}" width="24" height="${((54 * (hi - lo)) / 100).toFixed(1)}" rx="2" fill="${C.green}"/>` : ""}</svg>`;
      return `<div class="scroll fx">${head(ctx, t("quick"))}
        <div class="dlist"><div class="li" data-a="page" data-p="workmode">${esc(t("wm_scheduler"))}${CHEV}</div></div>
        <div class="qt">${esc(t("bat_control"))}</div>
        <div class="dlist qbat"><div class="ql">
          <div class="qk">${esc(t("soc_range"))}</div>
          <div class="qv"><span data-a="ent" data-k="min_soc_on_grid"><b>${lo === null ? "--" : Math.round(lo)}</b>% ${esc(t("min"))}</span><span data-a="ent" data-k="max_soc"><b>${hi === null ? "--" : Math.round(hi)}</b>% ${esc(t("max"))}</span></div>
          <div class="qk">${esc(t("off_grid_soc"))}</div>
          <div class="qv"><span data-a="ent" data-k="min_soc"><b>${og === null ? "--" : Math.round(og)}</b>%</span></div></div>${bar}</div>
        <div class="dlist">${row(t("storm"), "storm_safe", "")}</div>
        <div class="qt">${esc(t("grid_setting"))}</div>
        <div class="dlist">${row(t("export_limit"), "export_limit", "kW")}${row(t("import_limit"), "import_limit", "kW")}${row(t("meter_comp"), "meter_compensation", "W")}</div></div>`;
    },

    workmode: (ctx) => {
      const esc = ctx.esc, t = (k) => ctx.t(`ui.${k}`);
      const s = st(ctx, "work_mode");
      const opts = (s && s.attributes.options) || [];
      const cur = s ? s.state : null;
      return `<div class="scroll fx">${head(ctx, t("work_mode"))}
        ${opts.length
          ? `<div class="dlist">${opts.map((o) => `<div class="li" data-a="mode" data-v="${esc(o)}">${esc(workModeName(ctx, o))}${o === cur
              ? `<svg class="chk" viewBox="0 0 24 24"><path fill="none" stroke="${C.blue}" stroke-width="2.2" d="M5,12.5L10,17.5L19,7"/></svg>` : ""}</div>`).join("")}</div>`
          : `<div class="ptime">${esc(t("no_data"))}</div>`}
        <div class="dlist"><div class="li na">${esc(t("scheduler"))}<span class="lv">--</span></div></div></div>`;
    },

    /* ---------- alarm ---------- */
    alarm: (ctx) => {
      const esc = ctx.esc, pg = PG(ctx, "alarm"), t = (k) => ctx.t(`ui.${k}`);
      const hist = pg.tab === "hist";
      const s = st(ctx, "fault");
      const cur = s && !noFault(s.state) ? [{ s: s.state, t: new Date(s.last_changed).getTime() }] : [];
      const rows = hist ? (pg.data && pg.data.rows) || [] : cur;
      return `<div class="scroll fx">${head(ctx, t("alarm"))}
        <div class="atabs"><button data-a="atab" data-t="cur"${hist ? "" : ' class="on"'}>${esc(t("cur_tab"))}</button><button data-a="atab" data-t="hist"${hist ? ' class="on"' : ""}>${esc(t("history"))}</button></div>
        ${rows.length
          ? `<div class="dlist">${rows.map((r) => `<div class="kv"><span>${esc(t("fault_code"))}: ${esc(r.s)}</span><b>${esc(new Date(r.t).toLocaleString("sv-SE"))}</b></div>`).join("")}</div>`
          : `<div class="nodata">${esc(t("no_data"))}</div>`}</div>`;
    },

    /* ---------- device tab ---------- */
    devices: (ctx) => {
      const esc = ctx.esc, t = (k) => ctx.t(`ui.${k}`);
      const online = num(st(ctx, "pv")) !== null;
      const lg = loggerOnline(ctx);
      const pl = (on) => `<div class="dpill sm" style="background:${on ? C.green : C.neutral}">${esc(on ? t("normal") : t("offline"))}</div>`;
      const card = (page, img, sn, name, on) => `<div class="devc" data-a="page" data-p="${page}">${pl(on)}<img src="${ctx.img(img)}" alt=""><p>${esc(sn || "")}</p><b>${esc(name)}</b></div>`;
      const l = ctx.config.logger || {};
      return `<div class="scroll fx">${head(ctx, t("devices"))}<div class="devg">
        ${card("inverter", "dev_inverter.webp", ctx.config.inverter_sn, ctx.config.inverter_model, online)}
        ${card("logger", "dev_logger.webp", l.sn, t("logger"), lg)}
        ${card("battery", "dev_battery.webp", ctx.config.battery_sn, ctx.config.battery_model, online)}</div></div>`;
    },

    logger: (ctx) => {
      const esc = ctx.esc, t = (k) => ctx.t(`ui.${k}`);
      const l = ctx.config.logger || {}, on = loggerOnline(ctx);
      const card = (title, v) => `<div class="dcard"><div class="dt">${esc(title)}</div><div class="dv"><b>${esc(v || "")}</b></div></div>`;
      const blockState = st(ctx, "logger_block");
      return `<div class="scroll fx">${head(ctx, t("accessory"))}
        <div class="dpill" style="background:${on ? C.green : C.neutral}">${esc(on ? t("normal") : t("offline"))}</div>
        <img class="devimg" src="${ctx.img("dev_logger.webp")}" alt="">
        <div class="sn"><span>${esc(l.sn || "")}</span></div>
        <div class="dgrid">${card(t("net_type"), l.network)}${card(t("dev_type"), l.model)}</div>
        <div class="dlist"><div class="kv"><span>${esc(t("sw_version"))}</span><b>${esc(l.version || "")}</b></div>
          ${E(ctx).logger_block ? `<div class="li" data-a="ent" data-k="logger_block">${esc(blockState ? blockState.attributes.friendly_name || "" : "")}${CHEV}</div>` : ""}</div></div>`;
    },
  },

  /* ---------- sheets (the app's popups) ---------- */
  sheets: {
    info: (ctx, p) => `<h3>${ctx.esc(p.title || "")}</h3><div class="pbody">${p.body || ""}</div>` +
      `<div class="pbtn"><button data-a="closesheet">${ctx.esc(ctx.t("ui.ok"))}</button></div>`,
    confirm: (ctx, p) => `<h3>${ctx.esc(p.title || "")}</h3><div class="pbody">${p.body || ""}</div>` +
      `<div class="pbtn"><button data-a="closesheet">${ctx.esc(ctx.t("ui.cancel"))}</button>` +
      `<button class="main" data-a="${ctx.esc(p.action)}" data-v="${ctx.esc(p.v || "")}" data-p="${ctx.esc(p.p || "")}">${ctx.esc(ctx.t("ui.confirm"))}</button></div>`,
  },

  /* ---------- actions ---------- */
  actions: {
    page: (ctx, d) => ctx.go(d.p, {}),
    ent: (ctx, d) => ctx.more(E(ctx)[d.k]),
    quick: (ctx) => {
      const a = ctx.config.quick_settings_action;
      if (a && a.navigation_path) {
        window.history.pushState(null, "", a.navigation_path);
        window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
        return;
      }
      return ctx.go("quick", {});
    },
    tab: (ctx, d) => { const pg = PG(ctx, ctx.nav().screen); pg.tab = d.t; pg.date = Date.now(); pg.hover = undefined; pg.loadKey = null; ctx.refresh(); },
    atab: (ctx, d) => { PG(ctx, "alarm").tab = d.t; ctx.refresh(); },
    shift: (ctx, d) => {
      const pg = PG(ctx, ctx.nav().screen);
      const date = new Date(pg.date), k = Number(d.d);
      if (pg.tab === "day") date.setDate(date.getDate() + k);
      else if (pg.tab === "week") date.setDate(date.getDate() + 7 * k);
      else if (pg.tab === "month") date.setMonth(date.getMonth() + k);
      else if (pg.tab === "year") date.setFullYear(date.getFullYear() + k);
      if (date.getTime() > Date.now() + 86400000) return;
      pg.date = date.getTime();
      pg.hover = undefined;
      pg.loadKey = null;
      ctx.refresh();
    },
    fold: (ctx, d) => {
      const pg = PG(ctx, ctx.nav().screen);
      if (pg.open.has(d.k)) pg.open.delete(d.k); else pg.open.add(d.k);
      ctx.refresh();
    },
    chip: (ctx, d) => {
      const pg = PG(ctx, ctx.nav().screen);
      if (!pg.sel) return;
      if (pg.sel.has(d.k)) { if (pg.sel.size > 1) pg.sel.delete(d.k); } else pg.sel.add(d.k);
      ctx.refresh();
    },

    // Changing the work mode is a write to the inverter, so it asks first.
    mode: (ctx, d) => {
      const s = st(ctx, "work_mode");
      if (!s || s.state === d.v) return;
      ctx.sheet("confirm", { title: ctx.t("ui.work_mode"), body: ctx.esc(ctx.t("ui.switch_mode", { name: workModeName(ctx, d.v) })), action: "domode", v: d.v });
    },
    domode: (ctx, d) => {
      ctx.closeSheet();
      return ctx.call("select", "select_option", { entity_id: E(ctx).work_mode, option: d.v });
    },

    statuspop: (ctx) => {
      if (num(st(ctx, "pv")) === null) return ctx.sheet("info", { title: ctx.t("ui.offline"), body: ctx.esc(ctx.t("ui.off_tips")) });
      const f = st(ctx, "fault");
      if (f && !noFault(f.state)) {
        return ctx.sheet("confirm", {
          title: ctx.t("ui.fault"),
          body: `${ctx.esc(ctx.t("ui.normal_tips"))}<br><br>${ctx.esc(ctx.t("ui.fault_code"))}: ${ctx.esc(f.state)}`,
          action: "gopage", p: "devices",
        });
      }
      const s = st(ctx, "status");
      return ctx.more(s && s.entity_id);
    },
    gopage: (ctx, d) => { ctx.closeSheet(); return ctx.go(d.p, {}); },

    loadpop: (ctx) => {
      const load = kW(st(ctx, "load")), eps = kW(st(ctx, "eps"));
      if (eps === null) return ctx.more(E(ctx).load);
      const normal = load === null ? null : Math.max(0, load - eps);
      return ctx.sheet("info", {
        title: ctx.t("ui.home"),
        body: `<div class="kv"><span>${ctx.esc(ctx.t("ui.normal_load"))}</span><b>${f2(normal)} kW</b></div>` +
              `<div class="kv"><span>${ctx.esc(ctx.t("ui.backup_load"))}</span><b>${f2(eps)} kW</b></div>`,
      });
    },
  },

  /* ---------- the frame loop, the charts and the loaders ---------- */
  afterRender: (ctx, root) => {
    const s = S(ctx);
    const screen = ctx.nav()?.screen;

    // "Updated N minutes ago" has no entity change behind it, so the screen refreshes itself.
    if (!s.tick) s.tick = setInterval(() => ctx.refresh(), 15000);

    if (screen === "home") {
      s.canvas = root.querySelector("#comets");
      s.flags = flags(ctx);
      if (!s.tracks) s.tracks = buildTracks();
      sizeCanvas(s);
      // Every render replaces the scene, so an observer bound to the previous .flow node is
      // watching something detached and never fires again.
      const flow = root.querySelector(".flow");
      if (flow && s.flowNode !== flow && typeof ResizeObserver !== "undefined") {
        s.ro?.disconnect();
        s.ro = new ResizeObserver(() => sizeCanvas(s));
        s.ro.observe(flow);
        s.flowNode = flow;
      }
      if (!s.raf) {
        const loop = (now) => {
          s.raf = requestAnimationFrame(loop);
          frame(s, now);
        };
        s.raf = requestAnimationFrame(loop);
      }
      if (!s.barsAt || Date.now() - s.barsAt > 300000) { s.barsAt = Date.now(); loadHomeCharts(ctx); }
      drawBars(ctx, root);
      drawSoc(ctx, root);
      return;
    }

    // Off the home screen the canvas is gone; the loop would draw into nothing.
    s.canvas = null;

    if (screen === "inv_analysis" || screen === "bat_analysis" || screen === "plant_analysis") {
      const pg = PG(ctx, screen);
      const key = `${pg.tab}|${pg.date}`;
      if (pg.loadKey !== key) { pg.loadKey = key; loadAnalysis(ctx, screen); }
      drawAnalysis(ctx, root, screen);
      wireHover(ctx, root, screen);
      return;
    }
    if (screen === "revenue") {
      const pg = PG(ctx, "revenue");
      const key = `${pg.tab}|${pg.date}`;
      if (pg.loadKey !== key) { pg.loadKey = key; loadRevenue(ctx); }
      drawAnalysis(ctx, root, "revenue");
      wireHover(ctx, root, "revenue");
      return;
    }
    if (screen === "revenue_cal") {
      const pg = PG(ctx, "revenue_cal");
      const key = String(pg.date);
      if (pg.loadKey !== key) { pg.loadKey = key; loadRevCal(ctx); }
      return;
    }
    if (screen === "alarm") {
      const pg = PG(ctx, "alarm");
      if (!pg.loadKey) { pg.loadKey = "1"; loadAlarm(ctx); }
    }
  },

  teardown: (ctx) => {
    const s = ctx.state.fx;
    if (!s) return;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.raf = null;
    if (s.sizeRetry) cancelAnimationFrame(s.sizeRetry);
    s.sizeRetry = 0;
    s.flowNode = null;
    clearInterval(s.tick);
    s.tick = null;
    s.ro?.disconnect();
    s.ro = null;
    s.canvas = null;
  },

  /* ---------- styles ---------- */
  // The hub owns ha-card, .wrap, .scroll, .toast, .veil and .sheet. `--u` is this app's design
  // unit: the whole screen is laid out in 700 units and scales with the card width.
  css: () => `
.fx{--u:calc(100cqw / ${W});font-family:Roboto,"Noto Sans",sans-serif;color:var(--fx-l1);padding-bottom:calc(var(--u) * 16);
  --fx-tile:var(--card-background-color,#1c1c1e);--fx-fill2:var(--secondary-background-color,#27282a);
  --fx-l1:var(--primary-text-color,#e9ebf0);--fx-l2:var(--secondary-text-color,#9fa2ac);
  --fx-helper:color-mix(in srgb,var(--secondary-text-color,#666a76) 80%,var(--card-background-color,#1c1c1e));
  --fx-vmix:30%;--fx-sep:var(--divider-color,rgba(135,141,150,0.83))}
/* the scene images are dark skins only: the hero keeps its own palette in every theme */
.flow{position:relative;overflow:hidden;background:#141414;--fx-l1:#e9ebf0;--fx-l2:#9fa2ac;--fx-sep:rgba(135,141,150,0.83)}
.scene{position:absolute;left:0;width:100%}
.abs{position:absolute;display:block}
img.abs,#comets{pointer-events:none}
.hot{cursor:pointer}
.vline{position:absolute;width:calc(var(--u) * 0.5);background:var(--fx-sep)}
.solar{position:absolute;padding-left:calc(var(--u) * 4);cursor:pointer}
.solar .t{color:var(--st)}
.solar .v b,.solar .v span{color:var(--sv)}
.lbl{position:absolute;cursor:pointer}
.lbl > i{position:absolute;left:0;top:0;bottom:0;width:calc(var(--u) * 0.5);background:var(--fx-sep)}
.lt{position:absolute;left:calc(var(--u) * 4);bottom:0}
.fx .t{font-size:calc(var(--u) * ${11 * FONT});line-height:1.17;color:var(--fx-l2);white-space:nowrap;display:flex;align-items:center;gap:calc(var(--u) * 4)}
.fx .t .pr{width:calc(var(--u) * ${13 * FONT});height:calc(var(--u) * ${13 * FONT});color:var(--fx-l2)}
.fx .v{white-space:nowrap;line-height:1.17;display:flex;align-items:baseline}
.fx .v b{font-size:calc(var(--u) * ${16 * FONT});font-weight:700;color:var(--fx-l1)}
.fx .v span{font-size:calc(var(--u) * ${13 * FONT});margin-left:calc(var(--u) * 2);color:var(--fx-l1)}
.fx .v svg{width:calc(var(--u) * ${16 * FONT});height:calc(var(--u) * ${17 * FONT});margin-left:calc(var(--u) * 4);align-self:center}
.soc b,.soc span{color:${C.green}}
.head{position:absolute;inset:0;pointer-events:none}
.head > *{pointer-events:auto}
.alarm{position:absolute;right:calc(var(--u) * 58);top:calc(var(--u) * 20);width:calc(var(--u) * 28);height:calc(var(--u) * 28);color:var(--fx-l1);cursor:pointer}
.more{position:absolute;right:calc(var(--u) * 18);top:calc(var(--u) * 32);width:calc(var(--u) * 26);height:calc(var(--u) * 6);color:var(--fx-l1);cursor:pointer}
.status{position:absolute;left:calc(var(--u) * 16);top:calc(var(--u) * 68);padding:calc(var(--u) * 2) calc(var(--u) * 8);border-radius:calc(var(--u) * 6);font-size:calc(var(--u) * ${13 * FONT});line-height:1.3;color:#fff;cursor:pointer}
.upd{position:absolute;right:calc(var(--u) * 16);top:calc(var(--u) * 68);font-size:calc(var(--u) * ${13 * FONT});color:var(--fx-l2)}
.refr{position:absolute;right:calc(var(--u) * 16);top:calc(var(--u) * 66);display:flex;align-items:center;gap:calc(var(--u) * 6);padding:calc(var(--u) * 2) calc(var(--u) * 10) calc(var(--u) * 2) calc(var(--u) * 6);border-radius:calc(var(--u) * 9);background:rgba(255,255,255,0.1);font-size:calc(var(--u) * ${13 * FONT});color:var(--fx-l1)}
.spin{width:calc(var(--u) * 18);height:calc(var(--u) * 18);border-radius:50%;box-sizing:border-box;border:calc(var(--u) * 1.4) solid var(--fx-l2);
  background:conic-gradient(var(--fx-l2) var(--a, 0deg),transparent 0);animation:sweep 5s linear infinite}
@property --a { syntax:'<angle>'; inherits:false; initial-value:0deg; }
@keyframes sweep{from{--a:0deg}to{--a:360deg}}
.wx{position:absolute;left:calc(var(--u) * 16);top:calc(var(--u) * 18);display:flex;align-items:center;font-size:calc(var(--u) * ${16 * FONT});cursor:pointer}
.wx svg,.wx ha-icon{width:calc(var(--u) * 30);height:calc(var(--u) * 30);--mdc-icon-size:calc(var(--u) * 30);margin-right:calc(var(--u) * 4);display:block}
.quick{margin:calc(var(--u) * 42) calc(var(--u) * 16) 0;height:calc(var(--u) * 50);border-radius:calc(var(--u) * 8);background:var(--fx-fill2);display:flex;align-items:center;padding:0 calc(var(--u) * 12) 0 calc(var(--u) * 16);font-size:calc(var(--u) * ${16 * FONT});font-weight:700;cursor:pointer}
.quick svg{width:calc(var(--u) * 22);height:calc(var(--u) * 22);margin-right:calc(var(--u) * 4)}
.quick .chev{margin:0 0 0 auto;color:var(--fx-l1)}
.fx .row{display:flex;gap:calc(var(--u) * 16);margin:calc(var(--u) * 17) calc(var(--u) * 16) 0}
.fx .row .tile{flex:1;margin:0}
.tile{position:relative;background:var(--fx-tile);border-radius:calc(var(--u) * 8);padding:calc(var(--u) * 14) calc(var(--u) * 10) calc(var(--u) * 14) calc(var(--u) * 16);cursor:pointer;min-width:0}
.tile.wide{margin:calc(var(--u) * 16) calc(var(--u) * 16) 0}
.tt{display:flex;align-items:center;font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-l2)}
.tt .chev{width:calc(var(--u) * 20);height:calc(var(--u) * 20);margin-left:auto;color:#666a76}
.tv{display:flex;align-items:baseline;margin-top:calc(var(--u) * 14);white-space:nowrap}
.tv b,.tile > .tv:not(:has(b)){font-size:calc(var(--u) * ${16 * FONT});font-weight:700;color:var(--fx-l1)}
#wm{font-size:calc(var(--u) * ${16 * FONT});font-weight:700}
.tv span{font-size:calc(var(--u) * ${12 * FONT});margin-left:calc(var(--u) * 2);color:var(--fx-l1)}
.tv em{margin-left:auto;font-style:normal;font-size:calc(var(--u) * ${11 * FONT});color:var(--fx-l2)}
.chart .tv b{font-size:calc(var(--u) * ${16 * FONT})}
.bars{display:block;width:calc(100% + var(--u) * 8);margin-left:calc(var(--u) * -7);height:calc(var(--u) * 66);margin-top:calc(var(--u) * 6)}
.days{display:flex;justify-content:space-around;margin-left:calc(var(--u) * -7);margin-right:calc(var(--u) * -1);font-size:calc(var(--u) * ${11 * FONT * 0.7});color:var(--fx-l2);margin-top:calc(var(--u) * 4)}
.days span{width:calc(100% / 7);text-align:center}
.legend{position:absolute;right:calc(var(--u) * 16);top:calc(var(--u) * 46);display:flex;gap:calc(var(--u) * 16);font-size:calc(var(--u) * ${11 * FONT * 0.7});color:var(--fx-helper)}
.legend i{display:inline-block;width:calc(var(--u) * 12);height:calc(var(--u) * 2);vertical-align:middle;margin-right:calc(var(--u) * 4)}
.socsvg{display:block;width:100%;height:calc(var(--u) * 92)}
.socx{display:flex;justify-content:space-between;padding:0 calc(var(--u) * 20);font-size:calc(var(--u) * ${11 * FONT * 0.7});color:var(--fx-l2)}
.impact{cursor:default}
.imp{display:flex;margin-top:calc(var(--u) * 20);padding-bottom:calc(var(--u) * 10)}
.imp > div{flex:1;text-align:center}
.imp img{width:calc(var(--u) * 40);height:calc(var(--u) * 40)}
.imp p{margin:calc(var(--u) * 10) 0 0;font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-helper)}
.imp .tv{justify-content:center;margin-top:calc(var(--u) * 8)}
.sh{position:relative;min-height:calc(var(--u) * 66);display:flex;align-items:center;justify-content:center}
.sh .bk{position:absolute;left:calc(var(--u) * 10);top:calc(var(--u) * 14);max-width:calc(var(--u) * 88);display:flex;align-items:center;gap:calc(var(--u) * 2);background:none;border:0;color:${C.blue};font:inherit;font-size:calc(var(--u) * ${16 * FONT});cursor:pointer;padding:calc(var(--u) * 4);white-space:nowrap;overflow:hidden}
.sh .bk svg{flex:none;width:calc(var(--u) * 24);height:calc(var(--u) * 24)}
.sh .bk span{overflow:hidden;text-overflow:ellipsis}
.sh .st{font-size:calc(var(--u) * ${16 * FONT});font-weight:500}
.dpill{display:inline-block;margin:calc(var(--u) * 12) 0 0 calc(var(--u) * 17);padding:calc(var(--u) * 2) calc(var(--u) * 7);border-radius:calc(var(--u) * 6);font-size:calc(var(--u) * ${13 * FONT});line-height:1.3;color:#fff}
.devimg{display:block;width:100%;margin-top:calc(var(--u) * 4);aspect-ratio:1400/902;object-fit:cover}
.sn{display:flex;align-items:center;gap:calc(var(--u) * 6);width:max-content;margin:calc(var(--u) * 18) auto 0;padding:calc(var(--u) * 4) calc(var(--u) * 10);border-radius:calc(var(--u) * 6);background:#1e1e1f;color:#e9ebf0;font-size:calc(var(--u) * ${12 * FONT})}
.sn .chev{width:calc(var(--u) * 16);height:calc(var(--u) * 16);color:#9fa2ac}
.dupd{margin:calc(var(--u) * 14) calc(var(--u) * 17) calc(var(--u) * 8);font-size:calc(var(--u) * ${11 * FONT});color:var(--fx-helper)}
.dgrid{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u) * 14);margin:calc(var(--u) * 14) calc(var(--u) * 17) 0}
.dgrid.inv{grid-template-rows:calc(var(--u) * 96) calc(var(--u) * 96)}
.dgrid.inv .dcard{min-height:0;padding-top:calc(var(--u) * 16)}
.dgrid.inv .gauge{grid-row:span 2}
.dcard{background:var(--fx-tile);border-radius:calc(var(--u) * 8);padding:calc(var(--u) * 18) calc(var(--u) * 16);min-height:calc(var(--u) * 60)}
.dt{font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-l2)}
.dv{margin-top:calc(var(--u) * 22);display:flex;align-items:baseline;gap:calc(var(--u) * 3)}
.dv b{font-size:calc(var(--u) * ${20 * FONT});font-weight:400}
.dv span{font-size:calc(var(--u) * ${13 * FONT})}
.gauge svg{display:block;width:40%;margin:calc(var(--u) * 26) auto 0;overflow:visible}
.gauge .gv{fill:var(--fx-l1);font-size:24px}
.gauge .gu{fill:var(--fx-l1);font-size:13px;font-weight:700}
.socbar{margin:calc(var(--u) * 4) calc(var(--u) * 17) 0;padding-top:calc(var(--u) * 16);padding-bottom:calc(var(--u) * 12);min-height:0}
.socbar + .dgrid{gap:calc(var(--u) * 12);margin-top:calc(var(--u) * 12)}
.srow{display:flex;justify-content:space-between;font-size:calc(var(--u) * ${16 * FONT});color:var(--fx-l2)}
.srow b{color:var(--fx-l1);font-weight:400}
.segs{display:flex;justify-content:space-between;margin-top:calc(var(--u) * 12)}
.segs i{width:calc(var(--u) * 5);height:calc(var(--u) * 10.5);border-radius:calc(var(--u) * 2);background:var(--disabled-text-color,#525254)}
.segs i.on{background:${C.green}}
.dlist{margin:calc(var(--u) * 25) calc(var(--u) * 17) 0;background:var(--fx-tile);border-radius:calc(var(--u) * 8)}
.li,.fh{display:flex;align-items:center;justify-content:space-between;padding:0 calc(var(--u) * 16);min-height:calc(var(--u) * 54);font-size:calc(var(--u) * ${16 * FONT});cursor:pointer}
.li + .li{border-top:1px solid #3e4044}
.li .chev,.fh .chev{width:calc(var(--u) * 22);height:calc(var(--u) * 22);color:var(--fx-l2)}
.fold{margin:calc(var(--u) * 25) calc(var(--u) * 16) 0;background:var(--fx-tile);border-radius:calc(var(--u) * 8);overflow:hidden}
.fold:first-of-type{margin-top:calc(var(--u) * 14)}
.fold.open .fh .chev{transform:rotate(180deg)}
.fh{min-height:calc(var(--u) * 47)}
.tbl{border-top:1px solid #3e4044}
.tr{display:flex;align-items:center;min-height:calc(var(--u) * 57);border-bottom:1px solid #3e4044}
.tr:last-child{border-bottom:0}
.tr span{flex:1;padding:0 calc(var(--u) * 16);font-size:calc(var(--u) * ${15 * FONT})}
.tr.th span{font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-l2);padding-top:calc(var(--u) * 6);padding-bottom:calc(var(--u) * 6)}
.fx .kv{display:flex;justify-content:space-between;align-items:center;min-height:calc(var(--u) * 57);padding:0 calc(var(--u) * 16);border-top:1px solid #3e4044;font-size:calc(var(--u) * ${15 * FONT})}
.fold.open > .kv:first-child{border-top:0}
.fx .kv span{color:var(--fx-l2)}
.fx .kv b{font-weight:400}
.ptime{text-align:center;margin-top:calc(var(--u) * 22);font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-helper)}
.fx .tabs{display:flex;margin:calc(var(--u) * 14) calc(var(--u) * 16) 0;padding:calc(var(--u) * 3);background:var(--fx-fill2);border-radius:calc(var(--u) * 10)}
.fx .tabs button{flex:1;height:calc(var(--u) * 35);background:none;border:0;border-radius:calc(var(--u) * 8);color:var(--fx-l2);font:inherit;font-size:calc(var(--u) * ${12 * FONT});cursor:pointer}
.fx .tabs button.on{background:var(--fx-tile);color:var(--fx-l1);font-weight:700}
.dnav{display:flex;align-items:center;justify-content:space-between;margin:calc(var(--u) * 16) calc(var(--u) * 16) 0;height:calc(var(--u) * 46)}
.dnav b{font-size:calc(var(--u) * ${14 * FONT})}
.dnav button,.dnav span{width:calc(var(--u) * 40);height:calc(var(--u) * 40);background:none;border:0;color:var(--fx-l2);cursor:pointer;padding:calc(var(--u) * 6)}
.ahead{margin:calc(var(--u) * 20) calc(var(--u) * 16) 0;font-size:calc(var(--u) * ${15 * FONT})}
.fx .chips{display:flex;flex-wrap:wrap;gap:calc(var(--u) * 8);margin:calc(var(--u) * 12) calc(var(--u) * 16) 0}
.fx .chips button{display:flex;align-items:center;gap:calc(var(--u) * 6);height:calc(var(--u) * 26);padding:0 calc(var(--u) * 9);background:var(--fx-tile);border:1px solid #3e4044;border-radius:calc(var(--u) * 6);color:var(--fx-l1);font:inherit;font-size:calc(var(--u) * ${11 * FONT});cursor:pointer}
.fx .chips button:not(.on){color:var(--fx-l2)}
.fx .chips i{width:calc(var(--u) * 10);height:calc(var(--u) * 10);border:1px solid var(--fx-l2);border-radius:2px}
.achart{position:relative;margin:calc(var(--u) * 14) calc(var(--u) * 6) 0}
.achart svg{display:block;width:100%;height:calc(var(--u) * 330);touch-action:pan-y}
.achart.soc svg{height:calc(var(--u) * 120)}
.achart .cap{margin-left:calc(var(--u) * 10);font-size:calc(var(--u) * 11);color:var(--fx-l2)}
.achart .ax{fill:var(--fx-l2);font-size:10px}
.achart .nd{fill:var(--fx-l2);font-size:14px}
.tip{position:absolute;top:calc(var(--u) * 130);padding:calc(var(--u) * 10) calc(var(--u) * 12);background:rgba(40,41,44,0.92);border-radius:calc(var(--u) * 8);font-size:calc(var(--u) * 11);color:#e9ebf0;min-width:calc(var(--u) * 150);pointer-events:none}
.tip p{margin:0 0 calc(var(--u) * 6);font-size:calc(var(--u) * 12)}
.tip div{display:flex;align-items:center;gap:calc(var(--u) * 6);margin-top:calc(var(--u) * 4);color:#9fa2ac}
.tip i{width:calc(var(--u) * 8);height:calc(var(--u) * 8);border-radius:2px}
.tip b{margin-left:auto;color:#e9ebf0}
.pcard{display:flex;margin:calc(var(--u) * 14) calc(var(--u) * 16) 0;padding:calc(var(--u) * 10) calc(var(--u) * 16) calc(var(--u) * 14);background:var(--fx-tile);border-radius:calc(var(--u) * 8)}
.pcard .pl{flex:1}
.pcard .pt{margin-top:calc(var(--u) * 12);font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-l2)}
.pcard .pv{display:flex;align-items:baseline;gap:calc(var(--u) * 2);margin-top:calc(var(--u) * 5)}
.pcard .pv b{font-size:calc(var(--u) * ${15 * FONT});font-weight:400}
.pcard .pv.big b{font-size:calc(var(--u) * ${16 * FONT});font-weight:700}
.pcard .pv span{font-size:calc(var(--u) * ${12 * FONT})}
.pcard .pr{display:flex;flex-direction:column;align-items:center;justify-content:center;width:calc(var(--u) * 170)}
.pcard .pr p{margin:calc(var(--u) * 8) 0 0;font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-l2)}
.ring{width:calc(var(--u) * 112);height:calc(var(--u) * 112)}
.ring text{font-size:15px}
.dot{display:inline-block;width:calc(var(--u) * 10);height:calc(var(--u) * 10);border-radius:2px;margin-right:calc(var(--u) * 8);vertical-align:middle}
.tr8{position:absolute;right:calc(var(--u) * 14);top:calc(var(--u) * 14);background:none;border:0;color:${C.blue};font:inherit;font-size:calc(var(--u) * ${16 * FONT});font-weight:700;cursor:pointer}
.rhead{margin:calc(var(--u) * 18) calc(var(--u) * 16) 0;padding:calc(var(--u) * 16) calc(var(--u) * 16) calc(var(--u) * 20);border-radius:calc(var(--u) * 8) calc(var(--u) * 8) 0 0;background:linear-gradient(90deg,#a77dff,#c9aeff);color:#141414}
.rhead p{margin:0;font-size:calc(var(--u) * ${12 * FONT})}
.rhead b{display:block;margin-top:calc(var(--u) * 10);font-size:calc(var(--u) * ${23 * FONT})}
.rhead b span{font-size:calc(var(--u) * ${14 * FONT})}
.rweek{margin:0 calc(var(--u) * 16);padding:calc(var(--u) * 6) calc(var(--u) * 6) calc(var(--u) * 12);background:var(--fx-tile);border-radius:0 0 calc(var(--u) * 8) calc(var(--u) * 8)}
.wds{display:flex}
.wd{flex:1;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u) * 6);padding:calc(var(--u) * 8) 0;border-radius:calc(var(--u) * 8);font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-l2)}
.wd.on{background:var(--fx-fill2)}
.wd b{font-size:calc(var(--u) * ${15 * FONT});font-weight:400;color:var(--fx-l1)}
.wd em{font-style:normal;color:color-mix(in srgb,${C.green},var(--fx-l1) var(--fx-vmix, 0%));min-height:1em}
.cal{display:flex;justify-content:flex-end;align-items:center;gap:calc(var(--u) * 6);margin-top:calc(var(--u) * 8);color:${C.blue};font-size:calc(var(--u) * ${14 * FONT});cursor:pointer}
.cal .chev{width:calc(var(--u) * 20);height:calc(var(--u) * 20);color:${C.blue}}
.rboxes{display:flex;align-items:center;gap:calc(var(--u) * 8);margin:calc(var(--u) * 12) calc(var(--u) * 16) 0}
.rboxes > i{font-style:normal;font-size:calc(var(--u) * ${16 * FONT});color:var(--fx-l2)}
.rbox{color:#e9ebf0;flex:1;min-width:0;padding:calc(var(--u) * 12);border-radius:calc(var(--u) * 8);font-size:calc(var(--u) * ${11 * FONT})}
.rbox div{line-height:1.2;min-height:2.4em}
.rbox b{display:block;margin-top:calc(var(--u) * 8);font-size:calc(var(--u) * ${15 * FONT})}
.rbox b span{font-size:calc(var(--u) * ${11 * FONT})}
.rbox.t{background:#3b2d5c}.rbox.s{background:#1d4a44}.rbox.f{background:#1b2c5e}
.calg{display:grid;grid-template-columns:repeat(7,1fr);gap:calc(var(--u) * 6);margin:calc(var(--u) * 14) calc(var(--u) * 16) 0}
.calg .ch{text-align:center;font-size:calc(var(--u) * ${11 * FONT});color:var(--fx-l2)}
.calg .cd{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u) * 4);padding:calc(var(--u) * 8) 0;background:var(--fx-tile);border-radius:calc(var(--u) * 6)}
.calg .cd b{font-weight:400;font-size:calc(var(--u) * ${13 * FONT})}
.calg .cd em{font-style:normal;font-size:calc(var(--u) * ${9 * FONT});color:color-mix(in srgb,${C.green},var(--fx-l1) var(--fx-vmix, 0%));min-height:1em}
.qt{margin:calc(var(--u) * 22) calc(var(--u) * 26) 0;font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-l2)}
.qt + .dlist{margin-top:calc(var(--u) * 8)}
.dlist + .dlist{margin-top:calc(var(--u) * 14)}
.li .lv{display:flex;align-items:center;gap:calc(var(--u) * 4);color:var(--fx-l2)}
.li.na{cursor:default;color:var(--fx-l2)}
.li .chk{width:calc(var(--u) * 24);height:calc(var(--u) * 24)}
.qbat{display:flex;align-items:center;padding:calc(var(--u) * 14) calc(var(--u) * 16)}
.qbat .ql{flex:1}
.qk{font-size:calc(var(--u) * ${16 * FONT});margin-top:calc(var(--u) * 6)}
.qv{display:flex;gap:calc(var(--u) * 24);margin:calc(var(--u) * 6) 0 calc(var(--u) * 8);font-size:calc(var(--u) * ${12 * FONT});color:var(--fx-l2)}
.qv span{cursor:pointer}
.qv b{font-size:calc(var(--u) * ${20 * FONT});font-weight:400;color:var(--fx-l1)}
.socr{width:calc(var(--u) * 50);height:calc(var(--u) * 88)}
.atabs{display:flex;justify-content:center;gap:calc(var(--u) * 30);margin-top:calc(var(--u) * 10)}
.atabs button{background:none;border:0;border-bottom:2px solid transparent;padding:calc(var(--u) * 6) calc(var(--u) * 4);color:var(--fx-l2);font:inherit;font-size:calc(var(--u) * ${15 * FONT});cursor:pointer}
.atabs button.on{color:var(--fx-l1);border-bottom-color:${C.blue}}
.nodata{text-align:center;margin-top:calc(var(--u) * 120);color:var(--fx-l2);font-size:calc(var(--u) * ${15 * FONT})}
.devg{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--u) * 10);margin:calc(var(--u) * 12) calc(var(--u) * 8) 0}
.devc{background:var(--fx-tile);border-radius:calc(var(--u) * 10);padding:calc(var(--u) * 12) calc(var(--u) * 12) calc(var(--u) * 16);cursor:pointer}
.devc img{display:block;width:70%;margin:calc(var(--u) * 6) auto;aspect-ratio:1400/902;object-fit:contain}
.devc p{margin:0;font-size:calc(var(--u) * ${11 * FONT});color:var(--fx-l2)}
.devc b{font-size:calc(var(--u) * ${15 * FONT});font-weight:500}
.dpill.sm{margin:0}
.sheet h3{margin:.2em 0 .8em;font-weight:500;text-align:center}
.pbody{color:var(--secondary-text-color,#9fa2ac);line-height:1.4}
.pbody .kv{display:flex;justify-content:space-between;min-height:44px;align-items:center}
.pbtn{display:flex;gap:10px;margin-top:18px}
.pbtn button{flex:1;height:46px;border:0;border-radius:10px;background:var(--secondary-background-color,#27282a);color:var(--primary-text-color,#e9ebf0);font:inherit;font-size:15px;cursor:pointer}
.pbtn button.main{background:${C.blue};color:#fff}
@container apphub (max-width:420px){.dgrid{grid-template-columns:1fr}.devg{grid-template-columns:1fr}}
`,
};

/* ---------- helpers the module body refers to ---------- */
function loggerOnline(ctx) {
  // the logger reaches FoxCloud only when the UniFi internet block is off
  const s = st(ctx, "logger_block");
  return !s ? null : s.state === "off";
}

function analysisHtml(ctx, screen, kind) {
  const esc = ctx.esc, pg = PG(ctx, screen), t = (k) => ctx.t(`ui.${k}`);
  const energy = !["h48", "day"].includes(pg.tab);
  const series = seriesOf(ctx, kind, energy);
  const rg = range(ctx, pg);
  const tabs = [["h48", "h48"], ["day", "day"], ["week", "week"], ["month", "month"], ["year", "year"], ["total", "total"]]
    .filter(([k]) => kind !== "plant" || k !== "h48");
  const sel = pg.sel || new Set(series.map((s) => s.k));
  const nav = pg.tab === "h48" || pg.tab === "total"
    ? `<div class="dnav"><span></span><b>${esc(rg.label)}</b><span></span></div>`
    : `<div class="dnav"><button data-a="shift" data-d="-1">${ARROW_L}</button><b>${esc(rg.label)}</b><button data-a="shift" data-d="1">${ARROW_R}</button></div>`;
  return `<div class="scroll fx">${head(ctx, t("analysis"))}
    <div class="tabs">${tabs.map(([k, n]) => `<button data-a="tab" data-t="${k}"${pg.tab === k ? ' class="on"' : ""}>${esc(t(n))}</button>`).join("")}</div>
    ${nav}
    ${kind === "plant" ? plantSumsHtml(ctx, pg) : ""}
    <div class="ahead"><span>${esc(t("stats"))}</span></div>
    <div class="chips">${series.map((s) => `<button data-a="chip" data-k="${s.k}"${sel.has(s.k) ? ' class="on"' : ""}><i style="${sel.has(s.k) ? `background:${s.c};border-color:${s.c}` : ""}"></i>${esc(s.n)}</button>`).join("")}</div>
    <div class="achart"><svg data-chart="main" viewBox="0 0 700 330" preserveAspectRatio="none"></svg><div class="tip" hidden></div></div>
    ${kind === "bat" && !energy ? `<div class="achart soc"><div class="cap">${esc(t("soc_chart"))}</div><svg data-chart="soc" viewBox="0 0 700 120" preserveAspectRatio="none"></svg></div>` : ""}
    ${kind === "plant" ? plantListsHtml(ctx, pg) : ""}</div>`;
}

function plantSumsHtml(ctx, pg) {
  const esc = ctx.esc, t = (k) => ctx.t(`ui.${k}`);
  const s = pg.sums || {};
  const pv = s.pv ?? null, exp = s.exp ?? null, load = s.load ?? null, imp = s.imp ?? null;
  const toLB = pv === null ? null : Math.max(0, pv - (exp || 0));
  // grid import also charges the battery (night charging): only the part not explained by PV goes to the load
  const gridChg = Math.max(0, (s.chg || 0) - (toLB || 0));
  const gridToLoad = imp === null ? null : Math.max(0, imp - gridChg);
  const fromPB = load === null ? null : Math.max(0, load - (gridToLoad || 0));
  const selfC = pv ? (toLB / pv) * 100 : null, selfS = load ? (fromPB / load) * 100 : null;
  const row = (title, v, col, big) => `<div class="pt">${esc(title)}</div>` +
    `<div class="pv${big ? " big" : ""}" style="${col ? `color:color-mix(in srgb, ${col}, var(--fx-l1) var(--fx-vmix, 0%))` : ""}"><b>${kwhTxt(v)}</b><span>kWh</span></div>`;
  return `<div class="pcard"><div class="pl">${row(t("pv_prod"), pv, "", 1)}${row(t("to_load_bat"), toLB, CS.load)}${row(t("to_grid"), exp)}</div>
      <div class="pr">${RING(selfC, CS.load)}<p>${esc(t("self_cons"))}</p></div></div>
    <div class="pcard"><div class="pl">${row(t("load_cons"), load, "", 1)}${row(t("from_pv_bat"), fromPB, CS.pv)}${row(t("from_grid"), gridToLoad === null ? null : Math.min(gridToLoad, load ?? gridToLoad))}</div>
      <div class="pr">${RING(selfS, CS.pv)}<p>${esc(t("self_suff"))}</p></div></div>`;
}

function plantListsHtml(ctx, pg) {
  const esc = ctx.esc, t = (k) => ctx.t(`ui.${k}`);
  const s = pg.sums || {};
  const li = (c, title, v) => `<div class="kv"><span><i class="dot" style="background:${c}"></i>${esc(title)}</span><b>${kwhTxt(v ?? null)} kWh</b></div>`;
  return `<div class="fold open"><div class="fh">${esc(t("supply"))}</div>${li(CS.pv, t("pv_prod"), s.pv)}${li(CS.imp, t("grid_import_l"), s.imp)}${li(CS.discharged, t("bat_discharge"), s.dis)}</div>
    <div class="fold open"><div class="fh">${esc(t("usage"))}</div>${li(CS.load, t("load_cons"), s.load)}${li(CS.ac, t("grid_export_l"), s.exp)}${li(CS.charged, t("bat_charge"), s.chg)}</div>`;
}

function sizeCanvas(s) {
  const cv = s.canvas;
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  // In a panel the first render happens before the element has been laid out, so the canvas
  // measures zero and every later frame would draw into a 1 px bitmap. Ask again next frame
  // instead of keeping that measurement.
  if (r.width < 2) {
    if (!s.sizeRetry) {
      s.sizeRetry = requestAnimationFrame(() => { s.sizeRetry = 0; sizeCanvas(s); });
    }
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  s.scale = cv.width / W;
}

// One frame of the comet animation. Phase lives in s.vis, so a re-render of the card does not
// restart the flows; only the canvas element is new.
function frame(s, now) {
  const cv = s.canvas;
  if (!cv || !s.scale || !s.flags || !s.tracks) return;
  const ctx2d = cv.getContext("2d");
  if (!ctx2d) return;
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, cv.width, cv.height);
  const f = s.flags, k = s.scale;
  ctx2d.setTransform(k, 0, 0, k, 0, 0);
  ctx2d.fillStyle = C.comet;
  const show = {
    invpv: f.solarToDevice !== 0 ? 1 : 0,
    bat: f.batToDevice === 0 ? 0 : f.batToDevice === 1 ? -1 : 1,
    grid: f.gridToHidden === 0 ? 0 : f.gridToHidden === 1 ? 1 : -1,
    inv: f.deviceToHidden === 0 ? 0 : f.deviceToHidden === 1 ? 1 : -1,
    load: f.loadToHidden === 0 ? 0 : f.loadToHidden === 1 ? -1 : 1,
  };
  const rad = 0.5;  // flow_path_width 1dp, round cap
  for (const [key, dir] of Object.entries(show)) {
    const tr = s.tracks[key];
    if (!dir) { s.vis[key] = null; continue; }
    const state = s.vis[key];
    if (!state || state.dir !== dir) s.vis[key] = { dir, t0: now };
    const path = dir > 0 ? tr.fwd : tr.rev;
    const L = path.len, span = tr.n * PT, el = now - s.vis[key].t0;
    // ab4: first cycle runs 0 -> L+span, later cycles span -> L+span with wraparound
    let v;
    if (el < tr.ms) v = (el / tr.ms) * (L + span);
    else v = span + (((el - tr.ms) % tr.ms) / tr.ms) * L;
    const solid = tr.n - tr.t;
    for (let i = tr.n - 1; i >= 0; i--) {
      let p = v - i * PT;
      if (v >= span && p >= L) p -= L;
      const [x, y] = path.at(p);
      ctx2d.globalAlpha = i < solid ? 1 : 1 - (i - solid) / tr.t;
      ctx2d.beginPath();
      ctx2d.arc(x, y, rad, 0, 6.2832);
      ctx2d.fill();
    }
  }
  ctx2d.globalAlpha = 1;
}

function wireHover(ctx, root, screen) {
  root.querySelectorAll('.achart svg[data-chart="main"]').forEach((svg) => {
    if (svg.dataset.bound) return;
    svg.dataset.bound = "1";
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      PG(ctx, screen).hover = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      drawAnalysis(ctx, root, screen);
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
  });
}
