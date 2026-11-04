import { esc } from "./format.js";

let renderFn = null;
let timer = 0;

export function registerRender(fn) {
  renderFn = fn;
}

export function render(opts) {
  return renderFn?.(opts);
}

export function go(path) {
  const next = path.startsWith("#") ? path : "#" + path;
  if (location.hash === next) return render();
  location.hash = next.slice(1);
}

export function currentRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const [path, query] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query || ""));
  return { parts, params, path: "/" + parts.join("/") };
}

export function toast(message, undo) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = `<span>${esc(message)}</span>` + (undo ? `<button type="button" id="toast-undo">Undo</button>` : "");
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.hidden = true;
  }, undo ? 6000 : 2800);
  if (undo) {
    document.getElementById("toast-undo").onclick = async () => {
      el.hidden = true;
      await undo();
      render();
    };
  }
}

export function setTheme(theme) {
  const next = theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
  try {
    localStorage.setItem("jobs-theme", next);
  } catch {
    /* Theme still applies for this visit. */
  }
  document.documentElement.setAttribute("data-theme", next);
}

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "system";
}
