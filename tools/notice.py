#!/usr/bin/env python3
"""Regenerate the trademark table in NOTICE from the app manifests.

    python3 tools/notice.py          check only, exits 1 when NOTICE is behind
    python3 tools/notice.py --write  rewrite the table

The disclaimer must not fall behind the app list, which is why the table is generated and
checked rather than maintained by hand.
"""
import argparse
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS = os.path.join(REPO, "custom_components", "app_hub", "www", "apps")
NOTICE = os.path.join(REPO, "NOTICE")
START = "Trademark owners of the app modules currently in this repository:"
END = "This list is generated from"


def table():
    with open(os.path.join(APPS, "index.json")) as f:
        ids = json.load(f)["apps"]
    rows = []
    for app_id in ids:
        with open(os.path.join(APPS, app_id, "manifest.json")) as f:
            m = json.load(f)
        rows.append(f"  {app_id:<14}{m.get('replaces', ''):<24}{m.get('trademark_owner', '')}".rstrip())
    return "\n".join(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    with open(NOTICE) as f:
        text = f.read()
    want = table()
    pattern = re.compile(re.escape(START) + r"\n\n(.*?)\n\n" + re.escape(END), re.DOTALL)
    m = pattern.search(text)
    if not m:
        sys.exit("NOTICE does not contain the generated block markers")
    if m.group(1).rstrip() == want.rstrip():
        print("NOTICE is current")
        return
    if not args.write:
        print("NOTICE is behind the app manifests; run with --write")
        sys.exit(1)
    with open(NOTICE, "w") as f:
        f.write(text[: m.start(1)] + want + text[m.end(1):])
    print("NOTICE updated")


if __name__ == "__main__":
    main()
