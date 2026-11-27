// iOS-style bottom sheets: confirm, choose, and free-form panels. No dependencies.
import { esc } from "./format.js";

let open = null;

export function closeSheet(result) {
  if (!open) return;
  const current = open;
  open = null;
  current.el.classList.remove("is-open");
  document.removeEventListener("keydown", current.onKey);
  setTimeout(() => current.el.remove(), 220);
  current.resolve(result);
}

export function isSheetOpen() {
  return !!open;
}

export function openSheet({ title = "", body = "", onClick, onInput, className = "", label = "" } = {}) {
  closeSheet(null);
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "sheet-layer";
    el.innerHTML = `<div class="sheet-backdrop" data-sheet-close></div>
      <div class="sheet ${esc(className)}" role="dialog" aria-modal="true" aria-label="${esc(label || title || "Options")}">
        <div class="sheet-grab" aria-hidden="true"></div>
        ${title ? `<h3 class="sheet-title">${esc(title)}</h3>` : ""}
        <div class="sheet-body">${body}</div>
      </div>`;
    const onKey = (event) => {
      if (event.key === "Escape") closeSheet(null);
    };
    open = { el, resolve, onKey };
    el.addEventListener("click", (event) => {
      if (event.target.closest("[data-sheet-close]")) return closeSheet(null);
      const hit = event.target.closest("[data-sheet-value]");
      if (hit) return closeSheet(hit.dataset.sheetValue);
      onClick?.(event, el);
    });
    if (onInput) el.addEventListener("input", (event) => onInput(event, el));
    document.addEventListener("keydown", onKey);
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-open")));
    const first = el.querySelector("[autofocus]") || el.querySelector(".sheet button, .sheet [href]");
    setTimeout(() => first?.focus?.({ preventScroll: true }), 60);
  });
}

export async function confirmSheet({ title = "Are you sure?", message = "", confirm = "Delete", cancel = "Cancel", danger = true } = {}) {
  const result = await openSheet({
    title,
    label: title,
    className: "sheet-confirm",
    body: `${message ? `<p class="sheet-msg">${esc(message)}</p>` : ""}
      <div class="sheet-actions">
        <button type="button" class="btn ${danger ? "danger-solid" : "primary"} block" data-sheet-value="ok">${esc(confirm)}</button>
        <button type="button" class="btn block" data-sheet-value="cancel">${esc(cancel)}</button>
      </div>`
  });
  return result === "ok";
}

export async function chooseSheet({ title = "", options = [], note = "" } = {}) {
  const rows = options
    .map((opt) => `<button type="button" class="sheet-row${opt.selected ? " is-on" : ""}" data-sheet-value="${esc(opt.value)}"${opt.selected ? ' aria-current="true"' : ""}>
        ${opt.swatch ? `<i class="swatch" style="--sw:${esc(opt.swatch)}"></i>` : ""}
        <span class="sheet-row-text"><b>${esc(opt.label)}</b>${opt.sub ? `<small>${esc(opt.sub)}</small>` : ""}</span>
        ${opt.selected ? `<svg class="icon tick" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7.5"/></svg>` : ""}
      </button>`)
    .join("");
  const result = await openSheet({
    title,
    body: `<div class="sheet-list">${rows}</div>${note ? `<p class="sheet-note">${esc(note)}</p>` : ""}<button type="button" class="btn block sheet-cancel" data-sheet-close>Cancel</button>`
  });
  return result;
}
