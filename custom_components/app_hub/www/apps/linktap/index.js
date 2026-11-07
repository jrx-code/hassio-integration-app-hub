/*
 * LinkTap app module: replaces the LinkTap 2.10.0 app (com.linkTap.wgapp).
 * The producer app is Cordova, so its wording, palette and artwork were read from
 * assets/www of the installed APK per docs/CAPTURE.md: strings from the English
 * dictionary in js/authentication.client.service.js, the teal #009688 / #00635a from
 * css/ionic.app.css, the battery, signal and watering images from img/.
 * Data and actions come from the linktap integration: one valve entity per TapLinker,
 * with its siblings resolved off the same device.
 */

const ICONS = {
  drop: '<path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
};

/* ---------- entity helpers ---------- */

// Every reading is in the valve's own `data` attribute, which the integration copies from the
// gateway. The sibling sensors carry the same values, but their entity ids are renameable and
// a renamed one (sensor..._bateria for battery) resolves to nothing, which would read as a
// device that is offline. So the payload is the source and the entities are the fallback.
function payload(ctx, dev) {
  return ctx.st(dev.entity)?.attributes?.data || {};
}

// The pause switch is named after the zone, not after a fixed suffix
// (switch.garden_zone_patio_pause_patio), so it is found among the device's own entities.
function pauseSwitch(ctx, dev) {
  return ctx.entities(dev).find((id) => id.startsWith("switch.") && /pause/.test(id));
}

function num(ctx, dev, key) {
  const v = Number(ctx.v(dev, key));
  return Number.isFinite(v) ? v : null;
}

// A reading, from the payload first and from the named entity second.
function val(ctx, dev, field, key) {
  const p = payload(ctx, dev)[field];
  if (p != null && p !== "") return Number(p);
  return key ? num(ctx, dev, key) : null;
}

function flag(ctx, dev, field, key) {
  const p = payload(ctx, dev)[field];
  if (typeof p === "boolean") return p;
  const e = key && ctx.e(dev, key);
  return e ? ctx.st(e)?.state === "on" : null;
}

// The integration's own table (custom_components/linktap/sensor.py, translate_plan_mode).
const PLAN_MODES = ["na", "instant", "calendar", "sevenday", "oddeven", "interval", "month", "master"];

function planName(ctx, dev) {
  const key = PLAN_MODES[Number(payload(ctx, dev).plan_mode)];
  if (key) return ctx.t(`linktap.mode_${key}`);
  const raw = ctx.v(dev, "sensor.plan_mode_string");
  return raw && raw !== "unknown" && raw !== "unavailable" ? raw : null;
}

function statusOf(ctx, dev) {
  if (flag(ctx, dev, "is_rf_linked", "binary_sensor.is_linked") === false) return "offline";
  if (flag(ctx, dev, "is_watering", "binary_sensor.is_watering")) return "watering";
  if (flag(ctx, dev, "is_paused", "binary_sensor.is_paused")) return "paused";
  return "idle";
}

const ALARMS = [
  ["is_leak", "binary_sensor.is_leaking", "leak"],
  ["is_clog", "binary_sensor.is_clogged", "clog"],
  ["is_broken", "binary_sensor.is_broken", "broken"],
  ["is_cutoff", "binary_sensor.is_cutoff", "cutoff"],
  ["is_fall", "binary_sensor.is_fall", "fall"],
];

function alarmsOf(ctx, dev) {
  return ALARMS.filter(([field, key]) => flag(ctx, dev, field, key)).map(([, , name]) => name);
}

function batteryImg(ctx, level) {
  const steps = [[90, "battery_full"], [70, "battery_80percent"], [50, "battery_60percent"],
    [30, "battery_40percent"], [10, "battery_20percent"]];
  const hit = steps.find(([min]) => Number(level) >= min);
  return ctx.img(`${hit ? hit[1] : "battery_empty"}.png`);
}

function signalImg(ctx, level) {
  const steps = [[90, "signal-100"], [70, "signal-80"], [50, "signal-60"], [30, "signal-40"], [10, "signal-20"]];
  const hit = steps.find(([min]) => Number(level) >= min);
  return ctx.img(`${hit ? hit[1] : "signal-none"}.png`);
}

