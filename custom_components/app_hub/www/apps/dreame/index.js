/*
 * Dreame: the Dreamehome app (2.6.6.3) screens as an App Hub module.
 * Screens, labels and colours were taken from the app on a Galaxy Z Fold8 (adb screencap,
 * uiautomator and OCR, 2026-11-01): device carousel, robot home (map, mode sheet, room / all /
 * zone tabs), settings hub with its sub-pages, cleaning history, consumables, schedule, MF10 fan.
 * Data and actions come from the Tasshack dreame_vacuum integration and from dreame_fan.
 *
 * Ported from dreame-app-card 0.2.0. The producer's own option names stay a data table in the
 * locale (they are the same words the app prints), the structure of the settings pages stays in
 * this file, and every string the user reads goes through ctx.t.
 */

const MODEL_IMG = { r9515a: "x60", r2489s: "x50", r5039h: "l50s", u2519: "mf10" };

// [attribute prefix, reset button suffix]. The locale names them under "cons".
const CONSUMABLES = [
  ["filter"], ["side_brush"], ["main_brush"],
  ["sensor_dirty", "sensor"], ["wheel_dirty", "wheel"], ["scale_inhibitor"],
];

// Settings sub-pages. The row type follows the entity domain, a row whose entity is missing is
// not drawn, `o` names the locale dictionary for the option values, `radio` draws the options
// inline instead of behind a sheet.
const PAGES = {
  station: { g: [
    { h: "mop_wash", r: [
      { k: "switch.smart_mop_washing" }, { k: "select.washing_mode", o: "washing_mode" },
      { k: "select.water_temperature", o: "water_temperature" },
      { k: "select.self_clean_frequency", o: "self_clean_frequency" },
      { k: "number.self_clean_area" }, { k: "number.self_clean_time" },
      { k: "select.auto_rewashing", o: "auto_rewashing" }, { k: "switch.self_clean" },
    ] },
    { h: "detergent", r: [
      { k: "switch.mop_washing_with_detergent" }, { k: "switch.mopping_with_detergent" },
      { k: "switch.auto_add_detergent" }, { k: "sensor.detergent_status", o: "status" },
    ] },
    { h: "dry", r: [
      { k: "switch.auto_drying" }, { k: "select.drying_time", o: "drying_time" },
      { k: "switch.silent_drying" }, { k: "switch.uv_sterilization" },
    ] },
    { h: "auto_empty", r: [
      { k: "select.auto_empty_mode", o: "auto_empty_mode" }, { k: "switch.hair_compression" },
      { k: "sensor.dust_bag_status", o: "status" },
    ] },
    { h: "station_care", r: [
      { k: "button.base_station_cleaning" }, { k: "button.self_clean" }, { k: "button.manual_drying" },
      { k: "button.start_auto_empty" }, { k: "button.water_tank_draining" }, { k: "button.empty_water_tank" },
      { k: "button.base_station_self_repair" }, { k: "switch.auto_water_refilling" },
      { k: "sensor.clean_water_tank_status", o: "status" }, { k: "sensor.dirty_water_tank_status", o: "status" },
    ] },
  ] },
  floor: { g: [
    { h: "direction", r: [{ k: "switch.floor_direction_cleaning" }] },
    { h: "low_lying", r: [
      { k: "select.auto_lds_coverage", o: "auto_lds_coverage" },
      { k: "select.low_lying_area_frequency", o: "low_lying_area_frequency" },
    ] },
    { h: "edges", r: [
      { k: "switch.mop_extend" }, { k: "switch.side_reach" }, { k: "switch.gap_cleaning_extension" },
      { k: "switch.mopping_under_furnitures" }, { k: "select.mop_extend_frequency", o: "mop_extend_frequency" },
    ] },
    { h: "deep", r: [
      { k: "switch.pressurized_cleaning" }, { k: "switch.dynamic_obstacle_cleaning" },
      { k: "select.auto_recleaning", o: "auto_recleaning" }, { k: "switch.collision_avoidance" },
    ] },
    { h: "hardware", r: [{ k: "switch.auto_mount_mop" }] },
  ] },
  carpet: { g: [
    { h: "carpet_global", r: [{ k: "select.carpet_cleaning", o: "carpet_cleaning", radio: true }] },
    { h: "more", r: [
      { k: "switch.carpet_boost" }, { k: "switch.intensive_carpet_cleaning" },
      { k: "switch.clean_carpets_first" }, { k: "switch.side_brush_carpet_rotate" },
      { k: "switch.lift_chassis_on_carpet" },
    ] },
  ] },
  crossing: { g: [{ r: [{ k: "switch.obstacle_crossing" }] }] },
  more: { g: [
    { r: [
      { k: "switch.streaming_voice_prompt" }, { k: "number.volume" }, { k: "switch.dnd" },
      { k: "time.dnd_start" }, { k: "time.dnd_end" }, { k: "switch.dnd_disable_resume_cleaning" },
      { k: "switch.dnd_disable_auto_empty" }, { k: "switch.dnd_reduce_volume" },
      { k: "switch.ring_light_always_on" }, { k: "switch.resume_cleaning" }, { k: "switch.child_lock" },
    ] },
    { h: "battery", r: [
      { k: "switch.off_peak_charging" }, { k: "time.off_peak_charging_start" },
      { k: "time.off_peak_charging_end" }, { k: "select.battery_charge_level", o: "battery_charge_level" },
    ] },
    { h: "device_care", r: [{ k: "@locate" }, { k: "button.reload_shortcuts" }] },
  ] },
  pet: { g: [{ r: [{ k: "switch.ai_pet_detection" }, { k: "switch.pet_focused_detection" }, { k: "switch.pet_picture" }] }] },
  voice: { g: [{ h: "dva", r: [{ k: "switch.voice_assistant" }, { k: "select.voice_assistant_language" }] }] },
  ai: { g: [{ r: [
    { k: "switch.ai_obstacle_detection" }, { k: "switch.collision_avoidance" },
    { k: "switch.ai_obstacle_picture" }, { k: "switch.ai_obstacle_image_upload" },
    { k: "switch.fill_light" }, { k: "switch.ai_furniture_detection" }, { k: "switch.fuzzy_obstacle_detection" },
  ] }] },
  lab: { g: [{ r: [{ k: "switch.stain_avoidance" }, { k: "switch.ai_fluid_detection" }, { k: "switch.large_particles_boost" }] }] },
  camera: { g: [{ r: [{ k: "sensor.stream_status" }, { k: "switch.human_follow" }] }] },
};

const HUB = [
  { id: "station", i: "dock" }, { id: "floor", i: "floor" }, { id: "carpet", i: "carpet" },
  { id: "crossing", i: "step" }, { id: "more", i: "dots" },
];
const SMART = [["pet", "paw"], ["voice", "bell"], ["ai", "video"]];
const REST = ["camera", "lab"];

const FAN_ROWS = [
  "binary_sensor.ciagle_monitorowanie", "switch.dzwiek_klawisza", "switch.wyswietlacz_led",
  "select.predkosc_lopatek", "switch.synchronizacja_kierunku_nawiewu", "switch.naprzemienny_kierunek_nawiewu",
];
const FAN_CONS = [
  ["sensor.zywotnosc_filtra_wstepnego", "%"], ["sensor.filtr_wstepny_pozostalo", "dni"],
  ["sensor.filtr_kompozytowy_zywotnosc", "%"], ["sensor.filtr_kompozytowy_pozostalo", "dni"],
];

/* ---------- per card instance state ---------- */
// The module object is shared by every card on the dashboard, so nothing mutable lives here.
const S = (ctx) => (ctx.state.dr = ctx.state.dr || { sel: {}, tab: {}, zones: {}, reps: {}, size: {}, idx: 0, fanTab: "in" });

const slug = (s) => String(s ?? "").toLowerCase().replace(/[\s-]+/g, "_");

/* ---------- device and vacuum model ---------- */
function dev(ctx, i) {
  const d = ctx.devices[Number(i) || 0];
  if (!d) return null;
  const st = ctx.st(d.entity);
  const reg = ctx.hass?.entities?.[d.entity];
  const device = reg && ctx.hass.devices?.[reg.device_id];
  const model = String(device?.model_id || device?.model || "").toLowerCase();
  const mkey = Object.keys(MODEL_IMG).find((k) => model.includes(k));
  const domain = String(d.entity).split(".")[0];
  return {
    ...d, st, device, domain,
    img: d.image || (mkey ? MODEL_IMG[mkey] : domain === "fan" ? "mf10" : "x60"),
    name: d.name || device?.name_by_user || st?.attributes.friendly_name || d.entity,
  };
}

function vac(ctx, d) {
  const a = d.st?.attributes || {};
  const cam = ctx.st(d.camera || `camera.${d.prefix}_map`);
  const state = ctx.st(ctx.e(d, "sensor.state"))?.state || a.vacuum_state || d.st?.state;
  const rooms = (a.rooms && (a.rooms[a.selected_map] || Object.values(a.rooms)[0])) || [];
  const seq = a.cleaning_sequence || [];
  const camRooms = cam?.attributes.rooms || {};
  const order = (r) => { const ix = seq.indexOf(r.id); return ix >= 0 ? ix + 1 : camRooms[r.id]?.order || null; };
  return {
    a, cam, state,
    rooms: rooms.map((r) => ({ ...r, order: order(r), box: camRooms[r.id] })).sort((x, y) => (x.order || 99) - (y.order || 99)),
    running: !!(a.running || a.started) && !a.paused, paused: !!a.paused, returning: !!a.returning,
    battery: a.battery ?? a.battery_level ?? ctx.st(ctx.e(d, "sensor.battery_level"))?.state,
  };
}

function statusText(ctx, d, v) {
  if (!d.st || d.st.state === "unavailable") return ctx.t("state.unavailable");
  if (v.a.charging && Number(v.battery) >= 100) return ctx.t("state.charging_completed");
  const dict = ctx.t(`state.${v.state}`);
  if (dict !== `state.${v.state}`) return dict;
  return ctx.fmtState(ctx.st(ctx.e(d, "sensor.state"))) || v.state;
}

function message(ctx, d, v) {
  const err = v.a.error && !/no.?error/i.test(v.a.error) ? v.a.error : null;
  if (err) return { t: err, red: true };
  const notes = [];
  if (v.a.low_water_warning && !/no.?warning/i.test(v.a.low_water_warning)) notes.push(v.a.low_water_warning);
  for (const [k] of CONSUMABLES) {
    const n = Number(v.a[k + "_left"]);
    if (Number.isFinite(n) && n <= 10) notes.push(ctx.t("ui.needs_replacement", { what: ctx.t(`cons.${k}`) }));
  }
  if (notes.length) return { t: ctx.t("ui.notifications", { n: notes.length }), red: true, list: notes };
  if (ctx.st(ctx.e(d, "sensor.task_status"))?.state === "completed") return { t: ctx.t("ui.task_done") };
  return null;
}

