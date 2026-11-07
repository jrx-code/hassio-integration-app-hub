# LinkTap

Replaces the LinkTap mobile app (`com.linkTap.wgapp`, 2.10.0) for the parts of it that watch and
run watering. Data and actions go through the `linktap` integration, which talks to the gateway on
the LAN; nothing here touches the LinkTap cloud.

The producer app is a Cordova application, so the capture pass (`docs/CAPTURE.md`) read its own
files instead of measuring screenshots: the English wording from the language dictionary in
`assets/www/js/authentication.client.service.js`, the palette (`#009688` with `#00635a`, surfaces
`#f0f0f0` and white) from `assets/www/css/ionic.app.css`, and the battery, signal and watering
images from `assets/www/img/`. The app ships English, Chinese, Japanese, Italian, Spanish, French
and German; there is no Polish, so the Polish locale here is this module's own.

## Coverage

| Producer screen | What it does | Here |
|---|---|---|
| Device list | every TapLinker with status, battery, signal | `start`: one card per device, read from the valve payload |
| Device details, status | watering in progress, time left, flow | `zone`: hero with the remaining time, progress bar, flow and volume of the cycle |
| Instant mode | start or stop watering now, by duration or by volume | `zone`: `valve.open_valve` / `valve.close_valve`, with `number.set_value` on the duration and volume |
| Watering plan | the active mode | `plan`: the mode from `plan_mode`, named with the integration's own table |
| Pause | pause the plan for N hours | `plan`: the device's pause switch, plus its pause-duration number |
| Watering history | daily usage | `history`: recorder statistics of the lifetime volume counter, per day |
| Device settings | failsafe, volume limit, child lock, ids | `settings`, read-only, plus the more-info dialog |
| Alerts | leak, clog, broken valve, cut-off, fallen device | shown on the device card and as notes on the zone screen |

What the module does not reproduce is in the manifest's `not_covered`, and the setup screen prints
it: creating and editing watering plans, rain and temperature skip, ECO mode, adding devices and
configuring the gateway, cloud alert notifications, and history older than the recorder keeps.

## Addressing a device

A device is one `valve.*` entity. Everything the screens show comes from that entity's `data`
attribute, which the integration fills with the gateway's payload; the sibling sensors are the
fallback. That order matters: entity ids are renameable and one zone here really is renamed
(`sensor..._bateria`), which a lookup by suffix would read as a device that is offline.
