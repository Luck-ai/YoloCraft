# SAM2 YOLO Dataset Builder

Local web app for building a YOLO segmentation dataset with click-assisted masks from SAM2.

## What it does

- Scans a local image dataset folder
- Full-screen, image-centric UI with floating glassmorphism panels
- Zoom and pan capabilities for highly precise annotations
- Lets you click on an image to prompt SAM2 (Left click = Positive, Shift+Click = Negative)
- Draws the predicted polygon mask in the browser instantly
- Saves approved masks with a class label
- Exports approved annotations in YOLO segmentation format with custom Train/Val/Test splits

## Project structure

- `app/main.py`: FastAPI server and API routes
- `app/sam2_service.py`: SAM2 integration for image click prompts
- `app/export_service.py`: YOLO segmentation export
- `app/project_store.py`: Multi-project storage operations
- `app/static/`: browser UI
- `app/data/projects/`: uniquely generated folders for saved project settings and annotations

## Requirements

Install the Python dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Install SAM2 into the same environment so `import sam2` works. This app expects:

- a SAM2 Hydra config name such as `configs/sam2.1/sam2.1_hiera_t.yaml`
- a SAM2 checkpoint path such as `models/sam2.1_hiera_tiny.pt`

### Downloading SAM2 Models

You will need to download a SAM2.1 checkpoint file. It is recommended to place it in the `models/` directory. Here are the official download links from Meta:

- [sam2.1_hiera_tiny.pt](https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt) (Fastest, best for CPU)
- [sam2.1_hiera_small.pt](https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt)
- [sam2.1_hiera_base_plus.pt](https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt)
- [sam2.1_hiera_large.pt](https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt) (Most accurate, best if you have a GPU)

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

The export writes the standard YOLO structures based on your configured Train/Val/Test percentages:

- `exports/yolo_dataset/images/{train,val,test}`
- `exports/yolo_dataset/labels/{train,val,test}`
- `exports/yolo_dataset/data.yaml`

## Notes

- The app natively supports multiple discrete projects. Your datasets are securely isolated inside ID directories in `app/data/projects/`.
- The exporter uses polygons for YOLO segmentation labels.
- Validation and Test splits are deterministic using a fixed random seed.
- If you want box-only YOLO export or multi-user review queues, that can be added next.