function tempWord(ctx, t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return "";
  return n < 18 ? ctx.t("ui.cold") : n < 26 ? ctx.t("ui.comfort") : ctx.t("ui.hot");
}

function battery(b, charging) {
  const p = Math.max(0, Math.min(100, Number(b) || 0));
  return `<svg class="bat" viewBox="0 0 28 14"><rect x="1" y="1" width="23" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.4"/>` +
    `<rect x="25" y="4.5" width="2" height="5" rx="1" fill="currentColor"/>` +
    `<rect x="3" y="3" width="${(19 * p) / 100}" height="8" rx="1.5" fill="${charging ? "#4cb050" : "currentColor"}"/>` +
    `${charging ? '<path d="M13 2.5l-3 5h3l-1 4 3.5-5.5h-3l1-3.5z" fill="#fff"/>' : ""}</svg>`;
}

// map px = m0 + (m1-m0) * x/1000 + (m2-m0) * y/1000
function calib(cam) {
  const cp = cam?.attributes.calibration_points;
  if (!Array.isArray(cp) || cp.length < 3) return null;
  const [a, b, c] = cp, s = 1000;
  const ux = (b.map.x - a.map.x) / (b.vacuum.x - a.vacuum.x || s), uy = (b.map.y - a.map.y) / (b.vacuum.x - a.vacuum.x || s);
  const vx = (c.map.x - a.map.x) / (c.vacuum.y - a.vacuum.y || s), vy = (c.map.y - a.map.y) / (c.vacuum.y - a.vacuum.y || s);
  const det = ux * vy - vx * uy;
  return {
    fwd: (x, y) => [a.map.x + ux * (x - a.vacuum.x) + vx * (y - a.vacuum.y), a.map.y + uy * (x - a.vacuum.x) + vy * (y - a.vacuum.y)],
    inv: (px, py) => { const dx = px - a.map.x, dy = py - a.map.y; return [a.vacuum.x + (vy * dx - vx * dy) / det, a.vacuum.y + (-uy * dx + ux * dy) / det]; },
  };
}

/* ---------- rows ---------- */
function rowText(ctx, k, field) {
  const key = `row.${k}.${field}`;
  const got = ctx.t(key);
  return got === key ? "" : got;
}

function row(ctx, d, r) {
  const esc = ctx.esc, svg = ctx.svg;
  const title = rowText(ctx, r.k, "t");
  const desc = rowText(ctx, r.k, "d");
  if (r.k === "@locate") {
    return `<div class="row" data-a="press" data-e="@locate" data-l="${esc(title)}"><div class="rt">${esc(title)}</div>${svg("chev")}</div>`;
  }
  const id = ctx.e(d, r.k);
  const st = ctx.st(id);
  if (!st) return "";
  const dom = id.split(".")[0];
  const off = st.state === "unavailable";
  const dd = desc ? `<div class="rd">${esc(desc)}</div>` : "";
  if (dom === "switch") {
    return `<div class="row ${off ? "dis" : ""}"><div class="rcol"><div class="rt">${esc(title)}</div>${dd}</div>` +
      `<span class="sw ${st.state === "on" ? "on" : ""}" data-a="toggle" data-e="${id}"><i></i></span></div>`;
  }
  if (dom === "select" && r.radio) {
    return (st.attributes.options || []).map((o) => {
      const od = rowText(ctx, r.k, o) || (ctx.t(`rowdesc.${r.k}.${o}`) === `rowdesc.${r.k}.${o}` ? "" : ctx.t(`rowdesc.${r.k}.${o}`));
      return `<div class="row radio ${o === st.state ? "on" : ""}" data-a="opt" data-e="${id}" data-v="${esc(o)}">` +
        `<div class="rcol"><div class="rt">${esc(ctx.fmtState(st, o, r.o))}</div>${od ? `<div class="rd">${esc(od)}</div>` : ""}</div><span class="rb"></span></div>`;
    }).join("");
  }
  if (dom === "select") {
    return `<div class="row ${off ? "dis" : ""}" data-a="sheet" data-s="opts" data-k="${id}" data-o="${esc(r.o || "")}" data-rt="${esc(title)}">` +
      `<div class="rcol"><div class="rt">${esc(title)}</div>${dd}</div>` +
      `<div class="rv">${esc(off ? "--" : ctx.fmtState(st, null, r.o))} ${svg("chev")}</div></div>`;
  }
  if (dom === "number") {
    return `<div class="row col ${off ? "dis" : ""}"><div class="rt">${esc(title)} <output>${esc(st.state)}${esc(st.attributes.unit_of_measurement ? " " + st.attributes.unit_of_measurement : "")}</output></div>` +
      `<input type="range" data-num="${id}" min="${esc(st.attributes.min ?? 0)}" max="${esc(st.attributes.max ?? 100)}" step="${esc(st.attributes.step ?? 1)}" value="${esc(st.state)}"></div>`;
  }
  if (dom === "time") {
    return `<div class="row"><div class="rt">${esc(title)}</div><input type="time" data-time="${id}" value="${esc(String(st.state).slice(0, 5))}"></div>`;
  }
  if (dom === "button") {
    return `<div class="row ${off ? "dis" : ""}" data-a="press" data-e="${id}" data-l="${esc(title)}"><div class="rt">${esc(title)}</div>${svg("chev")}</div>`;
  }
  return `<div class="row" data-a="more" data-e="${id}"><div class="rt">${esc(title)}</div><div class="rv">${esc(ctx.fmtState(st, null, r.o))}</div></div>`;
}

const hasPage = (ctx, d, id) => PAGES[id].g.some((g) => g.r.some((r) => r.k.startsWith("@") || ctx.e(d, r.k)));
const nav2 = (ctx, title) => `<div class="nav"><span data-a="back">${ctx.svg("back")}</span><h2>${ctx.esc(title)}</h2><span></span></div>`;

/* ---------- map ---------- */
function mapHtml(ctx, d, v, tab) {
  const esc = ctx.esc, s = S(ctx);
  const src = v.cam ? (d.map_url || v.cam.attributes.entity_picture) : null;
  const sz = s.size[d.entity];
  const cal = calib(v.cam);
  let over = "";
  if (sz && cal && tab === "room") {
    const sel = new Set(s.sel[d.entity] || []);
    const boxes = v.rooms.filter((r) => r.box).map((r) => {
      const p = cal.fwd(r.box.x0, r.box.y0), q = cal.fwd(r.box.x1, r.box.y1);
      return { r, x0: Math.min(p[0], q[0]), y0: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) };
    }).sort((m, n) => n.w * n.h - m.w * m.h);   // small rooms last, so they win a tap where boxes overlap
    over = boxes.map(({ r, x0, y0, w, h }) =>
      `<div class="rbox ${sel.has(r.id) ? "on" : ""}" data-a="room" data-r="${esc(r.id)}" style="left:${(x0 / sz[0]) * 100}%;top:${(y0 / sz[1]) * 100}%;width:${(w / sz[0]) * 100}%;height:${(h / sz[1]) * 100}%">` +
      `${sel.has(r.id) ? `<b>${[...sel].indexOf(r.id) + 1}</b>` : ""}</div>`).join("");
  }
  if (sz && tab === "zone") {
    over = (s.zones[d.entity] || []).map(([x0, y0, x1, y1], i) =>
      `<div class="zone" data-z="${i}" style="left:${(x0 / sz[0]) * 100}%;top:${(y0 / sz[1]) * 100}%;width:${((x1 - x0) / sz[0]) * 100}%;height:${((y1 - y0) / sz[1]) * 100}%">` +
      `<span class="zx" data-a="delzone" data-z="${i}">&times;</span><span class="handle"></span></div>`).join("");
  }
  const chips = tab === "room"
    ? `<div class="chips">${v.rooms.map((r) => {
        const on = (s.sel[d.entity] || []).includes(r.id);
        return `<span class="${on ? "on" : ""}" data-a="room" data-r="${esc(r.id)}">${r.order ? `<b>${r.order}</b>` : ""}${esc(r.name)}</span>`;
      }).join("")}</div>`
    : "";
  const warn = tab === "zone" && !cal ? `<div class="mapwarn">${esc(ctx.t("ui.no_calibration"))}</div>` : "";
  const box = src
    ? `<div class="mapbox ${tab === "zone" ? "swiper" : ""}" style="${sz ? `aspect-ratio:${sz[0]}/${sz[1]}` : ""}">` +
      `<img class="map" data-dev="${esc(d.entity)}" src="${esc(src)}" alt="">${over}</div>`
    : `<div class="nomap">${esc(ctx.t("ui.no_map"))}</div>`;
  return `<div class="mapwrap">${box}</div>${chips}${warn}`;
}

const modeIcon = (m) => ({ sweeping: "vac", mopping: "mop", sweeping_and_mopping: "vacmop", mopping_after_sweeping: "vacmop" }[m] || "vacmop");

