/*
 * DPD app module: replaces the DPD Mobile 2.10.18 app (pl.com.dpd.mobile.app.release).
 * Screens follow the producer app: the parcel list split into "W drodze" and
 * "Dostarczone", a parcel card with the status timeline, the pickup PIN and the
 * management operations DPD allows for that parcel right now. Red #DC0032 and the
 * grey #414042 are the DPD brand colours used by the app.
 *
 * Data: the shipment_tracking DPD sensor (one per account), whose attributes carry the
 * parcels. Actions: the shipment_tracking services dpd_parcel_options, dpd_parcel_action
 * and dpd_points, called through ctx.ws("call_service", ...) so the response comes back.
 * A DPD box is opened over Bluetooth next to it in the producer app, so this module
 * shows the PIN for the box keypad instead (see not_covered in app.json).
 */

const ICONS = {
  truck: '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  home: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
  refuse: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

// shipment_tracking dpd_parcel_action names, in the order the producer app lists them.
const OPS = [
  ["redirect", "pin"],
  ["change_date", "calendar"],
  ["change_address", "home"],
  ["refuse", "refuse"],
];

// Reasons the producer app offers on its refusal screen.
const REFUSE_REASONS = ["not_ordered", "damaged", "changed_mind", "other"];

/* ---------- data ---------- */

function accountName(ctx, dev) {
  if (dev.name) return dev.name;
  const id = ctx.hass?.entities?.[dev.entity]?.device_id;
  const d = id && ctx.hass?.devices?.[id];
  return (d && (d.name_by_user || d.name)) || ctx.st(dev.entity)?.attributes?.friendly_name || dev.entity;
}

function parcels(ctx, dev) {
  const a = ctx.st(dev.entity)?.attributes || {};
  return {
    active: Array.isArray(a.w_drodze) ? a.w_drodze : [],
    delivered: Array.isArray(a.dostarczone) ? a.dostarczone : [],
  };
}

// A screen opened without a waybill (a bookmark, the render check) shows the first parcel.
function firstWaybill(ctx, dev) {
  const p = parcels(ctx, dev);
  return (p.active[0] || p.delivered[0])?.numer;
}

function findParcel(ctx, dev, waybill) {
  const p = parcels(ctx, dev);
  return p.active.find((x) => x.numer === waybill) || p.delivered.find((x) => x.numer === waybill);
}

function when(ctx, iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${ctx.fmt.ymd(d)} ${ctx.fmt.hhmm(d)}`;
}

function gps(row) {
  let g = row?.gps_doreczenia;
  if (typeof g === "string") { try { g = JSON.parse(g); } catch (e) { g = null; } }
  const lat = Number(g?.lat);
  const lon = Number(g?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function service(ctx, name, data) {
  const res = await ctx.ws("call_service", {
    domain: "shipment_tracking",
    service: name,
    service_data: data,
    return_response: true,
  });
  return res?.response ?? res;
}

function errText(ctx, e) {
  const msg = e?.message || e?.error?.message || String(e || "");
  return msg ? ctx.t("dpd.failed", { error: msg }) : ctx.t("dpd.failed_plain");
}

// Options are per parcel and cached in ctx.state, so returning to a parcel does not
// call DPD again until something changed it.
function loadOptions(ctx, waybill, force = false) {
  const store = (ctx.state.opts = ctx.state.opts || {});
  if (!force && store[waybill]) return;
  store[waybill] = { loading: true };
  service(ctx, "dpd_parcel_options", { waybill })
    .then((r) => { store[waybill] = { data: r }; })
    .catch((e) => { store[waybill] = { error: errText(ctx, e) }; })
    .finally(() => ctx.refresh());
}

/* ---------- pieces ---------- */

function statusCls(row) {
  const s = String(row?.status || "").toLowerCase();
  // "W doręczeniu" (out for delivery) is still on the way; only a finished delivery is green.
  if (/doręczon|odebran|wydan/.test(s)) return "ok";
  if (/zwrot|anul|odmow/.test(s)) return "bad";
  if (/odbioru|punkcie|automacie/.test(s)) return "ready";
  return "way";
}

function parcelCard(ctx, row, i) {
  const esc = ctx.esc;
  const sender = row.nadawca || row.adres_nadawcy || ctx.t("dpd.unknown_sender");
  return `<button class="pcard" data-a="go" data-screen="parcel" data-i="${i}" data-w="${esc(row.numer)}">` +
    `<span class="pico ${statusCls(row)}">${ctx.svg("box")}</span>` +
    `<span class="pbody"><b>${esc(sender)}</b>` +
    `<span class="pstat ${statusCls(row)}">${esc(row.status || "--")}</span>` +
    `<small>${esc(row.numer || "")}${row.aktualizacja ? ` · ${esc(when(ctx, row.aktualizacja))}` : ""}</small></span>` +
    `${ctx.svg("chev", "chev")}</button>`;
}

function timeline(ctx, row) {
  const items = Array.isArray(row.historia) ? row.historia : [];
  if (!items.length) return `<p class="fine">${ctx.esc(ctx.t("dpd.no_history"))}</p>`;
  return `<ol class="tl">${items.map((h, j) =>
    `<li class="${j === 0 ? "now" : ""}"><b>${ctx.esc(h.status || "--")}</b>` +
    `<small>${ctx.esc(when(ctx, h.data))}</small></li>`).join("")}</ol>`;
}

function pinCard(ctx, opt) {
  const esc = ctx.esc;
  if (!opt?.data) return "";
  const pin = opt.data.pin;
  if (pin?.pin) {
    return `<div class="pinc"><span class="fine">${esc(ctx.t("dpd.pin_title"))}</span>` +
      `<b class="pinv">${esc(pin.pin)}</b>` +
      (pin.expires ? `<span class="fine">${esc(ctx.t("dpd.pin_until", { d: when(ctx, pin.expires) }))}</span>` : "") +
      `<span class="fine">${esc(ctx.t("dpd.pin_hint"))}</span></div>`;
  }
  if (opt.data.pin_hidden) return ctx.ui.note(ctx.t("dpd.pin_admin"));
  return "";
}

/* ---------- screens ---------- */

function start(ctx) {
  const esc = ctx.esc;
  if (!ctx.devices.length) {
    return `<div class="scroll"><div class="pad"><h1>${esc(ctx.manifest.name)}</h1>` +
      `<p class="fine">${esc(ctx.t("dpd.no_devices"))}</p></div></div>`;
  }
  const tab = ctx.state.tab || "active";
  const blocks = ctx.devices.map((dev, i) => {
    const p = parcels(ctx, dev);
    const list = tab === "active" ? p.active : p.delivered;
    const cards = list.map((row) => parcelCard(ctx, row, i)).join("");
    const empty = `<p class="fine">${esc(ctx.t(tab === "active" ? "dpd.none_active" : "dpd.none_delivered"))}</p>`;
    return (ctx.devices.length > 1 ? `<h2>${esc(accountName(ctx, dev))}</h2>` : "") +
      `<div class="plist">${cards || empty}</div>`;
  }).join("");
  const count = (key) => ctx.devices.reduce((n, d) => n + parcels(ctx, d)[key].length, 0);
  return `<div class="scroll"><div class="dhead">${ctx.svg("truck", "big")}<div>` +
    `<b>${esc(ctx.t("dpd.title"))}</b><span>${esc(ctx.t("dpd.n_active", { n: count("active") }))}</span></div></div>` +
    `<div class="pad"><div class="tabs">` +
    `<button class="${tab === "active" ? "on" : ""}" data-a="tab" data-v="active">${esc(ctx.t("dpd.tab_active"))} (${count("active")})</button>` +
    `<button class="${tab === "delivered" ? "on" : ""}" data-a="tab" data-v="delivered">${esc(ctx.t("dpd.tab_delivered"))} (${count("delivered")})</button>` +
    `</div>${blocks}` +
    `<button class="lrow" data-a="go" data-screen="info">${ctx.svg("info")}<span>${esc(ctx.t("dpd.about"))}</span>${ctx.svg("chev", "chev")}</button>` +
    `</div></div>`;
}

function parcel(ctx, params) {
  const esc = ctx.esc;
  const i = Number(params.i || 0);
  const dev = ctx.dev(i);
  const row = dev && findParcel(ctx, dev, params.w || firstWaybill(ctx, dev));
  if (!row) {
    return `<div class="scroll">${ctx.ui.bar(ctx.t("dpd.parcel"))}<div class="pad">` +
      `<p class="fine">${esc(ctx.t("dpd.gone"))}</p></div></div>`;
  }
  const active = parcels(ctx, dev).active.some((x) => x.numer === row.numer);
  if (active) loadOptions(ctx, row.numer);
  const opt = ctx.state.opts?.[row.numer];
  let ops = "";
  if (active) {
    if (opt?.loading) ops = `<p class="fine">${esc(ctx.t("dpd.loading"))}</p>`;
    else if (opt?.error) ops = ctx.ui.note(opt.error, "warn");
    else if (opt?.data) {
      const allowed = opt.data.operations || [];
      ops = allowed.length
        ? OPS.filter(([name]) => allowed.includes(name)).map(([name, icon]) =>
          `<button class="lrow" data-a="op" data-op="${name}" data-i="${i}" data-w="${esc(row.numer)}">` +
          `${ctx.svg(icon)}<span>${esc(ctx.t(`dpd.op_${name}`))}</span>${ctx.svg("chev", "chev")}</button>`).join("")
        : `<p class="fine">${esc(ctx.t("dpd.no_ops"))}</p>`;
    }
  }
  const meta = [
    [ctx.t("dpd.waybill"), row.numer],
    [ctx.t("dpd.sender"), row.nadawca],
    [ctx.t("dpd.sender_address"), row.adres_nadawcy],
    [ctx.t("dpd.courier"), row.kurier && row.kurier !== "null" ? row.kurier : null],
    [ctx.t("dpd.part"), row.czesc_przesylki],
  ].filter(([, v]) => v).map(([k, v]) => `<div class="srow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  return `<div class="scroll">${ctx.ui.bar(row.nadawca || ctx.t("dpd.parcel"))}<div class="pad">` +
    `<div class="phero ${statusCls(row)}">${ctx.svg("box", "big")}<b>${esc(row.status || "--")}</b>` +
    `<small>${esc(when(ctx, row.aktualizacja))}</small></div>` +
    pinCard(ctx, opt) +
    (active ? `<h2>${esc(ctx.t("dpd.manage"))}</h2>${ops}` : "") +
    `<h2>${esc(ctx.t("dpd.details"))}</h2>${meta}` +
    `<h2>${esc(ctx.t("dpd.history"))}</h2>${timeline(ctx, row)}` +
    `</div></div>`;
}

function points(ctx, params) {
  const esc = ctx.esc;
  const i = Number(params.i || 0);
  const dev = ctx.dev(i);
  const w = params.w || (dev && firstWaybill(ctx, dev));
  const row = dev && findParcel(ctx, dev, w);
  const key = `pts_${w}`;
  const st = ctx.state[key];
  if (row && st === undefined) {
    const at = gps(row) || { lat: ctx.hass?.config?.latitude, lon: ctx.hass?.config?.longitude };
    ctx.state[key] = { loading: true };
    service(ctx, "dpd_points", { latitude: at.lat, longitude: at.lon, count: 10, radius_km: 3, waybill: w })
      .then((r) => { ctx.state[key] = { list: r?.points || [] }; })
      .catch((e) => { ctx.state[key] = { error: errText(ctx, e) }; })
      .finally(() => ctx.refresh());
  }
  let body = `<p class="fine">${esc(ctx.t("dpd.loading"))}</p>`;
  if (st?.error) body = ctx.ui.note(st.error, "warn");
  else if (st?.list) {
    body = st.list.length ? st.list.map((p) =>
      `<button class="ptrow" data-a="sheet" data-s="redirect" data-i="${i}" data-w="${esc(w)}" data-p="${esc(p.id)}" data-n="${esc(p.name)}" data-addr="${esc(p.address)}">` +
      `${ctx.svg("pin")}<span><b>${esc(p.name)}</b><small>${esc(p.address)}</small>` +
      (p.hint ? `<small>${esc(p.hint)}</small>` : "") +
      `<em>${p.kind === "LOCKER" ? esc(ctx.t("dpd.locker")) : esc(ctx.t("dpd.shop"))}` +
      `${p.pinpad ? ` · ${esc(ctx.t("dpd.pinpad"))}` : ""}</em></span></button>`).join("")
      : `<p class="fine">${esc(ctx.t("dpd.no_points"))}</p>`;
  }
  return `<div class="scroll">${ctx.ui.bar(ctx.t("dpd.op_redirect"))}<div class="pad">` +
    `<p class="fine">${esc(ctx.t("dpd.points_hint"))}</p>${body}</div></div>`;
}

function info(ctx) {
  const esc = ctx.esc;
  const gaps = (ctx.manifest.not_covered || []).map((x) => `<li>${esc(x)}</li>`).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("dpd.about"))}<div class="pad">` +
    `<p class="fine">${esc(ctx.t("dpd.about_text"))}</p>` +
    `<h2>${esc(ctx.t("dpd.not_covered"))}</h2><ul class="gaps">${gaps}</ul></div></div>`;
}

/* ---------- sheets ---------- */

function confirmRow(ctx, label, action, extra) {
  return `<button class="big on" data-a="${action}" ${extra}>${ctx.esc(label)}</button>`;
}

function dateSheet(ctx, params) {
  const esc = ctx.esc;
  const dates = ctx.state.opts?.[params.w]?.data?.dates || [];
  const pick = ctx.state.pickDate;
  const rows = dates.length ? dates.map((d) =>
    `<button class="srow ${d === pick ? "on" : ""}" data-a="pickdate" data-v="${esc(d)}"><span>${esc(d)}</span>` +
    `${d === pick ? ctx.svg("ok") : ""}</button>`).join("")
    : `<p class="fine">${esc(ctx.t("dpd.no_dates"))}</p>`;
  return `<div class="pad"><h2>${esc(ctx.t("dpd.op_change_date"))}</h2>${rows}` +
    (pick ? confirmRow(ctx, ctx.t("dpd.confirm_date", { d: pick }), "run",
      `data-op="change_date" data-i="${esc(params.i)}" data-w="${esc(params.w)}" data-date="${esc(pick)}"`) : "") +
    `</div>`;
}

function redirectSheet(ctx, params) {
  const esc = ctx.esc;
  return `<div class="pad"><h2>${esc(ctx.t("dpd.op_redirect"))}</h2>` +
    `<div class="tile"><b>${esc(params.n || params.p)}</b><span class="fine">${esc(params.addr || "")}</span></div>` +
    ctx.ui.note(ctx.t("dpd.real_change")) +
    confirmRow(ctx, ctx.t("dpd.confirm_redirect"), "run",
      `data-op="redirect" data-i="${esc(params.i)}" data-w="${esc(params.w)}" data-p="${esc(params.p)}"`) +
    `</div>`;
}

function addressSheet(ctx, params) {
  const esc = ctx.esc;
  const f = (ctx.state.addr = ctx.state.addr || {});
  const input = (name, label) => `<label class="srow col"><span>${esc(label)}</span>` +
    `<input data-f="${name}" value="${esc(f[name] || "")}" autocomplete="off"></label>`;
  return `<div class="pad"><h2>${esc(ctx.t("dpd.op_change_address"))}</h2>` +
    input("address", ctx.t("dpd.f_address")) + input("postal_code", ctx.t("dpd.f_postal")) +
    input("city", ctx.t("dpd.f_city")) + input("note", ctx.t("dpd.f_note")) +
    ctx.ui.note(ctx.t("dpd.real_change")) +
    confirmRow(ctx, ctx.t("dpd.confirm_address"), "run",
      `data-op="change_address" data-i="${esc(params.i)}" data-w="${esc(params.w)}"`) +
    `</div>`;
}

function refuseSheet(ctx, params) {
  const esc = ctx.esc;
  const pick = ctx.state.reason;
  const rows = REFUSE_REASONS.map((r) =>
    `<button class="srow ${r === pick ? "on" : ""}" data-a="pickreason" data-v="${r}"><span>${esc(ctx.t(`dpd.reason_${r}`))}</span>` +
    `${r === pick ? ctx.svg("ok") : ""}</button>`).join("");
  return `<div class="pad"><h2>${esc(ctx.t("dpd.op_refuse"))}</h2>${rows}` +
    ctx.ui.note(ctx.t("dpd.refuse_warn"), "warn") +
    (pick ? confirmRow(ctx, ctx.t("dpd.confirm_refuse"), "run",
      `data-op="refuse" data-i="${esc(params.i)}" data-w="${esc(params.w)}"`) : "") +
    `</div>`;
}

/* ---------- actions ---------- */

async function run(ctx, data) {
  const payload = { waybill: data.w, action: data.op };
  if (data.op === "change_date") payload.date = data.date;
  if (data.op === "redirect") payload.point_id = data.p;
  if (data.op === "change_address") {
    const f = ctx.state.addr || {};
    if (!f.address || !f.city || !f.postal_code) return ctx.toast(ctx.t("dpd.fill_address"));
    Object.assign(payload, { address: f.address, city: f.city, postal_code: f.postal_code, note: f.note || "" });
  }
  if (data.op === "refuse") payload.reason = ctx.t(`dpd.reason_${ctx.state.reason || "other"}`);
  if (ctx.config.dry_run) {
    ctx.closeSheet();
    return ctx.toast(ctx.t("dpd.dry_run", { op: ctx.t(`dpd.op_${data.op}`) }));
  }
  try {
    await service(ctx, "dpd_parcel_action", payload);
    ctx.state.pickDate = null;
    ctx.state.reason = null;
    ctx.state.addr = {};
    ctx.closeSheet();
    ctx.toast(ctx.t("dpd.done"));
    loadOptions(ctx, data.w, true);
    if (data.op === "redirect") ctx.back();
  } catch (e) {
    ctx.toast(errText(ctx, e));
  }
}

export default {
  home: "start",
  icons: ICONS,
  title: (ctx) => ctx.manifest.name,
  screens: { start, parcel, points, info },
  sheets: { date: dateSheet, redirect: redirectSheet, address: addressSheet, refuse: refuseSheet },
  actions: {
    tab: (ctx, d) => { ctx.state.tab = d.v; ctx.refresh(); },
    op: (ctx, d) => {
      if (d.op === "redirect") return ctx.go("points", { i: d.i, w: d.w });
      const sheet = { change_date: "date", change_address: "address", refuse: "refuse" }[d.op];
      return ctx.sheet(sheet, { i: d.i, w: d.w });
    },
    pickdate: (ctx, d) => { ctx.state.pickDate = d.v; ctx.refresh(); },
    pickreason: (ctx, d) => { ctx.state.reason = d.v; ctx.refresh(); },
    run,
  },
  afterRender(ctx, root) {
    root.querySelectorAll("input[data-f]").forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("input", () => {
        (ctx.state.addr = ctx.state.addr || {})[el.dataset.f] = el.value;
      });
    });
  },
  css: () => `
