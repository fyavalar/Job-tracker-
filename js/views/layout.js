// Countertop drawing & cabinet layout editor: #/jobs/:id/layout
import { state, jobById, customerById } from "../state.js";
import { saveJobLayout, applyLayoutToJob } from "../actions.js";
import { empty, segmented } from "../components.js";
import { icon } from "../icons.js";
import { esc, niceDate, todayISO, shareOrDownload, safeFileName } from "../format.js";
import { jobTitle } from "../model.js";
import { toast, render, currentRoute } from "../nav.js";
import { openSheet, chooseSheet, closeSheet } from "../sheet.js";
import {
  PRESETS, ITEM_TYPES, EDGE_TYPES, SIDES, SIDE_LABELS, DEPTH_PRESETS,
  presetLayout, normalizeLayout, layoutStats, cloneLayout, cycleEdge, duplicatePiece, addPiece, removePiece,
  placeItem, rotateItem, setFaucetHoles, makeItem, snapValue, magnetize, itemsOnPiece, parseInches, formatInches,
  itemLabel, fmtNum, round, buildScene, sceneToSvg, PALETTES, jobFieldsFromLayout
} from "../layout.js";
import { blueprintSvg, layoutPngBlob, themePalette } from "../blueprint.js";

let jobId = "";
let L = null;
let sel = null; // { kind: "piece" | "item", id }
let undoStack = [];
let redoStack = [];
let saveTimer = 0;
let drag = null;
let fixedView = null;
let lastScene = null;

const CABINET_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48];
const EDGE_LABEL = Object.fromEntries(EDGE_TYPES.map((e) => [e.id, e.short]));

function job() {
  return jobById(jobId);
}

function selectedPiece() {
  return sel?.kind === "piece" ? L?.pieces.find((p) => p.id === sel.id) || null : null;
}

function selectedItem() {
  return sel?.kind === "item" ? L?.items.find((i) => i.id === sel.id) || null : null;
}

// Memory updates right away (so any re-render sees the latest drawing); the disk write is debounced.
function scheduleSave(immediate = false) {
  clearTimeout(saveTimer);
  const id = jobId;
  const snapshot = L ? cloneLayout(L) : null;
  const j = jobById(id);
  if (j) j.layout = snapshot ? normalizeLayout(snapshot) : null;
  const run = async () => {
    saveTimer = 0;
    const result = await saveJobLayout(id, snapshot);
    if (!result.ok) toast(result.error);
  };
  if (immediate) return run();
  saveTimer = setTimeout(run, 350);
}

function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  saveJobLayout(jobId, L ? cloneLayout(L) : null);
}

function commit(next, { inspector = true, keepSel = true } = {}) {
  undoStack.push(JSON.stringify(L));
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  L = next;
  if (!keepSel || (sel && !findSel())) sel = null;
  scheduleSave();
  paint({ inspector });
}

function findSel() {
  if (!sel || !L) return null;
  return sel.kind === "piece" ? L.pieces.find((p) => p.id === sel.id) : L.items.find((i) => i.id === sel.id);
}

function canvasWidth() {
  const box = document.getElementById("lay-canvas");
  return Math.max(260, (box?.clientWidth || 358));
}

function sceneFor(width) {
  return buildScene(L, { width, maxHeight: 380, maxScale: 6, selected: sel, interactive: true, palette: themePalette(), fixedView });
}

function canvasHtml() {
  if (!L) return "";
  const scene = sceneFor(canvasWidth());
  lastScene = scene;
  return sceneToSvg(scene, { className: "bp bp-edit", palette: themePalette(), label: "Countertop drawing. Tap a piece to edit it." });
}

