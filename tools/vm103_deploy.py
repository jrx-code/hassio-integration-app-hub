#!/usr/bin/env python3
"""Deploy App Hub to the Home Assistant test instance (PVE VM 103) and wire it up.

App Hub is an integration: the whole bundle lives in custom_components/app_hub, which also
serves it and registers both the card and the sidebar panel. So the deploy is an integration
install rather than a copy into /config/www, and a Python change needs a Home Assistant
restart (VM 103 may be restarted at will, production may not).

Runs on CT 117. Files go over the SSH add-on with a password from Bitwarden; the config
entry, the restart and the test dashboards go through the APIs with a token minted from the
stored refresh token.

    python3 tools/vm103_deploy.py               install, restart, config entry, dashboards
    python3 tools/vm103_deploy.py --no-files    only the API part
    python3 tools/vm103_deploy.py --no-restart  skip the restart: the bundle is served from
                                                disk, so only Python changes need one

Nothing here touches production.
"""
import argparse
import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _local import get as local  # noqa: E402  (path set below)

HOST = local("test_host")
PORT = local("test_port", 8123)
SSH_USER = local("ssh_user", "root")
BW_ITEM = local("bw_test_item")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMAIN = "app_hub"
VERSION = os.environ.get("APP_HUB_VERSION", "0.1.0")
# Device ids and producer serials for the test dashboards. Private, so it stays out of the repo
# (gitignored); without it the dashboards fall back to the manifest defaults.
APPS_LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vm103_apps.local.json")


def apps_config():
    try:
        with open(APPS_LOCAL) as fh:
            return json.load(fh)
    except FileNotFoundError:
        print(f"note: {os.path.basename(APPS_LOCAL)} absent, apps get the manifest defaults")
        return {}


def bw_item():
    sess = os.environ.get("BW_SESSION")
    if not sess:
        sys.exit("BW_SESSION is not set: export BW_SESSION=$(bw unlock '<pw>' --raw)")
    out = subprocess.run(["bw", "get", "item", BW_ITEM, "--session", sess],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def access_token(item):
    refresh = next(f["value"] for f in item["fields"] if f["name"] == "refresh_token")
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh,
        "client_id": f"http://{HOST}:{PORT}/",
    }).encode()
    req = urllib.request.Request(f"http://{HOST}:{PORT}/auth/token", data=data,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)["access_token"]


class WS:
    """Minimal websocket client: stdlib only, same shape as the prod deploy scripts."""

    def __init__(self, token):
        self.s = socket.create_connection((HOST, PORT), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET /api/websocket HTTP/1.1\r\nHost: {HOST}:{PORT}\r\nUpgrade: websocket\r\n"
                        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                        f"Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(1)
        assert self.recv()["type"] == "auth_required"
        self.send({"type": "auth", "access_token": token})
        assert self.recv()["type"] == "auth_ok", "auth rejected"
        self.i = 0

    def _read(self, n):
        b = b""
        while len(b) < n:
            chunk = self.s.recv(n - len(b))
            if not chunk:
                raise ConnectionError("socket closed")
            b += chunk
        return b

    def recv(self):
        data = b""
        while True:
            h = self._read(2)
            fin, ln = h[0] & 0x80, h[1] & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", self._read(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", self._read(8))[0]
            data += self._read(ln)
            if fin:
                return json.loads(data)

    def send(self, obj):
        p = json.dumps(obj).encode()
        mask = os.urandom(4)
        if len(p) < 126:
            h = bytes([0x81, 0x80 | len(p)])
        elif len(p) < 65536:
            h = bytes([0x81, 0x80 | 126]) + struct.pack(">H", len(p))
        else:
            h = bytes([0x81, 0x80 | 127]) + struct.pack(">Q", len(p))
        self.s.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(p)))

    def call(self, **msg):
        self.i += 1
        msg["id"] = self.i
        self.send(msg)
        while True:
            m = self.recv()
            if m.get("id") == self.i and m["type"] == "result":
                if not m.get("success"):
                    raise RuntimeError(f"{msg.get('type')}: {m.get('error')}")
                return m.get("result")


