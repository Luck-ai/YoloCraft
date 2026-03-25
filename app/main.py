from __future__ import annotations

from pathlib import Path
from urllib.parse import quote, unquote

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.dataset_service import get_image_path, scan_images
from app.export_service import export_yolo_segmentation
from app.models import AnnotationCreate, ExportRequest, ProjectSettingsUpdate, SegmentRequest
from app.project_store import list_projects, create_project, load_annotations, load_project, save_annotations, save_project, delete_project
from app.sam2_service import Sam2Service

app = FastAPI(title="SAM2 YOLO Dataset Builder")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(__file__).resolve().parent / "static"
sam2_service = Sam2Service()


class ProjectCreateRequest(BaseModel):
    name: str


@app.get("/api/projects")
def get_projects() -> list[dict]:
    return list_projects()


@app.post("/api/projects")
def create_new_project(payload: ProjectCreateRequest) -> dict:
    return create_project(payload.name)


@app.get("/api/projects/{project_id}")
def get_project(project_id: str) -> dict:
    try:
        project = load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
        
    try:
        images = scan_images(project["dataset_dir"]) if project["dataset_dir"] else []
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
        
    annotations = load_annotations(project_id)
    for item in images:
        item["url"] = f"/api/projects/{project_id}/images/file/{quote(item['id'])}"
        item["annotation_count"] = len(annotations.get("images", {}).get(item["id"], {}).get("annotations", []))
        
    return {
        "project": project,
        "images": images,
        "sam2_ready": bool(project["sam2_checkpoint"] and project["sam2_model_cfg"]),
    }


@app.post("/api/projects/{project_id}")
def update_project(project_id: str, payload: ProjectSettingsUpdate) -> dict:
    try:
        if payload.dataset_dir:
            scan_images(payload.dataset_dir)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"project": save_project(project_id, payload.model_dump())}


@app.delete("/api/projects/{project_id}")
def delete_project_endpoint(project_id: str) -> dict:
    delete_project(project_id)
    return {"status": "ok"}


@app.get("/api/projects/{project_id}/images/{image_id:path}/annotations")
def get_image_annotations(project_id: str, image_id: str) -> dict:
    annotations = load_annotations(project_id)
    return annotations.get("images", {}).get(unquote(image_id), {"annotations": []})


@app.get("/api/projects/{project_id}/images/file/{image_id:path}")
def get_image_file(project_id: str, image_id: str):
    project = load_project(project_id)
    if not project["dataset_dir"]:
        raise HTTPException(status_code=400, detail="Dataset directory is not configured")
    try:
        path = get_image_path(project["dataset_dir"], unquote(image_id))
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path)


@app.post("/api/projects/{project_id}/segment")
def segment_image(project_id: str, payload: SegmentRequest) -> dict:
    project = load_project(project_id)
    if not project["dataset_dir"]:
        raise HTTPException(status_code=400, detail="Dataset directory is not configured")
    if not project["sam2_checkpoint"] or not project["sam2_model_cfg"]:
        raise HTTPException(status_code=400, detail="SAM2 config and checkpoint are required")
    try:
        image_path = get_image_path(project["dataset_dir"], payload.image_id)
        result = sam2_service.segment(
            image_path=image_path,
            clicks=[item.model_dump() for item in payload.clicks],
            model_cfg=project["sam2_model_cfg"],
            checkpoint=project["sam2_checkpoint"],
            device=project["device"],
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/images/{image_id:path}/annotations")
def create_annotation(project_id: str, image_id: str, payload: AnnotationCreate) -> dict:
    annotations = load_annotations(project_id)
    item = annotations.setdefault("images", {}).setdefault(unquote(image_id), {"annotations": []})
    item["annotations"].append(payload.model_dump())
    save_annotations(project_id, annotations)
    return item


@app.delete("/api/projects/{project_id}/images/{image_id:path}/annotations/{annotation_idx}")
def delete_annotation_endpoint(project_id: str, image_id: str, annotation_idx: int) -> dict:
    annotations = load_annotations(project_id)
    item = annotations.setdefault("images", {}).setdefault(unquote(image_id), {"annotations": []})
    if annotation_idx < 0 or annotation_idx >= len(item["annotations"]):
        raise HTTPException(status_code=404, detail="Annotation index out of range")
    item["annotations"].pop(annotation_idx)
    save_annotations(project_id, annotations)
    return item


@app.post("/api/projects/{project_id}/export")
def export_dataset(project_id: str, payload: ExportRequest) -> dict:
    project = load_project(project_id)
    if not project["dataset_dir"]:
        raise HTTPException(status_code=400, detail="Dataset directory is not configured")
    try:
        return export_yolo_segmentation(
            dataset_dir=project["dataset_dir"],
            annotations=load_annotations(project_id),
            classes=project["classes"],
            output_dir=payload.output_dir,
            train_ratio=payload.train_ratio,
            val_ratio=payload.val_ratio,
            test_ratio=payload.test_ratio,
            copy_images=payload.copy_images,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
