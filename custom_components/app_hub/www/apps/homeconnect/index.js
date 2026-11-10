/*
 * Home Connect app module: replaces the Home Connect app (Siemens) screens for a coffee maker
 * and a dishwasher. Layout, Polish labels, the dishwasher program table and the colours were
 * taken from the app on a Galaxy Z Fold8 over wireless adb (screencap and uiautomator,
 * 2026-11-01). Data and actions come from the local homeconnect_ws integration
 * (chris-mc1/homeconnect_local_hass); nothing here talks to the Home Connect cloud.
 *
 * Ported onto the App Hub contract from homeconnect-app-card 0.2.0.
 */

// Dishwasher programs as the app lists them: key = HA option value.
const DW_PROGRAMS = {
  dishcare_dishwasher_program_intensiv70: { n: "Intensywny 70°", ic: "plate" },
  dishcare_dishwasher_program_auto2: { n: "Auto 45-65°", ic: "plate" },
  dishcare_dishwasher_program_eco50: { n: "Eco 50°", ic: "eco" },
  dishcare_dishwasher_program_prerinse: { n: "Płukanie wstępne", ic: "rinse" },
  dishcare_dishwasher_program_nightwash: { n: "Nocny 50", ic: "moon" },
  dishcare_dishwasher_program_kurz60: { n: "Speed 60°", ic: "speed" },
  dishcare_dishwasher_program_machinecare: { n: "Czyszczenie zmywarki", ic: "care" },
  dishcare_dishwasher_program_glassshine: { n: "brilliantShine", ic: "glass" },
  dishcare_dishwasher_program_learningdishwasher: { n: "Inteligentny", ic: "brain" },
  dishcare_dishwasher_program_quickd: { n: "Szybkie zmywanie i suszenie", ic: "speed" },
};
const DW_ORDER = Object.keys(DW_PROGRAMS);

// Coffee maker beverages. These are producer recipe names, identical in every language,
// so they stay a data table rather than locale strings.
const CM_NAMES = {
  espresso: "Espresso", espressodoppio: "Espresso doppio", coffee: "Kawa", caffegrande: "Caffè grande", xlcoffee: "Kawa XL",
  cappuccino: "Cappuccino", lattemacchiato: "Latte macchiato", caffelatte: "Caffè latte", milkfroth: "Pianka mleczna",
  warmmilk: "Ciepłe mleko", hotwater: "Gorąca woda", coffeepot: "Dzbanek kawy", ristretto: "Ristretto", espressomacchiato: "Espresso macchiato",
  americano: "Americano", flatwhite: "Flat white", cortado: "Cortado", doppio: "Doppio", cafeconleche: "Café con leche", cafeaulait: "Café au lait",
  cafecortado: "Café cortado", galao: "Galão", garoto: "Garoto", kaapi: "Kaapi", redeye: "Red eye", blackeye: "Black eye", deadeye: "Dead eye",
  coldbrew: "Cold brew", coldbrewmacchiato: "Cold brew macchiato", slowbrew: "Slow brew", verlaengerter: "Verlängerter",
  verlaengerterbraun: "Verlängerter braun", kleinerbrauner: "Kleiner Brauner", grosserbrauner: "Großer Brauner", wienermelange: "Wiener Melange",
  koffieverkeerd: "Koffie verkeerd",
};
const CM_CLEAN = {
  applianceoffrinsing: "Płukanie przy wyłączaniu", applianceonrinsing: "Płukanie przy włączaniu", rinsemilksystem: "Płukanie systemu mleka",
  clean: "Czyszczenie", descale: "Odkamienianie", calcnclean: "calc'nClean", specialrinsing: "Płukanie specjalne",
  frostprotection: "Ochrona przed zamarzaniem", cleanbrewingunitmanually: "Ręczne czyszczenie zespołu zaparzającego",
  cleanbrewingunitmanuallydetailed: "Ręczne czyszczenie zespołu zaparzającego (szczegóły)", cleanoutletmanually: "Ręczne czyszczenie wylewki",
  rinsewaterfilter: "Płukanie filtra wody", removewaterfilter: "Wyjęcie filtra wody", replacewaterfilter: "Wymiana filtra wody",
};

// Option keys of the coffee maker selects. Values and service calls keep the raw HA keys.
const OPT = {
  right: "Prawy", left: "Lewy", normal: "Normalny", intense: "Intensywny", intenseplus: "Intensywny+", mild: "Łagodna", strong: "Mocna",
  verystrong: "Bardzo mocna", fine: "Delikatny", balanced: "Zrównoważony", distinctive: "Wyrazisty", small: "Mały", medium: "Średni",
  large: "Duży", verylarge: "Bardzo duży", double: "Podwójny", triple: "Potrójny", on: "Włączone", off: "Wyłączone",
};
const optLabel = (o) => {
  const k = String(o).toLowerCase();
  let m;
  if (OPT[k]) return OPT[k];
  if ((m = k.match(/^(?:strength|coarsness)(\d+)$/))) return m[1];
  if ((m = k.match(/^(\d+)c$/))) return `${m[1]} °C`;
  if ((m = k.match(/^(\d+)percent$/))) return `${m[1]} %`;
  return o;
};

