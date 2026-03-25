from __future__ import annotations

import random
import shutil
from pathlib import Path

import yaml

from app.dataset_service import get_image_path, read_image_size, resolve_dataset_dir


def _normalize_polygon(polygon: list[list[float]], width: int, height: int) -> str:
    coords: list[str] = []
    for x, y in polygon:
        coords.append(f"{x / width:.6f}")
        coords.append(f"{y / height:.6f}")
    return " ".join(coords)


def export_yolo_segmentation(
    dataset_dir: str,
    annotations: dict,
    classes: list[str],
    output_dir: str,
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    copy_images: bool,
) -> dict:
    dataset_root = resolve_dataset_dir(dataset_dir)
    export_root = Path(output_dir).expanduser().resolve()
    image_train_dir = export_root / "images" / "train"
    image_val_dir = export_root / "images" / "val"
    image_test_dir = export_root / "images" / "test"
    label_train_dir = export_root / "labels" / "train"
    label_val_dir = export_root / "labels" / "val"
    label_test_dir = export_root / "labels" / "test"
    for path in [image_train_dir, image_val_dir, image_test_dir, label_train_dir, label_val_dir, label_test_dir]:
        path.mkdir(parents=True, exist_ok=True)

    class_to_id = {name: idx for idx, name in enumerate(classes)}
    annotated_items = [
        (image_id, data)
        for image_id, data in annotations.get("images", {}).items()
        if data.get("annotations")
    ]
    if not annotated_items:
        raise ValueError("No approved annotations available to export")

    rng = random.Random(42)
    shuffled = annotated_items[:]
    rng.shuffle(shuffled)
    total_ratio = train_ratio + val_ratio + test_ratio
    if total_ratio <= 0:
        train_ratio, val_ratio, test_ratio = 1.0, 0.0, 0.0
    else:
        train_ratio /= total_ratio
        val_ratio /= total_ratio
        test_ratio /= total_ratio

    total = len(shuffled)
    train_count = int(total * train_ratio)
    val_count = int(total * val_ratio)

    train_slice = shuffled[:train_count]
    val_slice = shuffled[train_count:train_count + val_count]
    
    train_ids = {item[0] for item in train_slice}
    val_ids = {item[0] for item in val_slice}

    exported = {"train": 0, "val": 0, "test": 0}
    for image_id, data in annotated_items:
        if image_id in train_ids:
            split = "train"
        elif image_id in val_ids:
            split = "val"
        else:
            split = "test"
        image_path = get_image_path(str(dataset_root), image_id)
        width, height = read_image_size(image_path)
        label_lines: list[str] = []
        for annotation in data["annotations"]:
            class_id = class_to_id.get(annotation["class_name"])
            if class_id is None:
                continue
            polygon = annotation["polygon"]
            if len(polygon) < 3:
                continue
            label_lines.append(f"{class_id} {_normalize_polygon(polygon, width, height)}")

        if not label_lines:
            continue

        if split == "train":
            label_dir = label_train_dir
            image_dir = image_train_dir
        elif split == "val":
            label_dir = label_val_dir
            image_dir = image_val_dir
        else:
            label_dir = label_test_dir
            image_dir = image_test_dir
        relative_path = Path(image_id)
        label_path = (label_dir / relative_path).with_suffix(".txt")
        label_path.parent.mkdir(parents=True, exist_ok=True)
        label_path.write_text("\n".join(label_lines) + "\n", encoding="utf-8")
        if copy_images:
            destination = image_dir / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(image_path, destination)
        exported[split] += 1

    yaml_payload = {
        "path": str(export_root),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {idx: name for idx, name in enumerate(classes)},
    }
    (export_root / "data.yaml").write_text(yaml.safe_dump(yaml_payload, sort_keys=False), encoding="utf-8")
    return {"output_dir": str(export_root), "counts": exported}
