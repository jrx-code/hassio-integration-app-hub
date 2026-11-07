#!/usr/bin/env python3
"""Give the remote Chromium a logged-in HA session on the test instance.

The frontend keeps its session in `localStorage.hassTokens` on the HA origin.
This script mints a token from the refresh token stored in Bitwarden and writes
that object straight into the page over the browser's own debugging protocol,
so the token travels host to browser and is never written to a file, never
served from an unauthenticated path and never printed here.

    python3 tools/vm103_browser_session.py                 log in, land on /app-hub-strategy
    python3 tools/vm103_browser_session.py --to /app-hub-kiosk
    python3 tools/vm103_browser_session.py --logout        drop the session

Nothing here touches production: the target page must already be on the VM 103
origin, and the script refuses any other host.
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
ORIGIN = f"http://{HOST}:{PORT}"
BW_ITEM = local("bw_test_item")
# The browser that gets the session: a Chrome or Chromium with remote debugging open.
CDP = (local("cdp_host"), local("cdp_port", 9222))


def bw_item():
    sess = os.environ.get("BW_SESSION")
    if not sess:
        sys.exit("BW_SESSION is not set: export BW_SESSION=$(bw unlock '<pw>' --raw)")
    out = subprocess.run(["bw", "get", "item", BW_ITEM, "--session", sess],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def hass_tokens(item):
    refresh = next(f["value"] for f in item["fields"] if f["name"] == "refresh_token")
    client_id = f"{ORIGIN}/"
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token", "refresh_token": refresh, "client_id": client_id,
    }).encode()
    req = urllib.request.Request(f"{ORIGIN}/auth/token", data=data,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=20) as r:
        got = json.load(r)
    return {
        "access_token": got["access_token"],
        "expires_in": got["expires_in"],
        "refresh_token": refresh,
        "token_type": got.get("token_type", "Bearer"),
        "hassUrl": ORIGIN,
        "clientId": client_id,
        "expires": int(time.time() * 1000) + got["expires_in"] * 1000,
    }


class WS:
    """Minimal websocket client, stdlib only, enough for CDP."""

    def __init__(self, url):
        u = urllib.parse.urlparse(url)
        self.s = socket.create_connection((u.hostname, u.port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET {u.path} HTTP/1.1\r\nHost: {u.netloc}\r\nUpgrade: websocket\r\n"
                        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                        f"Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.s.recv(1)
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
        while True:
            b1, b2 = self._read(2)
            op, ln = b1 & 0x0F, b2 & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", self._read(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(ln)
            if op == 1:
                return json.loads(payload)

    def send(self, obj):
        p = json.dumps(obj).encode()
        mask = os.urandom(4)
        if len(p) < 126:
            h = bytes([0x81, 0x80 | len(p)])
        elif len(p) < 1 << 16:
            h = bytes([0x81, 0x80 | 126]) + struct.pack(">H", len(p))
        else:
            h = bytes([0x81, 0x80 | 127]) + struct.pack(">Q", len(p))
        self.s.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(p)))

    def call(self, method, **params):
        self.i += 1
        self.send({"id": self.i, "method": method, "params": params})
        while True:
            m = self.recv()
            if m.get("id") == self.i:
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result")


def target_on_origin():
    """Find a tab already on the test instance, or open one; the session is written into a page."""
    for opened in (False, True):
        with urllib.request.urlopen(f"http://{CDP[0]}:{CDP[1]}/json/list", timeout=10) as r:
            pages = json.load(r)
        for t in pages:
            if t.get("type") == "page" and t.get("url", "").startswith(ORIGIN):
                return t
        if opened:
            break
        req = urllib.request.Request(
            f"http://{CDP[0]}:{CDP[1]}/json/new?{ORIGIN}", method="PUT")
        try:
            with urllib.request.urlopen(req, timeout=15):
                pass
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
            sys.exit(f"no open tab on {ORIGIN} and opening one failed: {exc}")
        time.sleep(3)
    sys.exit(f"no open tab on {ORIGIN}: point one at {ORIGIN} first")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", default="/app-hub-strategy")
    ap.add_argument("--logout", action="store_true")
    args = ap.parse_args()

    t = target_on_origin()
    ws = WS(t["webSocketDebuggerUrl"])
    ws.call("Runtime.enable")

    if args.logout:
        ws.call("Runtime.evaluate", expression="localStorage.removeItem('hassTokens')")
        print("session dropped on", ORIGIN)
        return

    tok = json.dumps(hass_tokens(bw_item()))
    res = ws.call("Runtime.evaluate",
                  expression=f"localStorage.setItem('hassTokens', {json.dumps(tok)});"
                             "!!localStorage.getItem('hassTokens')",
                  returnByValue=True)
    assert res["result"]["value"] is True, res
    ws.call("Page.enable")
    ws.call("Page.navigate", url=f"{ORIGIN}{args.to}")
    time.sleep(6)
    where = ws.call("Runtime.evaluate", expression="location.pathname", returnByValue=True)
    print("session written, page at", where["result"]["value"])


if __name__ == "__main__":
    main()
