#!/usr/bin/env python3
"""Scaffold a new App Hub app module.

    python3 tools/new_app.py dreame --name Dreame --integration dreame_vacuum \
        --replaces "Dreamehome" --owner "Dreame Technology"

Creates custom_components/app_hub/www/apps/<id>/ with a manifest, a module with one screen, both locales, an empty
fixture and a placeholder icon, and adds the id to the apps index. It writes nothing
outside the repository and refuses to overwrite an existing app.
"""
import argparse
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS = os.path.join(REPO, "custom_components", "app_hub", "www", "apps")

MODULE = '''\
/*
 * {name} app module: replaces the {replaces} app.
 * Screens, labels and colours come from the producer app, captured per docs/CAPTURE.md.
 * Data and actions come from the {integration} integration.
 */

const ICONS = {{
  // app-specific icons, name: "<svg path markup>"
}};

function start(ctx) {{
  const rows = ctx.devices.map((dev, i) =>
    `<button class="lrow" data-a="go" data-screen="dev" data-i="${{i}}">` +
    `<span>${{ctx.esc(dev.name || dev.entity || dev.prefix)}}</span></button>`
  ).join("");
  return `<div class="scroll"><div class="pad"><h1>${{ctx.esc(ctx.manifest.name)}}</h1>` +
    `${{rows || `<p class="fine">${{ctx.esc(ctx.t("{id}.no_devices"))}}</p>`}}</div></div>`;
}}

function device(ctx, params) {{
  const dev = ctx.dev(Number(params.i || 0));
  if (!dev) return `<div class="scroll"><div class="pad"><p class="fine">-</p></div></div>`;
  return `<div class="scroll">${{ctx.ui.bar(dev.name || dev.prefix)}}<div class="pad">` +
    `<p class="fine">TODO: ekran urzadzenia</p></div></div>`;
}}

export default {{
  home: "start",
  icons: ICONS,

  title: (ctx) => ctx.manifest.name,

  watch: () => [],

  screens: {{ start, dev: device }},

  actions: {{}},

  css() {{
    return `
/* app-specific CSS; the core already ships the shared primitives */
`;
  }},
}};
'''

MANIFEST = {
    "id": "",
    "name": "",
    "replaces": "",
    "trademark_owner": "",
    "version": "0.1.0",
    "icon": "img/icon.svg",
    "artwork": "optional",
    "requires": [],
    "palette": {},
    "config": {
        "devices": {"shape": "objects", "anchor": "", "fields": {}},
        "options": {
            "theme": {"type": "select", "options": ["ha", "app"], "default": "ha"},
            "dry_run": {"type": "boolean", "default": False},
        },
    },
    "screens": ["start", "dev"],
    "locales": ["pl", "en"],
    "blueprints": [],
    "not_covered": [],
}

ICON = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="{name}">
  <rect width="64" height="64" rx="16" fill="#3a3f4b"/>
  <rect x="17" y="17" width="30" height="30" rx="6" fill="none" stroke="#ffffff" stroke-width="3"/>
</svg>
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("--name", required=True)
    ap.add_argument("--integration", default="")
    ap.add_argument("--replaces", default="")
    ap.add_argument("--owner", default="")
    ap.add_argument("--anchor", default="", help="entity template that anchors a device, e.g. switch.{prefix}_power")
    args = ap.parse_args()

    app_id = args.id
    if not app_id.isidentifier():
        sys.exit("id must be a plain identifier, lower case")
    target = os.path.join(APPS, app_id)
    if os.path.exists(target):
        sys.exit(f"{target} already exists, refusing to overwrite")

    os.makedirs(os.path.join(target, "img"))
    os.makedirs(os.path.join(target, "locales"))

    manifest = json.loads(json.dumps(MANIFEST))
    manifest.update(id=app_id, name=args.name, replaces=args.replaces, trademark_owner=args.owner)
    if args.integration:
        manifest["requires"] = [{"integration": args.integration, "hint": ""}]
    if args.anchor:
        manifest["config"]["devices"]["anchor"] = args.anchor
    with open(os.path.join(target, "app.json"), "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    with open(os.path.join(target, "index.js"), "w") as f:
        f.write(MODULE.format(name=args.name, replaces=args.replaces or args.name,
                              integration=args.integration or "(integration)", id=app_id))

    for lang, text in (("pl", "Brak urzadzen w konfiguracji karty."), ("en", "No devices configured.")):
        with open(os.path.join(target, "locales", f"{lang}.json"), "w") as f:
            json.dump({app_id: {"no_devices": text}}, f, indent=2, ensure_ascii=False)
            f.write("\n")

    with open(os.path.join(target, "img", "icon.svg"), "w") as f:
        f.write(ICON.format(name=args.name))

    with open(os.path.join(target, "fixture.json"), "w") as f:
        json.dump({"states": {}, "entities": {}, "devices": {},
                   "components": [args.integration] if args.integration else []}, f, indent=2)
        f.write("\n")

    index_path = os.path.join(APPS, "index.json")
    with open(index_path) as f:
        index = json.load(f)
    if app_id not in index["apps"]:
        index["apps"].append(app_id)
        index["apps"].sort()
        with open(index_path, "w") as f:
            json.dump(index, f, indent=2)
            f.write("\n")

    print(f"created custom_components/app_hub/www/apps/{app_id}/")
    print("next: docs/CAPTURE.md, then the coverage table in the app's README")


if __name__ == "__main__":
    main()
