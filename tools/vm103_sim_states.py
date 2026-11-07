#!/usr/bin/env python3
"""Mirror the production entity states the App Hub apps read onto VM 103.

The test instance has none of the three integrations: Dreame and Home Connect talk to clouds
tied to one account, FoxESS Modbus talks to the physical inverter. Without entities the cards
have nothing to draw, so the states are copied from production through the REST API and pushed
to VM 103 with POST /api/states, which creates them without any integration. They live until the
next Home Assistant restart, which is also how they are cleaned up.

The card maps are camera entities on production; their entity_picture is signed for that host, so
it is rewritten to the map snapshots deployed under /local/app-hub/sim/.

Secrets come from Bitwarden at run time: the production long-lived token and the VM 103 refresh
token, which is exchanged for an access token here.

  python3 tools/vm103_sim_states.py              # copy every entity the apps need
  python3 tools/vm103_sim_states.py --list       # print what would be copied, change nothing
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _local import get as local  # noqa: E402  (path set below)

PROD = local("prod_url")                 # the instance the states are copied from
TEST_HOST = local("test_host")           # the instance they are copied to
TEST = f"http://{TEST_HOST}:{local('test_port', 8123)}"
SSH_USER = local("ssh_user", "root")
BW_PROD = local("bw_prod_item")
BW_TEST = local("bw_test_item")

# Which entities an app needs: whole prefixes for the apps that address a device by prefix,
# and a substring for an integration that names entities after the room instead.
PREFIXES = local("mirror_prefixes", [])
CONTAINS = local("mirror_contains", [])
# Camera entities whose picture is signed for the source instance, and the local file that
# replaces it on the test instance.
MAPS = local("map_pictures", {})
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def bw(item, field=None):
    # The vault is unlocked by the caller; no password ever lives in this file.
    #   export BW_SESSION=$(bw unlock '<master password>' --raw)
    sess = os.environ.get("BW_SESSION")
    if not sess:
        sys.exit("BW_SESSION is not set: export BW_SESSION=$(bw unlock '<pw>' --raw)")
    out = subprocess.run(["bw", "get", "item", item, "--session", sess],
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    if field is None:
        return data["login"]["password"]
    for f in data.get("fields") or []:
        if f["name"] == field:
            return f["value"]
    raise SystemExit(f"field {field} not in Bitwarden item {item}")


def get(url, token, path):
    req = urllib.request.Request(url + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def post(url, token, path, payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url + path, data=body, method="POST", headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def test_token():
    refresh = bw(BW_TEST, "refresh_token")
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token", "refresh_token": refresh, "client_id": f"{TEST}/"}).encode()
    req = urllib.request.Request(TEST + "/auth/token", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["access_token"]


def wanted_ids():
    """Every entity id the three app modules read."""
    ids = set()
    path = os.path.join(HERE, "custom_components/app_hub/www/apps/foxess/app.json")
    with open(path) as fh:
        manifest = json.load(fh)
    for value in (manifest["config"]["options"]["entities"]["default"] or {}).values():
        if isinstance(value, str):
            ids.add(value)
        elif isinstance(value, list):
            ids.update(v for v in value if isinstance(v, str))
    return ids


def push_maps():
    """Upload the robot map snapshots the mirrored camera entities point at.

    A map snapshot is the floor plan of a real home, so the files live wherever the local
    config points ("map_source_dir") and never in this repository. Absent, the Dreame map
    screen shows its own "no map" state.
    """
    src = local("map_source_dir", "")
    names = sorted(os.path.basename(v) for v in MAPS.values()) if src else []
    names = [n for n in names if os.path.exists(os.path.join(src, n))]
    if not names:
        print("no map snapshots found, skipping (/local/app-hub/sim stays as it is)")
        return
    tar = subprocess.run(["tar", "czf", "-", "-C", src] + names, capture_output=True, check=True).stdout
    cmd = ("sudo mkdir -p /config/www/app-hub/sim && sudo tar xzf - -C /config/www/app-hub/sim "
           "&& sudo chown -R root:root /config/www/app-hub/sim && sudo ls /config/www/app-hub/sim | wc -l")
    out = subprocess.run(
        ["sshpass", "-p", bw(BW_TEST), "ssh", "-o", "PasswordAuthentication=yes",
         "-o", "PubkeyAuthentication=no", "-o", "StrictHostKeyChecking=no",
         f"{SSH_USER}@{TEST_HOST}", cmd],
        input=tar, capture_output=True, check=True)
    print("map snapshots on VM 103:", out.stdout.decode().strip())


def persist(chosen):
    """Write the same states to the test VM and install the component that replays them.

    POST /api/states lives in memory, so every restart leaves the hub looking broken on the
    test instance. The recording plus a tiny custom component fixes that without credentials
    and without a second client on any production device.
    """
    payload = {}
    for s in chosen:
        attrs = dict(s.get("attributes") or {})
        eid = s["entity_id"]
        if eid in MAPS:
            attrs["entity_picture"] = MAPS[eid]
        else:
            attrs.pop("entity_picture", None)
        payload[eid] = {"state": s["state"], "attributes": attrs}

    password = bw(BW_TEST)
    blob = json.dumps(payload, ensure_ascii=False).encode()
    put = ("sudo tee /config/app_hub_sim_states.json > /dev/null "
           "&& sudo chown root:root /config/app_hub_sim_states.json "
           "&& sudo stat -c '%s bytes' /config/app_hub_sim_states.json")
    print("recording on VM 103:", ssh_cmd(password, put, blob))

    src = os.path.join(HERE, "tools", "vm103_sim_component")
    tar = subprocess.run(["tar", "czf", "-", "-C", src, "app_hub_sim"],
                         capture_output=True, check=True).stdout
    install = ("sudo tar xzf - -C /config/custom_components "
               "&& sudo chown -R root:root /config/custom_components/app_hub_sim "
               "&& sudo grep -q '^app_hub_sim:' /config/configuration.yaml "
               "|| echo 'app_hub_sim:' | sudo tee -a /config/configuration.yaml > /dev/null; "
               "sudo grep -c '^app_hub_sim:' /config/configuration.yaml")
    print("replay component installed, configuration.yaml entries:",
          ssh_cmd(password, install, tar))


def ssh_cmd(password, cmd, payload=None):
    return subprocess.run(
        ["sshpass", "-p", password, "ssh", "-o", "PasswordAuthentication=yes",
         "-o", "PubkeyAuthentication=no", "-o", "StrictHostKeyChecking=no",
         f"{SSH_USER}@{TEST_HOST}", cmd],
        input=payload, capture_output=True, check=True).stdout.decode().strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="print the selection and change nothing")
    ap.add_argument("--no-maps", action="store_true", help="skip uploading the map snapshots")
    ap.add_argument("--no-persist", action="store_true",
                    help="only push the states, do not install the replay component")
    args = ap.parse_args()

    prod_token = bw(BW_PROD, "HA_TOKEN")
    states = get(PROD, prod_token, "/api/states")
    explicit = wanted_ids()

    chosen = []
    for s in states:
        eid = s["entity_id"]
        obj = eid.split(".", 1)[1]
        if (eid in explicit or any(obj.startswith(p) for p in PREFIXES)
                or any(c in obj for c in CONTAINS)):
            chosen.append(s)

    if args.list:
        for s in sorted(chosen, key=lambda x: x["entity_id"]):
            print(f"{s['entity_id']:70} {s['state'][:30]}")
        print(f"\n{len(chosen)} entities (explicit {len(explicit)}, prefixes {len(PREFIXES)}, contains {len(CONTAINS)})")
        return

    if not args.no_maps:
        push_maps()

    token = test_token()
    ok = fail = 0
    for s in chosen:
        eid = s["entity_id"]
        attrs = dict(s.get("attributes") or {})
        if eid in MAPS:
            attrs["entity_picture"] = MAPS[eid]
        elif "entity_picture" in attrs:
            attrs.pop("entity_picture")
        try:
            post(TEST, token, f"/api/states/{eid}", {"state": s["state"], "attributes": attrs})
            ok += 1
        except urllib.error.HTTPError as e:
            fail += 1
            print(f"  {eid}: HTTP {e.code} {e.read()[:120]!r}", file=sys.stderr)
    print(f"mirrored {ok} entities onto {TEST_HOST}, {fail} failed")
    if not args.no_persist:
        persist(chosen)


if __name__ == "__main__":
    main()
