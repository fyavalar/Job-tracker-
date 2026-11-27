// Browser-side rendering of a countertop layout: themed SVG, PNG sheet, and JPEG for PDFs.
import { buildScene, sceneToSvg, drawSceneOnCanvas, layoutStats, summaryLines, PALETTES, EDGE_TYPES, formatInches, itemLabel, ITEM_TYPES, fmtNum } from "./layout.js";
import { resolvedTheme } from "./nav.js";

export function themePalette() {
  try {
    return resolvedTheme() === "dark" ? PALETTES.dark : PALETTES.light;
  } catch {
    return PALETTES.light;
  }
}

export function blueprintSvg(layout, opts = {}) {
  const palette = opts.palette || themePalette();
  const scene = buildScene(layout, { ...opts, palette });
  return { svg: sceneToSvg(scene, { className: opts.className || "bp", palette, label: opts.label || "Countertop layout" }), scene };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the layout."))), type, quality));
}

function fitText(ctx, text, maxWidth) {
  let s = String(text || "");
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;

// High-res dimensioned sheet for texting to a fabricator or homeowner.
export async function layoutPngBlob(layout, meta = {}) {
  const P = PALETTES.light;
  const W = 1200; // logical px; drawn at 2x
  const dpr = 2;
  const pad = 56;
  const stats = layoutStats(layout);
  const scene = buildScene(layout, { width: W - pad * 2, maxHeight: 760, maxScale: 7, palette: P, cabinets: true });
  const drawH = (scene.vb[3] * (W - pad * 2)) / scene.vb[2];
  const pieces = layout.pieces || [];
  const items = (layout.items || []).filter((i) => ITEM_TYPES[i.type]);
  const listRows = Math.max(pieces.length, Math.ceil(items.length / 1));
  const H = Math.round(pad + 150 + drawH + 40 + 150 + 60 + Math.min(14, listRows) * 34 + 60 + 70);
  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // header
  let y = pad;
  ctx.fillStyle = P.polished;
  ctx.fillRect(pad, y, 44, 5);
  y += 34;
  ctx.fillStyle = P.ink2;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText(fitText(ctx, (meta.business || "Countertop layout").toUpperCase(), W - pad * 2 - 260), pad, y);
  ctx.textAlign = "right";
  ctx.fillText(meta.date || "", W - pad, y);
  ctx.textAlign = "left";
  y += 44;
  ctx.fillStyle = P.ink;
  ctx.font = `700 38px ${FONT}`;
  ctx.fillText(fitText(ctx, meta.customer || "Countertop layout", W - pad * 2), pad, y);
  y += 34;
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = P.ink2;
  const sub = [meta.job, [meta.material, meta.color].filter(Boolean).join(" "), meta.address].filter(Boolean).join("  ·  ");
  ctx.fillText(fitText(ctx, sub, W - pad * 2), pad, y);
  y += 30;

  // drawing
  ctx.save();
  ctx.beginPath();
  const boxW = W - pad * 2;
  roundRect(ctx, pad, y, boxW, drawH, 18);
  ctx.clip();
  ctx.translate(pad, y);
  drawSceneOnCanvas(ctx, scene, { pxWidth: boxW, palette: P });
  ctx.restore();
  ctx.strokeStyle = "#e6e0d3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, pad + 0.5, y + 0.5, boxW - 1, drawH - 1, 18);
  ctx.stroke();
  y += drawH + 36;

  // stat tiles
  const tiles = [
    [fmtNum(stats.sqft, 1), "sq ft"],
    [fmtNum(stats.polishedLF, 1), "lf polished"],
    [fmtNum(stats.backsplashLF, 1), "lf backsplash"],
    [String(stats.cutouts), stats.cutouts === 1 ? "cutout" : "cutouts"]
  ];
  const gap = 16;
  const tw = (boxW - gap * 3) / 4;
  tiles.forEach(([value, label], i) => {
    const x = pad + i * (tw + gap);
    ctx.fillStyle = "#f6f3ec";
    ctx.beginPath();
    roundRect(ctx, x, y, tw, 112, 16);
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(value, x + 20, y + 58);
    ctx.fillStyle = P.ink2;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(label.toUpperCase(), x + 20, y + 90);
  });
  y += 112 + 34;

  // legend
  ctx.font = `600 17px ${FONT}`;
  let lx = pad;
  const legend = [
    [P.polished, "Polished edge", "solid"], [P.splash, "4\u2033 splash", "double"], [P.splash, "Full splash", "band"],
    [P.overhang, "Overhang", "solid"], [P.wall, "Wall", "thin"], [P.seam, "Seam", "dash"], [P.cab, "Cabinet", "dash"]
  ];
  for (const [color, label, style] of legend) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.setLineDash(style === "dash" ? [6, 4] : []);
    ctx.lineWidth = style === "solid" ? 5 : style === "thin" ? 2 : 2;
    ctx.beginPath();
    ctx.moveTo(lx, y - 6);
    ctx.lineTo(lx + 28, y - 6);
    ctx.stroke();
    if (style === "double" || style === "band") {
      ctx.beginPath();
      ctx.moveTo(lx, y - 12);
      ctx.lineTo(lx + 28, y - 12);
      ctx.stroke();
      if (style === "band") {
        ctx.globalAlpha = 0.35;
        ctx.fillRect(lx, y - 12, 28, 6);
        ctx.globalAlpha = 1;
      }
    }
    ctx.setLineDash([]);
    ctx.fillStyle = P.ink2;
    ctx.fillText(label, lx + 36, y);
    lx += 36 + ctx.measureText(label).width + 26;
  }
  y += 40;

  // pieces & items lists
  const colW = (boxW - 40) / 2;
  ctx.fillStyle = P.ink;
  ctx.font = `700 19px ${FONT}`;
  ctx.fillText("PIECES", pad, y);
  ctx.fillText("CUTOUTS & CABINETS", pad + colW + 40, y);
  y += 12;
  ctx.font = `500 19px ${FONT}`;
  let ly = y;
  pieces.slice(0, 14).forEach((p, i) => {
    ly += 34;
    ctx.fillStyle = P.ink2;
    ctx.fillText(fitText(ctx, (p.name || "Piece " + (i + 1)), colW - 190), pad, ly);
    ctx.fillStyle = P.ink;
    ctx.textAlign = "right";
    ctx.fillText(formatInches(p.w) + " \u00d7 " + formatInches(p.d), pad + colW, ly);
    ctx.textAlign = "left";
  });
  let ry = y;
  items.slice(0, 14).forEach((item) => {
    ry += 34;
    ctx.fillStyle = P.ink;
    const size = item.type === "faucet" || item.type === "seam" ? "" : formatInches(item.rot ? item.d : item.w) + " \u00d7 " + formatInches(item.rot ? item.w : item.d);
    ctx.fillText(fitText(ctx, itemLabel(item), colW - 150), pad + colW + 40, ry);
    ctx.fillStyle = P.ink2;
    ctx.textAlign = "right";
    if (size) ctx.fillText(size, W - pad, ry);
    ctx.textAlign = "left";
  });
  y = Math.max(ly, ry) + 50;
  ctx.fillStyle = P.ink2;
  ctx.font = `500 16px ${FONT}`;
  ctx.fillText("All dimensions in inches. Verify on site before fabrication." + (meta.business ? "  ·  " + meta.business : ""), pad, Math.min(y, H - 30));

  return canvasToBlob(canvas, "image/png");
}

// Compact drawing for PDFs (JPEG bytes, white background).
export async function layoutJpegBytes(layout, { width = 1400, maxHeight = 640 } = {}) {
  const P = PALETTES.light;
  const scene = buildScene(layout, { width: width / 2, maxHeight: maxHeight / 2, maxScale: 7, palette: P });
  const h = Math.round((scene.vb[3] * width) / scene.vb[2]);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  drawSceneOnCanvas(ctx, scene, { pxWidth: width, palette: P });
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height: h };
}

export function layoutLegendHtml() {
  const rows = [
    ["polished", "Polished"], ["splash4", "4\u2033 splash"], ["splashFull", "Full splash"], ["overhang", "Overhang"], ["wall", "Wall"]
  ];
  return `<div class="bp-legend">${rows.map(([id, label]) => `<span><i class="edge-swatch" data-edge="${id}"></i>${label}</span>`).join("")}</div>`;
}

export { summaryLines, EDGE_TYPES };

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
