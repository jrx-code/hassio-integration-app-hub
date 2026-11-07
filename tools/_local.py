"""Where the developer's own test instance lives, kept out of the repository.

The deploy and mirror tools talk to one Home Assistant that is not this project's: an
address, an ssh user, vault entries and the entity prefixes of a real home. None of that
belongs in a public repository, and none of it is the same for the next person, so it is
read at run time from a file this repository does not carry.

    cp tools/test_instance.example.json tools/test_instance.local.json   # then edit it
    APP_HUB_TEST_CONFIG=/somewhere/else.json python3 tools/vm103_deploy.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT = HERE / "test_instance.local.json"
EXAMPLE = HERE / "test_instance.example.json"
_CACHE: dict | None = None


def config() -> dict:
    global _CACHE
    if _CACHE is None:
        path = Path(os.environ.get("APP_HUB_TEST_CONFIG", DEFAULT))
        if not path.exists():
            sys.exit(
                f"no test instance configured: copy {EXAMPLE.name} to {path.name} and fill it in"
            )
        _CACHE = json.loads(path.read_text(encoding="utf-8"))
    return _CACHE


def get(key: str, default=None):
    value = config().get(key, default)
    if value is None and default is None:
        sys.exit(f"test instance config has no {key!r}")
    return value
