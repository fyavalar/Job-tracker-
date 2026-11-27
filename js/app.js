import { open, migrateIfNeeded, loadAll, storageKind } from "./db.js";
import { state } from "./state.js";
import { registerRender, registerGuard, initHistory, currentRoute, toast, syncChrome, watchSystemTheme, go, back, savedScroll, consumeSaved, render as rerender } from "./nav.js";
import { esc, plural } from "./format.js";
import { icon } from "./icons.js";
import { confirmSheet, closeSheet, isSheetOpen } from "./sheet.js";
import * as home from "./views/home.js";
import * as jobs from "./views/jobs.js";
import * as layoutView from "./views/layout.js";
import * as customers from "./views/customers.js";
import * as docs from "./views/docs.js";
import * as calendar from "./views/calendar.js";
import * as money from "./views/money.js";
import * as inventory from "./views/inventory.js";
import * as more from "./views/more.js";

const missing = {
  title: () => "Not found",
  back: () => "#/",
  html: () => `<div class="empty"><div class="empty-art">${icon("search")}</div><h2>That page isn't in the app.</h2><p><a class="btn primary" href="#/">Back to Home</a></p></div>`
};

let current = home;
let currentPath = "";
let token = 0;
let cleanups = [];
let snapshot = { path: "", value: "" };
let busy = false;

function pick(route) {
  const [a, b, c] = route.parts;
  if (!a) return home;
  if (a === "jobs" && !b) return jobs.list;
  if (a === "jobs" && b === "new") return jobs.form;
  if (a === "jobs" && c === "edit") return jobs.form;
  if (a === "jobs" && c === "pay") return jobs.payment;
  if (a === "jobs" && c === "layout") return layoutView.editor;
  if (a === "jobs") return jobs.detail;
  if (a === "customers" && !b) return customers.list;
  if (a === "customers" && b === "new") return customers.form;
  if (a === "customers" && c === "edit") return customers.form;
  if (a === "customers") return customers.detail;
  if (a === "estimates" && !b) return docs.estimates;
  if (a === "invoices" && !b) return docs.invoices;
  if ((a === "estimates" || a === "invoices") && b === "new") return docs.editor;
  if ((a === "estimates" || a === "invoices") && c === "preview") return docs.preview;
  if (a === "estimates" || a === "invoices") return docs.editor;
  if (a === "calendar") return calendar.view;
  if (a === "money") return money.money;
  if (a === "reports") return money.reports;
  if (a === "inventory" && !b) return inventory.list;
  if (a === "inventory") return inventory.form;
  if (a === "more") return more.more;
  if (a === "price-book" && !b) return more.prices;
  if (a === "price-book") return more.priceForm;
  if (a === "tasks") return more.tasks;
  if (a === "settings") return more.settings;
  if (a === "search") return more.search;
  return missing;
}

function tabOf(route) {
  const a = route.parts[0] || "";
  if (!a) return "home";
  if (a === "jobs") return "jobs";
  if (a === "calendar") return "calendar";
  if (a === "money" || a === "reports" || a === "invoices") return "money";
  return "more";
}

function topbar(route, view) {
  const title = esc(view.title?.(route) || "JOBS");
  const action = view.action?.(route) || "";
  if (view.root) {
    return `<h1 class="topbar-title is-root">${title}</h1><div class="topbar-actions">${action}<a class="icon-btn" href="#/search" aria-label="Search">${icon("search")}</a></div>`;
  }
  return `<button type="button" class="icon-btn back-btn" data-nav-back aria-label="Back">${icon("back")}</button><h1 class="topbar-title">${title}</h1><div class="topbar-actions">${action}</div>`;
}

function tabbar(active) {
  const items = [
    ["home", "#/", "Home", "home"],
    ["jobs", "#/jobs", "Jobs", "jobs"],
    ["calendar", "#/calendar", "Schedule", "calendar"],
    ["money", "#/money", "Money", "money"],
    ["more", "#/more", "More", "more"]
  ];
  return items
    .map(([id, href, label, name]) => `<a href="${href}" data-tab="${id}"${active === id ? ' aria-current="page"' : ""}>${icon(name, active === id)}<span>${label}</span></a>`)
    .join("");
}

function serialize(form) {
  if (!form) return "";
  return [...form.elements]
    .filter((el) => (el.name || el.dataset.k) && el.type !== "file" && el.type !== "button" && el.type !== "submit")
    .map((el) => (el.name || el.dataset.k) + "=" + (el.type === "checkbox" || el.type === "radio" ? el.checked : el.value))
    .join("&");
}

function guardForm() {
  return document.querySelector("#main form[data-guard]");
}

registerGuard({
  isDirty() {
    if (current?.dirty?.()) return true;
    const form = guardForm();
    if (!form || snapshot.path !== currentRoute().path) return false;
    return serialize(form) !== snapshot.value;
  },
  confirm() {
    return confirmSheet({ title: "Discard changes?", message: "You have edits on this screen that aren't saved yet.", confirm: "Discard changes", cancel: "Keep editing" });
  }
});

