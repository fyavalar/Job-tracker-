import { esc } from "./format.js";

let renderFn = null;
let guardFn = null;
let timer = 0;
const LIGHT_COLOR = "#f2f1ed";
const DARK_COLOR = "#0e0e0d";

// History bookkeeping: every in-app navigation gets a sequence number so we know
// whether a popstate went back or forward, and where each screen was scrolled.
const entries = new Map(); // n -> hash
const scrolls = new Map(); // n -> scrollTop
let current = 0;
let maxSeq = 0;
let skipGuardOnce = false;

export function registerRender(fn) {
  renderFn = fn;
}

// guard = { isDirty(): boolean, confirm(): Promise<boolean> }
export function registerGuard(guard) {
  guardFn = guard;
}

export function render(opts) {
  return renderFn?.(opts);
}

function normHash(path) {
  const raw = String(path || "/").replace(/^#/, "");
  return "#" + (raw.startsWith("/") ? raw : "/" + raw);
}

export function initHistory() {
  const n = Number(history.state?.n) || 0;
  current = n || 1;
  maxSeq = Math.max(current, Number(sessionStorage?.getItem?.("jobs-nav-max")) || 0);
  if (!n) history.replaceState({ n: current }, "", location.hash || "#/");
  entries.set(current, location.hash || "#/");
  window.addEventListener("popstate", onPop);
}

function bumpSeq() {
  maxSeq += 1;
  try {
    sessionStorage.setItem("jobs-nav-max", String(maxSeq));
  } catch {
    /* not important */
  }
  return maxSeq;
}

function main() {
  return document.getElementById("main");
}

function saveScroll() {
  const el = main();
  if (el) scrolls.set(current, el.scrollTop);
}

export function savedScroll() {
  return scrolls.get(current);
}

async function allowed() {
  if (skipGuardOnce) {
    skipGuardOnce = false;
    return true;
  }
  if (!guardFn || !guardFn.isDirty()) return true;
  return guardFn.confirm();
}

export function markClean() {
  skipGuardOnce = true;
}

// A form on the current screen was saved without leaving it: its new values are the clean baseline.
let savedFlag = false;
export function markSaved() {
  savedFlag = true;
}
export function consumeSaved() {
  const was = savedFlag;
  savedFlag = false;
  return was;
}

export async function go(path, { replace = false, force = false } = {}) {
  const next = normHash(path);
  if (!force && !(await allowed())) return false;
  skipGuardOnce = false;
  if (location.hash === next && !replace) {
    render({ keepScroll: true });
    return true;
  }
  saveScroll();
  const n = bumpSeq();
  if (replace) {
    entries.delete(current);
    scrolls.delete(current);
    history.replaceState({ n }, "", next);
  } else history.pushState({ n }, "", next);
  current = n;
  entries.set(n, next);
  render({ dir: replace ? "none" : "forward" });
  return true;
}

// Go "up" to a screen: use the real Back when that screen is directly underneath, so the
// history stays clean and its scroll position comes back.
export async function goBackTo(path, { force = false } = {}) {
  const target = normHash(path);
  const prevN = [...entries.keys()].filter((n) => n < current).sort((a, b) => b - a)[0];
  if (prevN !== undefined && entries.get(prevN) === target) {
    if (!force && !(await allowed())) return false;
    skipGuardOnce = true;
    history.back();
    return true;
  }
  return go(target, { replace: true, force });
}

export function canGoBack() {
  return [...entries.keys()].some((n) => n < current);
}

export async function back(fallback) {
  if (canGoBack()) {
    if (!(await allowed())) return false;
    skipGuardOnce = true;
    history.back();
    return true;
  }
  return go(fallback || "#/", { replace: true });
}

async function onPop(event) {
  const n = Number(event.state?.n) || 0;
  const hash = location.hash || "#/";
  if (!skipGuardOnce && guardFn?.isDirty()) {
    const leavingHash = entries.get(current);
    // put the form back while we ask, so a cancel leaves everything as it was
    const holdN = bumpSeq();
    history.pushState({ n: holdN }, "", leavingHash || "#/");
    const ok = await guardFn.confirm();
    if (!ok) {
      entries.delete(current);
      current = holdN;
      entries.set(holdN, leavingHash);
      return;
    }
    skipGuardOnce = true;
    history.back();
    return;
  }
  skipGuardOnce = false;
  saveScroll();
  const dir = n && n < current ? "back" : "forward";
  if (!n) {
    const fresh = bumpSeq();
    history.replaceState({ n: fresh }, "", hash);
    current = fresh;
  } else current = n;
  entries.set(current, hash);
  render({ dir, restore: dir === "back" });
}

export function currentRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const [path, query] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query || ""));
  return { parts, params, path: "/" + parts.join("/") };
}

export function toast(message, undo, actionLabel = "Undo") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = `<span>${esc(message)}</span>` + (undo ? `<button type="button" id="toast-undo">${esc(actionLabel)}</button>` : "");
  el.hidden = false;
  el.classList.remove("is-in");
  void el.offsetWidth;
  el.classList.add("is-in");
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.hidden = true;
  }, undo ? 6000 : 2800);
  if (undo) {
    document.getElementById("toast-undo").onclick = async () => {
      el.hidden = true;
      await undo();
      render({ keepScroll: true });
    };
  }
}

export function resolvedTheme(theme = currentTheme()) {
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function syncChrome(theme = currentTheme()) {
  const dark = resolvedTheme(theme) === "dark";
  const color = dark ? DARK_COLOR : LIGHT_COLOR;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", color);
  let bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (!bar) {
    bar = document.createElement("meta");
    bar.setAttribute("name", "apple-mobile-web-app-status-bar-style");
    document.head.appendChild(bar);
  }
  bar.setAttribute("content", dark ? "black-translucent" : "default");
}

export function setTheme(theme) {
  const next = theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
  try {
    localStorage.setItem("jobs-theme", next);
  } catch {
    /* Theme still applies for this visit. */
  }
  document.documentElement.setAttribute("data-theme", next);
  syncChrome(next);
}

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "system";
}

export function watchSystemTheme(onChange) {
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  if (!mq) return;
  const handler = () => {
    if (currentTheme() === "system") {
      syncChrome("system");
      onChange?.();
    }
  };
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else if (mq.addListener) mq.addListener(handler);
}