const ICONS = {
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  power: '<path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/>',
  plate: '<circle cx="9" cy="12" r="6.5"/><circle cx="9" cy="12" r="3"/><path d="M19 4v16M17 4v5a2 2 0 0 0 4 0V4"/>',
  eco: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14zM5 19l7-7"/>',
  rinse: '<path d="M4 12a8 8 0 0 1 16 0"/><path d="M8 15v4M12 15v5M16 15v4"/>',
  moon: '<path d="M20 14a8 8 0 1 1-10-10 6.5 6.5 0 0 0 10 10z"/>',
  speed: '<circle cx="12" cy="13" r="7"/><path d="M12 13V9M10 3h4"/>',
  care: '<rect x="4" y="8" width="14" height="11" rx="1"/><path d="M4 12h14M19 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  glass: '<path d="M6 3h8l-1 7a3 3 0 0 1-6 0zM10 13v7M7 20h6"/>',
  brain: '<path d="M9 18v-2a6 6 0 1 1 6 0v2z"/><path d="M12 3v1M5 6l1 1M19 6l-1 1"/>',
  cup: '<path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6"/>',
  sliders: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  tools: '<path d="M7 4v8M5 4v4a2 2 0 0 0 4 0V4M17 4v16M14 8h6M11 20h8"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  warm: '<path d="M6 17h12M8 13c0-2 2-2 2-4M12 13c0-2 2-2 2-4M16 13c0-2 2-2 2-4"/>',
  wave: '<path d="M3 12c3-5 6 5 9 0s6 5 9 0"/>',
  bean: '<ellipse cx="12" cy="12" rx="6" ry="9" transform="rotate(30 12 12)"/><path d="M8 14c3-1 5-5 8-6"/>',
};

/* ---------- appliance model ---------- */
function model(ctx, dev) {
  const conn = ctx.v(dev, "binary_sensor.connection");
  const op = ctx.v(dev, "sensor.operation_state");
  const power = ctx.v(dev, "switch.power");
  const offline = conn === "off" || conn === undefined || conn === "unavailable" || power === "unavailable";
  let label;
  if (offline) label = ctx.t("hc.offline");
  else if (["run", "delayedstart", "pause", "finished", "error", "actionrequired", "aborting"].includes(op)) label = ctx.t(`hc.op.${op}`);
  else label = power === "on" ? ctx.t("hc.op.on") : ctx.t("hc.op.off");
  return { op, power, offline, label, running: ["run", "delayedstart", "pause", "aborting"].includes(op), paused: op === "pause" };
}

function notes(ctx, dev, s) {
  const n = [];
  if (s.offline) return [{ t: ctx.t("hc.note.offline"), k: "info" }];
  if (dev.type === "dishwasher") {
    if (ctx.v(dev, "sensor.salt") === "empty") n.push({ t: ctx.t("hc.note.no_salt"), k: "warn" });
    if (ctx.v(dev, "sensor.rinse_aid") === "empty") n.push({ t: ctx.t("hc.note.no_rinse_aid"), k: "warn" });
    if (ctx.is(dev, "binary_sensor.door")) n.push({ t: ctx.t("hc.note.door_open"), k: "info" });
    if (ctx.is(dev, "binary_sensor.program_aborted")) n.push({ t: ctx.t("hc.note.aborted"), k: "warn" });
    if (ctx.is(dev, "binary_sensor.program_finished")) n.push({ t: ctx.t("hc.note.finished"), k: "info" });
    if (ctx.is(dev, "binary_sensor.machine_care")) n.push({ t: ctx.t("hc.note.machine_care"), k: "warn" });
    if (ctx.is(dev, "binary_sensor.water_heater_calcified")) n.push({ t: ctx.t("hc.note.calcified"), k: "warn" });
    if (ctx.is(dev, "binary_sensor.smart_filter_cleaning")) n.push({ t: ctx.t("hc.note.filter"), k: "warn" });
  } else {
    if (ctx.v(dev, "sensor.water_tank") === "empty") n.push({ t: ctx.t("hc.note.tank_empty"), k: "warn" });
    if (ctx.is(dev, "binary_sensor.bean_container_empty")) n.push({ t: ctx.t("hc.note.beans_empty"), k: "warn" });
    if (ctx.v(dev, "sensor.drip_tray") === "full") n.push({ t: ctx.t("hc.note.tray_full"), k: "warn" });
    if (ctx.v(dev, "sensor.descaling_required") === "on") n.push({ t: ctx.t("hc.note.descale"), k: "warn" });
    if (ctx.is(dev, "binary_sensor.program_finished")) n.push({ t: ctx.t("hc.note.finished"), k: "info" });
  }
  return n;
}

const cmName = (key) => {
  if (!key) return "";
  if (key.startsWith("favorite_")) return `Ulubiony ${Number(key.slice(9))}`;
  const m = key.match(/_(beverage|coffeeworld|cleaningmodes)_(.+)$/);
  if (!m) return key;
  return CM_NAMES[m[2]] || CM_CLEAN[m[2]] || m[2];
};

function devName(ctx, dev) {
  return dev.name || (dev.type === "coffeemaker" ? ctx.t("hc.dev.coffeemaker") : ctx.t("hc.dev.dishwasher"));
}
function devImg(ctx, dev) {
  return dev.image || ctx.img(dev.type === "coffeemaker" ? "coffeemaker.webp" : "dishwasher.webp");
}

