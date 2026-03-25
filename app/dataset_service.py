from __future__ import annotations

from pathlib import Path

from PIL import Image

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def resolve_dataset_dir(dataset_dir: str) -> Path:
    path = Path(dataset_dir).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Dataset directory does not exist: {path}")
    if not path.is_dir():
        raise NotADirectoryError(f"Dataset path is not a directory: {path}")
    return path


def scan_images(dataset_dir: str) -> list[dict]:
    root = resolve_dataset_dir(dataset_dir)
    items: list[dict] = []
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        rel_path = path.relative_to(root).as_posix()
        width, height = read_image_size(path)
        items.append(
            {
                "id": rel_path,
                "name": path.name,
                "relative_path": rel_path,
                "width": width,
                "height": height,
            }
        )
    return items


def get_image_path(dataset_dir: str, image_id: str) -> Path:
    root = resolve_dataset_dir(dataset_dir)
    path = (root / image_id).resolve()
    if root not in path.parents and path != root:
        raise ValueError("Image path escapes the dataset directory")
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")
    return path


def read_image_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size