function mmss(ctx, seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  return m >= 60 ? ctx.fmt.dur(m) : `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ctx.ui.row carries no parameters, and every screen below the launcher needs the device
// index, so the row is written here with the data attributes the core turns into params.
function navRow(ctx, icon, label, screen, i) {
  return `<button class="lrow" data-a="go" data-screen="${ctx.esc(screen)}" data-i="${i}">` +
    `${ctx.svg(icon)}<span>${ctx.esc(label)}</span>${ctx.svg("chev", "chev")}</button>`;
}

// The registry name is what the producer app shows ("Obwod - Grill"); the entity's friendly
// name carries the integration's own prefix in front of it.
function devName(ctx, dev) {
  if (dev.name) return dev.name;
  const id = ctx.hass?.entities?.[dev.entity]?.device_id;
  const d = id && ctx.hass?.devices?.[id];
  return (d && (d.name_by_user || d.name)) || ctx.st(dev.entity)?.attributes?.friendly_name || dev.prefix;
}

/* ---------- screens ---------- */

function start(ctx) {
  const esc = ctx.esc;
  if (!ctx.devices.length) {
    return `<div class="scroll"><div class="pad"><h1>${esc(ctx.manifest.name)}</h1>` +
      `<p class="fine">${esc(ctx.t("linktap.no_devices"))}</p></div></div>`;
  }
  const watering = ctx.devices.filter((d) => statusOf(ctx, d) === "watering").length;
  const cards = ctx.devices.map((dev, i) => {
    const st = statusOf(ctx, dev);
    const battery = val(ctx, dev, "battery", "sensor.battery");
    const signal = val(ctx, dev, "signal", "sensor.signal");
    const remain = val(ctx, dev, "remain_duration", "sensor.remain_duration");
    const plan = planName(ctx, dev);
    const alarms = alarmsOf(ctx, dev);
    const sub = st === "watering"
      ? `${ctx.t("linktap.progress")} · ${mmss(ctx, remain)}`
      : st === "paused" ? ctx.t("linktap.paused")
        : st === "offline" ? ctx.t("linktap.not_connected")
          : plan ? `${ctx.t("linktap.plan")}: ${plan}` : ctx.t("linktap.connected");
    return `<button class="zcard ${st}" data-a="go" data-screen="zone" data-i="${i}">` +
      `<span class="zhead"><b>${esc(devName(ctx, dev))}</b>` +
      `<span class="zst ${st}">${esc(st === "watering" ? ctx.t("linktap.on") : ctx.t(`linktap.st_${st}`))}</span></span>` +
      `<span class="zsub">${esc(sub)}</span>` +
      `<span class="zmeta">` +
      `<img src="${batteryImg(ctx, battery)}" alt=""><i>${battery == null ? "--" : `${battery}%`}</i>` +
      `<img src="${signalImg(ctx, signal)}" alt=""><i>${signal == null ? "--" : `${signal}%`}</i>` +
      (alarms.length ? `<em class="bad">${esc(ctx.t(`linktap.alarm_${alarms[0]}`))}</em>` : "") +
      `</span></button>`;
  }).join("");
  return `<div class="scroll"><div class="pad"><h1>${esc(ctx.manifest.name)}</h1>` +
    `<p class="fine">${esc(watering ? ctx.t("linktap.n_watering", { n: watering }) : ctx.t("linktap.all_idle"))}</p>` +
    `<div class="zcards">${cards}</div></div></div>`;
}

function zone(ctx, params) {
  const esc = ctx.esc;
  const i = Number(params.i || 0);
  const dev = ctx.dev(i);
  if (!dev) return `<div class="scroll"><div class="pad"><p class="fine">--</p></div></div>`;
  const st = statusOf(ctx, dev);
  const valve = dev.entity;
  const remain = val(ctx, dev, "remain_duration", "sensor.remain_duration") || 0;
  const total = val(ctx, dev, "total_duration", "sensor.total_duration") || 0;
  const pct = total > 0 ? ((total - remain) / total) * 100 : 0;
  const durEnt = ctx.e(dev, "number.watering_duration");
  const volEnt = ctx.e(dev, "number.watering_volume");
  const dur = num(ctx, dev, "number.watering_duration");
  const vol = num(ctx, dev, "number.watering_volume");
  const alarms = alarmsOf(ctx, dev);

  const hero = `<div class="hero ${st}">` +
    `<img class="hicon" src="${ctx.img("icon_watering.png")}" alt="">` +
    `<div class="hstate">${esc(st === "watering" ? ctx.t("linktap.progress") : ctx.t(`linktap.st_${st}`))}</div>` +
    (st === "watering"
      ? `<div class="hbig">${esc(mmss(ctx, remain))}</div>${ctx.ui.bar_pct(pct)}` +
        `<div class="hfine">${esc(ctx.t("linktap.speed", { v: val(ctx, dev, "speed", "sensor.speed") ?? 0 }))} · ` +
        `${esc(ctx.t("linktap.volume_now", { v: val(ctx, dev, "volume", "sensor.volume") ?? 0 }))}</div>`
      : `<div class="hfine">${esc(ctx.t("linktap.plan"))}: ${esc(planName(ctx, dev) || "--")}</div>`) +
    `<button class="big ${st === "watering" ? "off" : "on"}" data-a="water" data-e="${esc(valve)}" data-on="${st === "watering" ? 0 : 1}">` +
    `${esc(st === "watering" ? ctx.t("linktap.valve_off") : ctx.t("linktap.valve_on"))}</button>` +
    `</div>`;

  const alarmNotes = alarms.map((a) => ctx.ui.note(ctx.t(`linktap.alarm_${a}`), "warn")).join("");

  const stepper = (entity, label, value, unit, step) =>
    `<div class="srow"><span>${esc(label)}</span><span class="step">` +
    `<button class="sb" data-a="num" data-e="${esc(entity || "")}" data-v="${(value ?? 0) - step}">-</button>` +
    `<b>${value == null ? "--" : value}${esc(unit)}</b>` +
    `<button class="sb" data-a="num" data-e="${esc(entity || "")}" data-v="${(value ?? 0) + step}">+</button>` +
    `</span></div>`;

  return `<div class="scroll">${ctx.ui.bar(devName(ctx, dev))}<div class="pad">` +
    hero + alarmNotes +
    `<h2>${esc(ctx.t("linktap.instant"))}</h2>` +
    stepper(durEnt, ctx.t("linktap.duration"), dur, " min", 5) +
    stepper(volEnt, ctx.t("linktap.volume"), vol, " L", 10) +
    `<p class="fine">${esc(ctx.t("linktap.instant_hint"))}</p>` +
    `<h2>${esc(ctx.t("linktap.more"))}</h2>` +
    navRow(ctx, "calendar", ctx.t("linktap.plan_screen"), "plan", i) +
    navRow(ctx, "chart", ctx.t("linktap.history"), "history", i) +
    navRow(ctx, "gear", ctx.t("linktap.settings"), "settings", i) +
    `</div></div>`;
}

function plan(ctx, params) {
  const esc = ctx.esc;
  const dev = ctx.dev(Number(params.i || 0));
  if (!dev) return `<div class="scroll"><div class="pad"><p class="fine">--</p></div></div>`;
  const mode = planName(ctx, dev);
  const sn = ctx.v(dev, "sensor.plan_sn") ?? payload(ctx, dev).plan_sn;
  const pause = pauseSwitch(ctx, dev);
  const pauseOn = pause ? ctx.st(pause)?.state === "on" : false;
  const pauseDurEnt = ctx.e(dev, "number.pause_duration");
  const pauseDur = num(ctx, dev, "number.pause_duration");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("linktap.plan_screen"))}<div class="pad">` +
    `<div class="tile"><span class="fine">${esc(ctx.t("linktap.plan"))}</span>` +
    `<b class="tbig">${esc(mode || ctx.t("linktap.no_plan"))}</b>` +
    (sn && sn !== "unknown" ? `<span class="fine">#${esc(sn)}</span>` : "") + `</div>` +
    `<h2>${esc(ctx.t("linktap.pause_title"))}</h2>` +
    (pause ? ctx.ui.toggle(pause, ctx.t("linktap.pause_plan"), pauseOn)
      : `<p class="fine">${esc(ctx.t("linktap.no_pause_entity"))}</p>`) +
    `<div class="srow"><span>${esc(ctx.t("linktap.pause_hours"))}</span><span class="step">` +
    `<button class="sb" data-a="num" data-e="${esc(pauseDurEnt || "")}" data-v="${(pauseDur ?? 1) - 1}">-</button>` +
    `<b>${pauseDur == null ? "--" : pauseDur} h</b>` +
    `<button class="sb" data-a="num" data-e="${esc(pauseDurEnt || "")}" data-v="${(pauseDur ?? 1) + 1}">+</button>` +
    `</span></div>` +
    `<p class="fine">${esc(ctx.t("linktap.pause_hint"))}</p>` +
    `<p class="fine">${esc(ctx.t("linktap.plan_edit_elsewhere"))}</p>` +
    `</div></div>`;
}

