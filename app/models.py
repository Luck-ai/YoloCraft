from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ClickPoint(BaseModel):
    x: float
    y: float
    label: Literal[0, 1] = 1


class SegmentRequest(BaseModel):
    image_id: str
    clicks: list[ClickPoint] = Field(default_factory=list)


class ProjectSettingsUpdate(BaseModel):
    dataset_dir: str = ""
    sam2_checkpoint: str = ""
    sam2_model_cfg: str = ""
    device: str = "cpu"
    classes: list[str] = Field(default_factory=lambda: ["object"])


class AnnotationCreate(BaseModel):
    class_name: str
    polygon: list[list[float]]
    score: float | None = None
    bbox: list[float] | None = None


class ExportRequest(BaseModel):
    output_dir: str = "exports/yolo_dataset"
    train_ratio: float = 0.8
    val_ratio: float = 0.1
    test_ratio: float = 0.1
    copy_images: bool = True
