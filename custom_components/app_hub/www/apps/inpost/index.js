/*
 * InPost app module: replaces the InPost Mobile 4.23.1 app (pl.inpost.inmobile).
 * Screens follow the producer app: parcels to collect with the pickup code and QR,
 * parcels on the way, sent parcels, the archive, the locker opening flows (collect,
 * send, return), friends and sharing, returns, parcel point search, notifications and
 * label creation. Yellow #FFC20E with dark text is the InPost brand look.
 *
 * Data: the shipment_tracking InPost sensors of one account (attributes do_odbioru,
 * w_drodze on the picked sensor, archiwum and udostepnione on its siblings). Actions:
 * the services inpost_query, inpost_action and inpost_locker (docs/INPOST_MOBILE_API.md
 * in the integration), called through ctx.ws("call_service", ...) so the response
 * comes back. Everything the producer only allows over Bluetooth, or behind a payment
 * gateway, is listed in not_covered of app.json.
 */

const ICONS = {
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  truck: '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4 1.8 4 4"/>',
  share: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8 11l8-4M8 13l8 4"/>',
  back: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  send: '<path d="M21 3L3 11l7 3 3 7z"/><path d="M10 14l11-11"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

const SIZES = ["A", "B", "C"];
const FLOWS = ["collect", "send", "return"];

/* ---------- data ---------- */

function attrs(ctx, id) { return ctx.st(id)?.attributes || {}; }

function accountName(ctx, dev) {
  if (dev.name) return dev.name;
  const id = ctx.hass?.entities?.[dev.entity]?.device_id;
  const d = id && ctx.hass?.devices?.[id];
  return (d && (d.name_by_user || d.name)) || attrs(ctx, dev.entity).friendly_name || dev.entity;
}

// The picked sensor carries ready and in-transit parcels; the archive and the shared
// lists sit on sibling sensors of the same account.
function lists(ctx, dev) {
  const own = attrs(ctx, dev.entity);
  const out = {
    ready: Array.isArray(own.do_odbioru) ? own.do_odbioru : [],
    transit: Array.isArray(own.w_drodze) ? own.w_drodze : [],
    archive: [], received: [], given: [],
  };
  // Sibling sensors of the account: by device when the registry knows it, else by the
  // entity id prefix (sensor.inpost_x_do_odbioru -> sensor.inpost_x_*).
  const base = dev.entity.replace(/_[^_]+(_[^_]+)?$/, "").replace(/_do$/, "");
  const siblings = new Set(ctx.entities(dev));
  if (siblings.size <= 1) {
    for (const id of Object.keys(ctx.hass?.states || {})) {
      if (id.startsWith(base + "_") && base.length > 8) siblings.add(id);
    }
  }
  for (const id of siblings) {
    const a = attrs(ctx, id);
    if (Array.isArray(a.archiwum)) out.archive = a.archiwum;
    if (Array.isArray(a.udostepnione)) out.received = a.udostepnione;
    if (Array.isArray(a.moje_udostepnione)) out.given = a.moje_udostepnione;
  }
  return out;
}

function findParcel(ctx, dev, number) {
  const l = lists(ctx, dev);
  for (const key of ["ready", "transit", "received", "archive", "given"]) {
    const row = l[key].find((x) => x.numer === number);
    if (row) return { row, kind: key };
  }
  return null;
}

function firstNumber(ctx, dev) {
  const l = lists(ctx, dev);
  return (l.ready[0] || l.transit[0] || l.received[0] || l.archive[0])?.numer;
}

function when(ctx, iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${ctx.fmt.ymd(d)} ${ctx.fmt.hhmm(d)}`;
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
  return msg ? ctx.t("inpost.failed", { error: msg }) : ctx.t("inpost.failed_plain");
}

// Reads are cached in ctx.state.q by key, so a screen does not call InPost on every render.
function load(ctx, key, what, params = {}, force = false) {
  const store = (ctx.state.q = ctx.state.q || {});
  if (!force && store[key]) return store[key];
  store[key] = { loading: true };
  service(ctx, "inpost_query", { what, ...params })
    .then((r) => { store[key] = { data: r?.result }; })
    .catch((e) => { store[key] = { error: errText(ctx, e) }; })
    .finally(() => ctx.refresh());
  return store[key];
}

function cached(ctx, key) { return ctx.state.q?.[key]; }

// Writes honour dry_run on the client and go through the admin services.
async function write(ctx, name, payload, okKey = "inpost.done") {
  if (ctx.config.dry_run) {
    ctx.toast(ctx.t("inpost.dry_run", { op: payload.action || `${payload.flow} ${payload.step}` }));
    return null;
  }
  try {
    const res = await service(ctx, name, payload);
    ctx.toast(ctx.t(okKey));
    return res ?? {};
  } catch (e) {
    ctx.toast(errText(ctx, e));
    return null;
  }
}

// The position of the person using the panel, taken from their Home Assistant person.
// Nothing is invented: without a position the locker cannot be opened from here.
function myPosition(ctx) {
  const uid = ctx.hass?.user?.id;
  for (const [id, s] of Object.entries(ctx.hass?.states || {})) {
    if (!id.startsWith("person.")) continue;
    const a = s.attributes || {};
    if (uid && a.user_id !== uid) continue;
    const lat = Number(a.latitude);
    const lon = Number(a.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon, acc: Number(a.gps_accuracy) || 25, name: a.friendly_name || id };
    }
  }
  return null;
}

/* ---------- pieces ---------- */

function statusCls(row) {
  const s = String(row?.status || "").toLowerCase();
  if (/odebran|dostarczon/.test(s)) return "ok";
  if (/zwr|anul|wygas|nieodebr/.test(s)) return "bad";
  if (/odbioru|gotow|czeka/.test(s)) return "ready";
  return "way";
}

function parcelCard(ctx, row, i, ready) {
  const esc = ctx.esc;
  const sender = row.nadawca || ctx.t("inpost.unknown_sender");
  const code = ready && row.kod_odbioru
    ? `<span class="pcode">${esc(row.kod_odbioru)}</span>` : "";
  const where = row.paczkomat ? ` · ${esc(row.paczkomat)}` : "";
  return `<button class="pcard" data-a="go" data-screen="parcel" data-i="${i}" data-w="${esc(row.numer)}">` +
    `<span class="pico ${statusCls(row)}">${ctx.svg("box")}</span>` +
    `<span class="pbody"><b>${esc(sender)}</b>` +
    `<span class="pstat ${statusCls(row)}">${esc(row.status || "--")}</span>` +
    `<small>${esc(row.numer || "")}${where}</small>${code}</span>${ctx.svg("chev", "chev")}</button>`;
}

function loading(ctx, c) {
  if (c?.error) return ctx.ui.note(c.error, "warn");
  if (!c || c.loading) return `<p class="fine">${ctx.esc(ctx.t("inpost.loading"))}</p>`;
  return "";
}

function field(ctx, store, name, label, extra = "") {
  const f = (ctx.state[store] = ctx.state[store] || {});
  return `<label class="srow col"><span>${ctx.esc(label)}</span>` +
    `<input data-s="${store}" data-f="${name}" value="${ctx.esc(f[name] || "")}" autocomplete="off" ${extra}></label>`;
}

function menuRow(ctx, icon, label, action, extra = "") {
  return `<button class="lrow" data-a="${action}" ${extra}>${ctx.svg(icon)}<span>${ctx.esc(label)}</span>${ctx.svg("chev", "chev")}</button>`;
}

function timeline(ctx, log) {
  const items = Array.isArray(log) ? [...log].reverse() : [];
  if (!items.length) return `<p class="fine">${ctx.esc(ctx.t("inpost.no_history"))}</p>`;
  return `<ol class="tl">${items.map((h, j) =>
    `<li class="${j === 0 ? "now" : ""}"><b>${ctx.esc(h.name || h.type || "--")}</b>` +
    `<small>${ctx.esc(when(ctx, h.date))}</small></li>`).join("")}</ol>`;
}

/* ---------- screens ---------- */

function start(ctx) {
  const esc = ctx.esc;
  if (!ctx.devices.length) {
    return `<div class="scroll"><div class="pad"><h1>${esc(ctx.manifest.name)}</h1>` +
      `<p class="fine">${esc(ctx.t("inpost.no_devices"))}</p></div></div>`;
  }
  const tab = ctx.state.tab || "ready";
  const counts = { ready: 0, transit: 0, archive: 0 };
  const blocks = ctx.devices.map((dev, i) => {
    const l = lists(ctx, dev);
    counts.ready += l.ready.length + l.received.length;
    counts.transit += l.transit.length;
    counts.archive += l.archive.length;
    let body = "";
    if (tab === "ready") {
      body = [...l.ready.map((r) => parcelCard(ctx, r, i, true)), ...l.received.map((r) => parcelCard(ctx, r, i, true))].join("");
    } else if (tab === "transit") {
      body = l.transit.map((r) => parcelCard(ctx, r, i, false)).join("");
    } else if (tab === "sent") {
      const c = load(ctx, `sent${i}`, "sent", { account: dev.account });
      body = loading(ctx, c) || ((c.data?.parcels || []).map((p) => sentCard(ctx, p, i)).join("") ||
        `<p class="fine">${esc(ctx.t("inpost.none_sent"))}</p>`);
    } else {
      body = l.archive.map((r) => parcelCard(ctx, r, i, false)).join("");
    }
    const empty = `<p class="fine">${esc(ctx.t(`inpost.none_${tab}`))}</p>`;
    return (ctx.devices.length > 1 ? `<h2>${esc(accountName(ctx, dev))}</h2>` : "") +
      `<div class="plist">${body || empty}</div>`;
  }).join("");
  const tabBtn = (id, n) => `<button class="${tab === id ? "on" : ""}" data-a="tab" data-v="${id}">${esc(ctx.t(`inpost.tab_${id}`))}${n === null ? "" : ` (${n})`}</button>`;
  return `<div class="scroll"><div class="dhead">${ctx.svg("box", "big")}<div>` +
    `<b>${esc(ctx.t("inpost.title"))}</b><span>${esc(ctx.t("inpost.n_ready", { n: counts.ready }))}</span></div></div>` +
    `<div class="pad"><div class="tabs">${tabBtn("ready", counts.ready)}${tabBtn("transit", counts.transit)}` +
    `${tabBtn("sent", null)}${tabBtn("archive", counts.archive)}</div>${blocks}` +
    menuRow(ctx, "plus", ctx.t("inpost.track_title"), "sheet", 'data-s="track"') +
    menuRow(ctx, "send", ctx.t("inpost.send_title"), "go", 'data-screen="send"') +
    menuRow(ctx, "back", ctx.t("inpost.returns_title"), "go", 'data-screen="returns"') +
    menuRow(ctx, "users", ctx.t("inpost.friends_title"), "go", 'data-screen="friends"') +
    menuRow(ctx, "pin", ctx.t("inpost.points_title"), "go", 'data-screen="points"') +
    menuRow(ctx, "bell", ctx.t("inpost.notif_title"), "go", 'data-screen="notifications"') +
    menuRow(ctx, "clock", ctx.t("inpost.about"), "go", 'data-screen="info"') +
    `</div></div>`;
}

function sentCard(ctx, p, i) {
  const esc = ctx.esc;
  return `<div class="pcard static"><span class="pico way">${ctx.svg("send")}</span><span class="pbody">` +
    `<b>${esc(p.shipmentNumber)}</b><span class="pstat way">${esc(p.status || p.shipmentType || "")}</span>` +
    `<small>${esc(ctx.t("inpost.size"))} ${esc(p.parcelSize || "--")}${p.expiryDate ? ` · ${esc(when(ctx, p.expiryDate))}` : ""}</small>` +
    (p.quickSendCode ? `<span class="pcode">${esc(p.quickSendCode)}</span>` : "") +
    `<span class="row2"><button class="mini" data-a="lockerOpen" data-flow="send" data-i="${i}" data-w="${esc(p.shipmentNumber)}">${esc(ctx.t("inpost.open_send"))}</button></span></span></div>`;
}

function parcel(ctx, params) {
  const esc = ctx.esc;
  const i = Number(params.i || 0);
  const dev = ctx.dev(i);
  const found = dev && findParcel(ctx, dev, params.w || firstNumber(ctx, dev));
  if (!found) {
    return `<div class="scroll">${ctx.ui.bar(ctx.t("inpost.parcel"))}<div class="pad">` +
      `<p class="fine">${esc(ctx.t("inpost.gone"))}</p></div></div>`;
  }
  const { row, kind } = found;
  const ready = kind === "ready" || kind === "received";
  const detail = load(ctx, `p_${row.numer}`, "parcel", { shipment_number: row.numer, account: dev.account });
  const d = detail.data || {};
  const ops = d.operations || {};
  const codeCard = ready && row.kod_odbioru
    ? `<div class="pinc"><span class="fine">${esc(ctx.t("inpost.code"))}</span><b class="pinv">${esc(row.kod_odbioru)}</b>` +
      (row.qr_url ? `<img class="qr" alt="QR" src="${esc(row.qr_url)}">` : "") +
      (row.termin_odbioru ? `<span class="fine">${esc(ctx.t("inpost.until", { d: when(ctx, row.termin_odbioru) }))}</span>` : "") +
      `</div>`
    : (ready && row.podglad ? ctx.ui.note(ctx.t("inpost.preview_only")) : "");
  const acts = [];
  if (ready && row.kod_odbioru && (ops.collect || d.mobileCollectPossible)) {
    acts.push(menuRow(ctx, "lock", ctx.t("inpost.open_collect"), "lockerOpen", `data-flow="collect" data-i="${i}" data-w="${esc(row.numer)}"`));
  }
  if (ready && (row.mozna_udostepnic || ops.canShareParcel)) {
    acts.push(menuRow(ctx, "share", ctx.t("inpost.share"), "sheet", `data-s="share" data-i="${i}" data-w="${esc(row.numer)}"`));
  }
  if (ready) {
    acts.push(menuRow(ctx, "pin", ctx.t("inpost.easy_access"), "easy", `data-w="${esc(row.numer)}"`));
  }
  if (kind === "archive" && row.numer) {
    acts.push(menuRow(ctx, "back", ctx.t("inpost.start_return"), "go", `data-screen="returns" data-w="${esc(row.numer)}"`));
  }
  if (kind === "transit" || kind === "ready") {
    acts.push(menuRow(ctx, "plus", ctx.t("inpost.untrack"), "untrack", `data-w="${esc(row.numer)}"`));
  }
  const meta = [
    [ctx.t("inpost.number"), row.numer],
    [ctx.t("inpost.sender"), row.nadawca],
    [ctx.t("inpost.locker"), row.paczkomat],
    [ctx.t("inpost.address"), row.adres],
    [ctx.t("inpost.owner"), row.od || row.wlasciciel],
    [ctx.t("inpost.shared_to"), (row.udostepniona_do || row.dla || []).join(", ")],
    [ctx.t("inpost.size"), d.parcelSize],
  ].filter(([, v]) => v).map(([k, v]) => `<div class="srow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  return `<div class="scroll">${ctx.ui.bar(row.nadawca || ctx.t("inpost.parcel"))}<div class="pad">` +
    `<div class="phero ${statusCls(row)}">${ctx.svg("box", "big")}<b>${esc(row.status || "--")}</b>` +
    `<small>${esc(row.tytul_zdarzenia || "")}</small></div>` + codeCard +
    (acts.length ? `<h2>${esc(ctx.t("inpost.manage"))}</h2>${acts.join("")}` : "") +
    `<h2>${esc(ctx.t("inpost.details"))}</h2>${meta}` +
    `<h2>${esc(ctx.t("inpost.history"))}</h2>${loading(ctx, detail) || timeline(ctx, d.eventLog)}` +
    `</div></div>`;
}

// Opening a compartment: confirm, validate+open, then closed / reopen / finish.
function locker(ctx, params) {
  const esc = ctx.esc;
  const lk = ctx.state.lk || {};
  const flow = params.flow || lk.flow || "collect";
  const pos = myPosition(ctx);
  let body = "";
  if (lk.phase === "opened") {
    const c = lk.compartment || {};
    const loc = c.location ? [c.location.side, c.location.column, c.location.row].filter(Boolean).join(" ") : "";
    body = `<div class="pinc"><span class="fine">${esc(ctx.t("inpost.compartment"))}</span>` +
      `<b class="pinv">${esc(c.name || "--")}</b>${loc ? `<span class="fine">${esc(loc)}</span>` : ""}` +
      `<span class="fine">${esc(ctx.t("inpost.opened_hint"))}</span></div>` +
      `<button class="big on" data-a="lkStep" data-step="closed">${esc(ctx.t("inpost.is_closed"))}</button>` +
      `<button class="big" data-a="lkStep" data-step="reopen">${esc(ctx.t("inpost.reopen"))}</button>` +
      `<button class="big" data-a="lkStep" data-step="status" data-expected="CLOSED">${esc(ctx.t("inpost.check_status"))}</button>` +
      `<button class="big" data-a="lkStep" data-step="${flow === "collect" ? "terminate" : "confirm"}">${esc(ctx.t(flow === "collect" ? "inpost.finish" : "inpost.confirm_flow"))}</button>`;
  } else if (lk.phase === "closed") {
    body = ctx.ui.note(ctx.t("inpost.closed_ok")) +
      `<button class="big on" data-a="lkStep" data-step="${flow === "collect" ? "terminate" : "confirm"}">${esc(ctx.t(flow === "collect" ? "inpost.finish" : "inpost.confirm_flow"))}</button>`;
  } else if (lk.phase === "done") {
    body = ctx.ui.note(ctx.t("inpost.flow_done"));
  } else {
    body = (pos
      ? `<div class="tile"><b>${esc(ctx.t("inpost.my_position"))}</b><span class="fine">${esc(pos.name)} · ${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}</span></div>`
      : ctx.ui.note(ctx.t("inpost.no_position"), "warn")) +
      ctx.ui.note(ctx.t("inpost.open_warn"), "warn") +
      (pos ? `<button class="big on" data-a="lkOpen" data-flow="${flow}" data-i="${esc(params.i || 0)}" data-w="${esc(params.w || "")}">${esc(ctx.t("inpost.open_now"))}</button>` : "");
  }
  return `<div class="scroll">${ctx.ui.bar(ctx.t(`inpost.flow_${flow}`))}<div class="pad">` +
    (lk.error ? ctx.ui.note(lk.error, "warn") : "") + body + `</div></div>`;
}

function points(ctx, params) {
  const esc = ctx.esc;
  const f = (ctx.state.psearch = ctx.state.psearch || {});
  const near = ctx.state.pnear;
  let body = "";
  if (near || f.text) {
    const key = near ? "pts_near" : `pts_${f.text}`;
    const c = cached(ctx, key);
    const at = near;
    const res = loading(ctx, c);
    body = res || ((c?.data?.points || []).map((p) => pointRow(ctx, p, params)).join("") ||
      `<p class="fine">${esc(ctx.t("inpost.no_points"))}</p>`);
    if (!c) load(ctx, key, "points", at ? { latitude: at.lat, longitude: at.lon, max_distance: 3000 } : { search: f.text, limit: 20 });
  }
  return `<div class="scroll">${ctx.ui.bar(ctx.t("inpost.points_title"))}<div class="pad">` +
    `<div class="row2"><input class="grow" data-s="psearch" data-f="text" value="${esc(f.text || "")}" placeholder="${esc(ctx.t("inpost.search_ph"))}">` +
    `<button class="mini on" data-a="psearch" data-pick="${esc(params.pick || "")}">${ctx.svg("search")}</button></div>` +
    `<button class="lrow" data-a="pnear" data-pick="${esc(params.pick || "")}">${ctx.svg("pin")}<span>${esc(ctx.t("inpost.near_home"))}</span>${ctx.svg("chev", "chev")}</button>` +
    body + `</div></div>`;
}

function pointRow(ctx, p, params) {
  const esc = ctx.esc;
  const a = p.addressDetails || {};
  const addr = [a.street, a.buildingNumber, a.city].filter(Boolean).join(" ") || p.locationDescription || "";
  const act = params.pick ? `data-a="pickpoint" data-n="${esc(p.name)}" data-pick="${esc(params.pick)}"` : "";
  return `<${params.pick ? "button" : "div"} class="ptrow" ${act}>${ctx.svg("pin")}<span><b>${esc(p.name)}</b>` +
    `<small>${esc(addr)}</small>${p.locationDescription ? `<small>${esc(p.locationDescription)}</small>` : ""}` +
    `<em>${p.location247 ? esc(ctx.t("inpost.open247")) : esc(p.openingHours || "")}${p.status ? ` · ${esc(p.status)}` : ""}</em></span></${params.pick ? "button" : "div"}>`;
}

function friends(ctx) {
  const esc = ctx.esc;
  const c = load(ctx, "friends", "friends");
  const list = c.data?.friends || [];
  const rows = list.map((fr) =>
    `<div class="pcard static"><span class="pico way">${ctx.svg("users")}</span><span class="pbody"><b>${esc(fr.name || "--")}</b></span>` +
    `<button class="mini" data-a="sheet" data-s="friend" data-mode="rename" data-u="${esc(fr.uuid)}" data-n="${esc(fr.name || "")}">${esc(ctx.t("inpost.rename"))}</button>` +
    `<button class="mini bad" data-a="sheet" data-s="friend" data-mode="remove" data-u="${esc(fr.uuid)}" data-n="${esc(fr.name || "")}">${esc(ctx.t("inpost.remove"))}</button></div>`).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("inpost.friends_title"))}<div class="pad">` +
    `<p class="fine">${esc(ctx.t("inpost.friends_hint"))}</p>${loading(ctx, c)}` +
    `<div class="plist">${rows || (c.data ? `<p class="fine">${esc(ctx.t("inpost.no_friends"))}</p>` : "")}</div>` +
    menuRow(ctx, "plus", ctx.t("inpost.friend_add"), "sheet", 'data-s="friend" data-mode="add"') +
    menuRow(ctx, "plus", ctx.t("inpost.invite_accept"), "sheet", 'data-s="friend" data-mode="accept"') +
    `</div></div>`;
}

function returns(ctx, params) {
  const esc = ctx.esc;
  const t = load(ctx, "tickets", "return_tickets");
  const r = load(ctx, "returnable", "returnable");
  const tickets = (t.data?.tickets || []).map((x) =>
    `<div class="pcard static"><span class="pico way">${ctx.svg("back")}</span><span class="pbody"><b>${esc(x.organizationName || x.rma || x.uuid)}</b>` +
    `<span class="pstat way">${esc(x.status || "")}</span><small>${esc(x.shipmentNumber || x.rma || "")}${x.expiryDate ? ` · ${esc(when(ctx, x.expiryDate))}` : ""}</small>` +
    (x.returnCode ? `<span class="pcode">${esc(x.returnCode)}</span>` : "") +
    `<span class="row2"><button class="mini" data-a="lockerOpen" data-flow="return" data-w="${esc(x.shipmentNumber || "")}" data-size="${esc(x.parcelSize || "A")}">${esc(ctx.t("inpost.open_return"))}</button></span></span></div>`).join("");
  const cands = (r.data?.parcels || []).map((x) =>
    `<button class="pcard ${params.w === x.shipmentNumber ? "sel" : ""}" data-a="sheet" data-s="return" data-w="${esc(x.shipmentNumber)}" data-o="${esc(x.organization?.uuid || "")}" data-n="${esc(x.organization?.name || x.senderName || "")}">` +
    `<span class="pico way">${ctx.svg("box")}</span><span class="pbody"><b>${esc(x.organization?.name || x.senderName || x.shipmentNumber)}</b>` +
    `<small>${esc(x.shipmentNumber)}${x.deliveredDate ? ` · ${esc(when(ctx, x.deliveredDate))}` : ""}</small></span>${ctx.svg("chev", "chev")}</button>`).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("inpost.returns_title"))}<div class="pad">` +
    `<h2>${esc(ctx.t("inpost.tickets"))}</h2>${loading(ctx, t)}<div class="plist">${tickets || (t.data ? `<p class="fine">${esc(ctx.t("inpost.no_tickets"))}</p>` : "")}</div>` +
    `<h2>${esc(ctx.t("inpost.returnable"))}</h2>${loading(ctx, r)}<div class="plist">${cands || (r.data ? `<p class="fine">${esc(ctx.t("inpost.no_returnable"))}</p>` : "")}</div>` +
    `</div></div>`;
}