/* ---------- screen pieces ---------- */
function hero(ctx, dev, s) {
  // The hub bar may already own the back control; a second one in the hero is noise.
  const back = ctx.chrome.back
    ? "<span></span>"
    : `<button class="ib light" data-a="back" aria-label="${ctx.esc(ctx.t("core.back"))}">${ctx.svg("back")}</button>`;
  return `<div class="hero" style="background-image:url('${ctx.esc(devImg(ctx, dev))}')">${back}` +
    `<div class="ht2"><div class="hn">${ctx.esc(devName(ctx, dev))}</div><div class="chip">${ctx.esc(s.label)}</div></div></div>`;
}

const notesHtml = (ctx, dev, s) =>
  notes(ctx, dev, s).map((x) => ctx.ui.note(x.t, x.k)).join("");

const quick = (ctx, items) =>
  `<h2>${ctx.esc(ctx.t("hc.quick"))}</h2><div class="quick">${items.filter(Boolean).map((q) =>
    `<button class="qt ${q.on ? "on" : ""}" data-a="toggle" data-e="${q.e}"><div><b>${ctx.esc(q.v)}</b><span>${ctx.esc(q.l)}</span></div>${ctx.svg(q.ic)}</button>`
  ).join("")}</div>`;

const advanced = (ctx) =>
  `<h2>${ctx.esc(ctx.t("hc.advanced"))}</h2><div class="list">` +
  ctx.ui.row("sliders", ctx.t("hc.screen.ctl"), "ctl") +
  ctx.ui.row("tools", ctx.t("hc.screen.care"), "care") +
  ctx.ui.row("info", ctx.t("hc.screen.info"), "info") +
  ctx.ui.row("gear", ctx.t("hc.screen.set"), "set") + `</div>`;

/* ---------- screens ---------- */
function start(ctx) {
  const h = new Date().getHours();
  const greet = h >= 18 || h < 4 ? ctx.t("hc.greet.evening") : h < 11 ? ctx.t("hc.greet.morning") : ctx.t("hc.greet.day");
  const tiles = ctx.devices.map((dev, i) => {
    const s = model(ctx, dev);
    return `<button class="tile" data-a="go" data-screen="dev" data-i="${i}">` +
      `<div class="tt">${ctx.esc(devName(ctx, dev))}</div>` +
      `<div class="ts ${s.offline ? "off" : ""}">${ctx.esc(s.label)}</div>` +
      `<img src="${devImg(ctx, dev)}" alt=""></button>`;
  }).join("");
  const name = ctx.config.user_name || "";
  return `<div class="scroll"><div class="brandbar"><span class="logo">SIEMENS</span><span>${ctx.esc(ctx.t("hc.brandline"))}</span></div>` +
    `<div class="pad"><h1>${ctx.esc(greet)}${name ? `, ${ctx.esc(name)}` : ""}!</h1>` +
    `<h2>${ctx.esc(ctx.t("hc.devices"))}</h2><div class="tiles">${tiles}</div></div></div>`;
}

function dish(ctx, dev) {
  const s = model(ctx, dev);
  const selId = ctx.e(dev, "select.selected_program");
  const sel = ctx.st(selId)?.state;
  const prog = DW_PROGRAMS[sel];
  const active = ctx.v(dev, "sensor.active_program");
  const remaining = Number(ctx.v(dev, "sensor.remaining_program_time"));
  const progress = Number(ctx.v(dev, "sensor.program_progress"));
  let card;
  if (s.running) {
    const ap = DW_PROGRAMS[active] || prog;
    card = `<div class="pcard"><div class="ph">${ctx.svg(ap?.ic || "plate", "big")}<b>${ctx.esc(ap?.n || ctx.t("hc.program"))}</b></div>` +
      ctx.ui.bar_pct(progress) +
      `<div class="pf"><span>${ctx.esc(s.paused ? ctx.t("hc.op.pause") : ctx.t("hc.remaining"))}</span><b>${Number.isFinite(remaining) ? ctx.fmt.dur(remaining * 60) : "--"}</b></div>` +
      `<button class="abort" data-a="abort">${ctx.esc(ctx.t("hc.abort"))}</button></div>`;
  } else {
    card = `<button class="pcard" data-a="go" data-screen="ctl"><div class="ph">${ctx.svg(prog?.ic || "plate", "big")}` +
      `<b>${ctx.esc(prog?.n || sel || ctx.t("hc.pick_program"))}</b>` +
      `<span class="play" data-a="start">${ctx.svg("play")}</span></div>` +
      `<div class="pf"><span>${ctx.esc(ctx.t("hc.duration"))}</span><b>${Number.isFinite(remaining) ? ctx.fmt.dur(remaining * 60) : "--"}</b></div></button>`;
  }
  const onoff = (k) => (ctx.is(dev, k) ? ctx.t("hc.op.enabled") : ctx.t("hc.op.disabled"));
  const q = [
    { e: ctx.e(dev, "switch.power"), v: s.power === "on" ? ctx.t("hc.op.on") : ctx.t("hc.op.off"), l: ctx.t("hc.q.power"), ic: "power", on: true },
    ctx.e(dev, "switch.silence_on_demand") && { e: ctx.e(dev, "switch.silence_on_demand"), v: onoff("switch.silence_on_demand"), l: ctx.t("hc.q.silence"), ic: "moon", on: ctx.is(dev, "switch.silence_on_demand") },
    ctx.e(dev, "switch.variospeedplus") && { e: ctx.e(dev, "switch.variospeedplus"), v: onoff("switch.variospeedplus"), l: ctx.t("hc.q.variospeed"), ic: "clock", on: ctx.is(dev, "switch.variospeedplus") },
  ];
  const fav = ctx.st(selId)?.attributes.options?.includes("favorite_001")
    ? `<h2>${ctx.esc(ctx.t("hc.favourites"))}</h2><button class="fav" data-a="opt" data-e="${selId}" data-v="favorite_001">${ctx.svg("heart")}<div><b>${ctx.esc(cmName("favorite_001"))}</b></div></button>`
    : "";
  return `<div class="scroll">${hero(ctx, dev, s)}<div class="pad"><div class="logo dark">SIEMENS</div>` +
    `${notesHtml(ctx, dev, s)}${card}${quick(ctx, q)}${fav}${advanced(ctx)}</div></div>`;
}