function statsHtml() {
  const s = layoutStats(L);
  const tiles = [
    [fmtNum(s.sqft, 1), "Sq ft", "is-accent"],
    [fmtNum(s.polishedLF, 1), "Polished lf", ""],
    [fmtNum(s.backsplashLF, 1), "Splash lf", ""],
    [String(s.cutouts), s.cutouts === 1 ? "Cutout" : "Cutouts", ""]
  ];
  return tiles.map(([v, l, c]) => `<div class="tile ${c}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
}

function edgeButton(piece, side) {
  const type = piece.edges[side];
  const arrow = { top: "up", right: "right", bottom: "down", left: "left" }[side];
  return `<button type="button" class="edge-btn" data-act="edge" data-side="${side}" data-edge-type="${type}">
    <span class="edge-side">${icon(arrow)}${esc(SIDE_LABELS[side])}</span>
    <span class="edge-type"><i class="edge-swatch" data-edge="${type}"></i>${esc(EDGE_LABEL[type])}</span>
  </button>`;
}

function nudgeHtml() {
  const step = L?.snap || 1;
  return `<div class="nudge" role="group" aria-label="Nudge ${step} inch">
    <button type="button" class="icon-btn sq" data-act="nudge" data-dx="-1" data-dy="0" aria-label="Nudge left">${icon("left")}</button>
    <button type="button" class="icon-btn sq" data-act="nudge" data-dx="0" data-dy="-1" aria-label="Nudge up">${icon("up")}</button>
    <button type="button" class="icon-btn sq" data-act="nudge" data-dx="0" data-dy="1" aria-label="Nudge down">${icon("down")}</button>
    <button type="button" class="icon-btn sq" data-act="nudge" data-dx="1" data-dy="0" aria-label="Nudge right">${icon("right")}</button>
  </div>`;
}

function dimInput(name, label, value, extra = "") {
  return `<label class="field dim-field" for="lay-${name}"><span class="lbl">${esc(label)}</span><span class="adorned has-suffix"><input id="lay-${name}" data-dim="${name}" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${esc(formatInches(value, { mark: false }))}"${extra}><span class="adorn suf" aria-hidden="true">″</span></span></label>`;
}

function inspectorHtml() {
  const piece = selectedPiece();
  const item = selectedItem();
  if (piece) {
    const index = L.pieces.indexOf(piece) + 1;
    return `<div class="insp-head"><div><span class="insp-kicker">Piece ${index} of ${L.pieces.length}</span><input class="insp-name" id="lay-name" value="${esc(piece.name)}" placeholder="Piece ${index}" aria-label="Piece name" autocapitalize="words" enterkeyhint="done"></div>
        <button type="button" class="icon-btn" data-act="deselect" aria-label="Done">${icon("close")}</button></div>
      <div class="dim-row">${dimInput("w", "Length", piece.w)}<span class="dim-x">×</span>${dimInput("d", "Depth", piece.d)}</div>
      <div class="quick-chips" role="group" aria-label="Depth presets">${DEPTH_PRESETS.map((p) => `<button type="button" class="chip sm${Math.abs(piece.d - p.value) < 0.01 ? " is-on" : ""}" data-act="depth" data-val="${p.value}">${esc(p.label)}</button>`).join("")}</div>
      <div class="insp-label">Edges <small>Tap to cycle, or tap an edge on the drawing</small></div>
      <div class="edge-grid">${SIDES.map((side) => edgeButton(piece, side)).join("")}</div>
      <div class="insp-foot">${nudgeHtml()}
        <div class="insp-actions"><button type="button" class="btn sm" data-act="dup-piece">${icon("copy")} Duplicate</button><button type="button" class="btn sm danger" data-act="del-piece" aria-label="Delete piece">${icon("trash")}</button></div>
      </div>`;
  }
  if (item) {
    const def = ITEM_TYPES[item.type];
    const nominal = item.rot ? item.d : item.w;
    const deep = item.rot ? item.w : item.d;
    let body = "";
    if (item.type === "faucet") {
      body = `<div class="stepper-row"><span>Holes</span><div class="stepper-ctl"><button type="button" class="icon-btn sq" data-act="holes" data-by="-1" aria-label="Fewer holes">−</button><b>${item.holes}</b><button type="button" class="icon-btn sq" data-act="holes" data-by="1" aria-label="More holes">+</button></div></div>`;
    } else if (item.type === "seam") {
      body = `<p class="meta">Drag the seam along the counter, or nudge it 1″ at a time. Rotate turns it across the other way.</p>`;
    } else {
      body = `<div class="dim-row">${dimInput("iw", def.group === "cabinet" ? "Width" : "Width", nominal)}<span class="dim-x">×</span>${dimInput("id", "Depth", deep)}</div>`;
      if (def.group === "cabinet" && item.type !== "fridge" && item.type !== "dishwasher") {
        body += `<div class="quick-chips scroll" role="group" aria-label="Cabinet widths">${CABINET_WIDTHS.map((w) => `<button type="button" class="chip sm${Math.abs(nominal - w) < 0.01 ? " is-on" : ""}" data-act="cab-width" data-val="${w}">${w}″</button>`).join("")}</div>`;
      }
    }
    return `<div class="insp-head"><div><span class="insp-kicker">${esc(def.group === "cabinet" ? "Cabinet / appliance" : def.group === "seam" ? "Seam" : "Cutout")}</span><strong class="insp-title">${esc(itemLabel(item))}</strong></div>
        <button type="button" class="icon-btn" data-act="deselect" aria-label="Done">${icon("close")}</button></div>
      ${body}
      <div class="insp-foot">${nudgeHtml()}
        <div class="insp-actions"><button type="button" class="btn sm" data-act="rotate" aria-label="Rotate">${icon("rotate")}</button><button type="button" class="btn sm" data-act="dup-item" aria-label="Duplicate">${icon("copy")}</button><button type="button" class="btn sm danger" data-act="del-item" aria-label="Delete">${icon("trash")}</button></div>
      </div>`;
  }
  return `<div class="insp-empty">${icon("sparkle")}<div><strong>Tap a piece to size it or mark its edges.</strong><span>Drag pieces and cutouts to move them. Everything saves as you go.</span></div></div>`;
}

function paint({ inspector = true } = {}) {
  const canvas = document.getElementById("lay-canvas");
  if (canvas) canvas.innerHTML = canvasHtml();
  const stats = document.getElementById("lay-stats");
  if (stats && L) stats.innerHTML = statsHtml();
  if (inspector) {
    const box = document.getElementById("lay-inspector");
    if (box) {
      box.innerHTML = inspectorHtml();
      box.dataset.mode = sel?.kind || "none";
    }
  }
  const u = document.querySelector("[data-act=undo]");
  const r = document.querySelector("[data-act=redo]");
  if (u) u.disabled = !undoStack.length;
  if (r) r.disabled = !redoStack.length;
}

export function presetThumb(id, { width = 132, height = 76 } = {}) {
  const layout = presetLayout(id);
  const scene = buildScene(layout, { width, maxHeight: height, palette: themePalette(), grid: false, dims: false, labels: false, cabinets: false, pad: 8 });
  return sceneToSvg(scene, { className: "bp bp-thumb", palette: themePalette(), background: false, label: PRESETS.find((p) => p.id === id)?.label || "" });
}

export function presetGrid(act = "preset", selected = "") {
  return `<div class="preset-grid">${PRESETS.map((p) => `<button type="button" class="preset${selected === p.id ? " is-on" : ""}" data-act="${act}" data-preset="${p.id}"><span class="preset-art">${presetThumb(p.id)}</span><span class="preset-name">${esc(p.label)}</span></button>`).join("")}</div>`;
}

function emptyHtml(j) {
  return `<div class="lay-intro"><span class="lay-intro-ico">${icon("layout")}</span><div><h2 class="h-title">Pick a starting shape</h2><p class="meta">One tap gives you a dimensioned layout with cabinets and a sink. Then adjust any piece to the inch.</p></div></div>
    ${presetGrid("preset")}
    <button type="button" class="btn block" data-act="blank">${icon("plus")} Start with a single piece</button>
    <p class="meta center">Saved on ${esc(jobTitle(j))} for ${esc(customerById(j.customerId)?.name || "this customer")}.</p>`;
}

export const editor = {
  id: "layout",
  title: () => "Countertop layout",
  back: (route) => "#/jobs/" + route.parts[1],
  action(route) {
    const j = jobById(route.parts[1]);
    if (!j?.layout?.pieces?.length) return "";
    return `<button type="button" class="icon-btn" data-act="undo" aria-label="Undo">${icon("undo")}</button><button type="button" class="icon-btn" data-act="redo" aria-label="Redo">${icon("redo")}</button>`;
  },
  prepare(route) {
    if (jobId !== route.parts[1]) {
      jobId = route.parts[1];
      sel = null;
      undoStack = [];
      redoStack = [];
    }
    const j = job();
    L = j?.layout ? normalizeLayout(j.layout) : null;
    if (sel && !findSel()) sel = null;
  },
  html() {
    const j = job();
    if (!j) return empty("That job isn't on this phone", "It may have been deleted.");
    if (!L || !L.pieces.length) return emptyHtml(j);
    const customer = customerById(j.customerId);
    return `<div class="lay">
      <div class="lay-sub"><span>${esc(customer?.name || "Customer")} · ${esc(jobTitle(j))}</span>${j.material || j.stoneColor ? `<span class="pill">${esc([j.material, j.stoneColor].filter(Boolean).join(" "))}</span>` : ""}</div>
      <div class="tiles lay-stats" id="lay-stats" aria-live="polite">${statsHtml()}</div>
      <div class="bp-shell"><div class="lay-canvas" id="lay-canvas"></div></div>
      <div class="lay-tools">
        <button type="button" class="btn sm primary-soft" data-act="add-item">${icon("plus")} Cutout or cabinet</button>
        <button type="button" class="btn sm" data-act="add-piece">${icon("plus")} Piece</button>
        ${segmented([[1, "1″"], [3, "3″"]], L.snap || 1, "snap", { label: "Snap", className: "seg-sm" })}
      </div>
      <section class="group inspector" id="lay-inspector" data-mode="${sel?.kind || "none"}">${inspectorHtml()}</section>
      <div class="lay-legend">${EDGE_TYPES.map((e) => `<span><i class="edge-swatch" data-edge="${e.id}"></i>${esc(e.short)}</span>`).join("")}<span><i class="edge-swatch" data-edge="seam"></i>Seam</span><span><i class="edge-swatch" data-edge="cab"></i>Cabinet</span></div>
      <div class="btn-col lay-cta">
        <button type="button" class="btn primary block" data-act="apply">${icon("check")} Apply to job</button>
        <div class="btn-row"><button type="button" class="btn" data-act="share">${icon("share")} Share PNG</button><button type="button" class="btn" data-act="restart">${icon("grid")} Presets</button></div>
      </div>
      <p class="meta center">Apply fills the job's square feet, sink cutouts, and backsplash. Drawn in inches. Verify on site.</p>
    </div>`;
  },
  mount(root) {
    const canvas = root.querySelector("#lay-canvas");
    if (!canvas) return () => flushSave();
    paint({ inspector: false });
    const onDown = (event) => pointerDown(event, canvas);
    const onMove = (event) => pointerMove(event, canvas);
    const onUp = (event) => pointerUp(event, canvas);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    const onResize = () => paint({ inspector: false });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      flushSave();
    };
  },
  leave() {
    flushSave();
    sel = null;
  },
  async onClick(act, el) {
    const j = job();
    if (!j) return;
    if (act === "preset") return loadPreset(el.dataset.preset);
    if (act === "blank") {
      const { layout, id } = addPiece(null, { w: 96, d: 25.5 });
      L = layout;
      sel = { kind: "piece", id };
      await scheduleSave(true);
      return render();
    }
    if (!L) return;
    if (act === "undo" || act === "redo") {
      const from = act === "undo" ? undoStack : redoStack;
      const to = act === "undo" ? redoStack : undoStack;
      if (!from.length) return;
      to.push(JSON.stringify(L));
      L = JSON.parse(from.pop());
      if (sel && !findSel()) sel = null;
      scheduleSave();
      return paint();
    }
    if (act === "deselect") {
      sel = null;
      return paint();
    }
    if (act === "snap") {
      const next = cloneLayout(L);
      next.snap = Number(el.dataset.val) === 3 ? 3 : 1;
      L = next;
      scheduleSave();
      el.closest(".seg").outerHTML = segmented([[1, "1″"], [3, "3″"]], L.snap, "snap", { label: "Snap", className: "seg-sm" });
      return paint();
    }
    if (act === "edge") return setEdge(el.dataset.side);
    if (act === "depth") return updatePiece({ d: Number(el.dataset.val) });
    if (act === "cab-width") return updateItemDims({ nominal: Number(el.dataset.val) });
    if (act === "nudge") return nudge(Number(el.dataset.dx), Number(el.dataset.dy));
    if (act === "dup-piece" && selectedPiece()) {
      const source = selectedPiece();
      const { layout, id } = duplicatePiece(L, source.id);
      sel = { kind: "piece", id };
      commit(layout);
      return toast("Piece duplicated below");
    }
    if (act === "del-piece" && selectedPiece()) {
      if (L.pieces.length === 1) {
        toast("A layout needs at least one piece. Use Presets to start over.");
        return;
      }
      const before = JSON.stringify(L);
      commit(removePiece(L, sel.id), { keepSel: false });
      return toast("Piece deleted", async () => restore(before));
    }
    if (act === "add-piece") {
      const { layout, id } = addPiece(L, { w: 48, d: 25.5 });
      sel = { kind: "piece", id };
      return commit(layout);
    }
    if (act === "add-item") return addItemSheet();
    if (act === "rotate" && selectedItem()) {
      const next = cloneLayout(L);
      const index = next.items.findIndex((i) => i.id === sel.id);
      next.items[index] = rotateItem(next.items[index]);
      return commit(next);
    }
    if (act === "dup-item" && selectedItem()) {
      const next = cloneLayout(L);
      const src = next.items.find((i) => i.id === sel.id);
      const copy = makeItem(src.type, { ...src, id: "", x: src.x + (src.rot ? 0 : src.w + 2), y: src.y + (src.rot ? src.d + 2 : 0) });
      next.items.push(copy);
      sel = { kind: "item", id: copy.id };
      return commit(next);
    }
    if (act === "del-item" && selectedItem()) {
      const before = JSON.stringify(L);
      const next = cloneLayout(L);
      next.items = next.items.filter((i) => i.id !== sel.id);
      commit(next, { keepSel: false });
      return toast("Removed", async () => restore(before));
    }
    if (act === "holes" && selectedItem()) {
      const next = cloneLayout(L);
      const index = next.items.findIndex((i) => i.id === sel.id);
      next.items[index] = setFaucetHoles(next.items[index], (next.items[index].holes || 1) + Number(el.dataset.by));
      return commit(next);
    }
    if (act === "apply") {
      flushSave();
      await saveJobLayout(jobId, cloneLayout(L));
      const result = await applyLayoutToJob(jobId);
      if (!result.ok) return toast(result.error);
      const f = result.fields;
      return toast(`Job updated: ${fmtNum(f.sqft, 1)} sq ft · ${f.sinkCutouts} sink${f.sinkCutouts === "1" ? "" : "s"} · ${f.backsplash === "None" ? "no splash" : f.backsplash.toLowerCase() + " splash"}`, result.undo);
    }
    if (act === "share") return shareLayoutPng(j, L);
    if (act === "restart") {
      const choice = await chooseSheet({ title: "Start from a preset", options: PRESETS.map((p) => ({ value: p.id, label: p.label, selected: L.preset === p.id })), note: "Your current drawing is replaced. Undo brings it back." });
      if (choice) loadPreset(choice);
    }
  },
  onInput(event) {
    const t = event.target;
    if (t.id === "lay-name") {
      const p = selectedPiece();
      if (!p) return;
      p.name = t.value.slice(0, 40);
      scheduleSave();
      return;
    }
    const dim = t.dataset?.dim;
    if (!dim) return;
    const value = parseInches(t.value);
    t.closest(".field")?.classList.toggle("is-bad", value === null && t.value.trim() !== "");
    if (value === null) return;
    if (dim === "w" || dim === "d") liveUpdatePiece({ [dim]: Math.min(600, value) });
    if (dim === "iw" || dim === "id") liveUpdateItem(dim === "iw" ? { nominal: value } : { deep: value });
  },
  onChange(event) {
    const t = event.target;
    if (t.dataset?.dim) {
      // commit the typed value as one undo step and tidy the field
      if (pendingLive) {
        undoStack.push(pendingLive);
        redoStack = [];
        pendingLive = null;
      }
      const value = parseInches(t.value);
      if (value !== null) t.value = formatInches(value, { mark: false });
      t.closest(".field")?.classList.remove("is-bad");
      paint({ inspector: false });
      updateChips();
    }
  },
  onKeydown(event) {
    if (event.key === "Enter" && event.target.dataset?.dim) {
      event.preventDefault();
      event.target.blur();
    }
  }
};