def ssh(password, cmd, payload=None):
    return subprocess.run(
        ["sshpass", "-p", password, "ssh", "-o", "PasswordAuthentication=yes",
         "-o", "PubkeyAuthentication=no", "-o", "StrictHostKeyChecking=no",
         f"{SSH_USER}@{HOST}", cmd],
        input=payload, capture_output=True, check=True).stdout.decode().strip()


def push_files(password):
    """tar custom_components/app_hub into /config/custom_components/ through the SSH add-on."""
    src = os.path.join(REPO, "custom_components", "app_hub")
    tar = subprocess.run(["tar", "czf", "-", "-C", os.path.dirname(src), "app_hub"],
                         capture_output=True, check=True).stdout
    # The target is root:root and the add-on logs in as administrator, so a read after the write
    # needs sudo too; without it the count prints 0 and a good deploy looks like a failed one.
    cmd = ("sudo mkdir -p /config/custom_components/app_hub "
           "&& sudo tar xzf - -C /config/custom_components "
           "&& sudo chown -R root:root /config/custom_components/app_hub "
           "&& sudo find /config/custom_components/app_hub -type f | wc -l")
    print("integration on VM 103:", ssh(password, cmd, tar), "file(s)")


def warn_duplicate_card(ws):
    """A Lovelace resource pointing at a copy of the card means two copies in one frontend.

    The integration loads the card itself, so a resource like this is left over from the days
    when the hub shipped as a dashboard plugin. It is reported rather than removed: deleting a
    resource somebody added by hand is not a deploy's business.
    """
    stale = [r for r in ws.call(type="lovelace/resources") if "app-hub-card.js" in r["url"]]
    for r in stale:
        print("WARNING: a Lovelace resource still loads the card, remove it:", r["url"])


def ensure_dashboard(ws, url_path, title, icon, config):
    existing = ws.call(type="lovelace/dashboards/list")
    if not any(d["url_path"] == url_path for d in existing):
        ws.call(type="lovelace/dashboards/create", title=title, url_path=url_path,
                icon=icon, show_in_sidebar=True)
        print("dashboard created:", url_path)
    ws.call(type="lovelace/config/save", url_path=url_path, config=config)
    print("config saved:", url_path)


def rest(token, path, payload=None, method=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f"http://{HOST}:{PORT}{path}", data=data, method=method or ("POST" if data else "GET"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    return json.loads(body) if body else None


def restart_core(token):
    """VM 103 only: a Python change in the integration needs a core restart to be picked up."""
    try:
        rest(token, "/api/services/homeassistant/restart", {})
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError):
        # Home Assistant answers this call by closing the socket as often as by a 200.
        print("restart requested (the call was cut short, which is normal)")
    for _ in range(60):
        time.sleep(2)
        try:
            if rest(token, "/api/config").get("state") == "RUNNING":
                print("core restarted and RUNNING")
                return
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError):
            continue  # the core is still down, that is what the loop is for
    sys.exit("core did not come back within 120 s")


