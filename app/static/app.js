const state = {
  projects: [],
  projectId: null,
  project: null,
  images: [],
  currentIndex: -1,
  currentImage: null,
  currentImageBitmap: null,
  clicks: [],
  preview: null,
  approvedAnnotations: [],
};

let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;

function updateTransform() {
  if (els.canvas) {
    els.canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }
}

const els = {
  projectSelect: document.querySelector("#projectSelect"),
  newProjectBtn: document.querySelector("#newProjectBtn"),
  datasetDir: document.querySelector("#dataset_dir") || document.querySelector("#datasetDir"),
  sam2Cfg: document.querySelector("#sam2Cfg"),
  sam2Checkpoint: document.querySelector("#sam2Checkpoint"),
  device: document.querySelector("#device"),
  classes: document.querySelector("#classes"),
  saveProject: document.querySelector("#saveProject"),
  refreshProject: document.querySelector("#refreshProject"),
  imageList: document.querySelector("#imageList"),
  imageCount: document.querySelector("#imageCount"),
  currentName: document.querySelector("#currentName"),
  classSelect: document.querySelector("#classSelect"),
  runSegmentation: document.querySelector("#runSegmentation"),
  approveMask: document.querySelector("#approveMask"),
  clearClicks: document.querySelector("#clearClicks"),
  resetView: document.querySelector("#resetView"),
  exportDataset: document.querySelector("#exportDataset"),
  prevImage: document.querySelector("#prevImage"),
  nextImage: document.querySelector("#nextImage"),
  annotationList: document.querySelector("#annotationList"),
  status: document.querySelector("#status"),
  canvas: document.querySelector("#imageCanvas"),
};

const ctx = els.canvas ? els.canvas.getContext("2d") : null;

function setStatus(message, type = "") {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Request failed");
  }
  return payload;
}

function renderClassOptions(classes) {
  if (!els.classSelect) return;
  els.classSelect.innerHTML = "";
  classes.forEach((className) => {
    const option = document.createElement("option");
    option.value = className;
    option.textContent = className;
    els.classSelect.append(option);
  });
}

function drawCanvas() {
  if (!ctx || !els.canvas) return;
  const image = state.currentImageBitmap;
  if (!image) {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    return;
  }

  els.canvas.width = image.width;
  els.canvas.height = image.height;
  ctx.clearRect(0, 0, image.width, image.height);
  ctx.drawImage(image, 0, 0);

  for (const annotation of state.approvedAnnotations) {
    drawPolygon(annotation.polygon, "rgba(20, 184, 166, 0.2)", "#14b8a6");
  }
  if (state.preview?.polygon) {
    drawPolygon(state.preview.polygon, "rgba(99, 102, 241, 0.25)", "#818cf8");
  }
  for (const click of state.clicks) {
    ctx.beginPath();
    ctx.arc(click.x, click.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = click.label === 1 ? "#14b8a6" : "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawPolygon(polygon, fill, stroke) {
  if (!polygon || polygon.length < 3 || !ctx) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(polygon[0][0], polygon[0][1]);
  polygon.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}

function renderImageList() {
  if (els.imageCount) els.imageCount.textContent = `${state.images.length} images`;
  if (!els.imageList) return;
  els.imageList.innerHTML = "";
  state.images.forEach((image, index) => {
    const item = document.createElement("button");
    item.className = `image-item ${index === state.currentIndex ? "active" : ""}`;
    item.innerHTML = `<strong>${image.name}</strong><div>${image.relative_path}</div><div>${image.annotation_count || 0} approved</div>`;
    item.addEventListener("click", () => loadImage(index));
    els.imageList.append(item);
  });
}

function renderAnnotations() {
  if (!els.annotationList) return;
  els.annotationList.innerHTML = "";
  if (!state.approvedAnnotations.length) {
    els.annotationList.innerHTML = `<div class="annotation-item">No approved annotations yet.</div>`;
    return;
  }
  state.approvedAnnotations.forEach((annotation, index) => {
    const row = document.createElement("div");
    row.className = "annotation-item";
    row.innerHTML = `<div class="row"><strong>${annotation.class_name}</strong><span class="pill">${(annotation.score || 0).toFixed(3)}</span></div>`;
    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      await fetchJson(`/api/projects/${state.projectId}/images/${encodeURIComponent(state.currentImage.id)}/annotations/${index}`, { method: "DELETE" });
      await refreshAnnotations();
      renderImageList();
      drawCanvas();
    });
    row.append(remove);
    els.annotationList.append(row);
  });
}

