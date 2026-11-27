// Countertop + cabinet layout engine. Pure functions only (runs in Node tests and the browser).
// Units are inches. Origin is top-left, x grows right, y grows down (toward the room / front edge).
import { uid } from "./format.js";

export const LAYOUT_VERSION = 1;
const EPS = 0.01;
export const SIDES = ["top", "right", "bottom", "left"];
export const SIDE_LABELS = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" };

export const EDGE_TYPES = [
  { id: "wall", label: "Wall", short: "Wall" },
  { id: "polished", label: "Polished edge", short: "Polished" },
  { id: "splash4", label: "4\u2033 splash", short: "4\u2033 splash" },
  { id: "splashFull", label: "Full splash", short: "Full splash" },
  { id: "overhang", label: "Overhang (12\u2033)", short: "Overhang" }
];
const EDGE_IDS = EDGE_TYPES.map((e) => e.id);
export const OVERHANG_IN = 12;

export const DEPTH_PRESETS = [
  { value: 25.5, label: "25\u00bd\u2033 Counter" },
  { value: 36, label: "36\u2033 Island" },
  { value: 22, label: "22\u2033 Vanity" }
];

export const ITEM_TYPES = {
  sinkUnder: { label: "Undermount sink", short: "Undermount", group: "cutout", w: 30, d: 18, sink: "Undermount" },
  sinkDrop: { label: "Drop-in sink", short: "Drop-in", group: "cutout", w: 33, d: 22, sink: "Drop-in" },
  sinkFarm: { label: "Farmhouse sink", short: "Farmhouse", group: "cutout", w: 33, d: 20, sink: "Farmhouse" },
  cooktop: { label: "Cooktop / range", short: "Cooktop", group: "cutout", w: 30, d: 21 },
  faucet: { label: "Faucet holes", short: "Faucet", group: "cutout", w: 1.5, d: 1.5, holes: 1 },
  sinkBase: { label: "Sink base", short: "Sink base", group: "cabinet", w: 36, d: 24, code: "SB" },
  drawers: { label: "Drawer base", short: "Drawers", group: "cabinet", w: 24, d: 24, code: "DB" },
  base: { label: "Base cabinet", short: "Base", group: "cabinet", w: 30, d: 24, code: "B" },
  dishwasher: { label: "Dishwasher", short: "Dishwasher", group: "cabinet", w: 24, d: 24, code: "DW" },
  fridge: { label: "Fridge opening", short: "Fridge", group: "cabinet", w: 36, d: 30, code: "REF" },
  seam: { label: "Seam line", short: "Seam", group: "seam", w: 0, d: 25.5 }
};

export const PRESETS = [
  { id: "straight", label: "Straight Run" },
  { id: "lShape", label: "L-Shape" },
  { id: "uShape", label: "U-Shape" },
  { id: "island", label: "Island" },
  { id: "lIsland", label: "L-Shape + Island" },
  { id: "galley", label: "Galley" },
  { id: "vanity", label: "Bathroom Vanity" }
];

// ---------- numbers ----------

export function round(n, places = 2) {
  const f = 10 ** places;
  return Math.round((Number(n) || 0) * f) / f;
}

export function snapValue(value, step) {
  const s = Number(step) > 0 ? Number(step) : 1;
  return round(Math.round(value / s) * s, 3);
}

const FRACTIONS = [
  [0.125, "\u215b"], [0.25, "\u00bc"], [0.375, "\u215c"], [0.5, "\u00bd"],
  [0.625, "\u215d"], [0.75, "\u00be"], [0.875, "\u215e"]
];

export function formatInches(value, { mark = true } = {}) {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  let whole = Math.floor(abs + 1e-9);
  const rest = abs - whole;
  let text;
  if (rest < 0.01) text = String(whole);
  else if (rest > 0.99) text = String(whole + 1);
  else {
    const hit = FRACTIONS.find(([f]) => Math.abs(rest - f) < 0.01);
    text = hit ? (whole ? String(whole) : "") + hit[1] : String(round(abs, 2));
  }
  return sign + text + (mark ? "\u2033" : "");
}

const UNICODE_FRACTIONS = { "\u00bc": 0.25, "\u00bd": 0.5, "\u00be": 0.75, "\u215b": 0.125, "\u215c": 0.375, "\u215d": 0.625, "\u215e": 0.875 };

// Accepts 25.5, 25 1/2, 25-1/2, 25½, 25", 8', 8' 6", 8ft 6in. Returns inches or null.
export function parseInches(input) {
  let s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/[\u2033\u201d"]|inches|inch|in\b/g, " ").replace(/[\u2032\u2019']|feet|foot|ft\b/g, " ft ").replace(/\s+/g, " ").trim();
  let feet = 0;
  const ftMatch = /^(\d+(?:\.\d+)?)\s*ft\s*(.*)$/.exec(s);
  if (ftMatch) {
    feet = Number(ftMatch[1]);
    s = ftMatch[2].trim();
    if (!s) return feet * 12 > 0 ? round(feet * 12, 3) : null;
  }
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(ch)) s = s.replace(ch, " " + val.toString().replace(/^0/, "0") + "u");
  }
  // "25 0.5u" -> 25.5 ; "0.5u" -> 0.5
  const uni = /^(\d+)?\s*(0\.\d+)u$/.exec(s);
  if (uni) return finish(feet * 12 + Number(uni[1] || 0) + Number(uni[2]));
  const mixed = /^(\d+)[\s-]+(\d+)\/(\d+)$/.exec(s);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!den) return null;
    return finish(feet * 12 + Number(mixed[1]) + Number(mixed[2]) / den);
  }
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) {
    const den = Number(frac[2]);
    if (!den) return null;
    return finish(feet * 12 + Number(frac[1]) / den);
  }
  const plain = /^(\d+(?:\.\d*)?|\.\d+)$/.exec(s);
  if (plain) return finish(feet * 12 + Number(plain[1]));
  return null;
}

function finish(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  return round(n, 3);
}

// ---------- model ----------

function clampDim(v, fallback, min = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(720, Math.max(min, round(n, 3)));
}

function clampPos(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(2000, Math.max(-2000, round(n, 3)));
}

export function makePiece(p = {}) {
  const edges = {};
  for (const side of SIDES) edges[side] = EDGE_IDS.includes(p.edges?.[side]) ? p.edges[side] : "polished";
  return {
    id: p.id || uid(),
    name: String(p.name || "").slice(0, 40),
    x: clampPos(p.x),
    y: clampPos(p.y),
    w: clampDim(p.w, 96),
    d: clampDim(p.d, 25.5),
    edges
  };
}