function sendScreen(ctx) {
  const esc = ctx.esc;
  const f = (ctx.state.send = ctx.state.send || {});
  const size = f.size || "A";
  const sizes = SIZES.map((s) => `<button class="${s === size ? "on" : ""}" data-a="pickvalue" data-store="send" data-f="size" data-v="${s}">${s}</button>`).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("inpost.send_title"))}<div class="pad">` +
    `<p class="fine">${esc(ctx.t("inpost.send_hint"))}</p>` +
    `<h2>${esc(ctx.t("inpost.size"))}</h2><div class="tabs">${sizes}</div>` +
    `<h2>${esc(ctx.t("inpost.send_to"))}</h2>${menuRow(ctx, "pin", f.point ? ctx.t("inpost.point_is", { n: f.point }) : ctx.t("inpost.pick_point"), "go", 'data-screen="points" data-pick="send"')}` +
    field(ctx, "send", "receiver_first_name", ctx.t("inpost.f_first")) + field(ctx, "send", "receiver_last_name", ctx.t("inpost.f_last")) +
    field(ctx, "send", "receiver_email", ctx.t("inpost.f_email"), 'inputmode="email"') + field(ctx, "send", "receiver_phone", ctx.t("inpost.f_phone"), 'inputmode="tel"') +
    `<h2>${esc(ctx.t("inpost.send_from"))}</h2>` +
    field(ctx, "send", "sender_first_name", ctx.t("inpost.f_first")) + field(ctx, "send", "sender_last_name", ctx.t("inpost.f_last")) +
    field(ctx, "send", "sender_email", ctx.t("inpost.f_email"), 'inputmode="email"') +
    field(ctx, "send", "sender_street", ctx.t("inpost.f_street")) + field(ctx, "send", "sender_building", ctx.t("inpost.f_building")) +
    field(ctx, "send", "sender_post_code", ctx.t("inpost.f_post")) + field(ctx, "send", "sender_city", ctx.t("inpost.f_city")) +
    ctx.ui.note(ctx.t("inpost.label_warn"), "warn") +
    `<button class="big on" data-a="sendnow">${esc(ctx.t("inpost.create_label"))}</button>` +
    (ctx.state.sendResult ? ctx.ui.note(ctx.t("inpost.label_done", { n: ctx.state.sendResult })) : "") +
    `</div></div>`;
}

function notifications(ctx) {
  const esc = ctx.esc;
  const c = load(ctx, "notif", "notifications");
  const raw = c.data;
  const list = Array.isArray(raw) ? raw : (raw?.notifications || []);
  const rows = list.map((n) =>
    `<div class="pcard static ${n.read ? "readn" : ""}"><span class="pico way">${ctx.svg("bell")}</span><span class="pbody"><b>${esc(n.title || n.type || "--")}</b>` +
    `<small>${esc(n.content || "")}</small><small>${esc(when(ctx, n.date))}</small></span>` +
    (n.read ? "" : `<button class="mini" data-a="markread" data-id="${esc(n.id)}">${esc(ctx.t("inpost.mark_read"))}</button>`) + `</div>`).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("inpost.notif_title"))}<div class="pad">${loading(ctx, c)}` +
    `<div class="plist">${rows || (c.data ? `<p class="fine">${esc(ctx.t("inpost.no_notif"))}</p>` : "")}</div>` +
    (list.some((n) => !n.read) ? `<button class="big" data-a="markall">${esc(ctx.t("inpost.mark_all"))}</button>` : "") +
    `</div></div>`;
}

