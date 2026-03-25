from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from app.geometry import mask_to_polygon, polygon_bbox


class Sam2Service:
    def __init__(self) -> None:
        self._predictor = None
        self._loaded_key: tuple[str, str, str] | None = None

    @staticmethod
    def _normalize_model_cfg(model_cfg: str) -> str:
        raw = str(model_cfg).strip()
        if not raw:
            raise ValueError("SAM2 config is required")
        marker = "site-packages/sam2/"
        if marker in raw:
            return raw.split(marker, 1)[1]
        return raw.lstrip("/")

    def _load_predictor(self, model_cfg: str, checkpoint: str, device: str):
        normalized_model_cfg = self._normalize_model_cfg(model_cfg)
        key = (normalized_model_cfg, checkpoint, device)
        if self._predictor is not None and self._loaded_key == key:
            return self._predictor

        checkpoint_path = Path(checkpoint).expanduser().resolve()
        if not checkpoint_path.exists():
            raise FileNotFoundError(f"SAM2 checkpoint not found: {checkpoint_path}")

        try:
            from sam2.build_sam import build_sam2
            from sam2.sam2_image_predictor import SAM2ImagePredictor
        except ImportError as exc:
            raise RuntimeError(
                "SAM2 is not installed in the current Python environment. "
                "Install it locally and make sure `sam2` is importable."
            ) from exc

        model = build_sam2(normalized_model_cfg, str(checkpoint_path), device=device)
        self._predictor = SAM2ImagePredictor(model)
        self._loaded_key = key
        return self._predictor

    @staticmethod
    @lru_cache(maxsize=64)
    def _load_image(path: str) -> np.ndarray:
        with Image.open(path) as image:
            return np.array(image.convert("RGB"))

    def segment(self, image_path: Path, clicks: list[dict], model_cfg: str, checkpoint: str, device: str) -> dict:
        if not clicks:
            raise ValueError("At least one click is required")

        predictor = self._load_predictor(model_cfg, checkpoint, device)
        image = self._load_image(str(image_path))
        predictor.set_image(image)

        coords = np.array([[point["x"], point["y"]] for point in clicks], dtype=np.float32)
        labels = np.array([point["label"] for point in clicks], dtype=np.int32)

        masks, scores, _ = predictor.predict(
            point_coords=coords,
            point_labels=labels,
            multimask_output=True,
        )
        best_idx = int(np.argmax(scores))
        best_mask = masks[best_idx]
        polygon = mask_to_polygon(best_mask)
        if len(polygon) < 3:
            raise RuntimeError("SAM2 returned a mask that could not be converted to a polygon")

        return {
            "polygon": polygon,
            "bbox": polygon_bbox(polygon),
            "score": float(scores[best_idx]),
        }