export function makeItem(type, p = {}) {
  const def = ITEM_TYPES[type] || ITEM_TYPES.base;
  const kind = ITEM_TYPES[type] ? type : "base";
  const item = {
    id: p.id || uid(),
    type: kind,
    x: clampPos(p.x),
    y: clampPos(p.y),
    w: kind === "seam" ? clampDim(p.w ?? def.w, 0, 0) : clampDim(p.w ?? def.w, def.w),
    d: kind === "seam" ? clampDim(p.d ?? def.d, 0, 0) : clampDim(p.d ?? def.d, def.d),
    rot: p.rot ? 1 : 0,
    label: String(p.label || "").slice(0, 24)
  };
  if (kind === "faucet") {
    item.holes = Math.min(5, Math.max(1, Math.round(Number(p.holes) || def.holes)));
    item.w = faucetSpan(item.holes);
    item.d = 1.5;
    if (item.rot) [item.w, item.d] = [item.d, item.w];
  }
  if (kind === "seam" && !(item.w > 0) && !(item.d > 0)) item.d = 25.5;
  return item;
}

export function faucetSpan(holes) {
  return round(1.5 + (Math.max(1, holes) - 1) * 4, 3);
}

export function normalizeLayout(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pieces = (Array.isArray(raw.pieces) ? raw.pieces : []).slice(0, 30).map(makePiece);
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 80).filter((it) => it && ITEM_TYPES[it.type]).map((it) => makeItem(it.type, it));
  if (!pieces.length && !items.length) return null;
  return {
    v: LAYOUT_VERSION,
    preset: PRESETS.some((p) => p.id === raw.preset) ? raw.preset : "",
    snap: Number(raw.snap) === 3 ? 3 : 1,
    fullSplashIn: clampDim(raw.fullSplashIn, 18, 4),
    pieces,
    items,
    updatedAt: raw.updatedAt || ""
  };
}

export function hasLayout(layout) {
  return !!(layout && Array.isArray(layout.pieces) && layout.pieces.length);
}

function E(top, right, bottom, left) {
  return { top, right, bottom, left };
}

export function presetLayout(id) {
  const P = (x, y, w, d, edges, name) => makePiece({ x, y, w, d, edges, name });
  const I = (type, x, y, extra = {}) => makeItem(type, { x, y, ...extra });
  let pieces = [];
  let items = [];
  switch (id) {
    case "straight": {
      pieces = [P(0, 0, 120, 25.5, E("splash4", "polished", "polished", "wall"), "Main run")];
      items = [
        I("drawers", 6, 0), I("sinkBase", 30, 0), I("dishwasher", 66, 0), I("base", 90, 0),
        I("sinkUnder", 33, 4.5), I("faucet", 47.25, 1.25)
      ];
      break;
    }
    case "lShape": {
      pieces = [
        P(0, 0, 132, 25.5, E("splash4", "polished", "polished", "splash4"), "Main run"),
        P(0, 25.5, 25.5, 72, E("polished", "polished", "polished", "splash4"), "Return")
      ];
      items = [
        I("drawers", 25.5, 0), I("sinkBase", 49.5, 0), I("dishwasher", 85.5, 0), I("base", 109.5, 0, { w: 22.5 }),
        I("sinkUnder", 52.5, 4.5), I("faucet", 66.75, 1.25),
        I("base", 0, 49.5, { w: 24, d: 30, rot: 1 }), I("cooktop", 2, 52, { w: 21, d: 30, rot: 1 })
      ];
      break;
    }
    case "uShape": {
      pieces = [
        P(0, 0, 144, 25.5, E("splash4", "splash4", "polished", "splash4"), "Back run"),
        P(0, 25.5, 25.5, 66, E("polished", "polished", "polished", "splash4"), "Left return"),
        P(118.5, 25.5, 25.5, 66, E("polished", "splash4", "polished", "polished"), "Right return")
      ];
      items = [
        I("sinkBase", 54, 0), I("dishwasher", 90, 0), I("drawers", 30, 0),
        I("sinkUnder", 57, 4.5), I("faucet", 71.25, 1.25),
        I("cooktop", 2, 46, { w: 21, d: 30, rot: 1 })
      ];
      break;
    }
    case "island": {
      pieces = [P(0, 0, 96, 36, E("polished", "polished", "overhang", "polished"), "Island")];
      items = [I("drawers", 12, 0), I("sinkBase", 36, 0), I("base", 72, 0, { w: 24 }), I("sinkUnder", 39, 3), I("faucet", 53.25, 0.75)];
      break;
    }
    case "lIsland": {
      pieces = [
        P(0, 0, 132, 25.5, E("splash4", "polished", "polished", "splash4"), "Main run"),
        P(0, 25.5, 25.5, 84, E("polished", "polished", "polished", "splash4"), "Return"),
        P(66, 66, 72, 36, E("polished", "polished", "overhang", "polished"), "Island")
      ];
      items = [
        I("drawers", 25.5, 0), I("sinkBase", 49.5, 0), I("dishwasher", 85.5, 0), I("base", 109.5, 0, { w: 22.5 }),
        I("sinkUnder", 52.5, 4.5), I("faucet", 66.75, 1.25),
        I("cooktop", 2, 58, { w: 21, d: 30, rot: 1 }),
        I("fridge", 132, 0),
        I("seam", 25.5, 0, { w: 0, d: 25.5 })
      ];
      break;
    }
    case "galley": {
      pieces = [
        P(0, 0, 120, 25.5, E("splash4", "polished", "polished", "wall"), "Sink wall"),
        P(0, 73.5, 120, 25.5, E("polished", "polished", "splash4", "wall"), "Range wall")
      ];
      items = [
        I("sinkBase", 42, 0), I("dishwasher", 78, 0), I("sinkUnder", 45, 4.5), I("faucet", 59.25, 1.25),
        I("cooktop", 45, 75.5)
      ];
      break;
    }
    case "vanity": {
      pieces = [P(0, 0, 60, 22, E("splash4", "polished", "polished", "splash4"), "Vanity")];
      items = [I("base", 0, 0, { w: 60, d: 21 }), I("sinkUnder", 21, 4.5, { w: 18, d: 13 }), I("faucet", 25.5, 1, { holes: 3 })];
      break;
    }
    default:
      return presetLayout("straight");
  }
  return { v: LAYOUT_VERSION, preset: id, snap: 1, fullSplashIn: 18, pieces, items, updatedAt: "" };
}

// ---------- geometry ----------

export function itemFootprint(item) {
  return { x: item.x, y: item.y, w: item.w, d: item.d };
}

export function bounds(layout, { withItems = true } = {}) {
  const rects = [...(layout?.pieces || [])];
  if (withItems) rects.push(...(layout?.items || []).map(itemFootprint));
  if (!rects.length) return { x: 0, y: 0, w: 0, d: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.d);
  }
  return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 };
}

