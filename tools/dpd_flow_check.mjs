// Flow check for the App Hub DPD module with mocked shipment_tracking service responses.
// node tools/dpd_flow_check.mjs "$PWD"   (from the repo root)
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";
const root = new URL(`file://${argv[2]}/custom_components/app_hub/www/`);
const core = await import(new URL("core/index.js", root));
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const manifest = read("apps/dpd/app.json");
const fixture = read("apps/dpd/fixture.json");
const locales = { pl: read("apps/dpd/locales/pl.json"), en: read("apps/dpd/locales/en.json") };
const mod = (await import(new URL("apps/dpd/index.js", root))).default;
const hass = { states: fixture.states, entities: fixture.entities, devices: fixture.devices, config: { latitude: 52.2, longitude: 21.0 } };
const devices = core.normalizeDevices(fixture.card_config.devices, manifest);
const i18n = new core.I18n(locales, "pl", "pl");
const t = (k, v) => i18n.t(k, v);
const svg = core.makeSvg(mod.icons || {});
const chrome = { back: true, kiosk: false };
const W = fixture.states[Object.keys(fixture.states)[0]].attributes.w_drodze[0].numer;
const ws = [];
let failNext = false;
const responses = {
  dpd_parcel_options: { waybill: W, operations: ["change_date", "redirect", "change_address", "refuse"], dates: ["2026-11-16", "2026-11-17"], redirect: { point_types: [], services: [] }, pin: { pin: "482913", expires: "2026-11-20T23:59:00Z" }, pin_hidden: false },
  dpd_points: { points: [{ id: "PL81900", name: "Automat DPD Pickup", kind: "LOCKER", address: "Testowa 19, 00001, Warszawa", hint: "Przy sklepie", pinpad: true, send: true }, { id: "PL10001", name: "Kiosk Demo", kind: "SHOP", address: "ul. Demo 1, 00-001, Warszawa", hint: null, pinpad: false }] },
  dpd_parcel_action: { done: true },
};
const toasts = [];
let sheetState = null; let screen = null; let backs = 0;
const config = { dry_run: false };
const ctx = {
  chrome, hass, config, manifest, devices, state: {},
  dev: (i) => devices[i], st: (id) => hass.states[id],
  ws: async (type, data) => {
    ws.push({ type, ...data });
    if (failNext) { failNext = false; throw new Error("HTTP 400 PACKAGE_IS_NOT_MANAGEABLE"); }
    return { response: responses[data.service] };
  },
  go: (s, p) => { screen = [s, p]; }, back: () => { backs++; },
  sheet: (n, p) => { sheetState = [n, p]; }, closeSheet: () => { sheetState = null; },
  refresh: () => {}, toast: (x) => toasts.push(x),
  t, svg, esc: core.esc, fmt: core.fmt, ui: core.makeUi(svg, t, chrome), img: (n) => n,
};
let bad = 0;
const flush = () => new Promise((r) => setTimeout(r, 0));
function expect(label, html, ...needles) {
  const miss = needles.filter((n) => !html.includes(n));
  const raw = /dpd\.[a-z_]+/.exec(html);
  if (miss.length || /undefined|NaN/.test(html) || raw) { bad++; console.log(`FAIL ${label}: missing ${miss.join(" | ")} ${raw ? "raw " + raw[0] : ""}`); }
  else console.log(`ok   ${label}`);
}

