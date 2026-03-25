from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).resolve().parent / "data"
PROJECT_FILE = DATA_DIR / "project.json"
ANNOTATIONS_FILE = DATA_DIR / "annotations.json"

DEFAULT_PROJECT = {
    "dataset_dir": "",
    "sam2_checkpoint": "",
    "sam2_model_cfg": "",
    "device": "cpu",
    "classes": ["object"],
}


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: Any) -> None:
    _ensure_parent(path)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temp_path.replace(path)


def load_project() -> dict[str, Any]:
    payload = DEFAULT_PROJECT | _read_json(PROJECT_FILE, {})
    payload["classes"] = [name.strip() for name in payload.get("classes", ["object"]) if name.strip()] or ["object"]
    return payload


def save_project(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = DEFAULT_PROJECT | payload
    normalized["classes"] = [name.strip() for name in normalized.get("classes", ["object"]) if name.strip()] or ["object"]
    _write_json(PROJECT_FILE, normalized)
    return normalized


def load_annotations() -> dict[str, Any]:
    return _read_json(ANNOTATIONS_FILE, {"images": {}})


def save_annotations(payload: dict[str, Any]) -> dict[str, Any]:
    _write_json(ANNOTATIONS_FILE, payload)
    return payload