function history(ctx, params) {
  const esc = ctx.esc;
  const i = Number(params.i || 0);
  const dev = ctx.dev(i);
  if (!dev) return `<div class="scroll"><div class="pad"><p class="fine">--</p></div></div>`;
  const days = Number(ctx.config.history_days || 7);
  const key = `hist_${i}`;
  const data = ctx.state[key];
  if (data === undefined) loadHistory(ctx, dev, i, days);

  let body = `<p class="fine">${esc(ctx.t("linktap.loading"))}</p>`;
  if (Array.isArray(data)) {
    if (!data.length) {
      body = `<p class="fine">${esc(ctx.t("linktap.no_history", { n: days }))}</p>`;
    } else {
      const max = Math.max(...data.map((d) => d.v), 1);
      const w = 100 / data.length;
      const bars = data.map((d, j) =>
        `<rect x="${(j * w + w * 0.18).toFixed(2)}" y="${(100 - (d.v / max) * 86).toFixed(2)}" ` +
        `width="${(w * 0.64).toFixed(2)}" height="${((d.v / max) * 86).toFixed(2)}" rx="1" fill="var(--primary-color,#009688)"/>`
      ).join("");
      const labels = data.map((d) => `<span>${esc(d.label)}</span>`).join("");
      const sum = data.reduce((a, d) => a + d.v, 0);
      body = `<svg class="bars" viewBox="0 0 100 100" preserveAspectRatio="none">${bars}</svg>` +
        `<div class="xlabels">${labels}</div>` +
        `<div class="srow"><span>${esc(ctx.t("linktap.total_volume", { n: days }))}</span><b>${sum.toFixed(1)} L</b></div>`;
    }
  }
  const totalVol = num(ctx, dev, "sensor.volume_total");
  const totalTime = num(ctx, dev, "sensor.watering_time_total");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("linktap.history"))}<div class="pad">` +
    `<h2>${esc(ctx.t("linktap.daily_volume"))}</h2>${body}` +
    `<h2>${esc(ctx.t("linktap.lifetime"))}</h2>` +
    `<div class="srow"><span>${esc(ctx.t("linktap.volume"))}</span><b>${totalVol == null ? "--" : `${totalVol} L`}</b></div>` +
    `<div class="srow"><span>${esc(ctx.t("linktap.total_duration"))}</span><b>${totalTime == null ? "--" : ctx.fmt.dur(totalTime / 60)}</b></div>` +
    `</div></div>`;
}

// Daily volume comes from the recorder statistics of the lifetime counter, so the chart
// survives a restart of the integration; the history endpoint would only carry the states.
async function loadHistory(ctx, dev, i, days) {
  const key = `hist_${i}`;
  ctx.state[key] = null;
  const entity = ctx.e(dev, "sensor.volume_total");
  if (!entity) { ctx.state[key] = []; return ctx.refresh(); }
  const end = new Date();
  const start = new Date(end.getTime() - days * 864e5);
  try {
    const res = await ctx.stats([entity], start, end, "day");
    const rows = (res && res[entity]) || [];
    ctx.state[key] = rows.map((r) => ({
      label: ctx.fmt.ymd(r.start).slice(5),
      v: Math.max(0, Number(r.sum ?? (r.max != null && r.min != null ? r.max - r.min : 0)) || 0),
    }));
  } catch (e) {
    ctx.state[key] = [];
  }
  ctx.refresh();
}

function settings(ctx, params) {
  const esc = ctx.esc;
  const dev = ctx.dev(Number(params.i || 0));
  if (!dev) return `<div class="scroll"><div class="pad"><p class="fine">--</p></div></div>`;
  const data = payload(ctx, dev);
  const rows = [
    [ctx.t("linktap.failsafe"), (() => { const v = val(ctx, dev, "failsafe_duration", "sensor.failsafe_duration"); return v ? mmss(ctx, v) : ctx.t("linktap.off"); })()],
    [ctx.t("linktap.volume_limit"), (() => { const v = val(ctx, dev, "volume_limit", "sensor.volume_limit"); return v ? `${v} L` : ctx.t("linktap.off"); })()],
    [ctx.t("linktap.child_lock"), data.child_lock ? ctx.t("linktap.on") : ctx.t("linktap.off")],
    [ctx.t("linktap.battery"), (() => { const v = val(ctx, dev, "battery", "sensor.battery"); return v == null ? "--" : `${v}%`; })()],
    [ctx.t("linktap.signal"), (() => { const v = val(ctx, dev, "signal", "sensor.signal"); return v == null ? "--" : `${v}%`; })()],
    [ctx.t("linktap.device_id"), data.dev_id || "--"],
  ].map(([k, v]) => `<div class="srow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  const gaps = (ctx.manifest.not_covered || []).map((x) => `<li>${esc(x)}</li>`).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("linktap.settings"))}<div class="pad">` +
    rows +
    `<button class="lrow" data-a="more" data-e="${esc(dev.entity)}"><span>${esc(ctx.t("linktap.more_info"))}</span></button>` +
    `<h2>${esc(ctx.t("linktap.not_covered"))}</h2><ul class="gaps">${gaps}</ul>` +
    `</div></div>`;
}