function info(ctx) {
  const esc = ctx.esc;
  const gaps = (ctx.manifest.not_covered || []).map((x) => `<li>${esc(x)}</li>`).join("");
  return `<div class="scroll">${ctx.ui.bar(ctx.t("inpost.about"))}<div class="pad">` +
    `<p class="fine">${esc(ctx.t("inpost.about_text"))}</p>` +
    `<h2>${esc(ctx.t("inpost.not_covered"))}</h2><ul class="gaps">${gaps}</ul></div></div>`;
}

/* ---------- sheets ---------- */

function confirmBtn(ctx, label, action, extra = "") {
  return `<button class="big on" data-a="${action}" ${extra}>${ctx.esc(label)}</button>`;
}

function trackSheet(ctx) {
  const esc = ctx.esc;
  const kind = ctx.state.trackKind || "TRACKED";
  return `<div class="pad"><h2>${esc(ctx.t("inpost.track_title"))}</h2>` +
    field(ctx, "track", "number", ctx.t("inpost.track_number")) +
    `<div class="tabs"><button class="${kind === "TRACKED" ? "on" : ""}" data-a="pickkind" data-v="TRACKED">${esc(ctx.t("inpost.kind_received"))}</button>` +
    `<button class="${kind === "SENT" ? "on" : ""}" data-a="pickkind" data-v="SENT">${esc(ctx.t("inpost.kind_sent"))}</button></div>` +
    confirmBtn(ctx, ctx.t("inpost.track_go"), "tracknow") + `</div>`;
}

