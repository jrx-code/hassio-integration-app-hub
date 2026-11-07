# Security policy

## What this integration does and does not do

App Hub has no entities, no cloud component and no credentials of its own. It serves a static
frontend bundle from the integration directory, registers a card and a dashboard strategy, and adds
a sidebar panel. Everything it shows or changes goes through integrations you have already
installed, with the permissions of the logged-in Home Assistant user.

- It makes **no outbound network connection**.
- It stores **no secrets**: the config entry holds the sidebar title, the palette, a dry-run switch
  and the per-app configuration, which is entity ids and producer options.
- The two actions that write to your Home Assistant configuration, creating a dashboard and saving
  one, are behind `hass.user.is_admin` and run only when you press the button in the setup screen.
- The kiosk option injects a style element into the frontend's own shadow roots to hide the sidebar
  and the toolbar. It is removed when the card is removed, and it changes nothing on the server.

## No identifying data in this repository

The app modules were built by capturing a real installation. Everything carried here is scrubbed
demo data: rooms, zones, device names, hardware ids, serial numbers and floor plans are replaced,
and the test instance's address lives outside the repository.

`python3 tools/anonymise_fixtures.py` scans every tracked file for what must not be in it and exits
non-zero on a hit. It runs in CI on every push and pull request.

If you find identifying data in this repository anyway, please open an issue without quoting it, or
write to the address below, and it will be removed and the history rewritten.

## Reporting a vulnerability

Open a [security advisory](https://github.com/jrx-code/ha-app-hub/security/advisories/new), or an
issue if the problem is not sensitive. Please include the Home Assistant version, the App Hub
version and what you did.

Expect a first answer within a week. There is no bounty: this is a hobby project.

## Supported versions

The latest release is supported. Fixes go into a new release rather than into older ones.
