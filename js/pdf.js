const EXTRA = {
  "\u20ac": 128,
  "\u201a": 130,
  "\u0192": 131,
  "\u201e": 132,
  "\u2026": 133,
  "\u2020": 134,
  "\u2021": 135,
  "\u02c6": 136,
  "\u2030": 137,
  "\u0160": 138,
  "\u2039": 139,
  "\u0152": 140,
  "\u017d": 142,
  "\u2018": 145,
  "\u2019": 146,
  "\u201c": 147,
  "\u201d": 148,
  "\u2022": 149,
  "\u2013": 150,
  "\u2014": 151,
  "\u02dc": 152,
  "\u2122": 153,
  "\u0161": 154,
  "\u203a": 155,
  "\u0153": 156,
  "\u017e": 158,
  "\u0178": 159
};

function winByte(ch) {
  const code = ch.codePointAt(0);
  if (code >= 32 && code <= 126) return code;
  if (code >= 160 && code <= 255) return code;
  return EXTRA[ch] || 63;
}

function pdfText(value) {
  let out = "(";
  for (const ch of String(value ?? "")) {
    const b = winByte(ch);
    if (b === 40 || b === 41 || b === 92) out += "\\" + String.fromCharCode(b);
    else out += String.fromCharCode(b);
  }
  return out + ")";
}

function latin1(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 255;
  return bytes;
}

function concat(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function jpegSize(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) + bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: (bytes[i + 5] << 8) + bytes[i + 6], width: (bytes[i + 7] << 8) + bytes[i + 8] };
    }
    if (!len) break;
    i += 2 + len;
  }
  return null;
}

function wrap(text, size, width) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  const maxChars = Math.max(8, Math.floor(width / (size * 0.52)));
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function block(text, size, width) {
  const parts = String(text ?? "").split(/\n/);
  const lines = parts.flatMap((part) => (part.trim() ? wrap(part, size, width) : [""]));
  return lines.length ? lines : [""];
}

function drawLine(cmds, text, x, y, size, { bold = false, align = "left", width = 0 } = {}) {
  const font = bold ? "F2" : "F1";
  let dx = x;
  if (align === "right" && width) dx = x + width - text.length * size * 0.52;
  cmds.push(`BT /${font} ${size} Tf ${dx.toFixed(2)} ${y.toFixed(2)} Td ${pdfText(text)} Tj ET`);
}

