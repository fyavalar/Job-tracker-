import { state, customerById } from "../state.js";
import { saveBusiness, savePriceItem, deletePriceItem, saveTask, toggleTask, deleteTask, buildBackup, restoreBackup, csvRows } from "../actions.js";
import { icon } from "../icons.js";
import { empty, err, field, section, selectField } from "../components.js";
import { esc, centsToInput, downloadBlob, money, niceDate, parseDollarsToCents, parsePercent, plural, todayISO } from "../format.js";
import { csvBlob } from "../csv.js";
import { searchAll } from "../search.js";
import { jobTitle, docNumber, APP_VERSION } from "../model.js";
import { docTotals } from "../calc.js";
import { fileToJpegDataUrl } from "../images.js";
import { currentTheme, go, render, setTheme, toast } from "../nav.js";

const links = [
  ["#/customers", "user", "Customers", "People, and every job they have"],
  ["#/estimates", "doc", "Estimates", "Quotes with quantities, tax, and a total"],
  ["#/invoices", "doc", "Invoices", "Bills you can share or print"],
  ["#/inventory", "slab", "Inventory", "Slabs and remnants"],
  ["#/price-book", "tag", "Price book", "Prices that drop onto an estimate"],
  ["#/tasks", "check", "Tasks", "Notes to yourself, not alerts"],
  ["#/reports", "chart", "Reports", "Profit by week, month, and year"],
  ["#/settings", "gear", "Settings", "Business, backup, and theme"]
];

export const more = {
  root: true,
  title: () => "More",
  html() {
    const theme = currentTheme();
    return `<div class="seg" aria-label="Theme">${["system", "light", "dark"].map((item) => `<button type="button" class="${theme === item ? "is-on" : ""}" data-act="theme" data-theme="${item}">${item[0].toUpperCase() + item.slice(1)}</button>`).join("")}</div>
      <div class="menu">${links.map(([href, name, label, text]) => `<a href="${href}">${icon(name)}<span><strong>${label}</strong><small>${text}</small></span></a>`).join("")}</div>`;
  },
  onClick(act, el) {
    if (act !== "theme") return;
    setTheme(el.dataset.theme);
    render({ keepScroll: true });
  }
};

let priceKey = "";
let priceWorking = null;

export const prices = {
  title: () => "Price book",
  back: () => "#/more",
  html() {
    const rows = state.priceBook.slice().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const starter = rows.some((item) => item.starter);
    return `${starter ? `<p class="banner">Starter prices are placeholders. Change them to your numbers before you send a quote.</p>` : ""}
      ${rows.map((item) => `<a class="card card-link" href="#/price-book/${esc(item.id)}"><div class="card-top"><strong>${esc(item.name)}</strong><b>${esc(money(item.unitPriceCents))}</b></div><div class="meta">${esc(item.category)} · ${item.unit === "sqft" ? "per sq ft" : "each"}${item.starter ? " · Starter" : ""}</div></a>`).join("")}
      <a class="btn primary block" href="#/price-book/new">${icon("plus")} Add price</a>`;
  }
};