.dhead{display:flex;align-items:center;gap:14px;padding:18px 16px;background:var(--primary-color,#dc0032);color:#fff}
.dhead b{display:block;font-size:20px;font-weight:600}.dhead span{font-size:13px;opacity:.9}
.dhead .ic{color:#fff}
.tabs{display:flex;gap:8px;margin:4px 0 12px}
.tabs button{flex:1;padding:10px;border-radius:20px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color);font-weight:500;min-height:44px}
.tabs button.on{background:var(--primary-color,#dc0032);border-color:var(--primary-color,#dc0032);color:#fff}
.plist{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
.pcard{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:14px;border-radius:12px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color);min-height:44px}
.pico{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;background:var(--secondary-background-color,#f4f4f4)}
.pico.way{color:var(--primary-color,#dc0032)}.pico.ready{color:var(--warning-color,#f2a900)}.pico.ok{color:var(--success-color,#509e2f)}.pico.bad{color:var(--secondary-text-color)}
.pbody{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.pbody b{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pbody small{font-size:12px;color:var(--secondary-text-color);overflow-wrap:anywhere}
.pstat{font-size:13px;font-weight:500}.pstat.way{color:var(--primary-color,#dc0032)}.pstat.ok{color:var(--success-color,#509e2f)}.pstat.ready{color:var(--warning-color,#f2a900)}
.phero{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px;border-radius:14px;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#e6e6e6);margin-bottom:12px;text-align:center}
.phero b{font-size:18px;font-weight:600}.phero small{color:var(--secondary-text-color);font-size:12px}
.phero.way .ic{color:var(--primary-color,#dc0032)}.phero.ok .ic{color:var(--success-color,#509e2f)}.phero.ready .ic{color:var(--warning-color,#f2a900)}
.pinc{display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px;border-radius:14px;border:2px dashed var(--primary-color,#dc0032);margin-bottom:12px;text-align:center}
.pinv{font-size:34px;letter-spacing:6px;font-variant-numeric:tabular-nums;color:var(--primary-color,#dc0032)}
.tl{list-style:none;margin:0;padding:0 0 0 18px;border-left:2px solid var(--divider-color,#e6e6e6)}
.tl li{position:relative;padding:0 0 14px 6px;display:flex;flex-direction:column;gap:2px}
.tl li::before{content:"";position:absolute;left:-25px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--divider-color,#e6e6e6)}
.tl li.now::before{background:var(--primary-color,#dc0032)}
.tl b{font-size:14px;font-weight:500}.tl small{font-size:12px;color:var(--secondary-text-color)}
.ptrow{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:12px;margin-bottom:8px;border-radius:12px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color);min-height:44px}
.ptrow .ic{color:var(--primary-color,#dc0032)}
.ptrow span{display:flex;flex-direction:column;gap:2px;min-width:0}
.ptrow b{font-size:15px;font-weight:600}.ptrow small{font-size:12px;color:var(--secondary-text-color);overflow-wrap:anywhere}
.ptrow em{font-style:normal;font-size:12px;color:var(--primary-color,#dc0032)}
.srow.on{border-color:var(--primary-color,#dc0032)}
.tile{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:12px;border:1px solid var(--divider-color,#e6e6e6);margin-bottom:10px}
.gaps{margin:0;padding-left:18px;color:var(--secondary-text-color);font-size:13px;line-height:1.5}
@container apphub (max-width: 380px){.pinv{font-size:28px;letter-spacing:4px}.dhead{padding:14px 12px}}
`,
};