let pendingLive = null;

function liveUpdatePiece(patch) {
  const p = selectedPiece();
  if (!p) return;
  if (!pendingLive) pendingLive = JSON.stringify(L);
  Object.assign(p, patch);
  scheduleSave();
  paint({ inspector: false });
}

function liveUpdateItem({ nominal, deep }) {
  const item = selectedItem();
  if (!item) return;
  if (!pendingLive) pendingLive = JSON.stringify(L);
  if (nominal !== undefined) {
    if (item.rot) item.d = nominal;
    else item.w = nominal;
  }
  if (deep !== undefined) {
    if (item.rot) item.w = deep;
    else item.d = deep;
  }
  scheduleSave();
  paint({ inspector: false });
}

function updateChips() {
  const box = document.getElementById("lay-inspector");
  if (!box) return;
  const p = selectedPiece();
  if (p) box.querySelectorAll("[data-act=depth]").forEach((b) => b.classList.toggle("is-on", Math.abs(p.d - Number(b.dataset.val)) < 0.01));
  const i = selectedItem();
  if (i) box.querySelectorAll("[data-act=cab-width]").forEach((b) => b.classList.toggle("is-on", Math.abs((i.rot ? i.d : i.w) - Number(b.dataset.val)) < 0.01));
}

function restore(json) {
  undoStack.push(JSON.stringify(L));
  L = JSON.parse(json);
  if (sel && !findSel()) sel = null;
  scheduleSave();
  paint();
}