function coffee(ctx, dev) {
  const s = model(ctx, dev);
  const sid = ctx.e(dev, "select.selected_program");
  const sel = ctx.st(sid)?.state;
  const opts = ctx.st(sid)?.attributes.options || [];
  const bev = opts.filter((o) => /_(beverage|coffeeworld)_/.test(o));
  const grid = bev.map((o) =>
    `<button class="bev ${o === sel ? "sel" : ""}" data-a="sel" data-e="${sid}" data-v="${ctx.esc(o)}">` +
    `${ctx.svg(/milk|latte|cappu|macch|flat|cortado|leche|lait|melange|brauner/.test(o) ? "wave" : "cup")}` +
    `<span>${ctx.esc(cmName(o))}</span></button>`).join("");
  const fq = ctx.e(dev, "number.fill_quantity");
  const fqs = ctx.st(fq);
  let card;
  if (s.running) {
    const ap = ctx.v(dev, "sensor.active_program");
    const pr = Number(ctx.v(dev, "sensor.program_progress"));
    card = `<div class="pcard"><div class="ph">${ctx.svg("cup", "big")}<b>${ctx.esc(cmName(ap) || ctx.t("hc.program"))}</b></div>` +
      ctx.ui.bar_pct(pr) +
      `<div class="pf"><span>${ctx.esc(s.paused ? ctx.t("hc.op.pause") : ctx.t("hc.brewing"))}</span><b>${Number.isFinite(pr) ? Math.round(pr) + " %" : ""}</b></div>` +
      `<div class="two">${ctx.e(dev, s.paused ? "button.resume" : "button.pause") ? `<button class="abort alt" data-a="${s.paused ? "resume" : "pause"}">${ctx.esc(s.paused ? ctx.t("hc.resume") : ctx.t("hc.pause"))}</button>` : ""}` +
      `<button class="abort" data-a="abort">${ctx.esc(ctx.t("hc.cancel"))}</button></div></div>`;
  } else {
    card = `<div class="pcard"><div class="ph">${ctx.svg("cup", "big")}<b>${ctx.esc(cmName(sel) || ctx.t("hc.pick_drink"))}</b>` +
      `<span class="play" data-a="start">${ctx.svg("play")}</span></div>` +
      `${fqs && fqs.state !== "unavailable" ? `<div class="pf"><span>${ctx.esc(ctx.t("hc.amount"))}</span><b>${ctx.esc(fqs.state)} ml</b></div>` : ""}</div>`;
  }
  const onoff = (k) => (ctx.is(dev, k) ? ctx.t("hc.op.enabled") : ctx.t("hc.op.disabled"));
  const q = [
    { e: ctx.e(dev, "switch.power"), v: s.power === "on" ? ctx.t("hc.op.on") : ctx.t("hc.op.off"), l: ctx.t("hc.q.power"), ic: "power", on: true },
    ctx.e(dev, "switch.cup_warmer") && { e: ctx.e(dev, "switch.cup_warmer"), v: onoff("switch.cup_warmer"), l: ctx.t("hc.q.cup_warmer"), ic: "warm", on: ctx.is(dev, "switch.cup_warmer") },
    ctx.e(dev, "switch.child_lock") && { e: ctx.e(dev, "switch.child_lock"), v: onoff("switch.child_lock"), l: ctx.t("hc.q.child_lock"), ic: "lock", on: ctx.is(dev, "switch.child_lock") },
  ];
  return `<div class="scroll">${hero(ctx, dev, s)}<div class="pad"><div class="logo dark">SIEMENS</div>${notesHtml(ctx, dev, s)}${card}${quick(ctx, q)}` +
    `<h2>${ctx.esc(ctx.t("hc.drinks"))}</h2><div class="bevs">${grid || `<p class="fine">${ctx.esc(ctx.t("hc.no_programs"))}</p>`}</div>${advanced(ctx)}</div></div>`;
}