async function loadProjects() {
  const list = await fetchJson("/api/projects");
  state.projects = list;
  if (!els.projectSelect) return;
  els.projectSelect.innerHTML = "";
  
  if (list.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No projects found";
    opt.value = "";
    els.projectSelect.appendChild(opt);
    els.projectSelect.disabled = true;
    state.projectId = null;
    return;
  }
  
  els.projectSelect.disabled = false;
  list.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    els.projectSelect.appendChild(opt);
  });
  
  if (!state.projectId || !list.find(p => p.id === state.projectId)) {
    state.projectId = list[0].id;
  }
  els.projectSelect.value = state.projectId;
}

if (els.newProjectBtn) {
  els.newProjectBtn.addEventListener("click", async () => {
    const name = prompt("Enter new project name:");
    if (!name) return;
    try {
      const p = await fetchJson("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      state.projectId = p.id;
      await loadProjects();
      await loadProject();
      setStatus(`Created project: ${name}`, "success");
    } catch(err) {
      setStatus(err.message, "error");
    }
  });
}

if (els.projectSelect) {
  els.projectSelect.addEventListener("change", async (e) => {
    state.projectId = e.target.value;
    await loadProject();
  });
}

async function loadProject() {
  if (!state.projectId) {
    state.project = null;
    state.images = [];
    state.currentImageBitmap = null;
    drawCanvas();
    renderImageList();
    setStatus("Create a new project to start.", "warn");
    return;
  }
  const payload = await fetchJson(`/api/projects/${state.projectId}`);
  state.project = payload.project;
  state.images = payload.images;
  if (els.datasetDir) els.datasetDir.value = state.project.dataset_dir || "";
  if (els.sam2Cfg) els.sam2Cfg.value = state.project.sam2_model_cfg || "";
  if (els.sam2Checkpoint) els.sam2Checkpoint.value = state.project.sam2_checkpoint || "";
  if (els.device) els.device.value = state.project.device || "cpu";
  if (els.classes) els.classes.value = (state.project.classes || ["object"]).join("\n");
  renderClassOptions(state.project.classes || ["object"]);
  renderImageList();
  if (state.images.length && state.currentIndex === -1) {
    await loadImage(0);
  } else {
    state.currentIndex = -1;
    state.currentImage = null;
    state.currentImageBitmap = null;
    drawCanvas();
  }
}

async function refreshAnnotations() {
  if (!state.currentImage || !state.projectId) {
    state.approvedAnnotations = [];
    renderAnnotations();
    return;
  }
  const payload = await fetchJson(`/api/projects/${state.projectId}/images/${encodeURIComponent(state.currentImage.id)}/annotations`);
  state.approvedAnnotations = payload.annotations || [];
  const currentMeta = state.images.find((item) => item.id === state.currentImage.id);
  if (currentMeta) {
    currentMeta.annotation_count = state.approvedAnnotations.length;
  }
  renderAnnotations();
}

async function loadImage(index) {
  state.currentIndex = index;
  state.currentImage = state.images[index] || null;
  state.clicks = [];
  state.preview = null;
  
  zoom = 1;
  panX = 0;
  panY = 0;
  updateTransform();

  renderImageList();
  if (!state.currentImage) {
    state.currentImageBitmap = null;
    drawCanvas();
    return;
  }
  const response = await fetch(state.currentImage.url);
  const blob = await response.blob();
  state.currentImageBitmap = await createImageBitmap(blob);
  if (els.currentName) els.currentName.textContent = state.currentImage.relative_path;
  await refreshAnnotations();
  drawCanvas();
}

async function saveProject() {
  if (!state.projectId) return;
  const classes = els.classes.value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const payload = await fetchJson(`/api/projects/${state.projectId}`, {
    method: "POST",
    body: JSON.stringify({
      dataset_dir: els.datasetDir.value.trim(),
      sam2_model_cfg: els.sam2Cfg.value.trim(),
      sam2_checkpoint: els.sam2Checkpoint.value.trim(),
      device: els.device.value.trim() || "cpu",
      classes,
    }),
  });
  state.project = payload.project;
  renderClassOptions(state.project.classes);
  setStatus("Project settings saved.", "success");
  await loadProject();
}

async function runSegmentation() {
  if (!state.projectId) return;
  if (!state.currentImage) {
    setStatus("Choose an image first.", "error");
    return;
  }
  if (!state.clicks.length) {
    setStatus("Add at least one click.", "error");
    return;
  }
  setStatus("Running SAM2...");
  const payload = await fetchJson(`/api/projects/${state.projectId}/segment`, {
    method: "POST",
    body: JSON.stringify({
      image_id: state.currentImage.id,
      clicks: state.clicks,
    }),
  });
  state.preview = payload;
  drawCanvas();
  setStatus(`Preview ready with score ${payload.score.toFixed(3)}. Approve to save.`, "success");
}

async function approveMask() {
  if (!state.projectId) return;
  if (!state.preview?.polygon || !state.currentImage) {
    setStatus("Preview a mask before approving it.", "error");
    return;
  }
  await fetchJson(`/api/projects/${state.projectId}/images/${encodeURIComponent(state.currentImage.id)}/annotations`, {
    method: "POST",
    body: JSON.stringify({
      class_name: els.classSelect.value,
      polygon: state.preview.polygon,
      score: state.preview.score,
      bbox: state.preview.bbox,
    }),
  });
  state.preview = null;
  state.clicks = [];
  await refreshAnnotations();
  renderImageList();
  drawCanvas();
  setStatus("Annotation approved and stored.", "success");
}

async function exportDataset() {
  if (!state.projectId) return;
  const trainRatio = (parseFloat(document.getElementById("splitTrain").value) || 80) / 100;
  const valRatio = (parseFloat(document.getElementById("splitVal").value) || 10) / 100;
  const testRatio = (parseFloat(document.getElementById("splitTest").value) || 10) / 100;

  const payload = await fetchJson(`/api/projects/${state.projectId}/export`, {
    method: "POST",
    body: JSON.stringify({
      output_dir: "exports/yolo_dataset",
      train_ratio: trainRatio,
      val_ratio: valRatio,
      test_ratio: testRatio,
      copy_images: true,
    }),
  });
  setStatus(`Exported YOLO dataset to ${payload.output_dir}`, "success");
}

if (els.refreshProject) {
  els.refreshProject.addEventListener("click", async () => {
    try {
      setStatus("Scanning folder for new images...");
      await loadProject();
      setStatus(`Dataset reloaded. Found ${state.images.length} total images.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

if (els.saveProject) els.saveProject.addEventListener("click", () => saveProject().catch((error) => setStatus(error.message, "error")));
if (els.runSegmentation) els.runSegmentation.addEventListener("click", () => runSegmentation().catch((error) => setStatus(error.message, "error")));
if (els.approveMask) els.approveMask.addEventListener("click", () => approveMask().catch((error) => setStatus(error.message, "error")));
if (els.exportDataset) els.exportDataset.addEventListener("click", () => exportDataset().catch((error) => setStatus(error.message, "error")));
if (els.clearClicks) {
  els.clearClicks.addEventListener("click", () => {
    state.clicks = [];
    state.preview = null;
    drawCanvas();
    setStatus("Clicks cleared.");
  });
}

if (els.resetView) {
  els.resetView.addEventListener("click", () => {
    zoom = 1;
    panX = 0;
    panY = 0;
    updateTransform();
  });
}
if (els.prevImage) {
  els.prevImage.addEventListener("click", () => {
    if (state.currentIndex > 0) {
      loadImage(state.currentIndex - 1).catch((error) => setStatus(error.message, "error"));
    }
  });
}
if (els.nextImage) {
  els.nextImage.addEventListener("click", () => {
    if (state.currentIndex < state.images.length - 1) {
      loadImage(state.currentIndex + 1).catch((error) => setStatus(error.message, "error"));
    }
  });
}

if (els.canvas) {
  els.canvas.addEventListener("click", (event) => {
    if (!state.currentImageBitmap) {
      return;
    }
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    state.clicks.push({ x, y, label: event.shiftKey ? 0 : 1 });
    state.preview = null;
    drawCanvas();
    setStatus(`Added ${event.shiftKey ? "negative" : "positive"} click at (${Math.round(x)}, ${Math.round(y)}).`);
  });
}

const canvasWrapper = document.querySelector(".canvas-wrapper");
if (canvasWrapper) {
  canvasWrapper.addEventListener("wheel", (e) => {
    e.preventDefault();
    const oldZoom = zoom;
    const zoomFactor = 1.1;
    if (e.deltaY < 0) zoom *= zoomFactor;
    else zoom /= zoomFactor;
    zoom = Math.max(0.1, Math.min(zoom, 50));

    const rect = canvasWrapper.getBoundingClientRect();
    const screenX = e.clientX - rect.left - rect.width / 2;
    const screenY = e.clientY - rect.top - rect.height / 2;

    panX = screenX - ((screenX - panX) / oldZoom) * zoom;
    panY = screenY - ((screenY - panY) / oldZoom) * zoom;
    updateTransform();
  }, { passive: false });

  canvasWrapper.addEventListener("mousedown", (e) => {
    if (e.button === 2 || e.button === 1) { // Right or middle click
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
      canvasWrapper.style.cursor = "grabbing";
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    updateTransform();
  });

  window.addEventListener("mouseup", () => {
    if (isPanning) {
      isPanning = false;
      canvasWrapper.style.cursor = "default";
    }
  });

  canvasWrapper.addEventListener("contextmenu", (e) => e.preventDefault());
}

const toggleLeft = document.getElementById("toggleLeft") || document.getElementById("toggle-left");
const toggleRight = document.getElementById("toggleRight") || document.getElementById("toggle-right");
const panelLeft = document.querySelector(".panel-left") || document.getElementById("panel-left");
const panelRight = document.querySelector(".panel-right") || document.getElementById("panel-right");

if (toggleLeft) {
  toggleLeft.addEventListener("click", () => panelLeft.classList.toggle("collapsed"));
}
if (toggleRight) {
  toggleRight.addEventListener("click", () => panelRight.classList.toggle("collapsed"));
}

const deleteProjectBtn = document.getElementById("deleteProjectBtn");
if (deleteProjectBtn) {
  deleteProjectBtn.addEventListener("click", async () => {
    if (!state.projectId) return;
    if (confirm("Are you sure you want to permanently delete this project entirely? All annotations tracking will be lost!")) {
      try {
        await fetchJson(`/api/projects/${state.projectId}`, { method: "DELETE" });
        window.location.reload();
      } catch (error) {
        setStatus(error.message, "error");
      }
    }
  });
}

// Initial bootstrap
(async () => {
  try {
    await loadProjects();
    await loadProject();
  } catch(error) {
    setStatus(error.message, "error");
  }
})();