function updatePiece(patch) {
  const next = cloneLayout(L);
  const p = next.pieces.find((row) => row.id === sel?.id);
  if (!p) return;
  Object.assign(p, patch);
  commit(next);
}

function updateItemDims({ nominal }) {
  const next = cloneLayout(L);
  const item = next.items.find((row) => row.id === sel?.id);
  if (!item) return;
  if (item.rot) item.d = nominal;
  else item.w = nominal;
  commit(next);
}

function setEdge(side) {
  const next = cloneLayout(L);
  const p = next.pieces.find((row) => row.id === sel?.id);
  if (!p) return;
  p.edges[side] = cycleEdge(p.edges[side]);
  commit(next);
  announce(`${SIDE_LABELS[side]} edge: ${EDGE_LABEL[p.edges[side]]}`);
}

function announce(text) {
  const box = document.getElementById("lay-inspector");
  const flash = document.createElement("div");
  flash.className = "edge-flash";
  flash.textContent = text;
  document.querySelector(".bp-shell")?.appendChild(flash);
  setTimeout(() => flash.remove(), 1100);
  return box;
}

function nudge(dx, dy) {
  const step = L.snap || 1;
  const next = cloneLayout(L);
  if (sel?.kind === "piece") {
    const p = next.pieces.find((row) => row.id === sel.id);
    if (!p) return;
    const riders = itemsOnPiece(L, L.pieces.find((row) => row.id === sel.id)).map((i) => i.id);
    p.x = round(p.x + dx * step, 3);
    p.y = round(p.y + dy * step, 3);
    for (const item of next.items) {
      if (!riders.includes(item.id)) continue;
      item.x = round(item.x + dx * step, 3);
      item.y = round(item.y + dy * step, 3);
    }
  } else if (sel?.kind === "item") {
    const item = next.items.find((row) => row.id === sel.id);
    if (!item) return;
    const s = item.type === "faucet" || item.type === "seam" ? Math.min(step, 1) : step;
    item.x = round(item.x + dx * s, 3);
    item.y = round(item.y + dy * s, 3);
  }
  commit(next, { inspector: false });
}