async function render(opts = {}) {
  const mine = ++token;
  const route = currentRoute();
  const view = pick(route);
  const main = document.getElementById("main");
  const keep = opts.keepScroll ? main.scrollTop : 0;
  const leaving = currentPath && currentPath !== route.path;
  if (isSheetOpen() && !opts.keepScroll) closeSheet(null);
  cleanups.forEach((fn) => fn());
  cleanups = [];
  if (leaving) current?.leave?.();
  current = view;
  currentPath = route.path;
  try {
    if (view.prepare) await view.prepare(route);
    if (mine !== token) return;
    document.getElementById("topbar").innerHTML = topbar(route, view);
    document.getElementById("tabbar").innerHTML = tabbar(tabOf(route));
    document.body.dataset.view = view.id || route.parts[0] || "home";
    main.innerHTML = `<div class="wrap${opts.dir && opts.dir !== "none" && !opts.keepScroll ? " anim-" + opts.dir : ""}">${view.html(route)}</div>`;
    const cleanup = view.mount?.(main, route);
    if (typeof cleanup === "function") cleanups.push(cleanup);
    if (consumeSaved() || snapshot.path !== route.path) snapshot = { path: route.path, value: serialize(guardForm()) };
    const restore = opts.restore ? savedScroll() : undefined;
    main.scrollTop = opts.keepScroll ? keep : restore !== undefined ? restore : 0;
  } catch (error) {
    console.error(error);
    main.innerHTML = `<div class="wrap"><p class="err">This screen hit a problem. ${esc(error.message || "Unknown error")}</p></div>`;
  }
}

function actFrom(event) {
  return event.target.closest?.("[data-act]") || null;
}

async function runLocked(fn) {
  if (busy) return;
  const result = fn();
  if (result && typeof result.then === "function") {
    busy = true;
    document.body.classList.add("is-busy");
    try {
      await result;
    } catch (error) {
      console.error(error);
      toast("Something went wrong. Try that again.");
    } finally {
      busy = false;
      document.body.classList.remove("is-busy");
    }
  }
}

// In-app links use pushState so Back, scroll restore, and unsaved-change checks all work.
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  const backBtn = event.target.closest?.("[data-nav-back]");
  if (backBtn) {
    event.preventDefault();
    const route = currentRoute();
    back(current?.back?.(route) || "#/");
    return;
  }
  const a = event.target.closest?.("a[href^='#']");
  if (!a || a.target === "_blank" || a.closest(".sheet-layer")) return;
  event.preventDefault();
  if (a.dataset.tab) {
    const main = document.getElementById("main");
    if (location.hash === a.getAttribute("href") || (a.getAttribute("href") === "#/" && (location.hash === "" || location.hash === "#/"))) {
      main.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    go(a.getAttribute("href"));
    return;
  }
  go(a.getAttribute("href"));
});

const mainEl = document.getElementById("main");
mainEl.addEventListener("click", (event) => {
  const el = actFrom(event);
  if (!el || el.closest(".sheet-layer")) return;
  if (el.tagName === "A" && el.getAttribute("href")?.startsWith("#")) return;
  runLocked(() => current?.onClick?.(el.dataset.act, el, event));
});

document.getElementById("topbar").addEventListener("click", (event) => {
  const el = actFrom(event);
  if (!el) return;
  runLocked(() => current?.onClick?.(el.dataset.act, el, event));
});

mainEl.addEventListener("input", (event) => current?.onInput?.(event));
mainEl.addEventListener("change", (event) => current?.onChange?.(event));
mainEl.addEventListener("submit", (event) => {
  if (!event.target.closest?.("form")) return;
  event.preventDefault();
  document.activeElement?.blur?.();
  runLocked(() => current?.onSubmit?.(event));
});
mainEl.addEventListener("paste", (event) => current?.onPaste?.(event));
mainEl.addEventListener("keydown", (event) => current?.onKeydown?.(event));

mainEl.addEventListener("focusin", (event) => {
  const el = event.target;
  if (!el || !el.matches?.("input:not([type=file]), textarea, select") || el.closest(".no-autoscroll")) return;
  setTimeout(() => {
    const rect = el.getBoundingClientRect();
    const viewport = window.visualViewport?.height || window.innerHeight;
    if (rect.top > 90 && rect.bottom < viewport - 90) return;
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      el.scrollIntoView();
    }
  }, 320);
});

registerRender(render);

async function boot() {
  try {
    state.storage = await open();
    const migrated = await migrateIfNeeded();
    const loaded = await loadAll();
    state.business = loaded.business;
    state.customers = loaded.customers;
    state.jobs = loaded.jobs;
    state.estimates = loaded.estimates;
    state.invoices = loaded.invoices;
    state.payments = loaded.payments;
    state.priceBook = loaded.priceBook;
    state.slabs = loaded.slabs;
    state.tasks = loaded.tasks;
    state.loaded = true;
    state.storage = storageKind();
    initHistory();
    await render();
    if (migrated && (migrated.customers || migrated.jobs)) {
      toast("Copied " + plural(migrated.customers, "customer", "customers") + " and " + plural(migrated.jobs, "job", "jobs") + " from this phone.");
    }
  } catch (error) {
    console.error(error);
    document.getElementById("main").innerHTML = `<div class="wrap"><p class="err">Couldn't open your saved records. ${esc(error.message || "")}</p></div>`;
  }
  syncChrome();
  watchSystemTheme(() => rerender({ keepScroll: true }));
  if (navigator.storage?.persist) {
    navigator.storage.persisted?.().then((done) => (done ? true : navigator.storage.persist())).catch(() => {});
  }
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          toast("An update is ready.", () => location.reload(), "Reload");
        });
      }
      return reg;
    }).catch(() => {});
  }
}

boot();
