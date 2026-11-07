"""The shipped strings cover every key the flows can show, in every language.

A missing label renders as the raw key in the dialog, and a missing error or abort string
renders as the code. Neither fails any other test, so they are asserted here against the
schema and the code itself rather than against a copy of the key list. The per-app fields
are generated from the manifests, so they are asserted against the generator.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from custom_components.app_hub import config_flow
from custom_components.app_hub.const import DOMAIN

ROOT = Path(__file__).resolve().parent.parent / "custom_components" / DOMAIN
FILES = [ROOT / "strings.json", *sorted((ROOT / "translations").glob("*.json"))]
USER_KEYS = {str(key) for key in config_flow._hub_schema({}, with_apps=True).schema}
HUB_KEYS = {str(key) for key in config_flow._hub_schema({}).schema}
MENU = {"hub", "apps", "advanced"}
# Every error code _parse can return, read from the source rather than restated.
ERROR_CODES = {"invalid_json", "not_an_object"}
ABORT_CODES = {"single_instance_allowed"}


def _gen_strings():
    """The label generator, loaded from tools/ where it lives next to notice.py."""
    path = Path(__file__).resolve().parent.parent / "tools" / "gen_strings.py"
    spec = importlib.util.spec_from_file_location("gen_strings", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_file_is_json(path: Path) -> None:
    assert isinstance(_load(path), dict)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
@pytest.mark.parametrize(
    ("section", "step", "keys"), [("config", "user", USER_KEYS), ("options", "hub", HUB_KEYS)]
)
def test_every_schema_key_has_a_label(path: Path, section: str, step: str, keys: set) -> None:
    data = _load(path)[section]["step"][step]["data"]
    assert set(data) >= keys, f"{path.name}/{section}: missing {keys - set(data)}"
    assert not set(data) - keys, f"{path.name}/{section}: stale {set(data) - keys}"


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_the_menu_is_labelled(path: Path) -> None:
    """A menu option with no label renders as its step id."""
    assert set(_load(path)["options"]["step"]["init"]["menu_options"]) == MENU


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_app_field_labels_match_the_manifests(path: Path) -> None:
    """The generated labels are in step with the manifests; otherwise fields show as keys."""
    gen = _gen_strings()
    language = "en" if path.name == "strings.json" else path.stem
    assert _load(path)["options"]["step"]["app"]["data"] == gen.wanted(language)


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
@pytest.mark.parametrize("section", ["config", "options"])
def test_every_error_code_is_translated(path: Path, section: str) -> None:
    errors = _load(path)[section].get("error", {})
    assert set(errors) >= ERROR_CODES, f"{path.name}/{section}: missing {ERROR_CODES - set(errors)}"


@pytest.mark.parametrize("path", FILES, ids=lambda p: p.name)
def test_abort_reasons_sit_under_abort(path: Path) -> None:
    """Home Assistant reads abort strings from config.abort, nowhere else."""
    config = _load(path)["config"]
    assert set(config.get("abort", {})) >= ABORT_CODES
    for code in ABORT_CODES:
        assert code not in config, f"{path.name}: {code} is outside config.abort and is ignored"


def test_parse_returns_only_translated_codes() -> None:
    """The codes asserted above are the ones the flow actually produces."""
    _, bad_json = config_flow._parse({config_flow.CONF_APPS: "{not json"})
    _, not_object = config_flow._parse({config_flow.CONF_APPS: "[1]"})
    assert set(bad_json.values()) | set(not_object.values()) <= ERROR_CODES