export default {
  home: "home",

  icons: {
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    dock: '<rect x="6" y="3" width="12" height="15" rx="2"/><path d="M4 21h16"/>',
    mapedit: '<path d="M5 4h9l4 4v5"/><path d="M5 4v16h6"/><path d="M14 21l7-7-2-2-7 7v2z"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
    paw: '<circle cx="7" cy="9" r="1.8"/><circle cx="11" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2-4 1.5C10 19 8 19 8 17z"/>',
    bell: '<path d="M6 17V11a6 6 0 0112 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
    floor: '<path d="M3 20h18M5 20l3-12h8l3 12"/>',
    carpet: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M4 10h16M4 14h16"/>',
    step: '<path d="M3 19h6v-5h6V9h6"/>',
    dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    power: '<path d="M12 3v8"/><path d="M6.5 6.5a8 8 0 1011 0"/>',
    vac: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>',
    mop: '<path d="M12 3c3 4 6 7 6 11a6 6 0 01-12 0c0-4 3-7 6-11z"/>',
    vacmop: '<circle cx="9" cy="13" r="5"/><path d="M16 4c2 3 4 5 4 7a4 4 0 01-8 0"/>',
    custom: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    fanQ: '<path d="M8 15a5 5 0 108-6"/>',
    fanS: '<path d="M6 9l6 9 6-9"/>',
    fanM: '<path d="M12 12c0-5 4-7 6-5M12 12c5 0 7 4 5 6M12 12c0 5-4 7-6 5M12 12c-5 0-7-4-5-6"/>',
    fanX: '<path d="M12 12c0-6 5-8 7-5M12 12c6 0 8 5 5 7M12 12c0 6-5 8-7 5M12 12c-6 0-8-5-5-7"/><circle cx="12" cy="12" r="1.5"/>',
    route1: '<path d="M6 20V6a2 2 0 014 0v12a2 2 0 004 0V6a2 2 0 014 0v14"/>',
    route2: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h6"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    filter: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h8"/>',
    thermo: '<path d="M10 4a2 2 0 014 0v10a4 4 0 11-4 0z"/>',
    osc: '<path d="M4 12a8 8 0 0116 0"/><path d="M12 12v6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  },

  title: (ctx) => ctx.manifest.name,

  watch: (ctx) => ctx.devices.map((d) => `camera.${d.prefix}_map`),

  screens: {
    /* ---------- device carousel ---------- */
    home: (ctx) => {
      const esc = ctx.esc, svg = ctx.svg, s = S(ctx);
      const devs = ctx.devices.map((_, i) => dev(ctx, i));
      const pages = devs.map((d) => {
        const img = `<img class="prod" src="${ctx.img(`dev_${d.img}.webp`)}" alt="">`;
        if (d.domain === "fan") {
          const t = ctx.st(ctx.e(d, "sensor.temperatura") || ctx.e(d, "sensor.temperature"));
          return `<section class="hp" data-a="open" data-i="${d.i}">${img}
            <div class="hname"><b>${esc(d.name)}</b><span class="go">${esc(ctx.t("ui.go"))} ${svg("chev")}</span></div>
            <div class="hbtns"><div class="hbtn" data-a="open" data-i="${d.i}">${svg("fanM")}<span>${esc(d.st?.state === "on" ? ctx.t("ui.fan_running") : ctx.t("ui.fan_off"))}</span></div>
            <div class="hbtn" data-a="open" data-i="${d.i}"><small>${esc(ctx.t("ui.temperature"))}</small><span>${esc(tempWord(ctx, t?.state))}</span><big>${esc(t?.state ?? "--")}&deg;C</big></div></div></section>`;
        }
        const v = vac(ctx, d);
        return `<section class="hp" data-a="open" data-i="${d.i}">${img}
          <div class="hname"><b>${esc(d.name)}</b><span class="go">${esc(ctx.t("ui.go"))} ${svg("chev")}</span></div>
          <div class="hsub">${battery(v.battery, v.a.charging)} ${esc(v.battery ?? "--")}% <i></i> ${esc(statusText(ctx, d, v))}</div>
          <div class="hbtns"><div class="hbtn" data-a="home-start" data-i="${d.i}">${svg("play")}<span>${esc(v.running ? ctx.t("ui.cleaning_now") : ctx.t("ui.start_clean"))}</span></div>
          <div class="hbtn" data-a="home-dock" data-i="${d.i}">${svg("dock")}<span>${esc(v.a.charging ? ctx.t("ui.charging") : ctx.t("ui.start_charge"))}</span></div></div></section>`;
      }).join("");
      return `<div class="scroll dr"><div class="home"><div class="carousel swiper">${pages}</div>
        <div class="dots">${devs.map((_, i) => `<i class="${i === s.idx ? "on" : ""}"></i>`).join("")}</div></div></div>`;
    },

    /* ---------- robot home ---------- */
    vac: (ctx, p) => {
      const esc = ctx.esc, svg = ctx.svg, s = S(ctx);
      const d = dev(ctx, p.i);
      const v = vac(ctx, d);
      const tab = s.tab[d.entity] || "all";
      const msg = message(ctx, d, v);
      const mode = ctx.st(ctx.e(d, "select.cleaning_mode"));
      const cg = ctx.st(ctx.e(d, "select.cleangenius"));
      const modeLabel = cg && cg.state !== "off" ? ctx.t("ui.cleangenius") : ctx.fmtState(mode, null, "cleaning_mode") || v.a.cleaning_mode;
      const busy = v.running || v.paused || v.returning;
      const stats = busy ? `<div class="stats"><span>${esc(v.a.cleaned_area ?? 0)} m&sup2;</span><span>${esc(v.a.cleaning_time ?? 0)} min</span><span>${esc(v.battery)} %</span></div>` : "";
      const bottom = v.running
        ? `<div class="act" data-a="pause">${svg("pause")}<span>${esc(ctx.t("ui.pause"))}</span></div><div class="act" data-a="dock">${svg("dock", "blue")}<span>${esc(ctx.t("ui.dock"))}</span></div>`
        : v.paused
          ? `<div class="act" data-a="resume">${svg("play", "gold")}<span>${esc(ctx.t("ui.resume"))}</span></div><div class="act" data-a="stop">${svg("stop")}<span>${esc(ctx.t("ui.stop"))}</span></div>`
          : `<div class="act" data-a="clean">${svg("play", "gold")}<span>${esc(ctx.t("ui.clean"))}</span></div><div class="act" data-a="dock">${svg("dock", "blue")}<span>${esc(ctx.t("ui.dock"))}</span></div>`;
      const tabHint = tab === "room" ? ctx.t("ui.hint_room") : tab === "zone" ? ctx.t("ui.hint_zone") : null;
      // The hub bar owns the back control, so the head keeps only the settings pill.
      return `<div class="vac scroll dr">
        <div class="vhead"><div><h1>${esc(d.name)}</h1><div class="hsub">${battery(v.battery, v.a.charging)} ${esc(v.battery ?? "--")}% <i></i> ${esc(statusText(ctx, d, v))}</div></div>
          <div class="pillbtns"><span data-a="page" data-p="vset" data-i="${d.i}">${svg("gear")}</span>${ctx.chrome.back ? "" : `<i></i><span data-a="back">${svg("close")}</span>`}</div></div>
        ${stats}
        <div class="msgrow"><div class="avatar"></div>${tabHint ? `<div class="msg">${esc(tabHint)}</div>` : msg ? `<div class="msg ${msg.red ? "red" : ""}" ${msg.list ? `data-a="sheet" data-s="notes" data-i="${d.i}"` : `data-a="page" data-p="vhist" data-i="${d.i}"`}>${esc(msg.t)} ${svg("chev")}</div>` : ""}</div>
        <div class="side"><span data-a="sheet" data-s="map" data-i="${d.i}">${svg("mapedit")}</span>${d.video ? `<span data-a="more" data-e="${esc(d.video)}">${svg("video")}</span>` : ""}<span data-a="page" data-p="vsub" data-id="pet" data-i="${d.i}">${svg("paw")}</span></div>
        ${mapHtml(ctx, d, v, tab)}
        <div class="modechip" data-a="sheet" data-s="mode" data-i="${d.i}" data-tall="1">${svg(modeIcon(mode?.state))}<span>${esc(modeLabel)}</span>${svg("chev")}</div>
        ${tab !== "all" ? `<div class="reps">${tab === "zone" ? `<span data-a="addzone"><b>+</b><small>${esc(ctx.t("ui.add"))}</small></span>` : ""}<span data-a="reps"><b>x${s.reps[d.entity] || 1}</b><small>${esc(ctx.t("ui.cycles"))}</small></span></div>` : ""}
        <div class="panel"><div class="tabs">${[["room", "ui.tab_room"], ["all", "ui.tab_all"], ["zone", "ui.tab_zone"]].map(([k, key]) => `<span class="${tab === k ? "on" : ""}" data-a="tab" data-t="${k}">${esc(ctx.t(key))}</span>`).join("")}</div>
          <div class="acts">${bottom}</div></div></div>`;
    },

    /* ---------- settings hub ---------- */
    vset: (ctx, p) => {
      const esc = ctx.esc, svg = ctx.svg;
      const d = dev(ctx, p.i);
      const a = vac(ctx, d).a;
      const consOk = CONSUMABLES.every(([k]) => !Number.isFinite(Number(a[k + "_left"])) || Number(a[k + "_left"]) > 10);
      const sched = (a.schedule || []).filter((x) => x.enabled);
      const smart = SMART.filter(([id]) => hasPage(ctx, d, id));
      const rest = REST.filter((id) => hasPage(ctx, d, id));
      const i = d.i;
      return `<div class="sub scroll dr">${nav2(ctx, ctx.t("ui.settings"))}
        <div class="card hist" data-a="page" data-p="vhist" data-i="${i}"><div class="ct">${esc(ctx.t("ui.history"))} ${svg("chev")}</div>
          <div class="big">${esc(a.cleaned_area ?? "--")}<small>m&sup2;</small></div><div class="cs">${esc(ctx.t("ui.last_clean"))}</div>
          <div class="big s">${esc(a.total_cleaned_area ?? "--")}<small>m&sup2;</small></div><div class="cs">${esc(ctx.t("ui.total_area"))}</div></div>
        <div class="two"><div class="card" data-a="page" data-p="vsched" data-i="${i}"><div class="ct">${esc(ctx.t("ui.schedule"))}</div><div class="cs">${esc(sched.length ? ctx.t("ui.schedule_active", { n: sched.length }) : ctx.t("ui.schedule_none"))}</div></div>
          <div class="card" data-a="page" data-p="vcons" data-i="${i}"><div class="ct">${esc(ctx.t("ui.consumables"))}</div><div class="cs ${consOk ? "" : "redt"}">${esc(consOk ? ctx.t("ui.cons_ok") : ctx.t("ui.cons_bad"))}</div></div></div>
        <h4 class="sec">${esc(ctx.t("ui.common_settings"))}</h4>
        <div class="grid">${HUB.filter((h) => hasPage(ctx, d, h.id)).map((h) => `<div class="tile" data-a="page" data-p="vsub" data-id="${h.id}" data-i="${i}">${svg(h.i)}<span>${esc(ctx.t(`page.${h.id}`))}</span></div>`).join("")}</div>
        <h4 class="sec">${esc(ctx.t("ui.smart_settings"))}</h4>
        <div class="list">${smart.map(([id, ic]) => `<div class="row" data-a="page" data-p="vsub" data-id="${id}" data-i="${i}"><div class="rt">${svg(ic, "li")}${esc(ctx.t(`page.${id}`))}</div>${svg("chev")}</div>`).join("")}</div>
        <div class="list">${rest.map((id) => `<div class="row" data-a="page" data-p="vsub" data-id="${id}" data-i="${i}"><div class="rt">${esc(ctx.t(`page.${id}`))}</div>${svg("chev")}</div>`).join("")}
          <div class="row" data-a="page" data-p="vinfo" data-i="${i}"><div class="rt">${esc(ctx.t("ui.device_info"))}</div>${svg("chev")}</div></div></div>`;
    },

    vsub: (ctx, p) => {
      const d = dev(ctx, p.i);
      const page = PAGES[p.id];
      if (!page) return `<div class="scroll dr"><p class="empty">${ctx.esc(p.id)}</p></div>`;
      const groups = page.g.map((g) => {
        const rows = g.r.map((r) => row(ctx, d, r)).join("");
        return rows ? `${g.h ? `<h4 class="sec">${ctx.esc(ctx.t(`group.${g.h}`))}</h4>` : ""}<div class="list">${rows}</div>` : "";
      }).join("");
      return `<div class="sub scroll dr">${nav2(ctx, ctx.t(`page.${p.id}`))}${groups || `<p class="empty">${ctx.esc(ctx.t("ui.no_settings"))}</p>`}</div>`;
    },

    vhist: (ctx, p) => {
      const esc = ctx.esc, svg = ctx.svg;
      const d = dev(ctx, p.i);
      const v = vac(ctx, d), a = v.a;
      const pics = v.cam?.attributes.cleaning_history_picture || {};
      const items = Object.entries(pics).map(([k, u]) => {
        const m = k.match(/^\d+:\s*(\d+)\/(\d+)\s+(\S+)\s*-\s*(.*)$/);
        return { date: m ? `${m[2]}/${m[1]}  ${m[3]}` : k, what: m ? m[4] : "", u };
      });
      const what = (w) => w.replace(/^([A-Za-z ]+?)\s*\((\w+)\)$/, (_, t, st) => {
        const name = ctx.t(`hist.${t}`) === `hist.${t}` ? t : ctx.t(`hist.${t}`);
        return `${name}${st === "Completed" ? "" : st === "Interrupted" ? ` · ${ctx.t("hist.interrupted")}` : ` · ${st}`}`;
      });
      return `<div class="sub scroll dr">${nav2(ctx, ctx.t("ui.history"))}
        <div class="card"><div class="big">${esc(a.total_cleaned_area ?? "--")}<small>m&sup2;</small></div><div class="cs">${esc(ctx.t("ui.total_area"))}</div>
          <div class="tri"><div><b>${esc(a.total_cleaning_time ?? "--")}</b><small>min</small><div class="cs">${esc(ctx.t("ui.duration"))}</div></div>
          <div><b>${esc(a.cleaning_count ?? "--")}</b><small>${esc(ctx.t("ui.times"))}</small><div class="cs">${esc(ctx.t("ui.cycles_count"))}</div></div></div></div>
        <div class="list">${items.map((it) => `<div class="row" data-a="sheet" data-s="img" data-u="${esc(it.u)}" data-l="${esc(it.date)}"><div class="rcol"><div class="rt">${esc(what(it.what))}</div><div class="rd">${esc(it.date)}</div></div>${svg("chev")}</div>`).join("") || `<p class="empty">${esc(ctx.t("ui.no_history"))}</p>`}</div></div>`;
    },

    vcons: (ctx, p) => {
      const esc = ctx.esc;
      const d = dev(ctx, p.i);
      const a = vac(ctx, d).a;
      const items = CONSUMABLES.map(([k, btn]) => {
        const left = a[k + "_left"], hours = a[k + "_time_left"];
        if (left == null && hours == null) return "";
        const reset = ctx.e(d, `button.reset_${btn || k}`);
        const name = ctx.t(`cons.${k}`);
        const sub = k === "sensor_dirty" || k === "wheel_dirty" ? ctx.t("ui.hours_left", { n: hours }) : ctx.t("ui.life_left", { n: hours });
        return `<div class="cons"><div class="ring" style="--p:${Number(left) || 0}"><span>${esc(left ?? "--")}%</span></div>` +
          `<div class="rcol"><div class="rt">${esc(name)}</div><div class="rd">${esc(sub)}</div></div>` +
          `${reset ? `<span class="reset" data-a="press" data-e="${reset}" data-l="${esc(ctx.t("ui.reset_confirm", { what: name }))}">${esc(ctx.t("ui.reset"))}</span>` : ""}</div>`;
      }).join("");
      const statuses = [["sensor.mop_pad", "mop_pad"], ["sensor.dust_bag_status", "dust_bag"], ["sensor.dirty_water_tank_status", "dirty_water"], ["sensor.detergent_status", "detergent"]]
        .map(([k, name]) => {
          const st = ctx.st(ctx.e(d, k));
          return st ? `<div class="row"><div class="rt">${esc(ctx.t(`comp.${name}`))}</div><div class="rv">${esc(ctx.fmtState(st, null, "status"))}</div></div>` : "";
        }).join("");
      return `<div class="sub scroll dr">${nav2(ctx, ctx.t("ui.consumables"))}<h4 class="sec">${esc(ctx.t("ui.cons_head"))}</h4><div class="list">${items}</div>` +
        `<h4 class="sec">${esc(ctx.t("ui.components"))}</h4><div class="list">${statuses}</div></div>`;
    },

    vsched: (ctx, p) => {
      const esc = ctx.esc;
      const d = dev(ctx, p.i);
      const a = vac(ctx, d).a;
      const days = ctx.t("days");
      const rows = (a.schedule || []).map((s) => {
        const list = String(s.repeats || "").split("").map((c, i) => (c === "1" ? (Array.isArray(days) ? days[i] : "") : null)).filter(Boolean).join(" ");
        return `<div class="row"><div class="rcol"><div class="rt big2">${esc(s.time)}</div>` +
          `<div class="rd">${esc(s.once ? ctx.t("ui.once") : list)} | ${esc(s.options?.cleangenius ? ctx.t("ui.cleangenius") : ctx.t("ui.custom"))}</div></div>` +
          `<span class="sw ro ${s.enabled ? "on" : ""}"><i></i></span></div>`;
      }).join("");
      return `<div class="sub scroll dr">${nav2(ctx, ctx.t("ui.schedule"))}<div class="list">${rows || `<p class="empty">${esc(ctx.t("ui.schedule_empty"))}</p>`}</div>` +
        `<p class="note">${esc(ctx.t("ui.schedule_ro"))}</p></div>`;
    },

    vinfo: (ctx, p) => {
      const esc = ctx.esc;
      const d = dev(ctx, p.i);
      const a = vac(ctx, d).a;
      const fw = ctx.st(ctx.e(d, "sensor.firmware_version"));
      const rows = [
        [ctx.t("ui.name"), d.name], [ctx.t("ui.model"), d.device?.model || "--"],
        [ctx.t("ui.timezone"), a.timezone], [ctx.t("ui.area_unit"), ctx.t("ui.area_unit_v")],
        [ctx.t("ui.firmware"), fw?.state ?? a.firmware_version], [ctx.t("ui.wifi"), a.ap?.ssid],
        [ctx.t("ui.rssi"), a.ap?.rssi != null ? `${a.ap.rssi} dBm` : null], [ctx.t("ui.ip"), a.ap?.ip],
        [ctx.t("ui.first_clean"), ctx.st(ctx.e(d, "sensor.first_cleaning_date"))?.state?.slice(0, 10)],
      ];
      return `<div class="sub scroll dr">${nav2(ctx, ctx.t("ui.device_info"))}<div class="list">` +
        rows.filter((r) => r[1] != null).map(([t, v]) => `<div class="row"><div class="rt">${esc(t)}</div><div class="rv">${esc(v)}</div></div>`).join("") +
        `</div></div>`;
    },

    /* ---------- MF10 fan ---------- */
    fan: (ctx, p) => {
      const esc = ctx.esc, svg = ctx.svg, s = S(ctx);
      const d = dev(ctx, p.i);
      const st = d.st, at = st?.attributes || {}, on = st?.state === "on";
      const f = (k) => ctx.st(ctx.e(d, k));
      const temp = f("sensor.temperatura") || f("sensor.temperature");
      const tab = s.fanTab || "in";
      const presetIcon = { auto: "fanM", night: "fanQ", natural: "osc", strong: "fanX", custom: "custom" };
      const left = ctx.e(d, "switch.lewa_lopatka"), right = ctx.e(d, "switch.prawa_lopatka"), lock = ctx.e(d, "switch.blokada_dziecka");
      const timer = f("number.wylacznik_czasowy"), filt = f("sensor.filtr_wstepny_pozostalo");
      const outside = ctx.st(d.weather);
      const head = `<div class="nav fan">${ctx.chrome.back ? "<span></span>" : `<span data-a="back">${svg("back")}</span>`}
        <div class="ftitle"><small>${esc(d.name)}</small><b>${esc(st?.state === "unavailable" ? ctx.t("ui.offline") : on ? ctx.t("ui.fan_on") : ctx.t("ui.fan_off_state"))}</b></div>
        <span data-a="page" data-p="fanset" data-i="${d.i}">${svg("dots")}</span></div>
        <div class="ftabs"><span class="${tab === "in" ? "on" : ""}" data-a="fantab" data-t="in">${esc(ctx.t("ui.fan_inside"))}</span><span class="${tab === "out" ? "on" : ""}" data-a="fantab" data-t="out">${esc(ctx.t("ui.fan_outside"))}</span></div>`;
      if (tab === "out") {
        return `<div class="fanp scroll dr">${head}<div class="fcard out">` +
          `<div class="rt">${esc(ctx.t("ui.temperature"))} <b>${esc(outside?.attributes.temperature ?? "--")}&#8451;</b></div>` +
          `<div class="rt">${esc(ctx.t("ui.humidity_short"))} <b>${esc(outside?.attributes.humidity ?? "--")}%</b></div></div>` +
          `<p class="note">${esc(ctx.t("ui.weather_note"))}</p></div>`;
      }
      const pct = Number(at.percentage) || 0;
      return `<div class="fanp scroll dr">${head}
        <div class="fhero"><div><div class="fword">${esc(tempWord(ctx, temp?.state))}</div><div class="ftemp">${esc(ctx.t("ui.temperature"))} <b>${esc(temp?.state ?? "--")}</b>&#8451;</div></div>
          <span class="fpow ${on ? "on" : ""}" data-a="fanpower">${svg("power")}</span></div>
        ${temp ? `<div class="fcard" data-a="more" data-e="${temp.entity_id}"><div class="row"><div class="rt">${svg("thermo", "li")}${esc(ctx.t("ui.temperature"))}</div>${svg("chev")}</div></div>` : ""}
        <div class="fcard"><div class="ct">${svg("custom", "li")}${esc(ctx.t("ui.mode"))} <span class="rv">${esc(ctx.t(`preset.${at.preset_mode}`) === `preset.${at.preset_mode}` ? at.preset_mode || "" : ctx.t(`preset.${at.preset_mode}`))}</span></div>
          <div class="mrow">${(at.preset_modes || []).map((m) => `<div class="mbtn round ${m === at.preset_mode ? "dark" : ""}" data-a="preset" data-v="${esc(m)}"><span>${svg(presetIcon[m] || "fanM")}</span></div>`).join("")}</div></div>
        <div class="fcard"><div class="ct">${svg("fanM", "li")}${esc(ctx.t("ui.speed"))} <b class="fbig">${on ? Math.round(pct / 10) : "--"}</b></div>
          <input type="range" data-fanpct="${d.entity}" min="1" max="10" step="1" value="${Math.max(1, Math.round(pct / 10))}">
          <div class="wetl"><span>${esc(ctx.t("ui.low"))}</span><span>${esc(ctx.t("ui.high"))}</span></div></div>
        <div class="fcard"><div class="ct">${svg("osc", "li")}${esc(ctx.t("ui.airflow"))}</div>
          <div class="mrow"><div class="mbtn round ${at.oscillating ? "dark" : ""}" data-a="osc"><span>${svg("osc")}</span><small>${esc(ctx.t("ui.oscillation"))}</small></div>
          ${left ? `<div class="mbtn round ${ctx.st(left).state === "on" ? "dark" : ""}" data-a="toggle" data-e="${left}"><span>${svg("route1")}</span><small>${esc(ctx.t("ui.blade_left"))}</small></div>` : ""}
          ${right ? `<div class="mbtn round ${ctx.st(right).state === "on" ? "dark" : ""}" data-a="toggle" data-e="${right}"><span>${svg("route1")}</span><small>${esc(ctx.t("ui.blade_right"))}</small></div>` : ""}</div></div>
        ${lock ? `<div class="fcard"><div class="row"><div class="rt">${svg("lock", "li")}${esc(ctx.t("ui.child_lock"))}</div><span class="sw ${ctx.st(lock).state === "on" ? "on" : ""}" data-a="toggle" data-e="${lock}"><i></i></span></div></div>` : ""}
        ${timer ? `<div class="fcard"><div class="row"><div class="rt">${svg("timer", "li")}${esc(ctx.t("ui.timer"))}</div>
          <div class="stepper"><span data-a="timer" data-d="-1">&minus;</span><b>${Number(timer.state) ? `${Number(timer.state)} ${esc(timer.attributes.unit_of_measurement || "h")}` : "OFF"}</b><span data-a="timer" data-d="1">+</span></div></div></div>` : ""}
        ${filt ? `<div class="fcard" data-a="page" data-p="fanset" data-i="${d.i}"><div class="row"><div class="rt">${svg("filter", "li")}${esc(ctx.t("ui.prefilter"))}</div>
          <div class="rv">${esc(ctx.t("ui.days_left", { n: filt.state }))} ${svg("chev")}</div></div></div>` : ""}</div>`;
    },

    fanset: (ctx, p) => {
      const esc = ctx.esc;
      const d = dev(ctx, p.i);
      const rows = FAN_ROWS.map((k) => row(ctx, d, { k })).join("");
      const cons = FAN_CONS.map(([k, u]) => {
        const st = ctx.st(ctx.e(d, k));
        return st ? `<div class="row"><div class="rt">${esc(rowText(ctx, k, "t"))}</div><div class="rv">${esc(st.state)} ${esc(u)}</div></div>` : "";
      }).join("");
      return `<div class="sub scroll dr">${nav2(ctx, ctx.t("ui.settings"))}<h4 class="sec">${esc(ctx.t("ui.fan_device_settings"))}</h4><div class="list">${rows}</div>` +
        `<h4 class="sec">${esc(ctx.t("ui.fan_cons"))}</h4><div class="list">${cons}</div>` +
        `<div class="list"><div class="row"><div class="rt">${esc(ctx.t("ui.product_info"))}</div><div class="rv">${esc(d.device?.model || "MF10")}</div></div></div></div>`;
    },
  },

  /* ---------- bottom sheets ---------- */
  sheets: {
    mode: (ctx, p) => {
      const esc = ctx.esc, svg = ctx.svg;
      const d = dev(ctx, p.i);
      const v = vac(ctx, d), a = v.a;
      const mode = ctx.st(ctx.e(d, "select.cleaning_mode"));
      const cg = ctx.st(ctx.e(d, "select.cleangenius"));
      const custom = !cg || cg.state === "off";
      const modes = (mode?.attributes.options || []).map((o) =>
        `<div class="mbtn ${o === mode.state ? "on" : ""}" data-a="mode" data-v="${esc(o)}" data-i="${d.i}"><span>${svg(modeIcon(o))}</span><small>${esc(ctx.fmtState(mode, o, "cleaning_mode"))}</small></div>`).join("");
      const fsList = a.fan_speed_list || [], slList = a.suction_level_list || [];
      const suction = fsList.map((fs, i) => {
        const key = slug(slList[i] || fs);
        const label = ctx.t(`suction.${key}`) !== `suction.${key}` ? ctx.t(`suction.${key}`) : ctx.t(`suction.${slug(fs)}`) !== `suction.${slug(fs)}` ? ctx.t(`suction.${slug(fs)}`) : fs;
        return `<div class="mbtn ${fs === a.fan_speed ? "on" : ""}" data-a="suction" data-fs="${esc(fs)}" data-v="${esc(key)}" data-i="${d.i}"><span>${svg(["fanQ", "fanS", "fanM", "fanX"][i] || "fanM")}</span><small>${esc(label)}</small></div>`;
      }).join("");
      const wetE = ctx.e(d, "number.wetness_level"), wet = ctx.st(wetE);
      const humidity = (h) => (ctx.t(`humidity.${h}`) === `humidity.${h}` ? h : ctx.t(`humidity.${h}`));
      const wetRow = wet && wet.state !== "unavailable"
        ? `<div class="grp"><h4>${esc(ctx.t("ui.wetness"))}</h4><div class="wet"><input type="range" data-wet="${wetE}" min="${wet.attributes.min ?? 1}" max="${wet.attributes.max ?? 32}" step="${wet.attributes.step ?? 1}" value="${esc(wet.state)}"><output>${esc(wet.state)}</output></div>` +
          `<div class="wetl"><span>${esc(ctx.t("ui.wet_low"))}</span><span>${esc(ctx.t("ui.wet_mid"))}</span><span>${esc(ctx.t("ui.wet_high"))}</span></div></div>`
        : a.mop_pad_humidity_list
          ? `<div class="grp"><h4>${esc(ctx.t("ui.wetness"))}</h4><div class="seg">${a.mop_pad_humidity_list.map((h) => `<span class="${h === a.mop_pad_humidity ? "on" : ""}">${esc(humidity(h))}</span>`).join("")}</div></div>`
          : "";
      const freq = ctx.st(ctx.e(d, "select.self_clean_frequency"));
      const freqTxt = freq && freq.state !== "unavailable"
        ? ctx.fmtState(freq, null, "self_clean_frequency")
        : a.self_clean_frequency
          ? `${ctx.fmtState(null, slug(a.self_clean_frequency), "self_clean_frequency") || a.self_clean_frequency} ${a.self_clean_area ?? ""}m²`
          : null;
      const route = ctx.st(ctx.e(d, "select.cleaning_route"));
      const routeOpts = route && route.state !== "unavailable" ? route.attributes.options : (a.cleaning_route_list || []).map(slug);
      const routeCur = route && route.state !== "unavailable" ? route.state : slug(a.cleaning_route);
      const cgOpts = cg ? (cg.attributes.options || []).filter((o) => o !== "off") : [];
      return `<div class="sh-tabs"><span class="${custom ? "" : "on"}" data-a="cg" data-v="cg" data-i="${d.i}">${esc(ctx.t("ui.cleangenius"))}</span><span class="${custom ? "on" : ""}" data-a="cg" data-v="custom" data-i="${d.i}">${esc(ctx.t("ui.custom"))}</span></div>
        ${custom
          ? `<div class="grp"><h4>${esc(ctx.t("ui.cleaning_mode_h"))}</h4><div class="mrow">${modes}</div></div>
             <div class="grp"><h4>${esc(ctx.t("ui.suction_h"))}</h4><div class="mrow">${suction}</div></div>
             ${wetRow}
             ${freqTxt ? `<div class="grp"><div class="row" data-a="page" data-p="vsub" data-id="station" data-i="${d.i}"><div class="rt">${esc(ctx.t("ui.wash_freq"))}</div><div class="rv">${esc(freqTxt)} ${svg("chev")}</div></div></div>` : ""}
             ${routeOpts.length ? `<div class="grp"><h4>${esc(ctx.t("ui.route"))}</h4><div class="mrow">${routeOpts.map((o) => `<div class="mbtn ${o === routeCur ? "on" : ""}" ${route ? `data-a="opt" data-e="${route.entity_id}" data-v="${esc(o)}"` : ""}><span>${svg(o === "quick" ? "route1" : "route2")}</span><small>${esc(ctx.t(`cleaning_route.${o}`) === `cleaning_route.${o}` ? o : ctx.t(`cleaning_route.${o}`))}</small></div>`).join("")}</div></div>` : ""}`
          : `<div class="grp"><h4>${esc(ctx.t("ui.cleangenius"))}</h4>${cgOpts.map((o) => `<div class="row opt ${o === cg.state ? "on" : ""}" data-a="pick" data-e="${cg.entity_id}" data-v="${esc(o)}"><div class="rt">${esc(ctx.fmtState(cg, o, "cleangenius"))}</div>${o === cg.state ? "✓" : ""}</div>`).join("")}
             ${ctx.e(d, "select.cleangenius_mode") && ctx.st(ctx.e(d, "select.cleangenius_mode"))?.state !== "unavailable" ? row(ctx, d, { k: "select.cleangenius_mode" }) : ""}</div>`}
        <div class="now" data-a="clean" data-i="${d.i}">${esc(ctx.t("ui.clean_now"))}</div>`;
    },

    map: (ctx, p) => {
      const esc = ctx.esc, svg = ctx.svg;
      const d = dev(ctx, p.i);
      const v = vac(ctx, d);
      const maps = v.a.maps || [];
      return `<h3>${esc(ctx.t("ui.map_edit"))}</h3>
        ${maps.map((m) => {
          const name = m.custom_name || m.name;
          const cur = m.id === v.a.selected_map_id;
          return `<div class="row" ${cur ? "" : `data-a="press" data-e="@map:${m.id}" data-i="${d.i}" data-l="${esc(ctx.t("ui.map_switch_to", { name }))}"`}><div class="rt">${esc(name)}</div><div class="rv">${esc(cur ? ctx.t("ui.map_current") : ctx.t("ui.map_select"))}</div></div>`;
        }).join("")}
        ${ctx.e(d, "switch.multi_floor_map") ? row(ctx, d, { k: "switch.multi_floor_map" }) : ""}
        <div class="row" data-a="press" data-e="@backup" data-i="${d.i}" data-l="${esc(ctx.t("ui.map_backup_confirm"))}"><div class="rt">${esc(ctx.t("ui.map_backup"))}</div>${svg("chev")}</div>
        ${ctx.e(d, "select.map_rotation") ? row(ctx, d, { k: "select.map_rotation" }) : ""}
        ${v.rooms.length ? `<h4 class="sub">${esc(ctx.t("ui.clean_sequence"))}</h4>${v.rooms.map((r) => `<div class="row"><div class="rt">${r.order ? `<b class="num">${r.order}</b>` : ""}${esc(r.name)}</div></div>`).join("")}` : ""}`;
    },

    notes: (ctx, p) => {
      const d = dev(ctx, p.i);
      const list = message(ctx, d, vac(ctx, d))?.list || [];
      return `<h3>${ctx.esc(ctx.t("ui.messages"))}</h3>` + list.map((n) => `<div class="row"><div class="rt">${ctx.esc(n)}</div></div>`).join("");
    },

    opts: (ctx, p) => {
      const esc = ctx.esc;
      const st = ctx.st(p.k);
      const title = p.rt || st?.attributes.friendly_name || "";
      return `<h3>${esc(title)}</h3>` + (st?.attributes.options || []).map((o) =>
        `<div class="row opt ${o === st.state ? "on" : ""}" data-a="pick" data-e="${esc(p.k)}" data-v="${esc(o)}"><div class="rt">${esc(ctx.fmtState(st, o, p.o || undefined))}</div>${o === st.state ? "✓" : ""}</div>`).join("");
    },

    confirm: (ctx, p) => `<h3>${ctx.esc(p.l || ctx.t("ui.confirm"))}</h3><p class="cdesc">${ctx.esc(ctx.t("ui.confirm_body"))}</p>` +
      `<div class="cbtns"><span data-a="closesheet">${ctx.esc(ctx.t("ui.cancel"))}</span>` +
      `<span class="ok" data-a="doconfirm" data-e="${ctx.esc(p.e)}" data-i="${ctx.esc(p.i ?? 0)}">${ctx.esc(ctx.t("ui.confirm"))}</span></div>`,

    img: (ctx, p) => `<h3>${ctx.esc(p.l || "")}</h3><img class="histimg" src="${ctx.esc(p.u)}" alt="">`,
  },

  /* ---------- actions ---------- */
  actions: {
    open: (ctx, d) => { const v = dev(ctx, d.i); return ctx.go(v.domain === "fan" ? "fan" : "vac", { i: v.i }); },
    page: (ctx, d) => ctx.go(d.p, { i: d.i, id: d.id }),
    "home-start": (ctx, d) => ctx.call("vacuum", "start", { entity_id: dev(ctx, d.i).entity }),
    "home-dock": (ctx, d) => ctx.call("vacuum", "return_to_base", { entity_id: dev(ctx, d.i).entity }),

    tab: (ctx, d) => { const v = dev(ctx, ctx.nav().params.i); S(ctx).tab[v.entity] = d.t; ctx.refresh(); },
    room: (ctx, d) => {
      const v = dev(ctx, ctx.nav().params.i), s = S(ctx);
      const set = new Set(s.sel[v.entity] || []);
      const id = Number(d.r);
      if (set.has(id)) set.delete(id); else set.add(id);
      s.sel[v.entity] = [...set];
      if (s.tab[v.entity] !== "room") s.tab[v.entity] = "room";
      ctx.refresh();
    },
    reps: (ctx) => { const v = dev(ctx, ctx.nav().params.i), s = S(ctx); s.reps[v.entity] = ((s.reps[v.entity] || 1) % 3) + 1; ctx.refresh(); },
    addzone: (ctx) => {
      const v = dev(ctx, ctx.nav().params.i), s = S(ctx);
      const sz = s.size[v.entity] || [800, 800];
      const z = s.zones[v.entity] || [];
      if (z.length < 3) z.push([sz[0] * 0.35, sz[1] * 0.35, sz[0] * 0.65, sz[1] * 0.65]);
      s.zones[v.entity] = z;
      ctx.refresh();
    },
    delzone: (ctx, d) => { const v = dev(ctx, ctx.nav().params.i), s = S(ctx); (s.zones[v.entity] || []).splice(Number(d.z), 1); ctx.refresh(); },

    clean: (ctx, d) => {
      const v = dev(ctx, d.i ?? ctx.nav().params.i), s = S(ctx);
      if (ctx.sheetOpen) ctx.closeSheet();
      const tab = s.tab[v.entity] || "all";
      const repeats = s.reps[v.entity] || 1;
      if (tab === "room") {
        const seg = s.sel[v.entity] || [];
        if (!seg.length) return ctx.toast(ctx.t("ui.pick_rooms"));
        return ctx.call("dreame_vacuum", "vacuum_clean_segment", { entity_id: v.entity, segments: seg, repeats });
      }
      if (tab === "zone") {
        const model = vac(ctx, v), cal = calib(model.cam), zs = s.zones[v.entity] || [];
        if (!cal) return ctx.toast(ctx.t("ui.no_calib_short"));
        if (!zs.length) return ctx.toast(ctx.t("ui.add_zone"));
        const zone = zs.map(([x0, y0, x1, y1]) => {
          const p = cal.inv(x0, y0), q = cal.inv(x1, y1);
          return [Math.round(Math.min(p[0], q[0])), Math.round(Math.min(p[1], q[1])), Math.round(Math.max(p[0], q[0])), Math.round(Math.max(p[1], q[1]))];
        });
        return ctx.call("dreame_vacuum", "vacuum_clean_zone", { entity_id: v.entity, zone, repeats });
      }
      return ctx.call("vacuum", "start", { entity_id: v.entity });
    },
    dock: (ctx) => ctx.call("vacuum", "return_to_base", { entity_id: dev(ctx, ctx.nav().params.i).entity }),
    pause: (ctx) => ctx.call("vacuum", "pause", { entity_id: dev(ctx, ctx.nav().params.i).entity }),
    stop: (ctx) => ctx.call("vacuum", "stop", { entity_id: dev(ctx, ctx.nav().params.i).entity }),
    resume: (ctx) => ctx.call("vacuum", "start", { entity_id: dev(ctx, ctx.nav().params.i).entity }),

    mode: (ctx, d) => ctx.call("select", "select_option", { entity_id: ctx.e(dev(ctx, d.i), "select.cleaning_mode"), option: d.v }),
    suction: (ctx, d) => {
      const v = dev(ctx, d.i);
      const sel = ctx.e(v, "select.suction_level");
      return sel ? ctx.call("select", "select_option", { entity_id: sel, option: d.v })
                 : ctx.call("vacuum", "set_fan_speed", { entity_id: v.entity, fan_speed: d.fs });
    },
    cg: (ctx, d) => {
      const v = dev(ctx, d.i);
      const e = ctx.e(v, "select.cleangenius");
      const cur = ctx.st(e)?.state;
      if (d.v === "custom") return cur !== "off" ? ctx.call("select", "select_option", { entity_id: e, option: "off" }) : undefined;
      return cur === "off" ? ctx.call("select", "select_option", { entity_id: e, option: "routine_cleaning" }) : undefined;
    },

    // A press always asks first: these are physical actions on the machine.
    press: (ctx, d) => ctx.sheet("confirm", { e: d.e, l: d.l, i: d.i ?? ctx.nav().params.i }),
    doconfirm: (ctx, d) => {
      ctx.closeSheet();
      const v = dev(ctx, d.i);
      const k = String(d.e);
      if (k === "@locate") return ctx.call("vacuum", "locate", { entity_id: v.entity });
      if (k.startsWith("@reset:")) return ctx.call("button", "press", { entity_id: k.slice(7) });
      if (k.startsWith("@map:")) return ctx.call("dreame_vacuum", "vacuum_select_map", { entity_id: v.entity, map_id: Number(k.slice(5)) });
      if (k === "@backup") return ctx.call("dreame_vacuum", "vacuum_backup_map", { entity_id: v.entity });
      return ctx.call("button", "press", { entity_id: k });
    },

    fanpower: (ctx) => ctx.call("fan", "toggle", { entity_id: dev(ctx, ctx.nav().params.i).entity }),
    preset: (ctx, d) => ctx.call("fan", "set_preset_mode", { entity_id: dev(ctx, ctx.nav().params.i).entity, preset_mode: d.v }),
    osc: (ctx) => {
      const v = dev(ctx, ctx.nav().params.i);
      return ctx.call("fan", "oscillate", { entity_id: v.entity, oscillating: !v.st?.attributes.oscillating });
    },
    fantab: (ctx, d) => { S(ctx).fanTab = d.t; ctx.refresh(); },
    timer: (ctx, d) => {
      const v = dev(ctx, ctx.nav().params.i);
      const e = ctx.e(v, "number.wylacznik_czasowy") || ctx.e(v, "number.timer");
      const st = ctx.st(e);
      if (!st) return;
      const step = Number(st.attributes.step) || 1;
      const val = Math.max(Number(st.attributes.min) || 0, Math.min(Number(st.attributes.max) || 12, Number(st.state) + Number(d.d) * step));
      return ctx.call("number", "set_value", { entity_id: e, value: val });
    },
  },

  /* ---------- wiring that needs the rendered DOM ---------- */
  afterRender: (ctx, root) => {
    const s = S(ctx);
    const top = ctx.nav();

    // The carousel keeps its scroll position across renders, and the dots follow the swipe.
    const car = root.querySelector(".carousel");
    if (car) {
      if (!car.dataset.bound) {
        car.dataset.bound = "1";
        car.addEventListener("scroll", () => {
          const i = Math.round(car.scrollLeft / car.clientWidth);
          if (i !== s.idx) {
            s.idx = i;
            root.querySelectorAll(".dots i").forEach((el, k) => el.classList.toggle("on", k === i));
          }
        });
      }
      car.scrollLeft = car.clientWidth * s.idx;
    }

    // Zones and room boxes are placed in map pixels, so the natural size has to be known.
    const img = root.querySelector("img.map");
    if (img && !img.dataset.bound) {
      img.dataset.bound = "1";
      const measure = () => {
        const k = img.dataset.dev;
        const size = [img.naturalWidth, img.naturalHeight];
        if (size[0] && String(s.size[k]) !== String(size)) { s.size[k] = size; ctx.refresh(); }
      };
      img.addEventListener("load", measure);
      if (img.complete) measure();
    }

    root.querySelectorAll("input[data-wet]").forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("change", () => ctx.call("number", "set_value", { entity_id: el.dataset.wet, value: Number(el.value) }));
    });
    root.querySelectorAll("input[data-fanpct]").forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("change", () => ctx.call("fan", "set_percentage", { entity_id: el.dataset.fanpct, percentage: Number(el.value) * 10 }));
    });
    root.querySelectorAll("input[data-time]").forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("change", () => ctx.call("time", "set_value", { entity_id: el.dataset.time, time: el.value + ":00" }));
    });

    if (top?.screen !== "vac") return;
    const d = dev(ctx, top.params?.i);
    if (!d) return;
    root.querySelectorAll(".zone").forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      const box = el.parentElement;
      const zi = Number(el.dataset.z);
      el.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest("[data-a]")) return;
        ev.preventDefault();
        el.setPointerCapture(ev.pointerId);
        const sz = s.size[d.entity];
        if (!sz) return;
        const r = box.getBoundingClientRect();
        const k = sz[0] / r.width;
        const z = s.zones[d.entity][zi];
        const start = [ev.clientX, ev.clientY, ...z];
        const resize = ev.target.classList.contains("handle");
        const move = (e) => {
          const dx = (e.clientX - start[0]) * k, dy = (e.clientY - start[1]) * k;
          if (resize) { z[2] = Math.max(start[2] + 20, start[4] + dx); z[3] = Math.max(start[3] + 20, start[5] + dy); }
          else { z[0] = start[2] + dx; z[1] = start[3] + dy; z[2] = start[4] + dx; z[3] = start[5] + dy; }
          el.style.left = `${(z[0] / sz[0]) * 100}%`;
          el.style.top = `${(z[1] / sz[1]) * 100}%`;
          el.style.width = `${((z[2] - z[0]) / sz[0]) * 100}%`;
          el.style.height = `${((z[3] - z[1]) / sz[1]) * 100}%`;
        };
        const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      });
    });
  },

  /* ---------- styles ---------- */
  // The hub owns ha-card, .wrap, .scroll, .toast, .veil and .sheet. Everything below is this
  // app's own, and the breakpoints key on the card width through the apphub container.
  css: () => `
.dr{font-size:clamp(13px,2.3cqw,17px)}
.ic.gold{color:var(--primary-color,#c8b898)}.ic.blue{color:var(--info-color,#a1baee)}
.ic.li{width:1.25em;height:1.25em;margin-right:.5em;vertical-align:-.3em;color:var(--secondary-text-color,#6b6d72)}
.home{padding:1em 0 1.2em}
.carousel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
.carousel::-webkit-scrollbar{display:none}
.hp{flex:0 0 100%;scroll-snap-align:start;box-sizing:border-box;padding:0 1em;cursor:pointer}
/* the photos carry their own light backdrop: a plate in every theme instead of multiply,
   which erased the dark robots on a dark page */
.prod{width:100%;aspect-ratio:1496/1120;object-fit:contain;border-radius:1.4em;display:block}
.hname{display:flex;align-items:center;justify-content:space-between;margin-top:.4em}
.hname b{font-size:1.15em;font-weight:500}
.go{background:var(--card-background-color,#fff);border-radius:2em;padding:.45em 1em;font-weight:600;display:flex;align-items:center;gap:.2em;box-shadow:0 1px 4px rgba(0,0,0,.05)}
.go .ic{width:1em;height:1em}
.hsub{display:flex;align-items:center;gap:.4em;color:var(--secondary-text-color,#6b6d72);font-size:.92em;margin-top:.25em}
.hsub i{width:1px;height:.9em;background:var(--disabled-text-color,#a3a5aa)}
.bat{width:1.7em;height:.85em;color:var(--primary-text-color,#171818)}
.hbtns{display:grid;grid-template-columns:1fr 1fr;gap:.7em;margin-top:1em}
.hbtn{background:var(--card-background-color,#fff);border-radius:1.2em;padding:1em 1.1em;min-height:5.2em;display:flex;flex-direction:column;justify-content:space-between;gap:.6em;cursor:pointer}
.hbtn span{font-size:1.05em}.hbtn small{color:var(--secondary-text-color,#6b6d72)}.hbtn big{font-size:1.6em}
.dots{display:flex;justify-content:center;gap:.35em;margin-top:1em}
.dots i{width:.4em;height:.4em;border-radius:1em;background:var(--disabled-text-color,#a3a5aa);transition:width .2s}
.dots i.on{width:1.6em;background:var(--primary-text-color,#171818)}
.vac{position:relative;padding:1.2em 1em 1em}
.vhead{display:flex;justify-content:space-between;align-items:flex-start}
.dr h1{font-size:1.5em;font-weight:400;margin:0}
.pillbtns{display:flex;align-items:center;background:color-mix(in srgb,var(--card-background-color,#fff) 53%,transparent);border:1px solid var(--card-background-color,#fff);border-radius:2em;padding:.4em .9em;gap:.8em}
.pillbtns span{cursor:pointer;display:flex}.pillbtns i{width:1px;height:1.2em;background:var(--divider-color,#ececee)}
.stats{display:flex;justify-content:space-around;background:var(--divider-color,#ececee);border-radius:2em;padding:.6em;margin-top:.8em;color:var(--secondary-text-color,#6b6d72)}
.msgrow{display:flex;align-items:center;gap:.7em;margin:1em 3.4em 0 0;min-height:3.2em}
.avatar{width:3.2em;height:3.2em;border-radius:50%;flex:none;background:radial-gradient(circle at 50% 40%,#fff 0 30%,#dcdcdc 31% 100%)}
.msg{background:var(--card-background-color,#fff);border-radius:2em;padding:.7em 1.1em;display:flex;align-items:center;gap:.4em;font-size:.95em;cursor:pointer}
.msg.red{color:var(--error-color,#db4c3b)}.msg .ic{width:1em;height:1em}
.side{position:absolute;right:1em;top:10.5em;display:flex;flex-direction:column;gap:.8em;z-index:2}
.side span{width:3.2em;height:3.2em;background:var(--card-background-color,#fff);border-radius:1em;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.mapwrap{margin:1em 3.6em .6em;display:flex;justify-content:center;min-height:12em}
.mapbox{position:relative;width:100%;max-height:28em}
.map{width:100%;height:100%;object-fit:contain;display:block}
.nomap{color:var(--disabled-text-color,#a3a5aa);align-self:center}
.rbox{position:absolute;border-radius:.3em;cursor:pointer}
.rbox.on{background:rgba(200,184,152,.12)}
.rbox b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--dr-gold-text,#a68d64);color:var(--text-primary-color,#fff);border-radius:1em;padding:0 .45em;font-size:.85em}
.zone{position:absolute;border:2px solid #5b8def;background:rgba(91,141,239,.15);touch-action:none;cursor:move}
.zone .zx{position:absolute;left:-.7em;top:-.7em;width:1.4em;height:1.4em;border-radius:50%;background:#222;color:var(--text-primary-color,#fff);text-align:center;line-height:1.3em;cursor:pointer}
.zone .handle{position:absolute;right:-.6em;bottom:-.6em;width:1.2em;height:1.2em;border-radius:50%;background:#222;cursor:nwse-resize}
.mapwarn{text-align:center;color:var(--secondary-text-color,#6b6d72);font-size:.85em;margin:-.2em 0 .6em}
.chips{display:flex;flex-wrap:wrap;gap:.5em;justify-content:center;margin:0 1em .8em}
.chips span{background:var(--card-background-color,#fff);border-radius:2em;padding:.4em .9em;cursor:pointer;border:1px solid transparent}
.chips span.on{border-color:var(--primary-color,#c8b898);background:color-mix(in srgb,var(--primary-color,#c8b898) 22%,var(--card-background-color,#fff))}
.chips b{background:var(--divider-color,#ececee);border-radius:1em;padding:0 .4em;margin-right:.35em;font-size:.85em}
.modechip{display:inline-flex;align-items:center;gap:.4em;background:var(--card-background-color,#fff);border-radius:1em;padding:.7em 1em;cursor:pointer}
.modechip .ic:first-child{color:#7aa0e6}.modechip .ic:last-child{width:1em}
.reps{position:absolute;right:1em;display:flex;flex-direction:column;gap:.8em;margin-top:-7em}
.reps span{display:flex;flex-direction:column;align-items:center;cursor:pointer}
.reps b{width:2.6em;height:2.6em;border-radius:1em;background:var(--card-background-color,#fff);display:flex;align-items:center;justify-content:center;font-weight:400}
.reps small{font-size:.75em;color:var(--secondary-text-color,#6b6d72)}
.panel{background:color-mix(in srgb,var(--card-background-color,#fff) 69%,transparent);border-radius:1.6em;padding:.6em;margin-top:.8em}
.tabs{display:flex;justify-content:space-around;padding:.7em 0 .9em;color:var(--secondary-text-color,#6b6d72)}
.tabs span{cursor:pointer;position:relative}.tabs span.on{color:var(--primary-text-color,#171818)}
.tabs span.on::after{content:"";position:absolute;left:50%;bottom:-.45em;width:1.2em;height:2px;transform:translateX(-50%);background:var(--primary-text-color,#171818)}
.acts{display:grid;grid-template-columns:1fr 1fr;gap:.6em}
.act{background:var(--card-background-color,#fff);border-radius:1.2em;height:4.2em;display:flex;align-items:center;justify-content:center;gap:.7em;font-size:1.05em;cursor:pointer}
.sheet h3{margin:.2em 0 .8em;font-weight:500;text-align:center}
.sheet h4.sub{margin:1em .2em .4em;color:var(--secondary-text-color,#6b6d72);font-weight:400}
.sh-tabs{display:flex;gap:1.6em;padding:.3em .2em 1em;color:var(--secondary-text-color,#6b6d72);font-size:1.05em}
.sh-tabs span{cursor:pointer;position:relative}.sh-tabs span.on{color:var(--primary-text-color,#171818)}
.sh-tabs span.on::after{content:"";position:absolute;left:50%;bottom:-.4em;width:1.2em;height:2px;transform:translateX(-50%);background:var(--primary-text-color,#171818)}
.grp{background:var(--card-background-color,#fff);border-radius:1.2em;padding:.9em;margin-bottom:.7em}
.grp h4{margin:0 0 .8em;font-weight:400;font-size:.95em}
.mrow{display:flex;justify-content:space-around;gap:.4em;flex-wrap:wrap}
.mbtn{display:flex;flex-direction:column;align-items:center;gap:.45em;cursor:pointer;min-width:4.2em;text-align:center}
.mbtn span{width:3.2em;height:3.2em;border-radius:50%;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#ececee);display:flex;align-items:center;justify-content:center}
.mbtn small{font-size:.78em;color:var(--secondary-text-color,#6b6d72)}
.mbtn.on span{background:color-mix(in srgb,var(--primary-color,#c8b898) 22%,var(--card-background-color,#fff));border-color:transparent;color:var(--dr-gold-text,#a68d64)}
.mbtn.on small{color:var(--dr-gold-text,#a68d64)}
.mbtn.dark span{background:#2c2c2e;color:var(--text-primary-color,#fff);border-color:#2c2c2e}
.mbtn.round span{width:3em;height:3em}
.wet{display:flex;align-items:center;gap:.8em}
.wet input,.fcard input[type=range],.row input[type=range]{flex:1;width:100%;accent-color:var(--primary-color,#c8b898)}
.wetl{display:flex;justify-content:space-between;color:var(--secondary-text-color,#6b6d72);font-size:.85em;margin-top:.3em}
.dr .seg{display:flex;background:var(--secondary-background-color,#eef0f8);border-radius:2em;margin-top:0}
.dr .seg span{flex:1;text-align:center;padding:.5em;border-radius:2em}
.dr .seg span.on{background:color-mix(in srgb,var(--primary-color,#c8b898) 22%,var(--card-background-color,#fff))}
.now{background:color-mix(in srgb,var(--primary-color,#c8b898) 22%,var(--card-background-color,#fff));color:var(--dr-gold-text,#a68d64);text-align:center;padding:1em;border-radius:2em;margin-top:.8em;cursor:pointer;font-size:1.05em}
.sub{padding:0 1em 1.2em}
.nav{display:flex;align-items:center;justify-content:space-between;padding:1em 0 .8em;position:sticky;top:0;background:var(--app-hub-surface);z-index:3}
.nav span{width:2em;cursor:pointer;display:flex}
.nav h2{margin:0;font-size:1.2em;font-weight:500;text-align:center;flex:1}
.card{background:var(--card-background-color,#fff);border-radius:1.2em;padding:1em 1.1em;margin-bottom:.7em;cursor:pointer}
.card .ct{font-size:1.05em;display:flex;justify-content:space-between;align-items:center}.card .ct .ic{width:1em}
.big{font-size:1.6em;margin-top:.4em}.big small{font-size:.55em;margin-left:.15em}.big.s{font-size:1.3em}
.cs{color:var(--secondary-text-color,#6b6d72);font-size:.88em;margin-top:.15em}.redt{color:var(--error-color,#db4c3b)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:.7em}.two .card{margin:0 0 .7em}
.tri{display:flex;gap:2em;margin-top:.8em}.tri b{font-size:1.3em;font-weight:400}
h4.sec{color:var(--secondary-text-color,#6b6d72);font-weight:400;margin:1.2em .2em .6em;font-size:.92em}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.6em}
.tile{background:var(--card-background-color,#fff);border-radius:1.1em;padding:1em .6em;min-height:5.4em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6em;text-align:center;cursor:pointer;font-size:.92em}
.tile .ic{color:var(--secondary-text-color,#6b6d72)}
.list{background:var(--card-background-color,#fff);border-radius:1.2em;overflow:hidden;margin-bottom:.7em}
.row{display:flex;align-items:center;justify-content:space-between;gap:.8em;padding:.95em 1.1em;border-bottom:1px solid var(--divider-color,#ececee);cursor:default}
.row:last-child{border-bottom:none}.row[data-a]{cursor:pointer}
.row .ic{width:1em;color:var(--disabled-text-color,#a3a5aa)}.row .ic.li{width:1.25em}
.row.col{flex-direction:column;align-items:stretch}.row.col .rt{display:flex;justify-content:space-between}
.row.dis{opacity:.45}.row.opt.on,.row.radio.on .rt{color:var(--dr-gold-text,#a68d64)}
.rcol{flex:1;min-width:0}.rt{font-size:1em}.rt.big2{font-size:1.5em}
.rd{color:var(--secondary-text-color,#6b6d72);font-size:.85em;margin-top:.3em;line-height:1.35}
.rv{color:var(--secondary-text-color,#6b6d72);display:flex;align-items:center;gap:.3em;text-align:right}
.num{background:var(--divider-color,#ececee);border-radius:1em;padding:0 .45em;margin-right:.5em;font-weight:400}
.dr .sw{width:2.8em;height:1.6em;border-radius:1em;background:var(--divider-color,#ececee);position:relative;flex:none;cursor:pointer;transition:background .15s}
.dr .sw::after{content:none}
.dr .sw i{position:absolute;left:.2em;top:.2em;width:1.2em;height:1.2em;border-radius:50%;background:var(--card-background-color,#fff);transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.dr .sw.on{background:var(--primary-color,#c8b898)}.dr .sw.on i{left:1.4em}.dr .sw.ro{cursor:default}
.sheet .sw{width:2.8em;height:1.6em;border-radius:1em;background:var(--divider-color,#ececee);position:relative;flex:none;cursor:pointer}
.sheet .sw::after{content:none}
.sheet .sw i{position:absolute;left:.2em;top:.2em;width:1.2em;height:1.2em;border-radius:50%;background:var(--card-background-color,#fff);transition:left .15s}
.sheet .sw.on{background:var(--primary-color,#c8b898)}.sheet .sw.on i{left:1.4em}
.rb{width:1.2em;height:1.2em;border-radius:50%;border:1.5px solid var(--disabled-text-color,#a3a5aa);flex:none}
.radio.on .rb{border:5px solid var(--primary-color,#c8b898)}
.cons{display:flex;align-items:center;gap:1em;padding:.9em 1.1em;border-bottom:1px solid var(--divider-color,#ececee)}
.cons:last-child{border:none}
.ring{--p:0;width:3.2em;height:3.2em;border-radius:50%;flex:none;background:conic-gradient(var(--primary-color,#c8b898) calc(var(--p)*1%),var(--divider-color,#ececee) 0);display:flex;align-items:center;justify-content:center}
.ring span{width:2.6em;height:2.6em;border-radius:50%;background:var(--card-background-color,#fff);display:flex;align-items:center;justify-content:center;font-size:.8em}
.reset{color:var(--dr-gold-text,#a68d64);cursor:pointer;padding:.3em .6em;border:1px solid color-mix(in srgb,var(--primary-color,#c8b898) 22%,var(--card-background-color,#fff));border-radius:1em;font-size:.85em}
.empty{color:var(--secondary-text-color,#6b6d72);text-align:center;font-size:.9em;padding:1em}
.dr .note{color:var(--secondary-text-color,#6b6d72);text-align:left;font-size:.9em;padding:.4em .3em;background:none;box-shadow:none;border-radius:0;font-weight:400;display:block;margin:0}
.cdesc{text-align:center;color:var(--secondary-text-color,#6b6d72)}
.cbtns{display:grid;grid-template-columns:1fr 1fr;gap:.6em;margin-top:1em}
.cbtns span{background:var(--card-background-color,#fff);text-align:center;padding:.9em;border-radius:2em;cursor:pointer}
.cbtns .ok{background:color-mix(in srgb,var(--primary-color,#c8b898) 22%,var(--card-background-color,#fff));color:var(--dr-gold-text,#a68d64)}
.histimg{width:100%;border-radius:1em;background:var(--card-background-color,#fff)}
.fanp{padding:0 1em 1.2em}
.nav.fan{background:transparent}
.ftitle{text-align:center;flex:1}.ftitle small{display:block;color:var(--secondary-text-color,#6b6d72)}.ftitle b{font-weight:500;font-size:1.15em}
.ftabs{display:flex;background:color-mix(in srgb,var(--info-color,#a1baee) 22%,var(--card-background-color,#fff));border-radius:2em;padding:.25em;margin-bottom:1em}
.ftabs span{flex:1;text-align:center;padding:.6em;border-radius:2em;color:var(--secondary-text-color,#6b6d72);cursor:pointer}
.ftabs span.on{background:var(--card-background-color,#fff);color:var(--primary-text-color,#171818)}
.fhero{display:flex;justify-content:space-between;align-items:center;padding:1.5em .4em 1.2em}
.fword{color:#3b78c4;font-size:2.2em}
.ftemp{color:var(--secondary-text-color,#6b6d72)}.ftemp b{font-size:1.8em;color:var(--primary-text-color,#171818);font-weight:400}
.fpow{width:4em;height:4em;border-radius:50%;background:var(--card-background-color,#fff);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--disabled-text-color,#a3a5aa)}
.fpow.on{color:var(--primary-text-color,#171818);box-shadow:0 2px 10px rgba(0,0,0,.08)}
.fcard{background:color-mix(in srgb,var(--card-background-color,#fff) 70%,transparent);border-radius:1.2em;padding:.9em 1em;margin-bottom:.7em}
.fcard .row{padding:.2em 0;border:none}
.fcard .ct{display:flex;align-items:center;gap:.2em;margin-bottom:.8em}
.fcard .ct .rv,.fcard .ct .fbig{margin-left:auto}
.fbig{font-size:1.6em;font-weight:400}.fcard.out{display:flex;flex-direction:column;gap:.8em}
.stepper{display:flex;align-items:center;gap:1em}
.stepper span{cursor:pointer;font-size:1.4em;color:var(--secondary-text-color,#6b6d72)}
.stepper b{font-size:1.4em;font-weight:400;min-width:3em;text-align:center}
input[type=time]{border:none;background:var(--secondary-background-color,#eef0f8);border-radius:.6em;padding:.3em .5em;font:inherit;color:inherit}
@container apphub (max-width:420px){.dr{font-size:13px}.mapwrap{margin:1em 3.2em .6em .2em}.grid{grid-template-columns:repeat(2,1fr)}}
`,
};