export const priceForm = {
  title(route) {
    return route.parts[1] === "new" ? "New price" : "Edit price";
  },
  back: () => "#/price-book",
  html(route) {
    if (priceKey !== route.path) {
      priceKey = route.path;
      if (route.parts[1] === "new") priceWorking = { id: "", name: "", category: "Material", unit: "sqft", price: "", error: "", confirm: false };
      else {
        const item = state.priceBook.find((row) => row.id === route.parts[1]);
        priceWorking = item ? { id: item.id, name: item.name, category: item.category, unit: item.unit, price: centsToInput(item.unitPriceCents), error: "", confirm: false } : null;
      }
    }
    if (!priceWorking) return empty("That price isn't in the book", "It may have been deleted.");
    return `<form id="price-form">
      ${section("Price", [
        field({ label: "Name", name: "name", value: priceWorking.name }),
        field({ label: "Category", name: "category", value: priceWorking.category, list: "price-cats" }),
        selectField({ label: "Unit", name: "unit", value: priceWorking.unit, options: [{ value: "sqft", label: "Per square foot" }, { value: "each", label: "Each" }] }),
        field({ label: "Price", name: "price", value: priceWorking.price, inputmode: "decimal" })
      ].join(""))}
      <datalist id="price-cats"><option value="Material"></option><option value="Edge"></option><option value="Cutout"></option><option value="Backsplash"></option><option value="Service"></option></datalist>
      ${err(priceWorking.error)}
      <button class="btn primary block" type="submit">Save price</button>
      ${priceWorking.id ? `<button type="button" class="btn danger block" data-act="delete">${priceWorking.confirm ? "Delete this price" : "Delete"}</button>` : ""}
    </form>`;
  },
  async onSubmit(event) {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const cents = parseDollarsToCents(data.price);
    if (cents === null) {
      priceWorking = { ...priceWorking, ...data, error: "Enter the price like 75 or 75.00. Use 0 if it's included." };
      return render({ keepScroll: true });
    }
    const result = await savePriceItem({ id: priceWorking.id, ...data, unitPriceCents: cents });
    if (!result.ok) {
      priceWorking = { ...priceWorking, ...data, error: result.error };
      return render({ keepScroll: true });
    }
    priceKey = "";
    toast("Price saved");
    go("/price-book");
  },
  async onClick(act) {
    if (act !== "delete" || !priceWorking?.id) return;
    if (!priceWorking.confirm) {
      const data = Object.fromEntries(new FormData(document.getElementById("price-form")).entries());
      priceWorking = { ...priceWorking, ...data, confirm: true };
      return render({ keepScroll: true });
    }
    const result = await deletePriceItem(priceWorking.id);
    if (!result.ok) return toast(result.error);
    priceKey = "";
    toast("Price deleted");
    go("/price-book");
  }
};

let taskQuery = { title: "", dueDate: "", notes: "", customerId: "", error: "" };

export const tasks = {
  title: () => "Tasks",
  back: () => "#/more",
  html() {
    const rows = state.tasks.slice().sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    const customers = state.customers.slice().sort((a, b) => a.name.localeCompare(b.name));
    return `<form id="task-form">
      ${field({ label: "What needs doing", name: "title", value: taskQuery.title })}
      ${field({ label: "Due date", name: "dueDate", value: taskQuery.dueDate, type: "date" })}
      ${selectField({ label: "Customer", name: "customerId", value: taskQuery.customerId, options: [{ value: "", label: "None" }, ...customers.map((c) => ({ value: c.id, label: c.name }))] })}
      ${field({ label: "Notes", name: "notes", value: taskQuery.notes, multiline: true, rows: 3 })}
      ${err(taskQuery.error)}
      <button class="btn primary block" type="submit">Add task</button>
    </form>
    <div class="stack">${rows.map((task) => `<article class="card"><button type="button" class="check${task.done ? " is-on" : ""}" data-act="toggle" data-id="${esc(task.id)}"><span class="box">${task.done ? "✓" : ""}</span><span><strong class="${task.done ? "done" : ""}">${esc(task.title)}</strong>${task.dueDate ? `<small>${esc(niceDate(task.dueDate, { year: true }))}</small>` : ""}${task.notes ? `<small>${esc(task.notes)}</small>` : ""}</span></button><button type="button" class="text-btn" data-act="delete" data-id="${esc(task.id)}">Delete</button></article>`).join("")}</div>
    ${rows.length ? "" : `<p class="meta">No tasks. These stay on this phone. The app does not send reminders.</p>`}`;
  },
  async onSubmit(event) {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const result = await saveTask(data);
    if (!result.ok) {
      taskQuery = { ...data, error: result.error };
      return render({ keepScroll: true });
    }
    taskQuery = { title: "", dueDate: "", notes: "", customerId: "", error: "" };
    toast("Task added");
    render();
  },
  async onClick(act, el) {
    if (act === "toggle") {
      const result = await toggleTask(el.dataset.id);
      if (!result.ok) return toast(result.error);
      return render({ keepScroll: true });
    }
    if (act === "delete") {
      const result = await deleteTask(el.dataset.id);
      if (!result.ok) return toast(result.error);
      render({ keepScroll: true });
    }
  }
};

let settingsWorking = null;
let settingsKey = "";
let backupPass = "";
let restorePass = "";
let restoreRaw = null;
let restoreName = "";
let restoreError = "";
let restoreArmed = false;
let restoreNote = "";

