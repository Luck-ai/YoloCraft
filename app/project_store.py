from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).resolve().parent / "data"
PROJECTS_DIR = DATA_DIR / "projects"

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


def list_projects() -> list[dict]:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    for d in PROJECTS_DIR.iterdir():
        if d.is_dir() and (d / "project.json").exists():
            data = _read_json(d / "project.json", {})
            results.append({
                "id": data.get("id", d.name),
                "name": data.get("name", "Unnamed Project")
            })
    return sorted(results, key=lambda x: x["name"])


def create_project(name: str) -> dict:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    project_id = str(uuid.uuid4())
    project_dir = PROJECTS_DIR / project_id
    project_dir.mkdir()
    
    payload = DEFAULT_PROJECT.copy()
    payload["id"] = project_id
    payload["name"] = name
    
    _write_json(project_dir / "project.json", payload)
    _write_json(project_dir / "annotations.json", {"images": {}})
    
    return payload


def load_project(project_id: str) -> dict[str, Any]:
    project_file = PROJECTS_DIR / project_id / "project.json"
    if not project_file.exists():
        raise FileNotFoundError(f"Project {project_id} not found")
    payload = _read_json(project_file, {})
    # Ensure backwards compatibility keys
    payload = {**DEFAULT_PROJECT, **payload}
    payload["classes"] = [name.strip() for name in payload.get("classes", ["object"]) if name.strip()] or ["object"]
    return payload


def save_project(project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    project_file = PROJECTS_DIR / project_id / "project.json"
    if not project_file.exists():
        raise FileNotFoundError(f"Project {project_id} not found")
    existing = _read_json(project_file, {})
    normalized = {**existing, **payload}
    normalized["classes"] = [name.strip() for name in normalized.get("classes", ["object"]) if name.strip()] or ["object"]
    _write_json(project_file, normalized)
    return normalized


def load_annotations(project_id: str) -> dict[str, Any]:
    ann_file = PROJECTS_DIR / project_id / "annotations.json"
    return _read_json(ann_file, {"images": {}})


def save_annotations(project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    ann_file = PROJECTS_DIR / project_id / "annotations.json"
    _write_json(ann_file, payload)
    return payload


def delete_project(project_id: str) -> None:
    project_dir = PROJECTS_DIR / project_id
    if project_dir.exists() and project_dir.is_dir():
        import shutil
        shutil.rmtree(project_dir)