export default {
  home: "start",
  icons: ICONS,

  title: (ctx) => ctx.manifest.name,

  // The valve carries the whole payload, but the numbers and the pause switch are their
  // own entities, so a change in any of them has to redraw the screen.
  watch: (ctx) => ctx.devices.flatMap((dev) => ctx.entities(dev)),

  screens: { start, zone, plan, history, settings },

  actions: {
    water: (ctx, data) =>
      ctx.call("valve", data.on === "1" ? "open_valve" : "close_valve", { entity_id: data.e }),
    num: (ctx, data) => {
      if (!data.e) return ctx.toast(ctx.t("linktap.no_entity"));
      return ctx.call("number", "set_value", { entity_id: data.e, value: Math.max(0, Number(data.v)) });
    },
  },

  css() {
    return `
.zcards{display:flex;flex-direction:column;gap:12px}
.zcard{display:block;width:100%;background:var(--card-background-color,#fff);border-radius:12px;padding:14px 16px;box-shadow:0 1px 4px rgba(30,40,70,.14)}
.zcard.watering{border-left:4px solid var(--primary-color,#009688)}
.zcard.offline{opacity:.65}
.zhead{display:flex;align-items:center;gap:10px}
.zhead b{flex:1;font-size:19px;font-weight:500}
.zst{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--secondary-text-color,#71787d)}
.zst.watering{color:var(--primary-color,#009688)}
.zst.offline{color:var(--error-color,#d32f2f)}
.zsub{display:block;margin-top:4px;font-size:14px;color:var(--secondary-text-color,#71787d)}
.zmeta{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;color:var(--secondary-text-color,#71787d)}
.zmeta img{width:18px;height:18px;object-fit:contain}
.zmeta i{font-style:normal;margin-right:10px}
.zmeta em{font-style:normal;color:var(--error-color,#d32f2f);font-weight:600}
.hero{background:var(--card-background-color,#fff);border-radius:14px;padding:20px 16px 16px;text-align:center;box-shadow:0 1px 4px rgba(30,40,70,.14);margin-top:8px}
.hero .hicon{width:72px;height:72px;object-fit:contain;opacity:.9}
.hero.idle .hicon,.hero.offline .hicon{filter:grayscale(1);opacity:.45}
.hstate{font-size:15px;color:var(--secondary-text-color,#71787d);margin-top:6px}
.hbig{font-size:40px;font-weight:300;line-height:1.1;margin-top:4px}
.hfine{font-size:13px;color:var(--secondary-text-color,#71787d);margin-top:8px}
.big{display:block;width:100%;margin-top:16px;padding:14px;border-radius:26px;text-align:center;font-size:18px;font-weight:600;color:#fff;background:var(--primary-color,#009688);min-height:48px}
.big.off{background:var(--error-color,#d32f2f)}
.step{display:flex;align-items:center;gap:12px}
.step b{min-width:76px;text-align:center;font-weight:500}
.sb{width:38px;height:38px;border-radius:50%;border:1.5px solid var(--divider-color,#dfe1e3);text-align:center;font-size:20px;line-height:35px}
.tile{background:var(--card-background-color,#fff);border-radius:12px;padding:16px;margin-top:8px;box-shadow:0 1px 4px rgba(30,40,70,.14)}
.tbig{display:block;font-size:24px;font-weight:500;margin:4px 0}
.bars{width:100%;height:150px;display:block;margin-top:8px}
.xlabels{display:flex;justify-content:space-between;font-size:11px;color:var(--secondary-text-color,#71787d);margin-top:4px}
.gaps{margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:var(--secondary-text-color,#71787d)}
@container apphub (max-width:420px){.hbig{font-size:34px}.step b{min-width:62px}.xlabels{font-size:10px}}
`;
  },
};