function shareSheet(ctx, params) {
  const esc = ctx.esc;
  const c = load(ctx, `pf_${params.w}`, "parcel_friends", { shipment_number: params.w });
  const pick = (ctx.state.shareTo = ctx.state.shareTo || []);
  const list = c.data?.friends || [];
  const rows = list.map((fr) => `<button class="srow ${pick.includes(fr.uuid) ? "on" : ""}" data-a="pickfriend" data-v="${esc(fr.uuid)}">` +
    `<span>${esc(fr.name)}</span>${pick.includes(fr.uuid) ? ctx.svg("ok") : ""}</button>`).join("");
  return `<div class="pad"><h2>${esc(ctx.t("inpost.share"))}</h2>${loading(ctx, c)}` +
    (rows || (c.data ? `<p class="fine">${esc(ctx.t("inpost.no_friends"))}</p>` : "")) +
    (pick.length ? confirmBtn(ctx, ctx.t("inpost.share_go"), "sharenow", `data-w="${esc(params.w)}"`) : "") + `</div>`;
}

function friendSheet(ctx, params) {
  const esc = ctx.esc;
  const mode = params.mode || "add";
  let inner = "";
  if (mode === "add") {
    inner = field(ctx, "friend", "name", ctx.t("inpost.f_name")) + field(ctx, "friend", "phone", ctx.t("inpost.f_phone"), 'inputmode="tel"') +
      confirmBtn(ctx, ctx.t("inpost.friend_add"), "friendnow", 'data-mode="add"');
  } else if (mode === "accept") {
    inner = field(ctx, "friend", "code", ctx.t("inpost.f_code")) + field(ctx, "friend", "name", ctx.t("inpost.f_name")) +
      confirmBtn(ctx, ctx.t("inpost.invite_accept"), "friendnow", 'data-mode="accept"');
  } else if (mode === "rename") {
    inner = field(ctx, "friend", "name", ctx.t("inpost.f_name")) +
      confirmBtn(ctx, ctx.t("inpost.rename"), "friendnow", `data-mode="rename" data-u="${esc(params.u)}"`);
  } else {
    inner = ctx.ui.note(ctx.t("inpost.remove_warn", { n: params.n || "" }), "warn") +
      confirmBtn(ctx, ctx.t("inpost.remove"), "friendnow", `data-mode="remove" data-u="${esc(params.u)}"`);
  }
  return `<div class="pad"><h2>${esc(ctx.t(`inpost.friend_${mode}`))}</h2>${inner}</div>`;
}