function control(ctx, dev) {
  const s = model(ctx, dev);
  if (dev.type === "coffeemaker") return cmControl(ctx, dev, s);
  const selId = ctx.e(dev, "select.selected_program");
  const sel = ctx.st(selId)?.state;
  const prog = DW_PROGRAMS[sel];
  const fe = Number(ctx.v(dev, "sensor.energy_forecast"));
  const fw = Number(ctx.v(dev, "sensor.water_forecast"));
  const rem = Number(ctx.v(dev, "sensor.remaining_program_time"));
  const bars = (pct, c) => {
    const n = Number.isFinite(pct) ? Math.max(1, Math.min(3, Math.round(pct / 34))) : 0;
    return `<div class="lv">${[0, 1, 2].map((i) => `<i style="background:${i < n ? c : "var(--divider-color, #e2e6ee)"}"></i>`).join("")}</div>`;
  };
  const opts = [
    ["variospeedplus", "hc.opt.variospeedplus", "clock"],
    ["silence_on_demand", "hc.opt.silence", "moon"],
    ["hygiene_plus", "hc.opt.hygiene", "bolt"],
    ["intensiv_zone", "hc.opt.intensiv_zone", "plate"],
    ["brilliance_dry", "hc.opt.brilliance_dry", "glass"],
  ].filter(([k]) => ctx.e(dev, `switch.${k}`))
    .map(([k, l, ic]) => `<button class="opt ${ctx.is(dev, `switch.${k}`) ? "on" : ""}" data-a="toggle" data-e="${ctx.e(dev, `switch.${k}`)}">${ctx.svg(ic)}<span>${ctx.esc(ctx.t(l))}</span></button>`)
    .join("");
  const startIn = Number(ctx.v(dev, "sensor.start_in"));
  return `<div class="scroll">${ctx.ui.bar(devName(ctx, dev))}<div class="pad">${notesHtml(ctx, dev, s)}` +
    `<button class="prow" data-a="go" data-screen="progs"><span>${ctx.esc(ctx.t("hc.program"))}</span><b>${ctx.svg(prog?.ic || "plate")}${ctx.esc(prog?.n || sel || "--")}</b></button>` +
    `<div class="stats"><div><small>${ctx.esc(ctx.t("hc.energy"))}</small><b>${ctx.fmt.pct(fe)}</b>${bars(fe, "var(--warning-color, #d6906f)")}</div>` +
    `<div><small>${ctx.esc(ctx.t("hc.water"))}</small><b>${ctx.fmt.pct(fw)}</b>${bars(fw, "var(--info-color, #5b8fc4)")}</div>` +
    `<div class="r"><small>${ctx.esc(ctx.t("hc.duration_caps"))}</small><b>${Number.isFinite(rem) ? ctx.fmt.dur(rem * 60) : "--"}</b></div></div>` +
    `${opts ? `<h2>${ctx.esc(ctx.t("hc.options"))}</h2><div class="opts">${opts}</div>` : ""}` +
    `<h2>${ctx.esc(ctx.t("hc.time"))}</h2><div class="cardrow"><span>${ctx.esc(ctx.t("hc.start_time"))}</span><b>${Number.isFinite(startIn) && startIn > 0 ? ctx.t("hc.in_time", { t: ctx.fmt.dur(startIn * 60) }) : ctx.t("hc.now")}</b></div></div></div>` +
    `<div class="dock"><button class="start" data-a="start">${ctx.svg("play")}${ctx.esc(ctx.t("hc.start"))}</button></div>`;
}

function cmControl(ctx, dev, s) {
  const sid = ctx.e(dev, "select.selected_program");
  const sel = ctx.st(sid)?.state;
  const fq = ctx.e(dev, "number.fill_quantity");
  const fqs = ctx.st(fq);
  const ctl = [
    ["select.coffee_strength", "hc.cm.strength"], ["select.bean_amount", "hc.cm.bean_amount"],
    ["select.coffee_temperature", "hc.cm.temperature"], ["select.beverage_size", "hc.cm.size"],
    ["select.flow_rate", "hc.cm.flow"], ["select.coarsness", "hc.cm.coarsness"],
    ["select.aroma_select", "hc.cm.aroma"], ["select.shot_count", "hc.cm.shots"],
    ["select.coffee_milk_ratio", "hc.cm.ratio"], ["select.bean_container", "hc.cm.container"],
    ["select.hot_water_temperature", "hc.cm.water_temp"],
  ].filter(([k]) => ctx.e(dev, k) && ctx.st(ctx.e(dev, k)).state !== "unavailable")
    .map(([k, l]) => {
      const e = ctx.e(dev, k);
      const st = ctx.st(e);
      return `<div class="srow col"><span>${ctx.esc(ctx.t(l))}</span>${ctx.ui.seg(e, st.attributes.options, st.state, optLabel)}</div>`;
    }).join("");
  return `<div class="scroll">${ctx.ui.bar(devName(ctx, dev))}<div class="pad">${notesHtml(ctx, dev, s)}` +
    `<div class="prow"><span>${ctx.esc(ctx.t("hc.drink"))}</span><b>${ctx.svg("cup")}${ctx.esc(cmName(sel) || "--")}</b></div>` +
    `${fqs && fqs.state !== "unavailable" ? `<div class="srow"><span>${ctx.esc(ctx.t("hc.amount_ml"))}</span><input type="number" data-num="${fq}" value="${ctx.esc(fqs.state)}" min="${ctx.esc(fqs.attributes.min)}" max="${ctx.esc(fqs.attributes.max)}" step="${ctx.esc(fqs.attributes.step)}"></div>` : ""}` +
    `${ctl}${ctx.e(dev, "switch.multiple_beverages") ? ctx.ui.toggle(ctx.e(dev, "switch.multiple_beverages"), ctx.t("hc.cm.multiple"), ctx.is(dev, "switch.multiple_beverages")) : ""}</div></div>` +
    `<div class="dock"><button class="start" data-a="start">${ctx.svg("play")}${ctx.esc(ctx.t("hc.start"))}</button></div>`;
}

function programs(ctx, dev) {
  const selId = ctx.e(dev, "select.selected_program");
  const sel = ctx.st(selId)?.state;
  const rem = Number(ctx.v(dev, "sensor.remaining_program_time"));
  const rows = DW_ORDER.filter((k) => ctx.st(selId)?.attributes.options?.includes(k)).map((k) => {
    const p = DW_PROGRAMS[k];
    return `<button class="prg ${k === sel ? "sel" : ""}" data-a="pick" data-e="${selId}" data-v="${k}">${ctx.svg(p.ic, "big")}` +
      `<div><b>${ctx.esc(p.n)}</b>${k === sel && Number.isFinite(rem) ? `<small>${ctx.fmt.dur(rem * 60)}</small>` : ""}</div></button>`;
  }).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("hc.program"))}<div class="pad">${rows}</div></div>`;
}

function care(ctx, dev) {
  const s = model(ctx, dev);
  const ok = ctx.t("hc.all_good");
  let rows;
  if (dev.type === "coffeemaker") {
    const cr = (l, v) => `<div class="crow"><b>${ctx.esc(l)}</b><span>${ctx.esc(v)}</span></div>`;
    const tank = ctx.v(dev, "sensor.water_tank");
    const tray = ctx.v(dev, "sensor.drip_tray");
    rows = cr(ctx.t("hc.care.tank"), tank === "full" ? ctx.t("hc.full") : tank === "empty" ? ctx.t("hc.empty") : tank ?? "--") +
      cr(ctx.t("hc.care.tray"), tray === "ok" ? ok : tray === "full" ? ctx.t("hc.tray_full_empty_it") : tray ?? "--") +
      cr(ctx.t("hc.care.beans"), ctx.is(dev, "binary_sensor.bean_container_empty") ? ctx.t("hc.empty") : ok);
    const clean = ["clean", "descale", "calcnclean", "rinsemilksystem", "specialrinsing"];
    const sid = ctx.e(dev, "select.selected_program");
    const opts = ctx.st(sid)?.attributes.options || [];
    rows += `<h2>${ctx.esc(ctx.t("hc.cleaning_programs"))}</h2>` +
      clean.map((k) => opts.find((o) => o.endsWith("cleaningmodes_" + k))).filter(Boolean)
        .map((o) => `<button class="lrow" data-a="opt" data-e="${sid}" data-v="${ctx.esc(o)}"><span>${ctx.esc(cmName(o))}</span>${ctx.svg("chev", "chev")}</button>`).join("");
  } else {
    const runs = ctx.v(dev, "sensor.machinecare_remaining_runs");
    const lvl = (k) => {
      const v = ctx.v(dev, `sensor.${k}`);
      return v === "empty" ? ctx.t("hc.empty") : v === "low" || v === "almost_empty" ? ctx.t("hc.low") : v === undefined ? "--" : ok;
    };
    rows = `<div class="crow"><b>${ctx.esc(ctx.t("hc.care.cleaning"))}</b><span>${runs !== undefined && runs !== "unavailable" ? ctx.esc(ctx.t("hc.care.service_after", { n: Number(runs) })) : ctx.esc(ok)}</span></div>` +
      `<div class="crow"><b>${ctx.esc(ctx.t("hc.care.smart_filter"))}</b><span>${ctx.is(dev, "binary_sensor.smart_filter_cleaning") || ctx.is(dev, "binary_sensor.machinecare_and_filter") ? ctx.esc(ctx.t("hc.care.needs_cleaning")) : ctx.esc(ok)}</span></div>` +
      `<div class="crow"><b>${ctx.esc(ctx.t("hc.care.rinse_aid"))}</b><span>${ctx.esc(lvl("rinse_aid"))}</span></div>` +
      `<div class="crow"><b>${ctx.esc(ctx.t("hc.care.salt"))}</b><span>${ctx.esc(lvl("salt"))}</span></div>`;
  }
  const good = !notes(ctx, dev, s).some((n) => n.k === "warn");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("hc.screen.care"))}<div class="pad"><div class="blob"></div>` +
    `<h2>${ctx.esc(ctx.t("hc.device_state"))}</h2>` +
    `<div class="status ${good ? "good" : "bad"}">${ctx.svg(good ? "ok" : "warn")}<b>${ctx.esc(good ? ctx.t("hc.works_fine") : ctx.t("hc.needs_attention"))}</b></div>` +
    `<h2>${ctx.esc(ctx.t("hc.screen.care"))}</h2><p class="fine">${ctx.esc(ctx.t("hc.care_blurb"))}</p>${rows}</div></div>`;
}