async function loadPreset(id) {
  const fresh = presetLayout(id);
  if (L?.pieces?.length) {
    commit(fresh, { keepSel: false });
    toast("Started from " + (PRESETS.find((p) => p.id === id)?.label || "preset"), async () => {
      if (undoStack.length) {
        L = JSON.parse(undoStack.pop());
        scheduleSave();
        paint();
      }
    });
    return;
  }
  L = fresh;
  sel = null;
  await scheduleSave(true);
  render();
}

async function addItemSheet() {
  const groups = [
    ["Cutouts", ["sinkUnder", "sinkDrop", "sinkFarm", "cooktop", "faucet"]],
    ["Cabinets & appliances", ["sinkBase", "drawers", "base", "dishwasher", "fridge"]],
    ["Lines", ["seam"]]
  ];
  const body = groups.map(([title, types]) => `<div class="sheet-group"><h4>${esc(title)}</h4><div class="item-grid">${types.map((type) => {
    const def = ITEM_TYPES[type];
    const size = type === "faucet" ? "1–5 holes" : type === "seam" ? "Joint" : formatInches(def.w) + " wide";
    return `<button type="button" class="item-tile" data-sheet-value="${type}"><span class="item-ico" data-type="${type}"></span><b>${esc(def.short)}</b><small>${esc(size)}</small></button>`;
  }).join("")}</div></div>`).join("");
  const piece = selectedPiece() || (selectedItem() ? L.pieces.find((p) => itemsOnPiece(L, p).some((i) => i.id === sel.id)) : null) || L.pieces[0];
  const type = await openSheet({ title: "Add to " + (piece?.name || "the layout"), body: body + `<button type="button" class="btn block sheet-cancel" data-sheet-close>Cancel</button>`, className: "sheet-items" });
  if (!type || !ITEM_TYPES[type]) return;
  const { layout, id } = placeItem(L, type, piece?.id);
  sel = { kind: "item", id };
  commit(layout);
}