function returnSheet(ctx, params) {
  const esc = ctx.esc;
  const reasons = load(ctx, `rr_${params.o}`, "return_reasons", { uuid: params.o });
  const f = (ctx.state.ret = ctx.state.ret || {});
  const list = reasons.data?.returnReasons || [];
  const rows = list.map((r) => `<button class="srow ${f.reason === r.uuid ? "on" : ""}" data-a="pickvalue" data-store="ret" data-f="reason" data-v="${esc(r.uuid)}"><span>${esc(r.name)}</span>${f.reason === r.uuid ? ctx.svg("ok") : ""}</button>`).join("");
  const size = f.size || "A";
  const sizes = SIZES.map((s) => `<button class="${s === size ? "on" : ""}" data-a="pickvalue" data-store="ret" data-f="size" data-v="${s}">${s}</button>`).join("");
  return `<div class="pad"><h2>${esc(ctx.t("inpost.return_title", { n: params.n || "" }))}</h2>${loading(ctx, reasons)}${rows}` +
    `<div class="tabs">${sizes}</div>` +
    field(ctx, "ret", "sender_name", ctx.t("inpost.f_name")) + field(ctx, "ret", "sender_email", ctx.t("inpost.f_email"), 'inputmode="email"') +
    field(ctx, "ret", "description", ctx.t("inpost.f_desc")) +
    ctx.ui.note(ctx.t("inpost.label_warn"), "warn") +
    (f.reason ? confirmBtn(ctx, ctx.t("inpost.return_go"), "returnnow", `data-w="${esc(params.w)}" data-o="${esc(params.o)}"`) : "") + `</div>`;
}