expect("start lists both active parcels", mod.screens.start(ctx), "Sklep Demo", "W doreczeniu", "W drodze (2)", "Dostarczone (2)");
mod.actions.tab(ctx, { v: "delivered" });
expect("delivered tab", mod.screens.start(ctx), "Odebrana w punkcie", "Allegro Demo");
mod.screens.parcel(ctx, { i: 0, w: W }); await flush(); await flush();
expect("parcel with options", mod.screens.parcel(ctx, { i: 0, w: W }), "482913", "Zmień termin doręczenia", "Przekieruj do punktu Pickup", "Odmów przyjęcia", "Przyjeta w oddziale", "Jan K.");
mod.actions.op(ctx, { op: "change_date", i: "0", w: W });
expect("op opens date sheet", JSON.stringify(sheetState), '"date"');
mod.actions.pickdate(ctx, { v: "2026-11-17" });
expect("date sheet confirm", mod.sheets.date(ctx, { i: "0", w: W }), "2026-11-16", "Zmień termin na 2026-11-17");
await mod.actions.run(ctx, { op: "change_date", i: "0", w: W, date: "2026-11-17" }); await flush();
const last = ws.filter((c) => c.service === "dpd_parcel_action").pop();
expect("change_date call", JSON.stringify(last), '"action":"change_date"', '"date":"2026-11-17"', '"return_response":true', `"waybill":"${W}"`);
expect("toast done", toasts.join("|"), "Gotowe");
mod.actions.op(ctx, { op: "redirect", i: "0", w: W });
expect("redirect goes to points", JSON.stringify(screen), '"points"');
mod.screens.points(ctx, { i: 0, w: W }); await flush(); await flush();
const ptsCall = ws.filter((c) => c.service === "dpd_points").pop();
expect("points searched at delivery GPS", JSON.stringify(ptsCall), '"latitude":52.2297', '"longitude":21.0122');
expect("points list", mod.screens.points(ctx, { i: 0, w: W }), "Automat DPD Pickup", "klawiatura PIN", "Kiosk Demo");
expect("redirect sheet", mod.sheets.redirect(ctx, { i: "0", w: W, p: "PL81900", n: "Automat DPD Pickup", addr: "Warszawa" }), "Przekieruj paczkę tutaj", "prawdziwą przesyłkę");
await mod.actions.run(ctx, { op: "redirect", i: "0", w: W, p: "PL81900" }); await flush();
expect("redirect call and back", JSON.stringify(ws.filter((c) => c.service === "dpd_parcel_action").pop()) + ` backs=${backs}`, '"point_id":"PL81900"', "backs=1");
ctx.state.addr = { address: "Testowa 19" };
await mod.actions.run(ctx, { op: "change_address", i: "0", w: W });
expect("address needs all fields", toasts.join("|"), "Uzupełnij ulicę");
ctx.state.addr = { address: "Testowa 19", city: "Warszawa", postal_code: "00-001" };
await mod.actions.run(ctx, { op: "change_address", i: "0", w: W }); await flush();
expect("address call", JSON.stringify(ws.filter((c) => c.service === "dpd_parcel_action").pop()), '"postal_code":"00-001"', '"city":"Warszawa"');
mod.actions.pickreason(ctx, { v: "damaged" });
expect("refuse sheet", mod.sheets.refuse(ctx, { i: "0", w: W }), "Paczka jest uszkodzona", "Odmów przyjęcia paczki", "nie da się cofnąć");
failNext = true;
await mod.actions.run(ctx, { op: "refuse", i: "0", w: W }); await flush();
expect("rejected write shows the DPD error", toasts.join("|"), "PACKAGE_IS_NOT_MANAGEABLE");
const before = ws.length;
config.dry_run = true;
await mod.actions.run(ctx, { op: "refuse", i: "0", w: W });
expect("dry run sends nothing", `${ws.length - before}|${toasts.pop()}`, "0|Podgląd");
responses.dpd_parcel_options = { ...responses.dpd_parcel_options, pin: null, pin_hidden: true };
config.dry_run = false; ctx.state.opts = {};
mod.screens.parcel(ctx, { i: 0, w: W }); await flush(); await flush();
expect("non-admin sees no PIN", mod.screens.parcel(ctx, { i: 0, w: W }), "widzi tylko administrator");
expect("info lists not covered", mod.screens.info(ctx), "Bluetooth", "nadawanie paczek");
console.log(bad ? `\n${bad} problem(s)` : "\nall DPD flows pass");
exit(bad ? 1 : 0);