// ---------- pointer: tap to select, drag to move, tap an edge to cycle ----------

function svgPoint(canvas, event) {
  const svg = canvas.querySelector("svg");
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const vb = (lastScene || fixedView)?.vb;
  if (!vb || !rect.width) return null;
  const k = vb[2] / rect.width;
  return { x: vb[0] + (event.clientX - rect.left) * k, y: vb[1] + (event.clientY - rect.top) * k, k };
}

function pointerDown(event, canvas) {
  if (!L || event.button > 0) return;
  const target = event.target.closest?.("[data-piece],[data-item]");
  const pt = svgPoint(canvas, event);
  if (!pt) return;
  drag = {
    pointerId: event.pointerId,
    sx: event.clientX,
    sy: event.clientY,
    moved: false,
    piece: target?.dataset.piece || "",
    item: target?.dataset.item || "",
    edge: target?.dataset.edge || "",
    k: pt.k,
    before: JSON.stringify(L),
    orig: null
  };
  if (drag.piece) {
    const p = L.pieces.find((row) => row.id === drag.piece);
    drag.orig = { x: p.x, y: p.y, riders: itemsOnPiece(L, p).map((i) => ({ id: i.id, x: i.x, y: i.y })) };
  } else if (drag.item) {
    const i = L.items.find((row) => row.id === drag.item);
    drag.orig = { x: i.x, y: i.y };
  }
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* fine */
  }
}