export const settings = {
  title: () => "Settings",
  back: () => "#/more",
  html() {
    if (!settingsWorking || settingsKey !== "settings") {
      settingsKey = "settings";
      settingsWorking = {
        name: state.business.name || "",
        phone: state.business.phone || "",
        email: state.business.email || "",
        address: state.business.address || "",
        logoDataUrl: state.business.logoDataUrl || "",
        taxRate: String(state.business.taxRate ?? ""),
        defaultDepositPercent: String(state.business.defaultDepositPercent ?? ""),
        documentFooter: state.business.documentFooter || "",
        error: ""
      };
    }
    const theme = currentTheme();
    const staged = restoreRaw && restoreArmed ? `<div id="restore-summary"><p>${esc(restoreNote)}</p><button type="button" class="btn danger" data-act="do-restore">Replace my records</button><button type="button" class="btn" data-act="cancel-restore">Cancel</button></div>` : "";
    return `<form id="settings-form">
      ${section("Business", [
        field({ label: "Business name", name: "name", value: settingsWorking.name }),
        field({ label: "Phone", name: "phone", value: settingsWorking.phone, type: "tel", inputmode: "tel" }),
        field({ label: "Email", name: "email", value: settingsWorking.email, type: "email", inputmode: "email" }),
        field({ label: "Address", name: "address", value: settingsWorking.address, multiline: true, rows: 3 }),
        `<label class="field"><span class="lbl">Logo</span><input id="logo-file" type="file" accept="image/*"></label>`,
        settingsWorking.logoDataUrl ? `<img class="logo-preview" alt="Business logo" src="${esc(settingsWorking.logoDataUrl)}"><button type="button" class="text-btn" data-act="clear-logo">Remove logo</button>` : ""
      ].join(""))}
      ${section("Money defaults", [
        field({ label: "Tax percent", name: "taxRate", value: settingsWorking.taxRate, inputmode: "decimal" }),
        field({ label: "Default deposit percent", name: "defaultDepositPercent", value: settingsWorking.defaultDepositPercent, inputmode: "decimal" }),
        field({ label: "Footer on estimates and invoices", name: "documentFooter", value: settingsWorking.documentFooter, multiline: true, rows: 3 }),
        `<p class="meta">New estimates use these. Florida shops often add county surtax on top of the state rate. Set the percent you actually charge.</p>`
      ].join(""))}
      ${err(settingsWorking.error)}
      <button class="btn primary block" type="submit">Save settings</button>
    </form>
    ${section("Theme", `<div class="seg">${["system", "light", "dark"].map((item) => `<button type="button" class="${theme === item ? "is-on" : ""}" data-act="theme" data-theme="${item}">${item[0].toUpperCase() + item.slice(1)}</button>`).join("")}</div>`)}
    ${section("Export CSV", `<div class="btn-col"><button type="button" class="btn" data-act="csv" data-kind="jobs">Jobs</button><button type="button" class="btn" data-act="csv" data-kind="customers">Customers</button><button type="button" class="btn" data-act="csv" data-kind="payments">Payments</button></div>`)}
    ${section("Backup", `<p class="meta">Records stay on this phone until you export them. A passphrase scrambles the file. You will need the same passphrase to restore it, so keep it somewhere that is not only this phone. Leave it blank for a plain file.</p>
      <label class="field"><span class="lbl">Passphrase</span><input id="backup-pass" type="password" autocomplete="new-password" value="${esc(backupPass)}"></label>
      <button type="button" class="btn primary" data-act="backup">Download backup</button>
      <p class="err" id="backup-error" hidden></p>`)}
    ${section("Restore", `<p class="meta">Restoring replaces the customers, jobs, and paperwork on this phone. It also accepts a backup from the previous JOBS app.</p>
      <label class="field"><span class="lbl">Backup file</span><input id="restore-file" type="file" accept="application/json,.json,text/plain"></label>
      ${restoreName ? `<p class="meta">${esc(restoreName)}</p>` : ""}
      <label class="field"><span class="lbl">Passphrase, if the file is encrypted</span><input id="restore-pass" type="password" autocomplete="current-password" value="${esc(restorePass)}"></label>
      ${restoreError ? `<p class="err">${esc(restoreError)}</p>` : ""}
      ${staged || `<button type="button" class="btn danger" data-act="stage-restore">Review backup</button>`}`)}
    <p class="meta">JOBS ${APP_VERSION}. Works offline. Cloud sync is not turned on. After an update, open this site once in Safari, then use the home screen icon.</p>`;
  },
  async onSubmit(event) {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const tax = parsePercent(data.taxRate, { max: 50, decimals: 3 });
    const deposit = parsePercent(data.defaultDepositPercent, { max: 100, decimals: 2 });
    if (tax === null || deposit === null) {
      settingsWorking = { ...settingsWorking, ...data, logoDataUrl: settingsWorking.logoDataUrl, error: tax === null ? "Enter tax as a percent, like 7 or 6.5." : "Enter the deposit percent from 0 to 100." };
      return render({ keepScroll: true });
    }
    const result = await saveBusiness({ ...data, taxRate: tax, defaultDepositPercent: deposit, logoDataUrl: settingsWorking.logoDataUrl });
    if (!result.ok) {
      settingsWorking = { ...settingsWorking, ...data, error: result.error };
      return render({ keepScroll: true });
    }
    settingsWorking = { ...settingsWorking, ...data, error: "" };
    toast("Settings saved");
    render({ keepScroll: true });
  },
  onInput(event) {
    if (event.target.id === "backup-pass") backupPass = event.target.value;
    if (event.target.id === "restore-pass") {
      restorePass = event.target.value;
      restoreArmed = false;
    }
  },
  async onChange(event) {
    if (event.target.id === "logo-file" && event.target.files?.[0]) {
      const data = Object.fromEntries(new FormData(document.getElementById("settings-form")).entries());
      settingsWorking = { ...settingsWorking, ...data };
      try {
        settingsWorking.logoDataUrl = await fileToJpegDataUrl(event.target.files[0]);
        settingsWorking.error = "";
      } catch (error) {
        settingsWorking.error = error.message || "Couldn't read that logo.";
      }
      event.target.value = "";
      return render({ keepScroll: true });
    }
    if (event.target.id === "restore-file" && event.target.files?.[0]) {
      restoreName = event.target.files[0].name;
      try {
        restoreRaw = JSON.parse(await event.target.files[0].text());
        restoreError = "";
        restoreArmed = false;
      } catch {
        restoreRaw = null;
        restoreError = "That file isn't JSON.";
      }
      event.target.value = "";
      render({ keepScroll: true });
    }
  },
  async onClick(act, el) {
    if (act === "clear-logo") {
      settingsWorking.logoDataUrl = "";
      return render({ keepScroll: true });
    }
    if (act === "theme") {
      setTheme(el.dataset.theme);
      return render({ keepScroll: true });
    }
    if (act === "csv") {
      const kind = el.dataset.kind;
      downloadBlob(csvBlob(csvRows(kind)), "jobs-" + kind + "-" + todayISO() + ".csv");
      toast("CSV downloaded");
      return;
    }
    if (act === "backup") {
      const pass = document.getElementById("backup-pass")?.value || "";
      backupPass = pass;
      const result = await buildBackup(pass);
      const error = document.getElementById("backup-error");
      if (!result.ok) {
        if (error) {
          error.hidden = false;
          error.textContent = result.error;
        }
        return;
      }
      downloadBlob(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }), (result.encrypted ? "jobs-backup-encrypted-" : "jobs-backup-") + todayISO() + ".json");
      toast(result.encrypted ? "Encrypted backup downloaded" : "Backup downloaded");
      return;
    }
    if (act === "stage-restore") {
      if (!restoreRaw) {
        restoreError = "Choose a backup file first.";
        return render({ keepScroll: true });
      }
      const summary = await summarizeRestore(restoreRaw, document.getElementById("restore-pass")?.value || restorePass);
      if (summary.error) {
        restoreError = summary.error;
        restoreArmed = false;
        return render({ keepScroll: true });
      }
      restoreError = "";
      restoreArmed = true;
      restoreNote = summary.legacy
        ? "This older backup has " + plural(summary.jobs, "job", "jobs") + ". Restoring replaces what is on this phone."
        : "This backup has " + plural(summary.customers, "customer", "customers") + " and " + plural(summary.jobs, "job", "jobs") + ". Restoring replaces what is on this phone.";
      return render({ keepScroll: true });
    }
    if (act === "do-restore") {
      const result = await restoreBackup(restoreRaw, document.getElementById("restore-pass")?.value || restorePass);
      if (!result.ok) {
        restoreError = result.error;
        restoreArmed = false;
        return render({ keepScroll: true });
      }
      restoreRaw = null;
      restoreArmed = false;
      restoreName = "";
      settingsKey = "";
      toast("Restored " + plural(result.customers, "customer", "customers") + " and " + plural(result.jobs, "job", "jobs"));
      return go("/");
    }
    if (act === "cancel-restore") {
      restoreArmed = false;
      render({ keepScroll: true });
    }
  }
};

