// Flow check for the App Hub InPost module with mocked shipment_tracking service responses.
// node tools/inpost_flow_check.mjs "$PWD"   (from the repo root)
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";
const root = new URL(`file://${argv[2]}/custom_components/app_hub/www/`);
const core = await import(new URL("core/index.js", root));
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const manifest = read("apps/inpost/app.json");
const fixture = read("apps/inpost/fixture.json");
const locales = { pl: read("apps/inpost/locales/pl.json"), en: read("apps/inpost/locales/en.json") };
const mod = (await import(new URL("apps/inpost/index.js", root))).default;
const hass = { states: fixture.states, entities: fixture.entities, devices: fixture.devices, user: { id: "demo-user" }, config: { latitude: 53.4, longitude: 14.5 } };
const devices = core.normalizeDevices(fixture.card_config.devices, manifest);
const i18n = new core.I18n(locales, "pl", "pl");
const t = (k, v) => i18n.t(k, v);
const svg = core.makeSvg(mod.icons || {});
const chrome = { back: true, kiosk: false };
const N1 = "620000000000000000000001";
const ws = [];
let failNext = false;
const answer = (d) => {
  if (d.service === "inpost_query") {
    return { what: d.service_data.what, result: ({
      sent: { parcels: [{ shipmentNumber: "620000000000000000000009", status: "Utworzona", parcelSize: "A", quickSendCode: "778899" }] },
      parcel: { shipmentNumber: N1, parcelSize: "B", mobileCollectPossible: true, operations: { collect: true, canShareParcel: true }, eventLog: [{ name: "Nadana", date: "2026-11-14T10:00:00Z" }, { name: "Gotowa do odbioru", date: "2026-11-15T09:30:00Z" }] },
      parcel_friends: { friends: [{ uuid: "f1", name: "Ala" }, { uuid: "f2", name: "Marek" }] },
      friends: { friends: [{ uuid: "f1", name: "Ala" }] },
      points: { points: [{ name: "TAN01M", addressDetails: { street: "Szczecińska", buildingNumber: "19", city: "Tanowo" }, location247: true, status: "Operating" }] },
      return_tickets: { tickets: [{ uuid: "t1", rma: "RMA1", organizationName: "Sklep Demo", status: "Accepted", returnCode: "445566", shipmentNumber: "620000000000000000000005", parcelSize: "A" }] },
      returnable: { parcels: [{ shipmentNumber: "620000000000000000000005", organization: { uuid: "o1", name: "Sklep Demo" } }] },
      return_reasons: { returnReasons: [{ uuid: "r1", name: "Nie pasuje" }] },
      notifications: { notifications: [{ id: "n1", title: "Paczka czeka", content: "TAN01M", date: "2026-11-15T09:30:00Z", read: false }] },
    })[d.service_data.what] };
  }
  if (d.service === "inpost_locker") {
    const s = d.service_data.step;
    if (s === "open") return { flow: d.service_data.flow, session: "S1", answer: { compartment: { name: "A12", location: { side: "L", column: "2", row: "3" } } } };
    return { flow: d.service_data.flow, answer: { status: "CLOSED", compartment: { name: "A12" } } };
  }
  return { done: true, result: { shipmentNumber: "620000000000000000000099" } };
};
const toasts = [];
let sheetState = null; let screen = null; let backs = 0;
const config = { dry_run: false };
const ctx = {
  chrome, hass, config, manifest, devices, state: {},
  dev: (i) => devices[i], st: (id) => hass.states[id],
  entities: (dev) => Object.keys(hass.entities).filter((id) => hass.entities[id].device_id === hass.entities[dev.entity].device_id),
  ws: async (type, data) => {
    ws.push({ type, ...data });
    if (failNext) { failNext = false; throw new Error("HTTP 400 BAD_REQUEST"); }
    return { response: answer(data) };
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
  const raw = /\binpost\.[a-z_]+/.exec(html);
  if (miss.length || /undefined|NaN/.test(html) || raw) { bad++; console.log(`FAIL ${label}: missing ${miss.join(" | ")} ${raw ? "raw " + raw[0] : ""}`); }
  else console.log(`ok   ${label}`);
}
const last = (service) => ws.filter((c) => c.service === service).pop()?.service_data || {};
const call = (service) => JSON.stringify(last(service));

expect("start lists ready parcels with codes", mod.screens.start(ctx), "Sklep Demo", "123456", "Do odbioru (3)", "W drodze (2)", "Archiwum (1)", "Sklep Znajomego");
mod.actions.tab(ctx, { v: "transit" });
expect("transit tab", mod.screens.start(ctx), "Sklep Online Demo", "Nadana");
mod.actions.tab(ctx, { v: "archive" });
expect("archive tab", mod.screens.start(ctx), "Odebrana");
mod.actions.tab(ctx, { v: "sent" });
mod.screens.start(ctx); await flush();
expect("sent tab from the service", mod.screens.start(ctx), "620000000000000000000009", "778899", "Otwórz skrytkę do nadania");
mod.actions.tab(ctx, { v: "ready" });

mod.screens.parcel(ctx, { i: 0, w: N1 }); await flush();
expect("parcel card", mod.screens.parcel(ctx, { i: 0, w: N1 }), "123456", "Otwórz skrytkę", "Udostępnij paczkę", "Gotowa do odbioru", "Historia przesyłki", "Nadana");
expect("a friend's parcel shows who shared it", mod.screens.parcel(ctx, { i: 0, w: "620000000000000000000006" }), "Sklep Znajomego", "Marek", "111222");

mod.actions.lockerOpen(ctx, { flow: "collect", w: N1, i: "0" });
expect("opening goes to the locker screen", JSON.stringify(screen), '"locker"');
expect("locker screen shows position and warning", mod.screens.locker(ctx, { flow: "collect", w: N1, i: "0" }), "53.4000, 14.5000", "prawdziwą skrytkę", "Otwórz skrytkę teraz");
await mod.actions.lkOpen(ctx, { flow: "collect", w: N1, i: "0" }); await flush();
expect("open sends position, confirm, no code from the app", call("inpost_locker"), '"flow":"collect"', '"step":"open"', '"confirm":true', '"latitude":53.4', `"shipment_number":"${N1}"`);
expect("compartment shown", mod.screens.locker(ctx, { flow: "collect" }), "A12", "Zamknąłem skrytkę");
await mod.actions.lkStep(ctx, { step: "closed" }); await flush();
expect("closed call keeps the session", call("inpost_locker"), '"step":"closed"', '"session":"S1"');
expect("closed screen", mod.screens.locker(ctx, { flow: "collect" }), "Skrytka zamknięta");
await mod.actions.lkStep(ctx, { step: "terminate" }); await flush();
expect("terminate ends the flow", mod.screens.locker(ctx, { flow: "collect" }), "Sesja skrytki zakończona");

// A panel user without a person has no position: nothing is opened.
const savedStates = hass.states["person.demo"]; delete hass.states["person.demo"];
const callsBefore = ws.length;
await mod.actions.lkOpen(ctx, { flow: "collect", w: N1, i: "0" });
expect("no position, no open", `${ws.length - callsBefore}|${toasts.pop()}`, "0|Brak Twojej pozycji");
hass.states["person.demo"] = savedStates;

mod.sheets.share(ctx, { w: N1 }); await flush();
mod.actions.pickfriend(ctx, { v: "f1" });
expect("share sheet", mod.sheets.share(ctx, { w: N1 }), "Ala", "Marek", "Udostępnij wybranym");
await mod.actions.sharenow(ctx, { w: N1 }); await flush();
expect("share call", call("inpost_action"), '"action":"share"', '"friend_uuids":["f1"]', `"shipment_numbers":["${N1}"]`);

ctx.state.track = { number: "620000000000000000000077" };
await mod.actions.tracknow(ctx); await flush();
expect("track call", call("inpost_action"), '"action":"track"', '"shipment_number":"620000000000000000000077"', '"parcel_type":"TRACKED"');
await mod.actions.untrack(ctx, { w: N1 }); await flush();
expect("untrack call", call("inpost_action"), '"action":"untrack"');
await mod.actions.easy(ctx, { w: N1 }); await flush();
expect("easy access call", call("inpost_action"), '"action":"easy_access"');

mod.screens.friends(ctx); await flush();
expect("friends screen", mod.screens.friends(ctx), "Ala", "Dodaj znajomego", "Przyjmij zaproszenie");
ctx.state.friend = { name: "Ola", phone: "500600700" };
await mod.actions.friendnow(ctx, { mode: "add" }); await flush();
expect("friend invite call", call("inpost_action"), '"action":"friend_invite"', '"phone":"500600700"', '"name":"Ola"');
await mod.actions.friendnow(ctx, { mode: "remove", u: "f1" }); await flush();
expect("friend remove call", call("inpost_action"), '"action":"friend_remove"', '"uuid":"f1"');
expect("friend remove sheet warns", mod.sheets.friend(ctx, { mode: "remove", u: "f1", n: "Ala" }), "Usunięcie znajomego Ala");

mod.screens.points(ctx, {}); ctx.state.psearch = { text: "Tanowo" };
mod.screens.points(ctx, {}); await flush();
expect("points by text", mod.screens.points(ctx, {}), "TAN01M", "Szczecińska 19 Tanowo", "Całodobowy");
mod.actions.pnear(ctx); mod.screens.points(ctx, {}); await flush();
expect("points near home use the configured home position", call("inpost_query"), '"latitude":53.4', '"max_distance":3000');
expect("picking a point for sending", mod.screens.points(ctx, { pick: "send" }), 'data-a="pickpoint"');
mod.actions.pickpoint(ctx, { n: "TAN01M", pick: "send" });
expect("point lands in the send form", mod.screens.send(ctx), "Paczkomat: TAN01M");

mod.screens.returns(ctx, {}); await flush();
expect("returns screen", mod.screens.returns(ctx, {}), "Sklep Demo", "445566", "Paczki do zwrotu");
mod.sheets.return(ctx, { w: "620000000000000000000005", o: "o1", n: "Sklep Demo" }); await flush();
ctx.state.ret = { reason: "r1", sender_name: "Jan Demo", sender_email: "jan@example.com", size: "B" };
expect("return sheet", mod.sheets.return(ctx, { w: "620000000000000000000005", o: "o1", n: "Sklep Demo" }), "Nie pasuje", "Zgłoś zwrot");
await mod.actions.returnnow(ctx, { w: "620000000000000000000005", o: "o1" }); await flush();
expect("return call", call("inpost_action"), '"action":"return_parcel"', '"reason_uuid":"r1"', '"confirm":true', '"parcel_size":"B"');
await mod.actions.lockerOpen(ctx, { flow: "return", w: "620000000000000000000005", size: "B", i: "0" });
await mod.actions.lkOpen(ctx, { flow: "return", w: "620000000000000000000005", i: "0" }); await flush();
expect("return open carries the size", call("inpost_locker"), '"flow":"return"', '"parcel_size":"B"');

ctx.state.send = { point: "TAN01M", size: "A", receiver_first_name: "A", receiver_last_name: "B", receiver_email: "a@example.com", receiver_phone: "500600700", sender_first_name: "C", sender_last_name: "D", sender_email: "c@example.com", sender_street: "Ulica", sender_building: "1", sender_post_code: "72-004", sender_city: "Tanowo" };
await mod.actions.sendnow(ctx); await flush();
expect("label call", call("inpost_action"), '"action":"send_parcel"', '"delivery_point":"TAN01M"', '"confirm":true', '"sender_post_code":"72-004"');
expect("label result shown", mod.screens.send(ctx), "620000000000000000000099");
ctx.state.send.receiver_email = "";
const n0 = ws.length;
await mod.actions.sendnow(ctx);
expect("label needs all fields", `${ws.length - n0}|${toasts.pop()}`, "0|Wypełnij");

mod.screens.notifications(ctx); await flush();
expect("notifications", mod.screens.notifications(ctx), "Paczka czeka", "Oznacz wszystkie");
await mod.actions.markread(ctx, { id: "n1" }); await flush();
expect("mark read call", call("inpost_action"), '"action":"notifications_read"', '"notification_ids":["n1"]');
await mod.actions.markall(ctx); await flush();
expect("mark all call", call("inpost_action"), '"action":"notifications_read_all"');

failNext = true;
await mod.actions.easy(ctx, { w: N1 }); await flush();
expect("a rejected write shows the InPost error", toasts.join("|"), "BAD_REQUEST");
const before = ws.length;
config.dry_run = true;
await mod.actions.easy(ctx, { w: N1 });
await mod.actions.lkOpen(ctx, { flow: "collect", w: N1, i: "0" });
expect("dry run sends nothing", `${ws.length - before}|${toasts.pop()}`, "0|Tryb próbny");
config.dry_run = false;
expect("info lists not covered", mod.screens.info(ctx), "Bluetooth", "bramkę");
console.log(bad ? `\n${bad} problem(s)` : "\nall InPost flows pass");
exit(bad ? 1 : 0);
