#!/usr/bin/env python3
"""Turn captured fixtures into demo data, and prove nothing identifying is left.

A fixture is a capture of a real installation: entity ids carry room names, a device
registry entry carries the hardware id, and a vacuum's camera attributes carry the floor
plan of the house, down to the furniture. None of that belongs in a public repository, and
none of it is needed: the fixtures exist so `tools/render_check.mjs` can render every
screen outside a browser, which only needs the shape of the data.

    python3 tools/anonymise_fixtures.py --check    # scan, change nothing, non-zero on a hit
    python3 tools/anonymise_fixtures.py --write    # rewrite the fixtures as demo data

The check also runs over the whole repository, because an entity id copied into a manifest
default, a test or a document leaks exactly as much as one in a fixture.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
APPS = REPO / "custom_components" / "app_hub" / "www" / "apps"

# Longest first: a token that is a prefix of another has to be replaced after it.
TOKENS = [
    # Dreame: three robots and a fan, named after the floors of a house
    ("odkurzacz_polpietro", "robot_landing"),
    ("odkurzacz_pietro", "robot_upstairs"),
    ("odkurzacz_parter", "robot_ground"),
    ("dreame_bladeless_fan_mf10", "fan_mf10"),
    ("taras_dreame_bladeless_fan", "terrace_fan"),
    ("taras", "terrace"),
    # Home Connect: the dishwasher sits in a room, and the room is in half its entity ids
    ("kuchnia_siemens", "siemens"),
    ("kuchnia", "kitchen"),
    # LinkTap: one zone per part of the garden
    ("obwod_master_ogrod_przedni", "zone_front_main"),
    ("ogrod_przedni_obwod_master", "front_zone_main"),
    ("obwod_szopka_garaz", "zone_shed"),
    ("obwod_brzeg_domu", "zone_house_side"),
    ("obwod_rabaty_z_przodu", "zone_front_beds"),
    ("obwod_podjazd", "zone_driveway"),
    ("obwod_grill", "zone_patio"),
    ("ogrod_przedni", "front_garden"),
    ("master_ogrod_przedni", "main_front"),
    ("rabaty_z_przodu", "front_beds"),
    ("rabaty_przednie", "front_beds"),
    ("szopka_garaz", "shed"),
    ("brzeg_domu", "house_side"),
    ("podjazd", "driveway"),
    ("ogrod", "garden"),
    ("obwod", "zone"),
    ("grill", "patio"),
    # FoxESS: a weather entity and a few helpers of that installation
    ("weather.dom", "weather.home"),
    ("switch.unifi_network_phase10_foxess_logger_block_internet_2", "switch.inverter_logger_internet"),
    ("sensor.energia_stawka_teraz", "sensor.energy_price_now"),
    ("sensor.house_load_power_foxess_calculated", "sensor.house_load_power"),
]

# Free text, including friendly names and the producer's own room labels.
NAMES = [
    ("Odkurzacz Półpiętro", "Robot Landing"),
    ("Odkurzacz Piętro", "Robot Upstairs"),
    ("Odkurzacz Parter", "Robot Ground"),
    ("Odkurzacz", "Robot"),
    ("Obwód Master - Ogród Przedni", "Zone Main - Front Garden"),
    ("Obwód - Szopka Garaż", "Zone - Shed"),
    ("Obwód - Brzeg Domu", "Zone - House Side"),
    ("Obwód - Rabaty z przodu", "Zone - Front Beds"),
    ("Obwód - Podjazd", "Zone - Driveway"),
    ("Obwód - Grill", "Zone - Patio"),
    ("Linktap", "LinkTap"),
    ("Taras", "Terrace"),
    # Rooms of the home, as the vacuum and its room pickers name them
    ("Główna Sypialnia 2", "Main Bedroom 2"),
    ("Główna Sypialnia", "Main Bedroom"),
    ("Sala Spotkań", "Meeting Room"),
    ("Łazienka 2", "Bathroom 2"),
    ("Łazienka", "Bathroom"),
    ("Korytarz", "Hall"),
    ("Kuchnia", "Kitchen"),
    ("Salon", "Living Room"),
    ("Sypialnia", "Bedroom"),
    ("Biuro", "Office"),
    ("Garderoba", "Wardrobe"),
    ("Pralnia", "Utility Room"),
    ("Jadalnia", "Dining Room"),
    ("Gabinet", "Study"),
    ("Półpiętro", "Landing"),
    ("Piętro", "Upstairs"),
    ("Parter", "Ground Floor"),
    # Entity renamed by hand in that installation
    ("Pozostały czas podlewania", "Remaining watering time"),
    ("Pominięte pomieszczenie", "Skipped room"),
    # Map snapshots shipped with the private capture, named after the floors
    ("map_polpietro", "map_landing"),
    ("map_pietro", "map_upstairs"),
    ("map_parter", "map_ground"),
]

# A vacuum's camera carries the plan of the home. The structure stays, the plan does not.
DEMO_ROOMS = {
    "1": {"name": "Hall", "custom_name": "Hall", "x0": -4000, "y0": 1600, "x1": -2000, "y1": 3200},
    "2": {"name": "Living Room", "custom_name": "Living Room", "x0": -2000, "y0": 1600, "x1": 1200, "y1": 4000},
    "3": {"name": "Kitchen", "custom_name": "Kitchen", "x0": -4000, "y0": -1200, "x1": -1600, "y1": 1600},
    "4": {"name": "Bedroom", "custom_name": "Bedroom", "x0": -1600, "y0": -1200, "x1": 1200, "y1": 1600},
    "5": {"name": "Bathroom", "custom_name": "Bathroom", "x0": 1200, "y0": -1200, "x1": 2800, "y1": 1600},
}
GEOMETRY_EMPTY = [
    "furnitures", "carpets", "deleted_carpets", "detected_carpets", "obstacles",
    "virtual_walls", "no_go_areas", "no_mopping_areas", "passable_thresholds",
    "impassable_thresholds", "ramps", "curtains", "calibration_points",
]
# These are maps keyed by a label the integration builds from what the robot found in the
# house ("19: Power strip (Living Room)"), so the keys are scrubbed as well as the values.
PICTURE_MAPS = ["obstacle_picture", "cleaning_history_picture", "recovery_map_picture", "recovery_map_file"]
POSITIONS = {
    "charger_position": {"x": 0, "y": 0, "a": 0},
    "vacuum_position": {"x": 400, "y": 600, "a": 90},
    "router_position": {"x": -1200, "y": 2400},
}

# What must never appear in the repository. Checked over every tracked text file.
DENY = [
    (r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]", "Polish characters (a captured name)"),  # UI files are exempt below
    (r"odkurzacz|obwod|ogrod|pietro|parter|polpietro|podjazd|szopka|rabaty|brzeg_domu|taras",
     "captured room or zone name"),
    (r"\b[0-9A-F]{16}(_\d+)?\b", "hardware id"),
    (r"\b60E[A-Z0-9]{8,}\b|\b709L[A-Z0-9]{8,}\b", "serial number"),
    (r"weather\.dom\b|unifi_network|energia_stawka", "entity of the captured installation"),
    (r"\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.(?:\d{1,3}\.)+\d{1,3}\b", "private IP address"),
    (r"iwanus|jiwanus", "private host or account"),
]
# The Polish user interface is written in the repository on purpose, so the diacritics rule
# does not apply to the files that carry it. Every other rule applies everywhere.
UI_FILES = [
    re.compile(r"locales/[a-z]{2}\.json$"),
    re.compile(r"translations/[a-z]{2}\.json$"),
    re.compile(r"www/app-hub-(card|panel|strategy)\.js$"),
    re.compile(r"www/apps/[a-z]+/index\.js$"),
    re.compile(r"www/apps/[a-z]+/manifest\.json$"),
    re.compile(r"^custom_components/app_hub/strings\.json$"),
    re.compile(r"^poc/index\.html$"),
    re.compile(r"^tools/(gen_strings|notice)\.py$"),
]
SELF = re.compile(r"^tools/anonymise_fixtures\.py$")


def replace_text(value: str) -> str:
    for old, new in NAMES:
        value = value.replace(old, new)
    for old, new in TOKENS:
        value = value.replace(old, new)
    return value


def walk(node):
    if isinstance(node, dict):
        return {replace_text(k): walk(v) for k, v in node.items()}
    if isinstance(node, list):
        return [walk(v) for v in node]
    if isinstance(node, str):
        return replace_text(node)
    return node


def scrub_map(attributes: dict) -> None:
    """Replace a captured floor plan with a demo one, keeping every key the screens read."""
    if "rooms" in attributes and isinstance(attributes["rooms"], dict):
        rooms = {}
        for room_id, room in attributes["rooms"].items():
            demo = DEMO_ROOMS.get(str(room_id)) or DEMO_ROOMS["1"]
            rooms[room_id] = {**room, **demo}
        attributes["rooms"] = rooms
    for key in GEOMETRY_EMPTY:
        # The integration gives some of these as a list and some as a map keyed by id
        # (obstacles), and a map left alone keeps the position and type of every object
        # the robot has seen in the house.
        if isinstance(attributes.get(key), list):
            attributes[key] = []
        elif isinstance(attributes.get(key), dict):
            attributes[key] = {}
    for key in PICTURE_MAPS:
        value = attributes.get(key)
        if isinstance(value, dict) and value:
            first = next(iter(value.values()))
            attributes[key] = {"1: Demo (Living Room)": first}
    for key, value in POSITIONS.items():
        if key in attributes and isinstance(attributes[key], dict):
            attributes[key] = dict(value)


# The registry name of a device, which is a separate namespace from the entity ids: the
# same word appears in both, and replacing it as free text would hit the ids twice.
DEVICE_NAMES = {
    "grill": "patio",
    "rabaty-przednie": "front-beds",
    "master-ogród-przedni": "main-front",
    "podjazd": "driveway",
    "szopka-garaż": "shed",
    "brzeg-domu": "house-side",
}


def scrub_device(device: dict) -> dict:
    out = dict(device)
    name = out.get("name")
    if isinstance(name, str) and name in DEVICE_NAMES:
        out["name"] = DEVICE_NAMES[name]
    for key in ("model_id", "serial_number", "sw_version", "hw_version"):
        if key in out:
            out[key] = None
    model = out.get("model")
    if isinstance(model, str) and re.fullmatch(r"[0-9A-F]{16}(_\d+)?", model):
        out["model"] = "TapLinker"
    return out


def anonymise(path: pathlib.Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    data = walk(data)
    for entity_id, state in (data.get("states") or {}).items():
        attributes = state.get("attributes") or {}
        if entity_id.startswith("camera."):
            scrub_map(attributes)
        payload = attributes.get("data")
        if isinstance(payload, dict):
            if "dev_id" in payload:
                payload["dev_id"] = "DEMO-TAPLINKER"
            if "plan_sn" in payload:
                payload["plan_sn"] = 1001
        for key in ("plan_sn", "sn", "serial_number"):
            if key in attributes and attributes[key]:
                attributes[key] = "DEMO"
    devices = data.get("devices") if isinstance(data.get("devices"), dict) else {}
    mapping = {old: f"demo{i:02d}" for i, old in enumerate(sorted(devices), start=1)}
    if devices:
        data["devices"] = {mapping[old]: scrub_device(dev) for old, dev in devices.items()}
    if isinstance(data.get("entities"), dict):
        for entry in data["entities"].values():
            if entry.get("device_id") in mapping:
                entry["device_id"] = mapping[entry["device_id"]]
    for state in (data.get("states") or {}).values():
        state.pop("last_changed", None)
        state.pop("last_updated", None)
        state.pop("context", None)
    return data


def tracked_files() -> list[pathlib.Path]:
    out = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True)
    return [REPO / line for line in out.stdout.split() if line]


def check() -> int:
    findings = 0
    for path in tracked_files():
        rel = str(path.relative_to(REPO))
        if SELF.search(rel):
            continue  # this file names what it replaces
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # binary artwork
        ui = any(p.search(rel) for p in UI_FILES)
        if rel.endswith("fixture.json"):
            # Entity names and units come translated from the integration ("Prędkość łopatek").
            # The captured room, zone and device names are caught by their own rule below.
            text = re.sub(r'"(friendly_name|unit_of_measurement|options|description)":\s*(\[[^\]]*\]|"[^"]*")',
                          '"\\1": ""', text)
        for pattern, what in DENY:
            if ui and "Polish characters" in what:
                continue
            for match in re.finditer(pattern, text):
                line = text[: match.start()].count("\n") + 1
                print(f"{rel}:{line}: {what}: {match.group(0)[:60]}")
                findings += 1
                break
    print(f"{findings} finding(s) over {len(tracked_files())} tracked files")
    return 1 if findings else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.write:
        for path in sorted(APPS.glob("*/manifest.json")):
            data = walk(json.loads(path.read_text(encoding="utf-8")))
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("rewritten", path.relative_to(REPO))
        for path in sorted(APPS.glob("*/fixture.json")):
            data = anonymise(path)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print("rewritten", path.relative_to(REPO))
    if args.check or not args.write:
        return check()
    return 0


if __name__ == "__main__":
    sys.exit(main())