function labelSheet(ctx) {
  return `<div class="pad"><h2>${ctx.esc(ctx.t("inpost.create_label"))}</h2>${ctx.ui.note(ctx.t("inpost.label_warn"), "warn")}` +
    confirmBtn(ctx, ctx.t("inpost.create_label"), "sendnow") + `</div>`;
}

/* ---------- actions ---------- */

async function reloadKeys(ctx, ...keys) {
  keys.forEach((k) => { if (ctx.state.q) delete ctx.state.q[k]; });
  ctx.refresh();
}

async function lockerStep(ctx, step, extra = {}) {
  const lk = ctx.state.lk || {};
  const res = await write(ctx, "inpost_locker", {
    flow: lk.flow, step, session: lk.session, account: lk.account, confirm: true, ...extra,
  });
  if (!res) return;
  const ans = res.answer || {};
  if (step === "closed") ctx.state.lk = { ...lk, phase: "closed", error: null };
  else if (step === "terminate" || step === "confirm") ctx.state.lk = { ...lk, phase: "done", error: null };
  else if (step === "reopen") ctx.state.lk = { ...lk, phase: "opened", compartment: ans.compartment || lk.compartment, error: null };
  else if (step === "status") ctx.toast(ctx.t("inpost.status_is", { s: ans.status || "--" }));
  ctx.refresh();
}

