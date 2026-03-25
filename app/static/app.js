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

const els = {
  homeView: document.querySelector("#homeView"),
  editorView: document.querySelector("#editorView"),
  navHomeBtn: document.querySelector("#navHomeBtn"),
  navEditorBtn: document.querySelector("#navEditorBtn"),
  newProjectBtn: document.querySelector("#newProjectBtn"),
  projectGrid: document.querySelector("#projectGrid"),
  closeEditorBtn: document.querySelector("#closeEditorBtn"),
  toastContainer: document.querySelector("#toastContainer"),
  
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
  statusIcon: document.querySelector("#statusIcon"),
  canvas: document.querySelector("#imageCanvas"),
};

const ctx = els.canvas ? els.canvas.getContext("2d") : null;

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    let bg = "bg-surface-container-high border-outline-variant/30 text-white";
    if (type === "success") bg = "bg-primary-container text-white border-primary/50";
    if (type === "error") bg = "bg-error text-red-900 border-red-500/50";
    
    toast.className = `px-4 py-3 rounded-lg border shadow-2xl flex items-center gap-3 transform transition-all duration-300 translate-y-4 opacity-0 ${bg}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined text-[20px]">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
        <span class="text-xs font-bold font-headline uppercase tracking-wider">${message}</span>
    `;
    
    els.toastContainer.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.remove("translate-y-4", "opacity-0");
    });
    
    setTimeout(() => {
        toast.classList.add("translate-y-4", "opacity-0");
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function updateTransform() {
  if (els.canvas) {
    els.canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }
}

function setStatus(message, type = "") {
  if (!els.status) return;
  els.status.textContent = message;
  
  if (type === "error") {
      els.status.className = "text-[10px] font-mono font-bold text-error uppercase tracking-wider";
      if (els.statusIcon) els.statusIcon.className = "w-2 h-2 rounded-full bg-error";
  } else if (type === "success") {
      els.status.className = "text-[10px] font-mono font-bold text-primary uppercase tracking-wider";
      if (els.statusIcon) els.statusIcon.className = "w-2 h-2 rounded-full bg-primary animate-pulse";
  } else {
      els.status.className = "text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-wider";
      if (els.statusIcon) els.statusIcon.className = "w-2 h-2 rounded-full bg-secondary animate-pulse";
  }
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
    drawPolygon(annotation.polygon, "rgba(20, 184, 166, 0.2)", "#14b8a6"); // Emerald overlay
  }
  if (state.preview?.polygon) {
    drawPolygon(state.preview.polygon, "rgba(124, 77, 255, 0.4)", "#cdbdff"); // Primary purple overlay
  }
  for (const click of state.clicks) {
    ctx.beginPath();
    ctx.arc(click.x, click.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = click.label === 1 ? "#cdbdff" : "transparent"; // Primary color or empty
    ctx.fill();
    ctx.strokeStyle = click.label === 1 ? "white" : "#ffb4ab"; // White stroke or red stroke
    ctx.lineWidth = click.label === 1 ? 2 : 3;
    ctx.stroke();
    
    if (click.label === 0) {
        ctx.beginPath();
        ctx.arc(click.x, click.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffb4ab";
        ctx.fill();
    }
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
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
}

function renderImageList() {
  if (els.imageCount) els.imageCount.textContent = `${state.images.length} Images Total`;
  if (!els.imageList) return;
  els.imageList.innerHTML = "";
  
  if (state.images.length === 0) {
      els.imageList.innerHTML = `<div class="text-[10px] text-outline text-center mt-4">No images found. Check Dataset Directory configuration.</div>`;
      return;
  }

  state.images.forEach((image, index) => {
    const isActive = index === state.currentIndex;
    const borderCls = isActive ? "border-primary ring-2 ring-primary/20 shadow-[0_0_15px_rgba(124,77,255,0.3)]" : "border-outline-variant/20 hover:border-outline-variant/40";
    const opacityCls = isActive ? "opacity-100" : "opacity-60 group-hover:opacity-100";
    
    // shrink-0 prevents the flex column from squashing elements
    const itemHtml = `
      <div class="shrink-0 group relative aspect-video rounded-lg overflow-hidden border ${borderCls} transition-all cursor-pointer bg-surface-container-high">
        <img class="w-full h-full object-cover ${opacityCls} transition-all duration-300" src="${image.url}" />
        <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
        <div class="absolute top-2 left-2 flex gap-1 shadow-md">
          ${image.annotation_count > 0 
              ? `<span class="px-1.5 py-0.5 bg-green-500/20 border border-green-500/30 text-green-400 text-[9px] font-bold uppercase tracking-wider rounded backdrop-blur-md">Annotated (${image.annotation_count})</span>` 
              : `<span class="px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-500/30 text-yellow-500 text-[9px] font-bold uppercase tracking-wider rounded backdrop-blur-md">Unlabeled</span>`}
        </div>
        <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 pointer-events-none flex justify-between items-end">
            <span class="text-[9px] font-mono font-bold text-white truncate pr-2">${image.relative_path || image.name}</span>
        </div>
      </div>
    `;
    const temp = document.createElement("div");
    temp.innerHTML = itemHtml;
    const el = temp.firstElementChild;
    el.addEventListener("click", () => loadImage(index));
    els.imageList.appendChild(el);
  });
}

function renderAnnotations() {
  if (!els.annotationList) return;
  els.annotationList.innerHTML = "";
  if (!state.approvedAnnotations.length) {
    els.annotationList.innerHTML = `<div class="text-[10px] text-outline italic px-2">No masks approved yet.</div>`;
    return;
  }
  state.approvedAnnotations.forEach((annotation, index) => {
    const row = document.createElement("div");
    row.className = "flex items-center gap-3 p-2.5 bg-surface-container-highest/20 rounded-lg group border border-transparent hover:border-outline-variant/20 transition-all";
    row.innerHTML = `
        <div class="w-1 h-6 bg-primary rounded-full shadow-[0_0_5px_rgba(124,77,255,0.5)] shrink-0"></div>
        <div class="flex-1 truncate">
            <p class="text-[11px] font-bold text-on-surface leading-tight truncate pl-1">${annotation.class_name}</p>
            <p class="text-[9px] text-outline pl-1 mt-0.5 font-mono shadow-sm">${(annotation.score || 0).toFixed(3)} Conf</p>
        </div>
        <button class="remove-btn opacity-0 group-hover:opacity-100 material-symbols-outlined text-[16px] text-on-surface-variant hover:text-error transition-all p-1 cursor-pointer">
            delete
        </button>
    `;
    row.querySelector('.remove-btn').addEventListener("click", async () => {
      await fetchJson(`/api/projects/${state.projectId}/images/${encodeURIComponent(state.currentImage.id)}/annotations/${index}`, { method: "DELETE" });
      await refreshAnnotations();
      renderImageList();
      drawCanvas();
      showToast("Annotation removed", "success");
    });
    els.annotationList.append(row);
  });
}

// ------------------------
// SPA View Management
// ------------------------

function showHomeView() {
    els.editorView.classList.add("hidden");
    els.homeView.classList.remove("hidden");
    els.navHomeBtn.classList.add("text-[#7C4DFF]", "border-[#7C4DFF]");
    els.navHomeBtn.classList.remove("text-slate-400", "border-transparent", "hover:text-white");
    els.navEditorBtn.classList.remove("text-[#7C4DFF]", "border-[#7C4DFF]");
    els.navEditorBtn.classList.add("hidden");
    loadProjects();
}

function showEditorView() {
    els.homeView.classList.add("hidden");
    els.editorView.classList.remove("hidden");
    els.navEditorBtn.classList.remove("hidden");
    els.navEditorBtn.classList.add("text-[#7C4DFF]", "border-b-2", "border-[#7C4DFF]");
    els.navHomeBtn.classList.remove("text-[#7C4DFF]", "border-[#7C4DFF]");
    els.navHomeBtn.classList.add("text-slate-400", "border-transparent", "hover:text-white");
    
    // Auto-select first image if none chosen
    if (state.images.length > 0 && state.currentIndex === -1) {
        loadImage(0);
    }
}

async function loadProjects() {
  try {
      const list = await fetchJson("/api/projects");
      state.projects = list;
      if (!els.projectGrid) return;
      els.projectGrid.innerHTML = "";

      if (list.length === 0) {
        els.projectGrid.innerHTML = `
            <div class="col-span-1 md:col-span-2 xl:col-span-3 text-center py-20 border border-outline-variant/10 border-dashed rounded-2xl bg-surface-container/50">
                <span class="material-symbols-outlined text-5xl text-outline mb-4">folder_off</span>
                <h3 class="font-headline font-bold text-lg text-white mb-2">No Projects Found</h3>
                <p class="text-xs text-on-surface-variant">Click New Project to start annotating.</p>
            </div>
        `;
        return;
      }
      
      list.forEach(p => {
        const cardHtml = `
            <div class="bg-surface-container rounded-2xl border border-outline-variant/20 hover:border-primary/50 transition-colors shadow-lg flex flex-col group overflow-hidden">
                <div class="p-5 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-high shrink-0">
                    <h2 class="font-headline font-extrabold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-[18px]">folder</span> ${p.name}
                    </h2>
                    <button class="delete-btn opacity-0 group-hover:opacity-100 hover:text-error text-outline transition-all" title="Delete Project">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
                <div class="p-5 flex flex-col gap-4 flex-1">
                    <div>
                        <label class="text-[9px] font-bold text-outline uppercase ml-1">Dataset Directory</label>
                        <input type="text" class="input-dataset-dir w-full bg-surface-container-highest border border-outline-variant/20 rounded text-xs px-2 py-2 focus:border-primary focus:ring-1 focus:ring-primary text-on-surface transition-all" value="${p.dataset_dir || ''}" placeholder="/absolute/path/to/images"/>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-[9px] font-bold text-outline uppercase ml-1">SAM2 Config</label>
                            <input type="text" class="input-sam2-cfg w-full bg-surface-container-highest border border-outline-variant/20 rounded text-[10px] px-2 py-2 text-on-surface" value="${p.sam2_model_cfg || 'sam2.1_hiera_t.yaml'}"/>
                        </div>
                        <div>
                            <label class="text-[9px] font-bold text-outline uppercase ml-1">Device</label>
                            <input type="text" class="input-device w-full bg-surface-container-highest border border-outline-variant/20 rounded text-[10px] px-2 py-2 text-secondary font-mono" value="${p.device || 'cuda'}"/>
                        </div>
                    </div>
                    
                    <div>
                        <label class="text-[9px] font-bold text-outline uppercase ml-1">SAM2 Checkpoint Path</label>
                        <input type="text" class="input-checkpoint w-full bg-surface-container-highest border border-outline-variant/20 rounded text-[10px] px-2 py-2 text-on-surface" value="${p.sam2_checkpoint || 'models/sam2.1_hiera_tiny.pt'}"/>
                    </div>
                    
                    <div>
                        <label class="text-[9px] font-bold text-outline uppercase ml-1">Classes (one per line)</label>
                        <textarea rows="2" class="input-classes w-full bg-surface-container-highest border border-outline-variant/20 rounded text-xs px-2 py-2 focus:border-primary focus:ring-1 focus:ring-primary text-on-surface custom-scrollbar resize-none">${(p.classes || ["object"]).join("\n")}</textarea>
                    </div>
                </div>
                <div class="p-4 border-t border-outline-variant/10 bg-surface-container-lowest shrink-0">
                    <button class="open-btn w-full py-2.5 bg-primary-container hover:bg-[#6833ea] text-white text-xs font-bold uppercase tracking-widest rounded-lg border border-primary/20 shadow-[0_4px_15px_rgba(124,77,255,0.2)] hover:shadow-[0_8px_25px_rgba(124,77,255,0.4)] transition-all flex items-center justify-center gap-2">
                        Save & Open Workspace <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                </div>
            </div>
        `;
        const temp = document.createElement("div");
        temp.innerHTML = cardHtml;
        const card = temp.firstElementChild;
        
        card.querySelector('.delete-btn').addEventListener("click", async (e) => {
            e.stopPropagation();
            if (confirm(`Permanently delete project '${p.name}'? All annotations will be lost forever.`)) {
                try {
                    await fetchJson(`/api/projects/${p.id}`, { method: "DELETE" });
                    showToast("Project deleted", "success");
                    loadProjects();
                } catch(error) { showToast(error.message, "error"); }
            }
        });
        
        card.querySelector('.open-btn').addEventListener("click", async () => {
            const datasetDir = card.querySelector('.input-dataset-dir').value.trim();
            const sam2Cfg = card.querySelector('.input-sam2-cfg').value.trim();
            const checkpoint = card.querySelector('.input-checkpoint').value.trim();
            const device = card.querySelector('.input-device').value.trim();
            const classesRaw = card.querySelector('.input-classes').value;
            const classesArr = classesRaw.split("\n").map(i => i.trim()).filter(Boolean);
            
            try {
                // Save config first
                await fetchJson(`/api/projects/${p.id}`, {
                    method: "POST",
                    body: JSON.stringify({
                        dataset_dir: datasetDir,
                        sam2_model_cfg: sam2Cfg,
                        sam2_checkpoint: checkpoint,
                        device: device || "cpu",
                        classes: classesArr,
                    }),
                });
                
                showToast("Project saved. Loading workspace...", "success");
                
                // Set state and render editor
                state.projectId = p.id;
                await loadProject(state.projectId);
                showEditorView();
                
            } catch(err) {
                showToast(err.message, "error");
            }
        });
        
        els.projectGrid.appendChild(card);
      });
  } catch(error) {
      showToast("Error loading projects: " + error.message, "error");
  }
}

async function loadProject(id) {
  state.projectId = id;
  const payload = await fetchJson(`/api/projects/${state.projectId}`);
  state.project = payload.project;
  state.images = payload.images;
  
  renderClassOptions(state.project.classes || ["object"]);
  renderImageList();
  setStatus("Editor Ready", "success");
  
  if (state.images.length && state.currentIndex === -1) {
    await loadImage(0);
  } else {
    state.currentIndex = -1;
    state.currentImage = null;
    state.currentImageBitmap = null;
    if (els.currentName) els.currentName.textContent = "No image selected";
    drawCanvas();
    refreshAnnotations();
  }
}

// ------------------------
// Navigation Events
// ------------------------

if (els.navHomeBtn) els.navHomeBtn.addEventListener("click", showHomeView);
if (els.closeEditorBtn) els.closeEditorBtn.addEventListener("click", showHomeView);

if (els.newProjectBtn) {
  els.newProjectBtn.addEventListener("click", async () => {
    const name = prompt("Enter new project name (e.g., Drone Footage):");
    if (!name) return;
    try {
      await fetchJson("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
      await loadProjects();
      showToast(`Created new project: ${name}`, "success");
    } catch(err) {
      showToast(err.message, "error");
    }
  });
}

// ------------------------
// Editor Logic
// ------------------------

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
    if (els.currentName) els.currentName.textContent = "No image selected";
    drawCanvas();
    return;
  }
  const response = await fetch(state.currentImage.url);
  const blob = await response.blob();
  state.currentImageBitmap = await createImageBitmap(blob);
  
  // Update name tag
  if (els.currentName) els.currentName.textContent = state.currentImage.relative_path || state.currentImage.name;
  
  await refreshAnnotations();
  drawCanvas();
}

async function runSegmentation() {
  if (!state.projectId) return;
  if (!state.currentImage) {
    showToast("Choose an image first.", "error");
    return;
  }
  if (!state.clicks.length) {
    showToast("Add at least one point click first.", "error");
    return;
  }
  setStatus("Generating mask...", "warn");
  try {
      const payload = await fetchJson(`/api/projects/${state.projectId}/segment`, {
        method: "POST",
        body: JSON.stringify({
          image_id: state.currentImage.id,
          clicks: state.clicks,
        }),
      });
      state.preview = payload;
      drawCanvas();
      setStatus("Preview Generated", "success");
  } catch(error) {
      setStatus("Segmentation failed", "error");
      showToast(error.message, "error");
  }
}

async function approveMask() {
  if (!state.projectId) return;
  if (!state.preview?.polygon || !state.currentImage) {
    showToast("Run Segmentation first.", "error");
    return;
  }
  try {
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
      showToast("Mask Approved", "success");
  } catch(err) {
      showToast(err.message, "error");
  }
}

async function exportDataset() {
  if (!state.projectId) return;
  const trainRatio = (parseFloat(document.getElementById("splitTrain").value) || 80) / 100;
  const valRatio = (parseFloat(document.getElementById("splitVal").value) || 10) / 100;
  const testRatio = (parseFloat(document.getElementById("splitTest").value) || 10) / 100;

  setStatus("Building YOLO Export...", "warn");
  try {
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
      setStatus("Export Complete", "success");
      showToast(`Exported to ${payload.output_dir}`, "success");
  } catch(err) {
      setStatus("Export Failed", "error");
      showToast(err.message, "error");
  }
}

if (els.refreshProject) {
  els.refreshProject.addEventListener("click", async () => {
    try {
      await loadProject(state.projectId);
      showToast(`Reloaded. Found ${state.images.length} items.`, "success");
    } catch (error) { showToast(error.message, "error"); }
  });
}

if (els.runSegmentation) els.runSegmentation.addEventListener("click", () => runSegmentation().catch(e => console.error(e)));
if (els.approveMask) els.approveMask.addEventListener("click", () => approveMask().catch(e => console.error(e)));
if (els.exportDataset) els.exportDataset.addEventListener("click", () => exportDataset().catch(e => console.error(e)));

if (els.clearClicks) {
  els.clearClicks.addEventListener("click", () => {
    state.clicks = [];
    state.preview = null;
    drawCanvas();
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
    if (state.currentIndex > 0) loadImage(state.currentIndex - 1);
  });
}
if (els.nextImage) {
  els.nextImage.addEventListener("click", () => {
    if (state.currentIndex < state.images.length - 1) loadImage(state.currentIndex + 1);
  });
}

// Global hotkeys
window.addEventListener("keydown", (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    switch(e.key.toLowerCase()) {
        case 'a':
            if (state.currentIndex > 0) loadImage(state.currentIndex - 1);
            break;
        case 'd':
            if (state.currentIndex < state.images.length - 1) loadImage(state.currentIndex + 1);
            break;
        case 'c':
            if (els.clearClicks) els.clearClicks.click();
            break;
        case ' ': // spacebar = preview
            e.preventDefault();
            if (els.runSegmentation) els.runSegmentation.click();
            break;
        case 'enter': // approve
            if (els.approveMask) els.approveMask.click();
            break;
    }
});

if (els.canvas) {
  els.canvas.addEventListener("click", (event) => {
    if (!state.currentImageBitmap) return;
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    state.clicks.push({ x, y, label: event.shiftKey ? 0 : 1 });
    state.preview = null;
    drawCanvas();
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
      canvasWrapper.style.cursor = "crosshair";
    }
  });

  canvasWrapper.addEventListener("contextmenu", (e) => e.preventDefault());
}

// Initial bootstrap
(async () => {
  try {
    showHomeView();
  } catch(error) {
    showToast(error.message, "error");
  }
})();