function info(ctx, dev) {
  const ents = ctx.hass.entities;
  const devId = ents?.[dev.anchor]?.device_id;
  const d = devId && ctx.hass.devices?.[devId];
  const row = (l, v) => (v ? `<div class="irow"><small>${ctx.esc(l)}</small><b>${ctx.esc(v)}</b></div>` : "");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("hc.screen.info"))}<div class="pad">` +
    row(ctx.t("hc.info.model"), d?.model_id || d?.model) +
    row(ctx.t("hc.info.manufacturer"), d?.manufacturer) +
    row(ctx.t("hc.info.serial"), d?.serial_number) +
    row(ctx.t("hc.info.sw"), d?.sw_version) +
    row(ctx.t("hc.info.hw"), d?.hw_version) +
    row(ctx.t("hc.info.ip"), ctx.st(ctx.e(dev, "sensor.wifi_signal_strength"))?.attributes.ip_address) +
    `${!d ? `<p class="fine">${ctx.esc(ctx.t("hc.info.no_registry"))}</p>` : ""}</div></div>`;
}

function settings(ctx, dev) {
  const ents = ctx.hass.entities;
  const devId = ents?.[dev.anchor]?.device_id;
  const mine = Object.keys(ents || {}).filter((e) => ents[e].device_id === devId && /^(select|number|switch)\./.test(e) && ctx.hass.states[e]);
  const skip = /(selected_program|power_state|_power$|fill_quantity|start_in)/;
  // Program option switches live on the control screen; only device-level switches belong here.
  const rows = mine.filter((e) => !skip.test(e) && (!e.startsWith("switch.") || /(child_lock|cup_warmer)/.test(e))).map((e) => {
    const st = ctx.st(e);
    const name = (st.attributes.friendly_name || e).replace(/^.*?(Siemens )?(Dishwasher|CoffeeMaker) /i, "");
    if (e.startsWith("switch.")) return ctx.ui.toggle(e, name, st.state === "on");
    if (e.startsWith("number.")) return `<div class="srow"><span>${ctx.esc(name)}</span><input type="number" data-num="${e}" value="${ctx.esc(st.state)}" min="${ctx.esc(st.attributes.min)}" max="${ctx.esc(st.attributes.max)}" step="${ctx.esc(st.attributes.step)}"></div>`;
    return `<div class="srow col"><span>${ctx.esc(name)}</span>${ctx.ui.seg(e, st.attributes.options, st.state, optLabel)}</div>`;
  }).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("hc.screen.set"))}<div class="pad"><h2>${ctx.esc(ctx.t("hc.general"))}</h2>` +
    `<div class="cardrow"><span>${ctx.esc(ctx.t("hc.device_name"))}</span><b>${ctx.esc(devName(ctx, dev))}</b></div>` +
    `${rows || `<p class="fine">${ctx.esc(ctx.t("hc.no_settings"))}</p>`}</div></div>`;
}

