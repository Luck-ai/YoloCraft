# SAM2 YOLO Dataset Builder

Local web app for building a YOLO segmentation dataset with click-assisted masks from SAM2.

## What it does

- Scans a local image dataset folder
- Lets you click on an image to prompt SAM2
- Draws the predicted polygon mask in the browser
- Saves approved masks with a class label
- Exports approved annotations in YOLO segmentation format

## Project structure

- `app/main.py`: FastAPI server and API routes
- `app/sam2_service.py`: SAM2 integration for image click prompts
- `app/export_service.py`: YOLO segmentation export
- `app/static/`: browser UI
- `app/data/`: saved project settings and approved annotations

## Requirements

Install the Python dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Install SAM2 into the same environment so `import sam2` works. This app expects:

- a SAM2 Hydra config name such as `configs/sam2.1/sam2.1_hiera_t.yaml`
- a SAM2 checkpoint path such as `sam2.1_hiera_tiny.pt`

## Run

```bash
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`.

## Workflow

1. Enter your dataset folder.
2. Enter the SAM2 config name and checkpoint path.
3. Add one class per line.
4. Pick an image from the sidebar.
5. Left click for a positive point, `Shift+click` for a negative point.
6. Click `Preview Mask`.
7. If the mask looks right, click `Approve`.
8. Repeat across the dataset.
9. Click `Export YOLO`.

The export writes:

- `exports/yolo_dataset/images/train`
- `exports/yolo_dataset/images/val`
- `exports/yolo_dataset/labels/train`
- `exports/yolo_dataset/labels/val`
- `exports/yolo_dataset/data.yaml`

## Notes

- This first version stores approved annotations in `app/data/annotations.json`.
- The exporter uses polygons for YOLO segmentation labels.
- Validation split is deterministic with a fixed random seed.
- If you want box-only YOLO export or multi-user review queues, that can be added next.