export default {
  home: "start",
  icons: ICONS,
  title: (ctx) => ctx.manifest.name,
  screens: { start, parcel, locker, points, friends, returns, send: sendScreen, notifications, info },
  sheets: { track: trackSheet, share: shareSheet, friend: friendSheet, return: returnSheet, label: labelSheet },
  actions: {
    tab: (ctx, d) => { ctx.state.tab = d.v; ctx.refresh(); },
    pickkind: (ctx, d) => { ctx.state.trackKind = d.v; ctx.refresh(); },
    pickvalue: (ctx, d) => { (ctx.state[d.store] = ctx.state[d.store] || {})[d.f] = d.v; ctx.refresh(); },
    pickfriend: (ctx, d) => {
      const pick = (ctx.state.shareTo = ctx.state.shareTo || []);
      const at = pick.indexOf(d.v);
      if (at >= 0) pick.splice(at, 1); else pick.push(d.v);
      ctx.refresh();
    },
    psearch: (ctx, d) => { ctx.state.pnear = null; if (ctx.state.q) delete ctx.state.q[`pts_${ctx.state.psearch?.text}`]; ctx.refresh(); },
    pnear: (ctx) => {
      ctx.state.pnear = { lat: ctx.hass?.config?.latitude, lon: ctx.hass?.config?.longitude };
      if (ctx.state.q) delete ctx.state.q.pts_near;
      ctx.refresh();
    },
    pickpoint: (ctx, d) => {
      if (d.pick === "send") (ctx.state.send = ctx.state.send || {}).point = d.n;
      ctx.back();
    },
    lockerOpen: (ctx, d) => {
      ctx.state.lk = { flow: d.flow, phase: "idle", shipment: d.w, size: d.size, account: ctx.dev(Number(d.i || 0))?.account };
      ctx.go("locker", { flow: d.flow, w: d.w, i: d.i || 0 });
    },
    lkOpen: async (ctx, d) => {
      const pos = myPosition(ctx);
      if (!pos) return ctx.toast(ctx.t("inpost.no_position"));
      const lk = ctx.state.lk || {};
      const payload = {
        flow: d.flow, step: "open", confirm: true, account: lk.account,
        latitude: pos.lat, longitude: pos.lon, accuracy: pos.acc,
      };
      if (d.flow === "collect") payload.shipment_number = d.w;
      if (d.flow === "return") { payload.shipment_number = d.w; payload.parcel_size = lk.size || "A"; }
      if (d.flow === "send") {
        payload.shipment_number = d.w;
        const sent = (cached(ctx, `sent${d.i || 0}`)?.data?.parcels || []).find((p) => p.shipmentNumber === d.w);
        payload.quick_send_code = sent?.quickSendCode;
        payload.box_machine = ctx.state.send?.point;
        if (!payload.box_machine) return ctx.toast(ctx.t("inpost.pick_point_first"));
      }
      const res = await write(ctx, "inpost_locker", payload, "inpost.opened");
      if (!res) { ctx.state.lk = { ...lk, error: null }; return ctx.refresh(); }
      ctx.state.lk = { ...lk, flow: d.flow, phase: "opened", session: res.session, compartment: res.answer?.compartment, error: null };
      ctx.refresh();
    },
    lkStep: (ctx, d) => lockerStep(ctx, d.step, d.expected ? { expected: d.expected } : {}),
    easy: async (ctx, d) => {
      const res = await write(ctx, "inpost_action", { action: "easy_access", shipment_number: d.w });
      if (res) reloadKeys(ctx, `p_${d.w}`);
    },
    untrack: async (ctx, d) => {
      const res = await write(ctx, "inpost_action", { action: "untrack", shipment_number: d.w });
      if (res) ctx.back();
    },
    tracknow: async (ctx) => {
      const f = ctx.state.track || {};
      if (!f.number) return ctx.toast(ctx.t("inpost.fill_fields"));
      const res = await write(ctx, "inpost_action", { action: "track", shipment_number: f.number.trim(), parcel_type: ctx.state.trackKind || "TRACKED" });
      if (res) { ctx.state.track = {}; ctx.closeSheet(); }
    },
    sharenow: async (ctx, d) => {
      const res = await write(ctx, "inpost_action", { action: "share", shipment_numbers: [d.w], friend_uuids: ctx.state.shareTo || [] });
      if (res) { ctx.state.shareTo = []; ctx.closeSheet(); }
    },
    friendnow: async (ctx, d) => {
      const f = ctx.state.friend || {};
      let payload;
      if (d.mode === "add") { if (!f.name || !f.phone) return ctx.toast(ctx.t("inpost.fill_fields")); payload = { action: "friend_invite", name: f.name, phone: f.phone }; }
      else if (d.mode === "accept") { if (!f.code || !f.name) return ctx.toast(ctx.t("inpost.fill_fields")); payload = { action: "invitation_accept", invitation_code: f.code, name: f.name }; }
      else if (d.mode === "rename") { if (!f.name) return ctx.toast(ctx.t("inpost.fill_fields")); payload = { action: "friend_rename", uuid: d.u, name: f.name }; }
      else payload = { action: "friend_remove", uuid: d.u };
      const res = await write(ctx, "inpost_action", payload);
      if (res) { ctx.state.friend = {}; ctx.closeSheet(); reloadKeys(ctx, "friends"); }
    },
    returnnow: async (ctx, d) => {
      const f = ctx.state.ret || {};
      if (!f.reason || !f.sender_name || !f.sender_email) return ctx.toast(ctx.t("inpost.fill_fields"));
      const res = await write(ctx, "inpost_action", {
        action: "return_parcel", shipment_number: d.w, organization_uuid: d.o, reason_uuid: f.reason,
        parcel_size: f.size || "A", sender_name: f.sender_name, sender_email: f.sender_email,
        description: f.description || "", confirm: true,
      });
      if (res) { ctx.state.ret = {}; ctx.closeSheet(); reloadKeys(ctx, "tickets", "returnable"); }
    },
    sendnow: async (ctx) => {
      const f = ctx.state.send || {};
      const need = ["receiver_first_name", "receiver_last_name", "receiver_email", "receiver_phone", "sender_first_name",
        "sender_last_name", "sender_email", "sender_street", "sender_building", "sender_post_code", "sender_city"];
      if (!f.point || need.some((k) => !f[k])) return ctx.toast(ctx.t("inpost.fill_fields"));
      const payload = { action: "send_parcel", parcel_size: f.size || "A", delivery_point: f.point, confirm: true };
      need.forEach((k) => { payload[k] = f[k]; });
      const res = await write(ctx, "inpost_action", payload);
      if (res) { ctx.state.sendResult = res.result?.shipmentNumber || "ok"; reloadKeys(ctx, "sent0"); }
    },
    markread: async (ctx, d) => {
      const res = await write(ctx, "inpost_action", { action: "notifications_read", notification_ids: [d.id] });
      if (res) reloadKeys(ctx, "notif");
    },
    markall: async (ctx) => {
      const res = await write(ctx, "inpost_action", { action: "notifications_read_all", date: new Date().toISOString() });
      if (res) reloadKeys(ctx, "notif");
    },
  },
  afterRender(ctx, root) {
    root.querySelectorAll("input[data-f]").forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("input", () => {
        const store = el.dataset.s || "send";
        (ctx.state[store] = ctx.state[store] || {})[el.dataset.f] = el.value;
      });
    });
  },
  css: () => `
.dhead{display:flex;align-items:center;gap:14px;padding:18px 16px;background:var(--primary-color,#ffc20e);color:var(--text-primary-color,#1f1f1f)}
.dhead b{display:block;font-size:20px;font-weight:600}.dhead span{font-size:13px;opacity:.85}
.dhead .ic{color:var(--text-primary-color,#1f1f1f)}
.tabs{display:flex;gap:8px;margin:4px 0 12px;flex-wrap:wrap}
.tabs button{flex:1;padding:10px;border-radius:20px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color);font-weight:500;min-height:44px}
.tabs button.on{background:var(--primary-color,#ffc20e);border-color:var(--primary-color,#ffc20e);color:var(--text-primary-color,#1f1f1f)}
.plist{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
.pcard{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:14px;border-radius:12px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color);min-height:44px}
.pcard.sel,.pcard.on{border-color:var(--primary-color,#ffc20e)}.pcard.readn{opacity:.6}
.pico{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;background:var(--secondary-background-color,#f5f5f5)}
.pico.way{color:var(--primary-text-color)}.pico.ready{color:var(--warning-color,#f2a900)}.pico.ok{color:var(--success-color,#2e8b57)}.pico.bad{color:var(--secondary-text-color)}
.pbody{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.pbody b{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pbody small{font-size:12px;color:var(--secondary-text-color);overflow-wrap:anywhere}
.pstat{font-size:13px;font-weight:500}.pstat.ok{color:var(--success-color,#2e8b57)}.pstat.ready{color:var(--warning-color,#f2a900)}.pstat.bad{color:var(--error-color,#d22b2b)}
.pcode{font-size:22px;font-weight:700;letter-spacing:3px;font-variant-numeric:tabular-nums}
.phero{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px;border-radius:14px;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#e6e6e6);margin-bottom:12px;text-align:center}
.phero b{font-size:18px;font-weight:600}.phero small{color:var(--secondary-text-color);font-size:12px}
.phero.ready .ic{color:var(--warning-color,#f2a900)}.phero.ok .ic{color:var(--success-color,#2e8b57)}
.pinc{display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px;border-radius:14px;border:2px solid var(--primary-color,#ffc20e);margin-bottom:12px;text-align:center}
.pinv{font-size:34px;letter-spacing:6px;font-variant-numeric:tabular-nums}
.qr{width:168px;height:168px;image-rendering:pixelated;background:#fff;padding:6px;border-radius:8px}
.tl{list-style:none;margin:0;padding:0 0 0 18px;border-left:2px solid var(--divider-color,#e6e6e6)}
.tl li{position:relative;padding:0 0 14px 6px;display:flex;flex-direction:column;gap:2px}
.tl li::before{content:"";position:absolute;left:-25px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--divider-color,#e6e6e6)}
.tl li.now::before{background:var(--primary-color,#ffc20e)}
.tl b{font-size:14px;font-weight:500}.tl small{font-size:12px;color:var(--secondary-text-color)}
.ptrow{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:12px;margin-bottom:8px;border-radius:12px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color);min-height:44px}
.ptrow span{display:flex;flex-direction:column;gap:2px;min-width:0}
.ptrow b{font-size:15px;font-weight:600}.ptrow small{font-size:12px;color:var(--secondary-text-color);overflow-wrap:anywhere}
.ptrow em{font-style:normal;font-size:12px;color:var(--secondary-text-color)}
.row2{display:flex;gap:8px;align-items:center}.grow{flex:1;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color)}
.mini{padding:8px 12px;border-radius:16px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color);min-height:44px;min-width:44px}
.mini.on{background:var(--primary-color,#ffc20e);border-color:var(--primary-color,#ffc20e);color:var(--text-primary-color,#1f1f1f)}.mini.bad{color:var(--error-color,#d22b2b)}
.big{display:block;width:100%;box-sizing:border-box;margin:8px 0 0;padding:12px 16px;min-height:48px;border-radius:24px;border:1px solid var(--divider-color,#e6e6e6);background:var(--card-background-color,#fff);color:var(--primary-text-color);font:inherit;font-weight:600;cursor:pointer}
.big.on{background:var(--primary-color,#ffc20e);border-color:var(--primary-color,#ffc20e);color:var(--text-primary-color,#1f1f1f)}
.srow.on{border-color:var(--primary-color,#ffc20e)}
.tile{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:12px;border:1px solid var(--divider-color,#e6e6e6);margin-bottom:10px}
.gaps{margin:0;padding-left:18px;color:var(--secondary-text-color);font-size:13px;line-height:1.5}
@container apphub (max-width: 380px){.pinv{font-size:28px;letter-spacing:4px}.dhead{padding:14px 12px}.qr{width:140px;height:140px}}
`,
};