async function summarizeRestore(data, passphrase) {
  try {
    if (data?.encrypted) {
      const { decryptSnapshot } = await import("../backup.js");
      const snapshot = await decryptSnapshot(data, passphrase);
      return { customers: snapshot.customers?.length || 0, jobs: snapshot.jobs?.length || 0 };
    }
    if (Array.isArray(data?.customers) || data?.schemaVersion === 2) {
      return { customers: data.customers?.length || 0, jobs: data.jobs?.length || 0 };
    }
    if (Array.isArray(data?.jobs) || Array.isArray(data?.tasks)) {
      return { customers: "the customers in that file", jobs: data.jobs?.length || 0, legacy: true };
    }
    return { error: "That file isn't a JOBS backup." };
  } catch (error) {
    return { error: error.message || "Couldn't open that backup." };
  }
}

let searchText = "";

export const search = {
  title: () => "Search",
  back: () => "#/",
  html() {
    return `<div class="toolbar"><input id="q" placeholder="Customers, jobs, stone, invoices" value="${esc(searchText)}" aria-label="Search"></div><div id="results">${searchHtml(searchText)}</div>`;
  },
  mount(root) {
    const input = root.querySelector("#q");
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  },
  onInput(event) {
    if (event.target.id !== "q") return;
    searchText = event.target.value;
    const box = document.getElementById("results");
    if (box) box.innerHTML = searchHtml(searchText);
  }
};