def ensure_entry(token, apps):
    """Create the App Hub config entry if absent, then put the per-app config into its options.

    The panel carries its config, so this is what makes the launcher in the sidebar show the
    real devices instead of the manifest defaults.
    """
    entries = rest(token, "/api/config/config_entries/entry")
    mine = [e for e in entries if e["domain"] == DOMAIN]
    if mine:
        print("config entry present:", mine[0]["title"], f"({mine[0]['state']})")
    else:
        flow = rest(token, "/api/config/config_entries/flow", {"handler": DOMAIN})
        if flow.get("type") == "create_entry":
            print("config entry created (no form)")
        else:
            done = rest(token, f"/api/config/config_entries/flow/{flow['flow_id']}", {})
            print("config entry created:", done.get("title") or done.get("type"))
        entries = rest(token, "/api/config/config_entries/entry")
        mine = [e for e in entries if e["domain"] == DOMAIN]

    if not apps or not mine:
        return
    entry_id = mine[0]["entry_id"]
    # Only the per-app block is ours. The options flow is a menu now, and its "advanced" step
    # writes nothing but the apps block, so the sidebar title, icon, palette and dry run the
    # user set in the Configure dialog are kept by the flow itself rather than echoed back here.
    flow = rest(token, "/api/config/config_entries/options/flow", {"handler": entry_id})
    if flow.get("type") == "menu":
        flow = rest(
            token, f"/api/config/config_entries/options/flow/{flow['flow_id']}",
            {"next_step_id": "advanced"},
        )
    # Merge per app rather than replace: an app configured on the test instance through the
    # setup form is not in this file, and a deploy that posted only this file's block deleted it.
    current = {}
    for field in flow.get("data_schema") or []:
        if field.get("name") == "apps" and field.get("default"):
            try:
                current = json.loads(field["default"])
            except ValueError:
                current = {}
    merged = {**current, **apps}
    done = rest(
        token, f"/api/config/config_entries/options/flow/{flow['flow_id']}",
        {"apps": json.dumps(merged, ensure_ascii=False)},
    )
    if done.get("type") == "create_entry":
        print("options saved: apps =", ", ".join(sorted(merged)),
              f"(from this file: {len(apps)}, kept: {len(set(merged) - set(apps))})")
    else:
        print("options flow answered:", done.get("type"), done.get("errors"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-files", action="store_true")
    ap.add_argument("--no-restart", action="store_true")
    args = ap.parse_args()

    item = bw_item()
    if not args.no_files:
        push_files(item["login"]["password"])

    token = access_token(item)
    ws = WS(token)
    print("HA version on VM 103:", ws.call(type="get_config")["version"])
    warn_duplicate_card(ws)
    if not args.no_restart:
        restart_core(token)
        ws = WS(access_token(item))
    apps = apps_config()
    ensure_entry(token, apps)

    # Shape one: a single dashboard whose whole config is the strategy. Nothing is stored
    # beyond these four lines; the views come from the installed apps at render time.
    ensure_dashboard(ws, "app-hub-strategy", "App Hub (strategia)", "mdi:view-grid",
                     {"strategy": {"type": "custom:app-hub"}})

    # Shape two: a hand-written dashboard, the launcher in one panel view, which is what a
    # user gets by adding the card themselves. Kiosk on, to exercise the chrome control.
    ensure_dashboard(ws, "app-hub-kiosk", "App Hub (kiosk)", "mdi:fullscreen",
                     {"views": [{"title": "Aplikacje", "path": "apps", "type": "panel",
                                 "cards": [{"type": "custom:app-hub-card", "kiosk": True,
                                            "back_button": "always"}]}]})

    # Shape three: what production actually has. The prod dashboard "Aplikacje" holds one
    # panel view per producer card (FoxESS, Dreame, Home Connect); here the same three views
    # are the hub in single-app mode, so the port can be compared against the original.
    order = ["foxess", "dreame", "homeconnect"]
    titles = {"foxess": "FoxESS", "dreame": "Dreame", "homeconnect": "Home Connect"}
    views = [{"title": "Aplikacje", "path": "apps", "type": "panel",
              "cards": [{"type": "custom:app-hub-card", "apps": apps}]}]
    for app in order:
        views.append({"title": titles[app], "path": app, "type": "panel",
                      "cards": [{"type": "custom:app-hub-card", "app": app, **apps.get(app, {})}]})
    ensure_dashboard(ws, "aplikacje-app", "Aplikacje", "mdi:apps", {"views": views})

    # The strategy dashboard gets the same per-app blocks, so its generated views are not empty.
    if apps:
        ws.call(type="lovelace/config/save", url_path="app-hub-strategy",
                config={"strategy": {"type": "custom:app-hub", "apps": apps}})
        print("config saved: app-hub-strategy (with per-app config)")

    print("\nopen:")
    print(f"  http://{HOST}:{PORT}/app-hub            the sidebar panel, the normal way in")
    print(f"  http://{HOST}:{PORT}/aplikacje-app")
    print(f"  http://{HOST}:{PORT}/app-hub-strategy")
    print(f"  http://{HOST}:{PORT}/app-hub-kiosk")


if __name__ == "__main__":
    main()
