function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadFile(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("read"));
        el.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function drawToBlob(source, max, quality) {
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const blob = await canvasBlob(canvas, "image/jpeg", quality);
  if (!blob) throw new Error("Couldn't read that photo. Try a JPEG.");
  return blob;
}

export async function compressImageFile(file) {
  if (!file) throw new Error("Choose a photo.");
  try {
    const source = await loadFile(file);
    return await drawToBlob(source, 1600, 0.72);
  } catch {
    throw new Error("Couldn't read that photo. Try a JPEG.");
  }
}

export async function fileToJpegDataUrl(file, max = 480) {
  const source = await loadFile(file);
  const blob = await drawToBlob(source, max, 0.85);
  return await blobToDataUrl(blob);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Couldn't read that image."));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToJpegBytes(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("logo"));
      el.src = dataUrl;
    });
    const blob = await drawToBlob(img, 480, 0.85);
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}
