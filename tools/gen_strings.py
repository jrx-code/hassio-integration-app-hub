#!/usr/bin/env python3
"""Keep the per-app field labels of the options flow in step with the manifests.

The form for an app is generated from its manifest, so its field names are the manifest's.
Home Assistant takes field labels from the translation files only, and a name with no label
renders as the bare key. This writes those labels into the `app` step of `strings.json` and
of every language file, taking the text from the manifest (`config.options.<name>.label`,
either a string or a map of language to string) and falling back to the humanised key.

    python3 tools/gen_strings.py            # report drift, change nothing
    python3 tools/gen_strings.py --write    # write the labels
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
COMPONENT = ROOT / "custom_components" / "app_hub"
APPS = COMPONENT / "www" / "apps"
HUB_WIDE = {"theme", "dry_run"}
# Written by hand, because they belong to the hub rather than to any app.
FIXED = {"devices": {"en": "Devices", "pl": "Urządzenia"}}


def humanise(name: str) -> str:
    return name.replace("_", " ").capitalize()


def labels() -> dict[str, dict[str, str]]:
    """{field: {language: label}} for every field an app declares."""
    out: dict[str, dict[str, str]] = {k: dict(v) for k, v in FIXED.items()}
    index = json.loads((APPS / "index.json").read_text(encoding="utf-8"))
    for app_id in index.get("apps", []):
        manifest = json.loads((APPS / app_id / "app.json").read_text(encoding="utf-8"))
        options = (manifest.get("config") or {}).get("options") or {}
        for name, spec in options.items():
            if name in HUB_WIDE or not isinstance(spec, dict):
                continue
            label = spec.get("label")
            if isinstance(label, dict):
                out.setdefault(name, {}).update({k: str(v) for k, v in label.items()})
            elif isinstance(label, str):
                out.setdefault(name, {}).setdefault("en", label)
            else:
                out.setdefault(name, {})
    return out


def wanted(language: str) -> dict[str, str]:
    """The `app` step data block for one language file."""
    return {
        name: text.get(language) or text.get("en") or humanise(name)
        for name, text in sorted(labels().items())
    }


def files() -> list[tuple[str, pathlib.Path]]:
    """Every file that carries labels, with the language it is written in.

    strings.json is the English source and shares its language with translations/en.json,
    so the two cannot be keyed by language: that silently drops one of them.
    """
    out = [("en", COMPONENT / "strings.json")]
    out += [(p.stem, p) for p in sorted((COMPONENT / "translations").glob("*.json"))]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    drift = 0
    for language, path in files():
        data = json.loads(path.read_text(encoding="utf-8"))
        step = data.setdefault("options", {}).setdefault("step", {}).setdefault("app", {})
        have = step.get("data") or {}
        want = wanted(language)
        if have == want:
            continue
        drift += 1
        print(f"{path.name}: {len(set(want) - set(have))} missing, {len(set(have) - set(want))} stale")
        if args.write:
            step["data"] = want
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if drift and not args.write:
        print("run with --write")
        return 1
    print("app field labels in step" if not drift else "written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
