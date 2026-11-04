import { open, migrateIfNeeded, loadAll, storageKind } from "./db.js";
import { state } from "./state.js";
import { registerRender, currentRoute, toast } from "./nav.js";
import { esc, plural } from "./format.js";
import { icon } from "./icons.js";
import * as home from "./views/home.js";
import * as jobs from "./views/jobs.js";
import * as customers from "./views/customers.js";
import * as docs from "./views/docs.js";
import * as calendar from "./views/calendar.js";
import * as money from "./views/money.js";
import * as inventory from "./views/inventory.js";
import * as more from "./views/more.js";

const missing = {
  title: () => "Not found",
  back: () => "#/",
  html: () => `<div class="empty"><h2>That page isn't in the app.</h2><p><a class="btn primary" href="#/">Back to home</a></p></div>`
};

let current = home;
let token = 0;
let cleanups = [];

function pick(route) {
  const [a, b, c] = route.parts;
  if (!a) return home;
  if (a === "jobs" && !b) return jobs.list;
  if (a === "jobs" && b === "new") return jobs.form;
  if (a === "jobs" && c === "edit") return jobs.form;
  if (a === "jobs" && c === "pay") return jobs.payment;
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
  if (view.root) {
    return `<h1 class="topbar-title">${title}</h1><a class="icon-btn" href="#/search" aria-label="Search">${icon("search")}</a>`;
  }
  const back = view.back?.(route) || "#/";
  return `<a class="icon-btn" href="${esc(back)}" aria-label="Back">${icon("back")}</a><h1 class="topbar-title">${title}</h1>`;
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
    .map(([id, href, label, name]) => `<a href="${href}"${active === id ? ' aria-current="page"' : ""}>${icon(name)}<span>${label}</span></a>`)
    .join("");
}

async function render(opts = {}) {
  const mine = ++token;
  const route = currentRoute();
  const view = pick(route);
  current = view;
  const main = document.getElementById("main");
  const scroll = opts.keepScroll ? main.scrollTop : 0;
  cleanups.forEach((fn) => fn());
  cleanups = [];
  try {
    if (view.prepare) await view.prepare(route);
    if (mine !== token) return;
    document.getElementById("topbar").innerHTML = topbar(route, view);
    document.getElementById("tabbar").innerHTML = tabbar(tabOf(route));
    main.innerHTML = `<div class="wrap">${view.html(route)}</div>`;
    const cleanup = view.mount?.(main, route);
    if (typeof cleanup === "function") cleanups.push(cleanup);
    main.scrollTop = opts.keepScroll ? scroll : 0;
  } catch (error) {
    console.error(error);
    main.innerHTML = `<div class="wrap"><p class="err">This screen hit a problem. ${esc(error.message || "Unknown error")}</p></div>`;
  }
}

function actFrom(event) {
  return event.target.closest?.("[data-act]") || null;
}

document.getElementById("main").addEventListener("click", (event) => {
  const el = actFrom(event);
  if (!el) return;
  current?.onClick?.(el.dataset.act, el, event);
});

document.getElementById("main").addEventListener("input", (event) => current?.onInput?.(event));
document.getElementById("main").addEventListener("change", (event) => current?.onChange?.(event));
document.getElementById("main").addEventListener("submit", (event) => {
  if (!event.target.closest?.("form")) return;
  event.preventDefault();
  current?.onSubmit?.(event);
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
    window.addEventListener("hashchange", () => render());
    await render();
    if (migrated && (migrated.customers || migrated.jobs)) {
      toast("Copied " + plural(migrated.customers, "customer", "customers") + " and " + plural(migrated.jobs, "job", "jobs") + " from this phone.");
    }
  } catch (error) {
    console.error(error);
    document.getElementById("main").innerHTML = `<div class="wrap"><p class="err">Couldn't open your saved records. ${esc(error.message || "")}</p></div>`;
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot();