function searchHtml(q) {
  const found = searchAll(state, q);
  if (!q.trim()) return `<p class="meta">Search names, phones, materials, invoice numbers, and stone.</p>`;
  const blocks = [];
  const add = (title, rows) => {
    if (!rows.length) return;
    blocks.push(`<h2>${esc(title)}</h2>` + rows);
  };
  add("Customers", found.customers.map((c) => `<a class="card card-link" href="#/customers/${esc(c.id)}"><strong>${esc(c.name)}</strong><div class="meta">${esc(c.phone || c.address || "")}</div></a>`).join(""));
  add("Jobs", found.jobs.map((job) => `<a class="card card-link" href="#/jobs/${esc(job.id)}"><strong>${esc(customerById(job.customerId)?.name || "Customer")}</strong><div class="meta">${esc(jobTitle(job))}</div></a>`).join(""));
  add("Estimates", found.estimates.map((doc) => `<a class="card card-link" href="#/estimates/${esc(doc.id)}"><strong>${esc(docNumber("estimate", doc.number))}</strong><div class="meta">${esc(money(docTotals(doc).total))}</div></a>`).join(""));
  add("Invoices", found.invoices.map((doc) => `<a class="card card-link" href="#/invoices/${esc(doc.id)}"><strong>${esc(docNumber("invoice", doc.number))}</strong><div class="meta">${esc(money(docTotals(doc).total))}</div></a>`).join(""));
  add("Inventory", found.slabs.map((slab) => `<a class="card card-link" href="#/inventory/${esc(slab.id)}"><strong>${esc(slab.stoneColor || slab.material)}</strong><div class="meta">${esc(slab.kind)}</div></a>`).join(""));
  add("Tasks", found.tasks.map((task) => `<a class="card card-link" href="#/tasks"><strong>${esc(task.title)}</strong></a>`).join(""));
  return blocks.join("") || `<p class="meta">Nothing matches.</p>`;
}