function pointerMove(event, canvas) {
  if (!drag || event.pointerId !== drag.pointerId || !drag.orig) return;
  const dxPx = event.clientX - drag.sx;
  const dyPx = event.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dxPx, dyPx) < 7) return;
  if (!drag.moved) {
    drag.moved = true;
    fixedView = lastScene ? { vb: lastScene.vb, scale: lastScene.scale } : null;
    sel = drag.piece ? { kind: "piece", id: drag.piece } : { kind: "item", id: drag.item };
    canvas.classList.add("is-dragging");
  }
  event.preventDefault();
  const step = L.snap || 1;
  const dx = dxPx * drag.k;
  const dy = dyPx * drag.k;
  if (drag.piece) {
    const p = L.pieces.find((row) => row.id === drag.piece);
    if (!p) return;
    let nx = snapValue(drag.orig.x + dx, step);
    let ny = snapValue(drag.orig.y + dy, step);
    const mag = magnetize({ ...p, x: nx, y: ny }, L.pieces, Math.max(2, step));
    nx = mag.x;
    ny = mag.y;
    const ddx = nx - drag.orig.x;
    const ddy = ny - drag.orig.y;
    p.x = nx;
    p.y = ny;
    for (const r of drag.orig.riders) {
      const item = L.items.find((row) => row.id === r.id);
      if (item) {
        item.x = round(r.x + ddx, 3);
        item.y = round(r.y + ddy, 3);
      }
    }
  } else if (drag.item) {
    const item = L.items.find((row) => row.id === drag.item);
    if (!item) return;
    const s = item.type === "faucet" ? Math.min(step, 0.5) : step;
    item.x = snapValue(drag.orig.x + dx, s);
    item.y = snapValue(drag.orig.y + dy, s);
  }
  paint({ inspector: false });
}