export function buildPdf(model) {
  const pages = [];
  let cmds = [];
  let y = 740;
  const left = 48;
  const right = 564;
  const pageWidth = 612;
  const pageHeight = 792;

  const newPage = () => {
    if (cmds.length) pages.push(cmds);
    cmds = [];
    y = 740;
  };
  const need = (h) => {
    if (y - h < 56) {
      newPage();
      drawLine(cmds, (model.number || "Document") + " continued", left, y, 10);
      y -= 22;
    }
  };

  if (model.logoJpeg) {
    const size = jpegSize(model.logoJpeg);
    if (size) {
      const h = 42;
      const w = Math.min(140, (size.width / size.height) * h);
      cmds.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${left} ${y - h + 12} cm /Im1 Do Q`);
    }
  }

  drawLine(cmds, model.businessName || "Estimate", model.logoJpeg ? 200 : left, y, 18, { bold: true });
  drawLine(cmds, model.kind || "Estimate", 400, y, 14, { bold: true });
  y -= 18;
  for (const line of block(model.businessMeta || "", 10, 240)) {
    if (line) drawLine(cmds, line, model.logoJpeg ? 200 : left, y, 10);
    y -= 13;
  }
  const metaStart = 740;
  drawLine(cmds, model.number || "", 400, metaStart - 18, 11);
  drawLine(cmds, model.issueDate || "", 400, metaStart - 32, 11);
  if (model.dueDate) drawLine(cmds, "Due " + model.dueDate, 400, metaStart - 46, 11);
  y = Math.min(y, metaStart - 58);
  cmds.push(`0.78 0.62 0.23 RG 1.6 w ${left} ${y} m ${right} ${y} l S`);
  y -= 26;

  need(70);
  drawLine(cmds, "Prepared for", left, y, 10);
  y -= 16;
  drawLine(cmds, model.customerName || "Customer", left, y, 13, { bold: true });
  y -= 15;
  for (const line of block(model.customerMeta || "", 11, 320)) {
    if (line) drawLine(cmds, line, left, y, 11);
    y -= 14;
  }
  if (model.jobLine) {
    y -= 2;
    drawLine(cmds, model.jobLine, left, y, 11);
    y -= 14;
  }
  y -= 10;

  need(36);
  cmds.push(`0.93 0.91 0.86 rg ${left} ${y - 6} ${right - left} 22 re f`);
  drawLine(cmds, "Description", left + 6, y, 10, { bold: true });
  drawLine(cmds, "Qty", 330, y, 10, { bold: true });
  drawLine(cmds, "Price", 400, y, 10, { bold: true });
  drawLine(cmds, "Amount", 490, y, 10, { bold: true });
  y -= 22;

  for (const line of model.lines || []) {
    const descLines = block(line.description || "Item", 11, 250).filter(Boolean);
    if (!descLines.length) descLines.push("Item");
    need(descLines.length * 14 + 8);
    descLines.forEach((text, index) => {
      drawLine(cmds, text, left, y, 11);
      if (index === 0) {
        drawLine(cmds, line.qty || "", 330, y, 11);
        drawLine(cmds, line.price || "", 390, y, 11);
        drawLine(cmds, line.amount || "", 470, y, 11);
      }
      y -= 14;
    });
    y -= 4;
  }

  y -= 8;
  const totals = model.totals || [];
  need(totals.length * 18 + 10);
  for (const row of totals) {
    drawLine(cmds, row.label, 330, y, row.strong ? 12 : 11, { bold: !!row.strong });
    drawLine(cmds, row.value, 470, y, row.strong ? 12 : 11, { bold: !!row.strong });
    y -= row.strong ? 20 : 16;
  }

  if (model.notes) {
    y -= 8;
    need(30);
    drawLine(cmds, "Notes", left, y, 10, { bold: true });
    y -= 14;
    for (const line of block(model.notes, 11, right - left)) {
      need(16);
      drawLine(cmds, line, left, y, 11);
      y -= 14;
    }
  }

  pages.push(cmds);

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const font2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  let imageId = null;
  if (model.logoJpeg && jpegSize(model.logoJpeg)) {
    const size = jpegSize(model.logoJpeg);
    const header = `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${model.logoJpeg.length} >>\nstream\n`;
    const footer = "\nendstream";
    imageId = add({ header, bytes: model.logoJpeg, footer });
  }

  const pageIds = [];
  const contentIds = [];
  for (const commands of pages) {
    const stream = commands.join("\n");
    const bytes = latin1(stream);
    contentIds.push(add({ header: `<< /Length ${bytes.length} >>\nstream\n`, bytes, footer: "\nendstream" }));
  }
  const pagesIdRef = objects.length + pages.length + 1;
  for (let i = 0; i < pages.length; i++) {
    const resources = imageId
      ? `/Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> /XObject << /Im1 ${imageId} 0 R >>`
      : `/Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >>`;
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesIdRef} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << ${resources} >> /Contents ${contentIds[i]} 0 R >>`
      )
    );
  }
  const kids = pageIds.map((id) => id + " 0 R").join(" ");
  const pagesId = add(`<< /Type /Pages /Count ${pageIds.length} /Kids [${kids}] >>`);
  if (pagesId !== pagesIdRef) {
    throw new Error("PDF page tree mismatch");
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const chunks = [latin1("%PDF-1.4\n")];
  const offsets = [0];
  let position = chunks[0].length;
  for (const obj of objects) {
    offsets.push(position);
    const head = latin1(objects.indexOf(obj) + 1 + " 0 obj\n");
    let bodyChunks;
    let tail;
    if (typeof obj === "string") {
      bodyChunks = [latin1(obj)];
      tail = latin1("\nendobj\n");
    } else {
      bodyChunks = [latin1(obj.header), obj.bytes, latin1(obj.footer)];
      tail = latin1("\nendobj\n");
    }
    const size = head.length + bodyChunks.reduce((s, c) => s + c.length, 0) + tail.length;
    chunks.push(head, ...bodyChunks, tail);
    position += size;
  }
  const xrefPos = position;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  chunks.push(latin1(xref));
  return concat(chunks);
}

export function pdfFileName(kind, number) {
  const safe = String(number || "document").replace(/[^\w.-]+/g, "-");
  return (kind === "Invoice" ? "Invoice-" : "Estimate-") + safe + ".pdf";
}