/* ---------- module ---------- */
const current = (ctx, params) => ctx.dev(Number(params?.i ?? ctx.nav().params?.i ?? 0)) || ctx.dev(0);

export default {
  home: "start",
  icons: ICONS,

  title(ctx, top) {
    if (top.screen === "start") return ctx.manifest.name;
    const dev = current(ctx, top.params);
    return dev ? devName(ctx, dev) : ctx.manifest.name;
  },

  watch(ctx) {
    const ids = [];
    for (const dev of ctx.devices) {
      const sel = ctx.e(dev, "select.selected_program");
      if (sel) ids.push(sel);
    }
    return ids;
  },

  screens: {
    start,
    dev: (ctx, p) => { const d = current(ctx, p); return d.type === "coffeemaker" ? coffee(ctx, d) : dish(ctx, d); },
    ctl: (ctx, p) => control(ctx, current(ctx, p)),
    progs: (ctx, p) => programs(ctx, current(ctx, p)),
    care: (ctx, p) => care(ctx, current(ctx, p)),
    info: (ctx, p) => info(ctx, current(ctx, p)),
    set: (ctx, p) => settings(ctx, current(ctx, p)),
  },

  actions: {
    start(ctx) {
      const dev = current(ctx);
      const s = model(ctx, dev);
      if (s.offline) return ctx.toast(ctx.t("hc.err.offline"));
      if (ctx.v(dev, "binary_sensor.remote_start_allowed") === "off") return ctx.toast(ctx.t("hc.err.remote_start"));
      if (dev.type === "coffeemaker" && s.power !== "on") ctx.call("switch", "turn_on", { entity_id: ctx.e(dev, "switch.power") });
      return ctx.call("button", "press", { entity_id: ctx.e(dev, "button.start") });
    },
    abort: (ctx) => ctx.call("button", "press", { entity_id: ctx.e(current(ctx), "button.abort") }),
    pause: (ctx) => ctx.call("button", "press", { entity_id: ctx.e(current(ctx), "button.pause") }),
    resume: (ctx) => ctx.call("button", "press", { entity_id: ctx.e(current(ctx), "button.resume") }),
  },

  css() {
    const text2 = "var(--secondary-text-color,#6b7482)";
    const card = "var(--card-background-color,#fff)";
    const line = "var(--divider-color,#dfe3ea)";
    const chip = "var(--secondary-background-color,#eceef2)";
    const blue = "var(--primary-color,#4a82e8)";
    const red = "var(--error-color,#e8384f)";
    const bg = "var(--app-hub-surface)";
    return `
.brandbar{background:#00001e;color:#fff;padding:22px 16px;display:flex;justify-content:space-between;align-items:flex-end;font-size:14px}
.logo{font-weight:800;letter-spacing:1px;font-size:26px;color:#2f9a99}.logo.dark{margin:16px 0 10px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.tile{background:${card};border-radius:12px;box-shadow:0 1px 6px rgba(30,40,70,.18);overflow:hidden;display:flex;flex-direction:column}
.tile .tt{padding:10px 12px 0;font-size:16px;line-height:1.25;min-height:46px}
.tile .ts{padding:2px 12px 10px;font-size:16px}.tile .ts.off{color:var(--warning-color,#c4561d)}
.tile img{margin-top:auto;display:block;width:100%;height:190px;object-fit:cover}
.hero{height:230px;background-size:cover;background-position:center;position:relative;color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:12px 16px 14px}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.05) 60%,rgba(0,0,0,.4));pointer-events:none}
.hero>*{position:relative;z-index:1}.hn{font-size:30px;font-weight:600;margin-bottom:8px}
.pcard{display:block;width:100%;background:${card};border-radius:14px;box-shadow:0 1px 8px rgba(30,40,70,.18);padding:16px;margin:16px 0}
.ph{display:flex;align-items:center;gap:10px;font-size:22px}.ph b{font-weight:600;flex:1}
.play{width:52px;height:52px;border-radius:50%;background:${blue};color:#fff;display:flex;align-items:center;justify-content:center}
.pf{display:flex;justify-content:space-between;align-items:flex-end;margin-top:46px;color:${text2}}
.pf b{font-size:26px;font-weight:500;color:var(--primary-text-color,#2e3845)}
.abort{width:100%;margin-top:16px;padding:12px;border-radius:12px;border:1.5px solid ${red};color:${red};text-align:center;font-weight:500;min-height:44px}
.two{display:flex;gap:10px}.abort.alt{border-color:${blue};color:${blue}}
.quick{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.qt{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;min-width:0;background:${chip};border-radius:12px;padding:14px;color:${text2}}
.qt>div{min-width:0}.qt b{display:block;font-size:19px;font-weight:600}.qt span{font-size:17px}
.qt.on{background:${card};box-shadow:0 1px 6px rgba(30,40,70,.18);color:var(--primary-text-color,#2e3845)}
.fav{display:flex;align-items:center;gap:14px;width:100%;background:${card};border-left:6px solid var(--success-color,#9bdcc0);border-radius:10px;box-shadow:0 1px 5px rgba(30,40,70,.15);padding:14px}
.fav div{flex:1}.fav b{display:block;font-size:20px}
.prow{display:flex;justify-content:space-between;align-items:center;width:100%;background:${card};border-radius:12px;box-shadow:0 1px 5px rgba(30,40,70,.15);padding:22px 16px;margin:12px 0;font-size:20px;color:${text2}}
.prow b{display:flex;gap:8px;align-items:center;color:${blue};font-weight:600}
.stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:14px 0}
.stats small{display:block;color:${text2};font-size:15px}.stats b{display:block;font-size:24px;margin:4px 0 6px;font-weight:500}.stats .r{text-align:right}
.lv{display:flex;gap:4px}.lv i{display:block;width:30px;height:5px;border-radius:2px}
.opts{display:flex;flex-wrap:wrap;gap:10px}
.opt{display:flex;gap:8px;align-items:center;border:1.5px solid ${line};border-radius:28px;padding:12px 18px;font-size:19px;min-height:44px}
.opt.on{background:${chip};border-color:${blue};color:${blue}}
.cardrow{display:flex;justify-content:space-between;background:${card};border-radius:12px;box-shadow:0 1px 5px rgba(30,40,70,.15);padding:18px 16px;font-size:19px}
.cardrow span{color:${text2}}.cardrow b{color:${blue};font-weight:600}
.dock{position:absolute;left:0;right:0;bottom:0;padding:14px 16px 18px;background:linear-gradient(0deg,${bg} 70%,transparent)}
.start{width:100%;height:60px;border-radius:12px;color:#fff;font-size:24px;display:flex;justify-content:center;align-items:center;gap:10px;background:${blue}}
.prg{display:flex;gap:14px;align-items:center;width:100%;background:${card};border:1.5px solid ${line};border-radius:12px;padding:20px 16px;margin:10px 0;font-size:24px}
.prg b{font-weight:600}.prg.sel{border:2px solid ${blue};align-items:flex-start}
.prg small{color:${text2};font-size:19px;display:block;margin-top:6px}
.blob{height:170px;border-radius:50% 40% 50% 50%;background:${chip};margin:8px 0}
.status{display:flex;gap:12px;align-items:center;border:1px solid ${line};border-radius:10px;padding:16px;font-size:21px}
.status.good .ic{color:var(--success-color,#2f8f5b)}.status.bad .ic{color:var(--warning-color,#c4561d)}
.crow{border:1px solid ${line};border-radius:10px;padding:14px 16px;margin:10px 0}
.crow b{display:block;font-size:19px}.crow span{color:${text2};font-size:17px}
.irow{padding:14px 0;border-bottom:1px solid ${line}}.irow small{display:block;color:${text2};font-size:15px}.irow b{font-size:20px;font-weight:500}
.bevs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.bev{display:flex;flex-direction:column;align-items:center;gap:8px;background:${card};border:1.5px solid ${line};border-radius:12px;padding:14px 6px;text-align:center;font-size:15px;min-height:88px}
.bev.sel{border-color:${blue};color:${blue}}
@container apphub (max-width:420px){.bevs{grid-template-columns:repeat(2,1fr)}.stats{grid-template-columns:1fr 1fr}.stats .r{text-align:left}.hn{font-size:24px}.tile img{height:150px}.quick{grid-template-columns:1fr}}
`;
  },
};