export function unionAreaSqIn(rects) {
  const list = (rects || []).filter((r) => r.w > 0 && r.d > 0);
  if (!list.length) return 0;
  const xs = [...new Set(list.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(list.flatMap((r) => [r.y, r.y + r.d]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (list.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.d)) {
        area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
    }
  }
  return area;
}

function sideLine(p, side) {
  if (side === "top") return { axis: "x", at: p.y, a: p.x, b: p.x + p.w };
  if (side === "bottom") return { axis: "x", at: p.y + p.d, a: p.x, b: p.x + p.w };
  if (side === "left") return { axis: "y", at: p.x, a: p.y, b: p.y + p.d };
  return { axis: "y", at: p.x + p.w, a: p.y, b: p.y + p.d };
}

const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };

// Portions of a side that touch a neighbouring piece (a joint), as [a, b] intervals.
export function jointIntervals(piece, side, pieces) {
  const line = sideLine(piece, side);
  const out = [];
  for (const q of pieces || []) {
    if (q === piece || q.id === piece.id) continue;
    const other = sideLine(q, OPPOSITE[side]);
    if (Math.abs(other.at - line.at) > EPS) continue;
    const a = Math.max(line.a, other.a);
    const b = Math.min(line.b, other.b);
    if (b - a > EPS) out.push([a, b]);
  }
  return mergeIntervals(out);
}

function mergeIntervals(list) {
  const sorted = list.slice().sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function exposedIntervals(piece, side, pieces) {
  const line = sideLine(piece, side);
  const joints = jointIntervals(piece, side, pieces);
  const out = [];
  let cursor = line.a;
  for (const [a, b] of joints) {
    if (a - cursor > EPS) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (line.b - cursor > EPS) out.push([cursor, line.b]);
  return out;
}

export function exposedLength(piece, side, pieces) {
  return exposedIntervals(piece, side, pieces).reduce((sum, [a, b]) => sum + (b - a), 0);
}

function centerInside(item, piece) {
  const cx = item.x + item.w / 2;
  const cy = item.y + item.d / 2;
  return cx >= piece.x - EPS && cx <= piece.x + piece.w + EPS && cy >= piece.y - EPS && cy <= piece.y + piece.d + EPS;
}

export function itemsOnPiece(layout, piece) {
  return (layout?.items || []).filter((item) => centerInside(item, piece));
}

export function pieceAt(layout, x, y) {
  return (layout?.pieces || []).find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.d) || null;
}

// Pull a dragged piece flush against nearby pieces when within `reach` inches.
export function magnetize(piece, pieces, reach = 2) {
  let { x, y } = piece;
  let bestX = reach + EPS, bestY = reach + EPS;
  for (const q of pieces) {
    if (q.id === piece.id) continue;
    const overlapY = Math.min(y + piece.d, q.y + q.d) - Math.max(y, q.y) > -reach;
    const overlapX = Math.min(x + piece.w, q.x + q.w) - Math.max(x, q.x) > -reach;
    if (overlapY) {
      for (const target of [q.x + q.w, q.x - piece.w, q.x, q.x + q.w - piece.w]) {
        const dist = Math.abs(target - piece.x);
        if (dist < bestX) { bestX = dist; x = target; }
      }
    }
    if (overlapX) {
      for (const target of [q.y + q.d, q.y - piece.d, q.y, q.y + q.d - piece.d]) {
        const dist = Math.abs(target - piece.y);
        if (dist < bestY) { bestY = dist; y = target; }
      }
    }
  }
  return { x: round(x, 3), y: round(y, 3) };
}

// ---------- math ----------

export function layoutStats(layout) {
  const pieces = layout?.pieces || [];
  const items = layout?.items || [];
  const byType = { wall: 0, polished: 0, splash4: 0, splashFull: 0, overhang: 0 };
  for (const p of pieces) {
    for (const side of SIDES) {
      const type = p.edges?.[side] || "polished";
      byType[type] = (byType[type] || 0) + exposedLength(p, side, pieces);
    }
  }
  const areaIn = unionAreaSqIn(pieces);
  const sinks = { Undermount: 0, "Drop-in": 0, Farmhouse: 0 };
  let cooktops = 0;
  let faucetHoles = 0;
  let seams = 0;
  const cabinets = [];
  for (const item of items) {
    const def = ITEM_TYPES[item.type];
    if (!def) continue;
    if (def.sink) sinks[def.sink] += 1;
    else if (item.type === "cooktop") cooktops += 1;
    else if (item.type === "faucet") faucetHoles += item.holes || 1;
    else if (item.type === "seam") seams += 1;
    else if (def.group === "cabinet") cabinets.push({ type: item.type, label: itemLabel(item), width: nominalWidth(item) });
  }
  const sinkCount = sinks.Undermount + sinks["Drop-in"] + sinks.Farmhouse;
  const splashFullIn = Number(layout?.fullSplashIn) || 18;
  const lf = (inches) => round(inches / 12, 2);
  return {
    areaIn: round(areaIn, 3),
    sqft: round(areaIn / 144, 2),
    polishedLF: lf(byType.polished + byType.overhang),
    overhangLF: lf(byType.overhang),
    splash4LF: lf(byType.splash4),
    splashFullLF: lf(byType.splashFull),
    backsplashLF: lf(byType.splash4 + byType.splashFull),
    wallLF: lf(byType.wall),
    splash4Sqft: round((byType.splash4 * 4) / 144, 2),
    splashFullSqft: round((byType.splashFull * splashFullIn) / 144, 2),
    sinks,
    sinkCount,
    cooktops,
    faucetHoles,
    cutouts: sinkCount + cooktops + faucetHoles,
    seams,
    cabinets,
    pieces: pieces.length
  };
}

export function nominalWidth(item) {
  if (!item) return 0;
  return item.rot ? item.d : item.w;
}

export function itemLabel(item) {
  const def = ITEM_TYPES[item?.type];
  if (!def) return "";
  if (item.label) return item.label;
  if (item.type === "faucet") return (item.holes || 1) + (item.holes === 1 ? " faucet hole" : " faucet holes");
  if (def.group === "cabinet") return formatInches(nominalWidth(item)) + " " + def.short;
  return def.label;
}

export function itemCode(item) {
  const def = ITEM_TYPES[item?.type];
  if (!def) return "";
  if (item.type === "dishwasher") return "DW";
  if (item.type === "fridge") return "REF " + formatInches(nominalWidth(item), { mark: false });
  if (def.code) return def.code + formatInches(nominalWidth(item), { mark: false });
  return "";
}

function plural(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}

export function cutoutSummary(stats) {
  const bits = [];
  for (const [kind, n] of Object.entries(stats.sinks)) if (n) bits.push(plural(n, kind.toLowerCase() + " sink", kind.toLowerCase() + " sinks"));
  if (stats.cooktops) bits.push(plural(stats.cooktops, "cooktop", "cooktops"));
  if (stats.faucetHoles) bits.push(plural(stats.faucetHoles, "faucet hole", "faucet holes"));
  return bits.join(", ");
}

export function fmtNum(n, places = 1) {
  const v = round(n, places);
  return v.toFixed(places).replace(/\.0+$/, "") || "0";
}

export function summaryLines(stats) {
  const lines = [fmtNum(stats.sqft, 1) + " sq ft countertop"];
  if (stats.polishedLF) lines.push(fmtNum(stats.polishedLF) + " lf polished edge" + (stats.overhangLF ? " (" + fmtNum(stats.overhangLF) + " lf overhang)" : ""));
  if (stats.splash4LF) lines.push(fmtNum(stats.splash4LF) + " lf 4\u2033 backsplash");
  if (stats.splashFullLF) lines.push(fmtNum(stats.splashFullLF) + " lf full backsplash");
  const cut = cutoutSummary(stats);
  if (cut) lines.push(cut);
  if (stats.seams) lines.push(plural(stats.seams, "seam", "seams"));
  return lines;
}

export function jobFieldsFromLayout(layout) {
  const stats = layoutStats(layout);
  const sinkKinds = Object.entries(stats.sinks).filter(([, n]) => n > 0).map(([k]) => k);
  let backsplash = "None";
  if (stats.splash4LF && stats.splashFullLF) backsplash = "4 inch + Full height";
  else if (stats.splash4LF) backsplash = "4 inch";
  else if (stats.splashFullLF) backsplash = "Full height";
  return {
    sqft: round(stats.sqft, 2),
    sinkCutouts: String(stats.sinkCount),
    sinkType: sinkKinds.length ? sinkKinds.join(" + ") : "None",
    backsplash
  };
}

function findPrice(priceBook, ids, pattern) {
  const active = (priceBook || []).filter((p) => p.active !== false);
  return active.find((p) => ids.includes(p.id)) || (pattern ? active.find((p) => pattern.test(p.name)) : null) || null;
}

// Starter lines for an estimate built from the drawing. unitPriceCents comes from the price book when it matches.
export function estimateLinesFromLayout(layout, { priceBook = [], material = "", color = "" } = {}) {
  const stats = layoutStats(layout);
  const lines = [];
  const add = (description, unit, qty, price) => {
    if (!(qty > 0)) return;
    lines.push({ description, unit, qty: round(qty, 2), unitPriceCents: price?.unitPriceCents || 0, priceBookId: price?.id || "" });
  };
  const stone = [material, color].filter(Boolean).join(" ") || "Countertop";
  const matPrice = material ? findPrice(priceBook, [], new RegExp("^" + material.replace(/[^\w ]/g, ""), "i")) : null;
  add(stone + " countertop", "sqft", stats.sqft, matPrice);
  add("Polished edge", "lf", stats.polishedLF, findPrice(priceBook, [], /polish|edge.*lf|linear/i));
  add("4 inch backsplash", "sqft", stats.splash4Sqft, findPrice(priceBook, ["seed-splash-4"], /4.?inch|4"/i));
  add("Full height backsplash", "sqft", stats.splashFullSqft, findPrice(priceBook, ["seed-splash-full"], /full/i));
  add("Undermount sink cutout", "each", stats.sinks.Undermount, findPrice(priceBook, ["seed-sink-um"], /undermount/i));
  add("Drop-in sink cutout", "each", stats.sinks["Drop-in"], findPrice(priceBook, ["seed-sink-di"], /drop/i));
  add("Farmhouse sink cutout", "each", stats.sinks.Farmhouse, findPrice(priceBook, [], /farm|apron/i) || findPrice(priceBook, ["seed-sink-um"]));
  add("Cooktop cutout", "each", stats.cooktops, findPrice(priceBook, ["seed-cooktop"], /cooktop|range/i));
  add("Faucet hole", "each", stats.faucetHoles, findPrice(priceBook, ["seed-faucet"], /faucet/i));
  add("Seam", "each", stats.seams, findPrice(priceBook, ["seed-seam"], /seam/i));
  return lines;
}

// ---------- editing helpers (pure) ----------

export function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

export function cycleEdge(type) {
  const i = EDGE_IDS.indexOf(type);
  return EDGE_IDS[(i + 1) % EDGE_IDS.length];
}

export function duplicatePiece(layout, id) {
  const next = cloneLayout(layout);
  const src = next.pieces.find((p) => p.id === id);
  if (!src) return { layout: next, id: "" };
  const b = bounds(next, { withItems: false });
  const copy = makePiece({ ...src, id: "", y: b.y + b.d + 24, name: src.name ? src.name + " copy" : "" });
  next.pieces.push(copy);
  return { layout: next, id: copy.id };
}

export function addPiece(layout, { w = 96, d = 25.5 } = {}) {
  const next = layout ? cloneLayout(layout) : { v: LAYOUT_VERSION, preset: "", snap: 1, fullSplashIn: 18, pieces: [], items: [] };
  const b = bounds(next, { withItems: false });
  const piece = makePiece({ x: b.x || 0, y: next.pieces.length ? b.y + b.d + 24 : 0, w, d, edges: E("splash4", "polished", "polished", "polished") });
  next.pieces.push(piece);
  return { layout: next, id: piece.id };
}

export function removePiece(layout, id) {
  const next = cloneLayout(layout);
  const piece = next.pieces.find((p) => p.id === id);
  if (!piece) return next;
  const riders = new Set(itemsOnPiece(next, piece).map((i) => i.id));
  next.pieces = next.pieces.filter((p) => p.id !== id);
  next.items = next.items.filter((i) => !riders.has(i.id));
  return next;
}

// Place a new item on a piece: cutouts centred near the back edge, cabinets on the wall line.
export function placeItem(layout, type, pieceId) {
  const next = cloneLayout(layout);
  const piece = next.pieces.find((p) => p.id === pieceId) || next.pieces[0];
  const vertical = piece ? piece.d > piece.w : false;
  let item = makeItem(type, {});
  if (vertical && type !== "fridge") item = makeItem(type, { ...item, w: item.d, d: item.w, rot: 1, holes: item.holes });
  if (type === "seam" && piece) {
    item = vertical ? makeItem("seam", { w: piece.w, d: 0 }) : makeItem("seam", { w: 0, d: piece.d });
  }
  if (piece) {
    const cx = piece.x + piece.w / 2 - item.w / 2;
    const cy = piece.y + piece.d / 2 - item.d / 2;
    const def = ITEM_TYPES[type];
    if (def.group === "cabinet" && type !== "fridge") {
      item.x = vertical ? piece.x : cx;
      item.y = vertical ? cy : piece.y;
    } else if (type === "faucet") {
      item.x = vertical ? piece.x + 1.25 : cx;
      item.y = vertical ? cy : piece.y + 1.25;
    } else if (type === "fridge") {
      item.x = piece.x + piece.w;
      item.y = piece.y;
    } else if (type === "seam") {
      item.x = vertical ? piece.x : round(piece.x + piece.w / 2, 3);
      item.y = vertical ? round(piece.y + piece.d / 2, 3) : piece.y;
    } else {
      item.x = vertical ? piece.x + (piece.w - item.w) / 2 + 1.5 : cx;
      item.y = vertical ? cy : piece.y + Math.max(1, (piece.d - item.d) / 2 + 1);
    }
    item.x = snapValue(item.x, 0.25);
    item.y = snapValue(item.y, 0.25);
  }
  next.items.push(item);
  return { layout: next, id: item.id };
}

export function rotateItem(item) {
  const next = { ...item, w: item.d, d: item.w, rot: item.rot ? 0 : 1 };
  // keep the centre fixed
  next.x = round(item.x + item.w / 2 - next.w / 2, 3);
  next.y = round(item.y + item.d / 2 - next.d / 2, 3);
  return next;
}

export function setFaucetHoles(item, holes) {
  const n = Math.min(5, Math.max(1, Math.round(holes)));
  const span = faucetSpan(n);
  return item.rot ? { ...item, holes: n, d: span, w: 1.5 } : { ...item, holes: n, w: span, d: 1.5 };
}

// ---------- scene (shared by SVG and canvas renderers) ----------

export const PALETTES = {
  light: {
    bg: "#fbfaf6", grid: "#ebe6db", gridMajor: "#ddd6c7",
    stone: "#ffffff", stoneSel: "#fff6df", ink: "#1d1b16", ink2: "#6f6a5f",
    wall: "#8d877b", polished: "#c4870f", splash: "#2f6bd8", overhang: "#11957a",
    joint: "#a8a193", seam: "#d63f37", cut: "#1d1b16", cutFill: "#eef1f4",
    cab: "#8a79c9", cabFill: "rgba(138,121,201,0.07)", fridge: "#6f6a5f",
    sel: "#c4870f", dim: "#5c574d", label: "#1d1b16", labelBg: "rgba(255,255,255,0.86)"
  },
  dark: {
    bg: "#151513", grid: "#22211e", gridMajor: "#2d2c28",
    stone: "#23221f", stoneSel: "#2f2a1d", ink: "#ece7dc", ink2: "#a29d92",
    wall: "#8f8a7f", polished: "#e9b44c", splash: "#6ea1ff", overhang: "#38c9a5",
    joint: "#6f6b62", seam: "#ff6b62", cut: "#ece7dc", cutFill: "#2b2f35",
    cab: "#a896f0", cabFill: "rgba(168,150,240,0.10)", fridge: "#a29d92",
    sel: "#e9b44c", dim: "#b5b0a5", label: "#f4f0e8", labelBg: "rgba(28,27,24,0.86)"
  }
};

// Returns { vb:[x,y,w,h], scale (px per inch), els:[...] }.
// Each element: { t:"rect"|"line"|"path"|"circle"|"text", stroke, fill, sw (px), dash (px[]), ...geom, hit?, data? }
export function buildScene(layout, opts = {}) {
  const palette = opts.palette || PALETTES.light;
  const width = opts.width || 360;
  const maxHeight = opts.maxHeight || 360;
  const maxScale = opts.maxScale || 5;
  const sel = opts.selected || null;
  const interactive = !!opts.interactive;
  const showCabinets = opts.cabinets !== false;
  const pieces = layout?.pieces || [];
  const items = layout?.items || [];
  const b = bounds(layout);
  const dims = opts.dims !== false;
  const pad = opts.pad;
  const padPx = pad !== undefined ? { top: pad, left: pad, right: pad, bottom: pad } : dims ? { top: 40, left: 40, right: 18, bottom: 18 } : { top: 14, left: 14, right: 14, bottom: 14 };
  const usableW = Math.max(40, width - padPx.left - padPx.right);
  const usableH = Math.max(40, maxHeight - padPx.top - padPx.bottom);
  const fixed = opts.fixedView;
  const scale = fixed ? fixed.scale : Math.min(maxScale, usableW / Math.max(b.w, 12), usableH / Math.max(b.d, 12));
  const k = 1 / scale; // inches per px
  let vb;
  if (fixed) vb = fixed.vb;
  else {
    const vw = width * k;
    const contentH = Math.max(b.d, 12) * scale + padPx.top + padPx.bottom;
    const vh = Math.min(maxHeight, contentH) * k;
    const x = b.x - padPx.left * k - (usableW * k - Math.max(b.w, 0)) / 2;
    const y = b.y - padPx.top * k;
    vb = [round(x, 3), round(y, 3), round(vw, 3), round(vh, 3)];
  }
  const els = [];
  const push = (el) => els.push(el);

  // grid: 12" major, 3" minor when zoomed in enough
  if (opts.grid !== false) {
    const [gx, gy, gw, gh] = vb;
    const step = scale * 3 >= 7 ? 3 : 12;
    let minor = "";
    let major = "";
    for (let x = Math.floor(gx / step) * step; x <= gx + gw; x += step) {
      const seg = `M${round(x, 2)} ${round(gy, 2)}V${round(gy + gh, 2)}`;
      if (Math.abs(x % 12) < 0.001) major += seg; else minor += seg;
    }
    for (let y = Math.floor(gy / step) * step; y <= gy + gh; y += step) {
      const seg = `M${round(gx, 2)} ${round(y, 2)}H${round(gx + gw, 2)}`;
      if (Math.abs(y % 12) < 0.001) major += seg; else minor += seg;
    }
    if (minor) push({ t: "path", d: minor, stroke: palette.grid, sw: 0.5 });
    if (major) push({ t: "path", d: major, stroke: palette.gridMajor, sw: 0.75 });
  }

  // pieces (stone)
  for (const p of pieces) {
    const isSel = sel?.kind === "piece" && sel.id === p.id;
    push({ t: "rect", x: p.x, y: p.y, w: p.w, h: p.d, fill: isSel ? palette.stoneSel : palette.stone, stroke: "none", data: interactive ? { piece: p.id } : null });
  }

  // cabinets under the counter (dashed)
  if (showCabinets) {
    for (const item of items) {
      const def = ITEM_TYPES[item.type];
      if (def?.group !== "cabinet") continue;
      const isSel = sel?.kind === "item" && sel.id === item.id;
      const color = item.type === "fridge" ? palette.fridge : palette.cab;
      push({ t: "rect", x: item.x + 0.4, y: item.y + 0.4, w: Math.max(0.5, item.w - 0.8), h: Math.max(0.5, item.d - 0.8), fill: palette.cabFill, stroke: color, sw: isSel ? 1.6 : 1, dash: [4, 3], data: interactive ? { item: item.id } : null });
      if (item.type === "fridge" || item.type === "dishwasher") {
        push({ t: "path", d: `M${item.x + 0.4} ${item.y + 0.4}L${item.x + item.w - 0.4} ${item.y + item.d - 0.4}M${item.x + item.w - 0.4} ${item.y + 0.4}L${item.x + 0.4} ${item.y + item.d - 0.4}`, stroke: color, sw: 0.6, dash: [2, 3] });
      }
      const code = itemCode(item);
      const fs = 9 * k;
      const vertical = item.d > item.w * 1.4;
      // put cabinet code near the wall side (top for horizontal runs, left for vertical)
      if (code && (vertical ? item.d * scale > 26 : item.w * scale > 22)) {
        push({ t: "text", x: vertical ? item.x + item.w - 3 * k - fs * 0.4 : item.x + item.w / 2, y: vertical ? item.y + item.d / 2 : item.y + item.d - 3 * k, text: code, size: fs, fill: color, weight: 600, anchor: "middle", rot: vertical ? -90 : 0, baseline: vertical ? "middle" : "auto" });
      }
    }
  }

  // piece outlines
  for (const p of pieces) {
    push({ t: "rect", x: p.x, y: p.y, w: p.w, h: p.d, fill: "none", stroke: palette.ink, sw: 1.25 });
  }

  // joints between touching pieces
  for (const p of pieces) {
    for (const side of ["bottom", "right"]) {
      for (const [a, c] of jointIntervals(p, side, pieces)) {
        const ln = sideLine(p, side);
        const seg = ln.axis === "x" ? { x1: a, y1: ln.at, x2: c, y2: ln.at } : { x1: ln.at, y1: a, x2: ln.at, y2: c };
        push({ t: "line", ...seg, stroke: palette.joint, sw: 1, dash: [3, 3] });
      }
    }
  }

  // edges
  for (const p of pieces) {
    for (const side of SIDES) {
      const type = p.edges?.[side] || "polished";
      for (const [a, c] of exposedIntervals(p, side, pieces)) edgeEls(push, p, side, type, a, c, palette, k);
    }
  }

  // cutouts & seams
  for (const item of items) {
    const def = ITEM_TYPES[item.type];
    if (!def || def.group === "cabinet") continue;
    const isSel = sel?.kind === "item" && sel.id === item.id;
    const data = interactive ? { item: item.id } : null;
    if (item.type === "seam") {
      const x2 = item.x + item.w;
      const y2 = item.y + item.d;
      push({ t: "line", x1: item.x, y1: item.y, x2, y2, stroke: palette.seam, sw: isSel ? 2.4 : 1.8, dash: [6, 4] });
      if (interactive) push({ t: "line", x1: item.x, y1: item.y, x2, y2, stroke: "transparent", sw: 26, data, hit: true });
      continue;
    }
    if (item.type === "faucet") {
      const n = item.holes || 1;
      for (let i = 0; i < n; i++) {
        const cx = item.rot ? item.x + 0.75 : item.x + 0.75 + i * 4;
        const cy = item.rot ? item.y + 0.75 + i * 4 : item.y + 0.75;
        push({ t: "circle", cx, cy, r: 0.75, fill: palette.cutFill, stroke: palette.cut, sw: 1 });
      }
      if (interactive) push({ t: "rect", x: item.x - 9 * k, y: item.y - 9 * k, w: item.w + 18 * k, h: item.d + 18 * k, fill: "transparent", stroke: "none", data, hit: true });
    } else if (item.type === "cooktop") {
      push({ t: "rect", x: item.x, y: item.y, w: item.w, h: item.d, rx: 1, fill: palette.cutFill, stroke: palette.cut, sw: 1.2, data });
      const r = Math.min(item.w, item.d) * 0.17;
      for (const [fx, fy] of [[0.28, 0.3], [0.72, 0.3], [0.28, 0.72], [0.72, 0.72]]) {
        push({ t: "circle", cx: item.x + item.w * fx, cy: item.y + item.d * fy, r, fill: "none", stroke: palette.ink2, sw: 0.9 });
      }
    } else {
      // sinks
      const rx = item.type === "sinkDrop" ? 2.5 : 1.8;
      push({ t: "rect", x: item.x, y: item.y, w: item.w, h: item.d, rx, fill: palette.cutFill, stroke: palette.cut, sw: 1.2, data });
      if (item.type === "sinkDrop") push({ t: "rect", x: item.x + 1.5, y: item.y + 1.5, w: Math.max(1, item.w - 3), h: Math.max(1, item.d - 3), rx: 1.5, fill: "none", stroke: palette.ink2, sw: 0.8 });
      if (item.type === "sinkFarm") {
        const front = item.rot ? { x1: item.x + item.w, y1: item.y, x2: item.x + item.w, y2: item.y + item.d } : { x1: item.x, y1: item.y + item.d, x2: item.x + item.w, y2: item.y + item.d };
        push({ t: "line", ...front, stroke: palette.cut, sw: 2.6 });
      }
      push({ t: "circle", cx: item.x + item.w / 2, cy: item.y + item.d / 2, r: Math.max(0.8, Math.min(item.w, item.d) * 0.08), fill: "none", stroke: palette.ink2, sw: 0.9 });
    }
    if (isSel) push({ t: "rect", x: item.x - 3 * k, y: item.y - 3 * k, w: item.w + 6 * k, h: item.d + 6 * k, rx: 2 * k, fill: "none", stroke: palette.sel, sw: 1.6, dash: [4, 3] });
  }
  for (const item of items) {
    if (ITEM_TYPES[item.type]?.group !== "cabinet") continue;
    if (sel?.kind === "item" && sel.id === item.id) push({ t: "rect", x: item.x - 2 * k, y: item.y - 2 * k, w: item.w + 4 * k, h: item.d + 4 * k, rx: 2 * k, fill: "none", stroke: palette.sel, sw: 1.8 });
  }

  // piece labels (dimensions inside the stone), placed in the widest stretch free of cutouts and seams
  for (const p of opts.labels === false ? [] : pieces) {
    const vertical = p.d > p.w * 1.15;
    const fs = 11 * k;
    const shortPx = (vertical ? p.w : p.d) * scale;
    if (shortPx < 16) continue;
    const start = vertical ? p.y : p.x;
    const end = start + (vertical ? p.d : p.w);
    const blocked = items
      .filter((it) => ITEM_TYPES[it.type] && ITEM_TYPES[it.type].group !== "cabinet")
      .filter((it) => it.x < p.x + p.w && it.x + it.w > p.x && it.y < p.y + p.d && it.y + it.d > p.y)
      .map((it) => (vertical ? [it.y - 2 * k, it.y + it.d + 2 * k] : [it.x - 2 * k, it.x + it.w + 2 * k]))
      .sort((m, n) => m[0] - n[0]);
    const gaps = [];
    let cursor = start;
    for (const [g0, g1] of blocked) {
      if (g0 > cursor) gaps.push([cursor, Math.min(g0, end)]);
      cursor = Math.max(cursor, g1);
    }
    if (cursor < end) gaps.push([cursor, end]);
    const best = gaps.sort((m, n) => (n[1] - n[0]) - (m[1] - m[0]))[0] || [start, end];
    const room = (best[1] - best[0]) * scale;
    const full = formatInches(vertical ? p.d : p.w) + " \u00d7 " + formatInches(vertical ? p.w : p.d);
    const brief = formatInches(vertical ? p.d : p.w);
    const need = (t) => t.length * fs * 0.56 * scale + 10;
    let text = full;
    let mid = (best[0] + best[1]) / 2;
    if (room < need(full)) {
      if (room >= need(brief)) text = brief;
      else if ((end - start) * scale >= need(full) && !blocked.length) mid = (start + end) / 2;
      else if ((end - start) * scale < need(brief)) continue;
      else text = room >= need(brief) * 0.8 ? brief : full;
    }
    const tw = text.length * fs * 0.56 + 8 * k;
    const th = fs * 1.45;
    if (vertical) {
      const lx = p.x + p.w / 2;
      push({ t: "rect", x: lx - th / 2, y: mid - tw / 2, w: th, h: tw, rx: th / 2, fill: palette.labelBg, stroke: "none" });
      push({ t: "text", x: lx, y: mid, text, size: fs, fill: palette.label, weight: 650, anchor: "middle", baseline: "middle", rot: -90 });
    } else {
      const cy = p.y + p.d / 2;
      push({ t: "rect", x: mid - tw / 2, y: cy - th / 2, w: tw, h: th, rx: th / 2, fill: palette.labelBg, stroke: "none" });
      push({ t: "text", x: mid, y: cy, text, size: fs, fill: palette.label, weight: 650, anchor: "middle", baseline: "middle" });
    }
  }

  // overall dimension lines
  const pb = bounds(layout, { withItems: false });
  if (pieces.length && dims) {
    const yDim = pb.y - 22 * k;
    const xDim = pb.x - 22 * k;
    dimLine(push, pb.x, yDim, pb.x + pb.w, yDim, formatInches(pb.w), palette, k, "h");
    dimLine(push, xDim, pb.y, xDim, pb.y + pb.d, formatInches(pb.d), palette, k, "v");
  }

  // selected piece: hit targets for each edge
  if (interactive && sel?.kind === "piece") {
    const p = pieces.find((row) => row.id === sel.id);
    if (p) {
      push({ t: "rect", x: p.x - 2.5 * k, y: p.y - 2.5 * k, w: p.w + 5 * k, h: p.d + 5 * k, rx: 2 * k, fill: "none", stroke: palette.sel, sw: 1.6, dash: [5, 3] });
      for (const side of SIDES) {
        const ln = sideLine(p, side);
        const inset = Math.min(10 * k, (ln.b - ln.a) / 4);
        const seg = ln.axis === "x" ? { x1: ln.a + inset, y1: ln.at, x2: ln.b - inset, y2: ln.at } : { x1: ln.at, y1: ln.a + inset, x2: ln.at, y2: ln.b - inset };
        push({ t: "line", ...seg, stroke: "transparent", sw: 30, data: { piece: p.id, edge: side }, hit: true });
      }
    }
  }
  return { vb, scale, els };
}

function edgeEls(push, p, side, type, a, c, palette, k) {
  const ln = sideLine(p, side);
  const out = side === "top" || side === "left" ? -1 : 1; // outward direction
  const seg = (offPx) => {
    const o = offPx * k * out;
    return ln.axis === "x" ? { x1: a, y1: ln.at + o, x2: c, y2: ln.at + o } : { x1: ln.at + o, y1: a, x2: ln.at + o, y2: c };
  };
  if (type === "wall") {
    // architectural wall: line plus outward hatch ticks
    push({ t: "line", ...seg(0), stroke: palette.wall, sw: 1.6 });
    let d = "";
    const step = 6 * k;
    for (let t = a + step / 2; t < c; t += step) {
      if (ln.axis === "x") d += `M${round(t, 2)} ${round(ln.at, 2)}l${round(-4 * k, 3)} ${round(5 * k * out, 3)}`;
      else d += `M${round(ln.at, 2)} ${round(t, 2)}l${round(5 * k * out, 3)} ${round(-4 * k, 3)}`;
    }
    if (d) push({ t: "path", d, stroke: palette.wall, sw: 0.8 });
  } else if (type === "polished") {
    push({ t: "line", ...seg(0), stroke: palette.polished, sw: 3.4, cap: "round" });
  } else if (type === "splash4") {
    push({ t: "line", ...seg(0), stroke: palette.splash, sw: 1.6 });
    push({ t: "line", ...seg(4), stroke: palette.splash, sw: 1.6 });
  } else if (type === "splashFull") {
    const o1 = seg(0);
    const o2 = seg(7);
    push({ t: "path", d: `M${o1.x1} ${o1.y1}L${o1.x2} ${o1.y2}L${o2.x2} ${o2.y2}L${o2.x1} ${o2.y1}Z`, fill: palette.splash, stroke: palette.splash, sw: 1, opacity: 0.35 });
    push({ t: "line", ...seg(0), stroke: palette.splash, sw: 1.8 });
    push({ t: "line", ...seg(7), stroke: palette.splash, sw: 1.8 });
  } else if (type === "overhang") {
    push({ t: "line", ...seg(0), stroke: palette.overhang, sw: 3.4, cap: "round" });
    // cabinet face line 12" inside the edge
    const inward = -out * OVERHANG_IN;
    const depth = ln.axis === "x" ? p.d : p.w;
    if (depth > OVERHANG_IN + 2) {
      const at = ln.at + inward;
      push({ t: "line", ...(ln.axis === "x" ? { x1: a, y1: at, x2: c, y2: at } : { x1: at, y1: a, x2: at, y2: c }), stroke: palette.overhang, sw: 1, dash: [5, 4] });
      const mid = (a + c) / 2;
      const fs = 8.5 * k;
      const labelAt = ln.at + inward / 2;
      push({ t: "text", x: ln.axis === "x" ? mid : labelAt, y: ln.axis === "x" ? labelAt : mid, text: "12\u2033 OH", size: fs, fill: palette.overhang, weight: 650, anchor: "middle", baseline: "middle", rot: ln.axis === "x" ? 0 : -90 });
    }
  }
}

function dimLine(push, x1, y1, x2, y2, label, palette, k, dir) {
  const t = 5 * k;
  push({ t: "line", x1, y1, x2, y2, stroke: palette.dim, sw: 0.9 });
  // architectural 45° ticks and extension lines
  const ticks = dir === "h"
    ? `M${x1 - t} ${y1 + t}L${x1 + t} ${y1 - t}M${x2 - t} ${y2 + t}L${x2 + t} ${y2 - t}M${x1} ${y1 - t}V${y1 + 12 * k}M${x2} ${y2 - t}V${y2 + 12 * k}`
    : `M${x1 - t} ${y1 + t}L${x1 + t} ${y1 - t}M${x2 - t} ${y2 + t}L${x2 + t} ${y2 - t}M${x1 - t} ${y1}H${x1 + 12 * k}M${x2 - t} ${y2}H${x2 + 12 * k}`;
  push({ t: "path", d: ticks, stroke: palette.dim, sw: 0.9 });
  const fs = 10.5 * k;
  const tw = label.length * fs * 0.58 + 8 * k;
  const th = fs * 1.35;
  if (dir === "h") {
    const cx = (x1 + x2) / 2;
    push({ t: "rect", x: cx - tw / 2, y: y1 - th / 2, w: tw, h: th, fill: palette.bg, stroke: "none" });
    push({ t: "text", x: cx, y: y1, text: label, size: fs, fill: palette.dim, weight: 600, anchor: "middle", baseline: "middle" });
  } else {
    const cy = (y1 + y2) / 2;
    push({ t: "rect", x: x1 - th / 2, y: cy - tw / 2, w: th, h: tw, fill: palette.bg, stroke: "none" });
    push({ t: "text", x: x1, y: cy, text: label, size: fs, fill: palette.dim, weight: 600, anchor: "middle", baseline: "middle", rot: -90 });
  }
}

function attr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function n3(v) {
  return Number.isFinite(v) ? String(round(v, 3)) : "0";
}

export function sceneToSvg(scene, { className = "bp", label = "Countertop layout", background = true, palette = PALETTES.light } = {}) {
  const [x, y, w, h] = scene.vb;
  const parts = [];
  if (background) parts.push(`<rect x="${n3(x)}" y="${n3(y)}" width="${n3(w)}" height="${n3(h)}" fill="${palette.bg}"/>`);
  for (const el of scene.els) {
    const common = [];
    if (el.stroke) common.push(`stroke="${attr(el.stroke)}"`);
    if (el.sw) common.push(`stroke-width="${el.sw}" vector-effect="non-scaling-stroke"`);
    if (el.dash) common.push(`stroke-dasharray="${el.dash.map((v) => n3(v / scene.scale)).join(" ")}"`);
    if (el.cap) common.push(`stroke-linecap="${el.cap}"`);
    if (el.opacity) common.push(`fill-opacity="${el.opacity}"`);
    if (el.data) for (const [key, val] of Object.entries(el.data)) common.push(`data-${key}="${attr(val)}"`);
    if (el.hit) common.push(`class="hit"`);
    // labels, dimensions and decorations never swallow a tap meant for the piece underneath
    if (!el.data && !el.hit) common.push(`pointer-events="none"`);
    const c = common.join(" ");
    if (el.t === "rect") parts.push(`<rect x="${n3(el.x)}" y="${n3(el.y)}" width="${n3(Math.max(0, el.w))}" height="${n3(Math.max(0, el.h))}"${el.rx ? ` rx="${n3(el.rx)}"` : ""} fill="${attr(el.fill || "none")}" ${c}/>`);
    else if (el.t === "line") parts.push(`<line x1="${n3(el.x1)}" y1="${n3(el.y1)}" x2="${n3(el.x2)}" y2="${n3(el.y2)}" ${c}/>`);
    else if (el.t === "path") parts.push(`<path d="${attr(el.d)}" fill="${attr(el.fill || "none")}" ${c}/>`);
    else if (el.t === "circle") parts.push(`<circle cx="${n3(el.cx)}" cy="${n3(el.cy)}" r="${n3(el.r)}" fill="${attr(el.fill || "none")}" ${c}/>`);
    else if (el.t === "text") {
      const rot = el.rot ? ` transform="rotate(${el.rot} ${n3(el.x)} ${n3(el.y)})"` : "";
      const base = el.baseline === "middle" ? ` dominant-baseline="central"` : "";
      parts.push(`<text x="${n3(el.x)}" y="${n3(el.y)}" font-size="${n3(el.size)}" font-weight="${el.weight || 500}" fill="${attr(el.fill)}" text-anchor="${el.anchor || "start"}"${base}${rot}>${attr(el.text)}</text>`);
    }
  }
  return `<svg class="${attr(className)}" viewBox="${n3(x)} ${n3(y)} ${n3(w)} ${n3(h)}" role="img" aria-label="${attr(label)}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif" preserveAspectRatio="xMidYMin meet">${parts.join("")}</svg>`;
}

// Canvas renderer (export). `ctx` is a CanvasRenderingContext2D already translated to the drawing box.
export function drawSceneOnCanvas(ctx, scene, { pxWidth, background = true, palette = PALETTES.light } = {}) {
  const [vx, vy, vw] = scene.vb;
  const s = pxWidth / vw; // device px per inch
  const strokePx = s / scene.scale; // device px per scene px
  ctx.save();
  ctx.setTransform(ctx.getTransform().a, 0, 0, ctx.getTransform().d, ctx.getTransform().e, ctx.getTransform().f);
  ctx.scale(s, s);
  ctx.translate(-vx, -vy);
  if (background) {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(vx, vy, scene.vb[2], scene.vb[3]);
  }
  for (const el of scene.els) {
    if (el.hit) continue;
    ctx.lineWidth = (el.sw || 1) * strokePx / s;
    ctx.setLineDash(el.dash ? el.dash.map((v) => (v * strokePx) / s) : []);
    ctx.lineCap = el.cap || "butt";
    const stroke = el.stroke && el.stroke !== "none" && el.stroke !== "transparent" ? el.stroke : null;
    const fill = el.fill && el.fill !== "none" && el.fill !== "transparent" ? el.fill : null;
    if (el.t === "rect") {
      ctx.beginPath();
      roundRect(ctx, el.x, el.y, Math.max(0, el.w), Math.max(0, el.h), el.rx || 0);
      paint(ctx, fill, stroke, el.opacity);
    } else if (el.t === "line") {
      if (!stroke) continue;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.strokeStyle = stroke;
      ctx.stroke();
    } else if (el.t === "path") {
      const path = new Path2D(el.d);
      if (fill) {
        ctx.globalAlpha = el.opacity || 1;
        ctx.fillStyle = fill;
        ctx.fill(path);
        ctx.globalAlpha = 1;
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.stroke(path);
      }
    } else if (el.t === "circle") {
      ctx.beginPath();
      ctx.arc(el.cx, el.cy, el.r, 0, Math.PI * 2);
      paint(ctx, fill, stroke);
    } else if (el.t === "text") {
      ctx.save();
      ctx.translate(el.x, el.y);
      if (el.rot) ctx.rotate((el.rot * Math.PI) / 180);
      ctx.font = `${el.weight || 500} ${el.size}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = el.fill;
      ctx.textAlign = el.anchor === "middle" ? "center" : el.anchor === "end" ? "right" : "left";
      ctx.textBaseline = el.baseline === "middle" ? "middle" : "alphabetic";
      ctx.fillText(el.text, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  if (!rr) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function paint(ctx, fill, stroke, opacity) {
  if (fill) {
    ctx.globalAlpha = opacity || 1;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