function pointerUp(event, canvas) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  canvas.classList.remove("is-dragging");
  if (d.moved) {
    fixedView = null;
    undoStack.push(d.before);
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
    scheduleSave();
    paint();
    return;
  }
  // a tap
  if (d.edge && sel?.kind === "piece" && sel.id === d.piece) return setEdge(d.edge);
  if (d.piece) sel = { kind: "piece", id: d.piece };
  else if (d.item) sel = { kind: "item", id: d.item };
  else sel = null;
  paint();
}

export async function shareLayoutPng(j, layout) {
  if (!layout?.pieces?.length) return toast("Draw a layout first.");
  const customer = customerById(j.customerId);
  try {
    const blob = await layoutPngBlob(layout, {
      business: state.business.name || "",
      customer: customer?.name || "Customer",
      job: jobTitle(j),
      material: j.material || "",
      color: j.stoneColor || "",
      address: j.siteAddress || customer?.address || "",
      date: niceDate(todayISO(), { year: true })
    });
    const name = "Layout-" + safeFileName((customer?.name || "job") + "-" + jobTitle(j), "job") + ".png";
    const how = await shareOrDownload(blob, name, (customer?.name || "") + " countertop layout");
    if (how === "downloaded") toast("Layout image saved");
  } catch (error) {
    console.error(error);
    toast("Couldn't make the image. Try again.");
  }
}

export function layoutPreviewHtml(j, { href = "" } = {}) {
  const layout = normalizeLayout(j.layout);
  if (!layout?.pieces?.length) return "";
  const { svg } = blueprintSvg(layout, { width: 340, maxHeight: 220, maxScale: 4, className: "bp bp-mini" });
  return href ? `<a class="bp-frame" href="${esc(href)}" aria-label="Edit countertop layout">${svg}</a>` : `<div class="bp-frame">${svg}</div>`;
}

export { jobFieldsFromLayout, PALETTES };
