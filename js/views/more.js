import { state, customerById } from "../state.js";
import { saveBusiness, savePriceItem, deletePriceItem, saveTask, toggleTask, deleteTask, buildBackup, restoreBackup, csvRows } from "../actions.js";
import { icon } from "../icons.js";
import { empty, err, field, section, selectField, segmented } from "../components.js";
import { confirmSheet } from "../sheet.js";
import { esc, centsToInput, downloadBlob, lastBackupTime, money, niceDate, parseDollarsToCents, parsePercent, plural, rememberBackupTime, shareOrDownload, todayISO } from "../format.js";
import { csvBlob } from "../csv.js";
import { searchAll } from "../search.js";
import { handlePhoneInput } from "../customer-ui.js";
import { jobTitle, docNumber, APP_VERSION } from "../model.js";
import { docTotals } from "../calc.js";
import { fileToJpegDataUrl } from "../images.js";
import { currentTheme, go, goBackTo, render, setTheme, toast, markSaved } from "../nav.js";

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

function themeSeg(theme) {
  return segmented([["system", "Automatic"], ["light", "Light"], ["dark", "Dark"]], theme, "theme", { label: "Theme", attr: "theme" });
}

export const more = {
  root: true,
  title: () => "More",
  html() {
    const theme = currentTheme();
    const count = { "#/customers": state.customers.length, "#/estimates": state.estimates.length, "#/invoices": state.invoices.length, "#/inventory": state.slabs.filter((s) => s.status !== "used").length, "#/tasks": state.tasks.filter((t) => !t.done).length };
    const groups = [links.slice(0, 3), links.slice(3, 6), links.slice(6)];
    return groups.map((g) => `<div class="menu">${g.map(([href, name, label, text]) => `<a href="${href}"><span class="menu-ico" data-ico="${name}">${icon(name)}</span><span class="row-text"><strong>${label}</strong><small>${text}</small></span>${count[href] ? `<span class="menu-n">${count[href]}</span>` : ""}${icon("chevronRight")}</a>`).join("")}</div>`).join("") +
      section("Appearance", themeSeg(theme), { className: "plain" }) +
      `<p class="meta small center">JOBS ${esc(APP_VERSION)} · Works offline · Records stay on this phone</p>`;
  },
  onClick(act, el) {
    if (act !== "theme") return;
    setTheme(el.dataset.theme);
    render({ keepScroll: true });
  }
};

let priceKey = "";
let priceWorking = null;

function unitLabel(unit) {
  return unit === "sqft" ? "per sq ft" : unit === "lf" ? "per linear ft" : "each";
}

export const prices = {
  title: () => "Price book",
  back: () => "#/more",
  action: () => `<a class="icon-btn" href="#/price-book/new" aria-label="Add price">${icon("plus")}</a>`,
  html() {
    const rows = state.priceBook.slice().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const starter = rows.some((item) => item.starter);
    return `${starter ? `<p class="banner warn">Starter prices are placeholders. Change them to your numbers before you send a quote.</p>` : ""}
      ${[...new Set(rows.map((r) => r.category))].map((cat) => section(cat, `<div class="list">${rows.filter((r) => r.category === cat).map((item) => `<a class="row-main" href="#/price-book/${esc(item.id)}"><span class="row-text"><strong>${esc(item.name)}</strong><small>${unitLabel(item.unit)}${item.starter ? " · Starter price" : ""}</small></span><b class="row-amt">${esc(money(item.unitPriceCents))}</b>${icon("chevronRight")}</a>`).join("")}</div>`)).join("") || empty("No prices yet", "Add the prices you quote most so estimates fill in fast.", { art: "doc" })}
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
    if (!priceWorking) return empty("That price isn't in the book", "It may have been deleted.", { art: "doc" });
    return `<form id="price-form" data-guard novalidate>
      ${section("Price", `<div class="form-stack">${[
        field({ label: "Name", name: "name", value: priceWorking.name, autocapitalize: "words", placeholder: "Quartz, level 2" }),
        field({ label: "Category", name: "category", value: priceWorking.category, list: "price-cats", autocapitalize: "words" }),
        selectField({ label: "Unit", name: "unit", value: priceWorking.unit, options: [{ value: "sqft", label: "Per square foot" }, { value: "lf", label: "Per linear foot" }, { value: "each", label: "Each" }] }),
        field({ label: "Price", name: "price", value: priceWorking.price, inputmode: "decimal", currency: true, enterkeyhint: "done" })
      ].join("")}</div>`, { className: "form-group" })}
      <datalist id="price-cats"><option value="Material"></option><option value="Edge"></option><option value="Cutout"></option><option value="Backsplash"></option><option value="Service"></option></datalist>
      ${err(priceWorking.error)}
      <div class="form-bar"><button class="btn primary block" type="submit">Save price</button></div>
      ${priceWorking.id ? `<button type="button" class="btn danger-ghost block" data-act="delete">${icon("trash")} Delete price</button>` : ""}
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
    const creating = !priceWorking.id;
    priceKey = "";
    toast("Price saved");
    if (creating) return go("/price-book", { replace: true, force: true });
    return goBackTo("/price-book", { force: true });
  },
  leave() {
    priceKey = "";
    priceWorking = null;
  },
  async onClick(act) {
    if (act !== "delete" || !priceWorking?.id) return;
    const ok = await confirmSheet({ title: "Delete this price?", message: "Estimates that already use it keep their numbers.", confirm: "Delete price" });
    if (!ok) return;
    const result = await deletePriceItem(priceWorking.id);
    if (!result.ok) return toast(result.error);
    priceKey = "";
    toast("Price deleted");
    goBackTo("/price-book", { force: true });
  }
};

let taskQuery = { title: "", dueDate: "", notes: "", customerId: "", error: "" };

export const tasks = {
  title: () => "Tasks",
  back: () => "#/more",
  html() {
    const rows = state.tasks.slice().sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    const customers = state.customers.slice().sort((a, b) => a.name.localeCompare(b.name));
    const today = todayISO();
    const open = taskQuery.title || taskQuery.notes || taskQuery.dueDate || taskQuery.customerId || taskQuery.error;
    return `<form id="task-form" class="group form-group" novalidate>
      <div class="task-add">${field({ label: "New task", name: "title", value: taskQuery.title, placeholder: "Call Maria about the seam", autocapitalize: "sentences", enterkeyhint: "done" })}<button class="btn primary" type="submit" aria-label="Add task">${icon("plus")}</button></div>
      <details class="more-fields"${open ? " open" : ""}><summary>Due date, customer, notes ${icon("chevronDown")}</summary><div class="form-stack">
      <div class="two-col">${field({ label: "Due date", name: "dueDate", value: taskQuery.dueDate, type: "date" })}${selectField({ label: "Customer", name: "customerId", value: taskQuery.customerId, options: [{ value: "", label: "None" }, ...customers.map((c) => ({ value: c.id, label: c.name }))] })}</div>
      ${field({ label: "Notes", name: "notes", value: taskQuery.notes, multiline: true, rows: 2, autocapitalize: "sentences" })}
      </div></details>
      ${err(taskQuery.error)}
    </form>
    ${rows.length ? `<div class="list">${rows.map((task) => {
      const who = task.customerId ? customerById(task.customerId)?.name : "";
      const late = !task.done && task.dueDate && task.dueDate < today;
      const sub = [task.dueDate ? (late ? "Overdue · " : task.dueDate === today ? "Today · " : "") + niceDate(task.dueDate, { weekday: true }) : "", who, task.notes].filter(Boolean).join(" · ");
      return `<div class="row task-row${task.done ? " is-done" : ""}"><button type="button" class="check" data-act="toggle" data-id="${esc(task.id)}" aria-pressed="${task.done}" aria-label="${task.done ? "Mark not done" : "Mark done"}: ${esc(task.title)}"><span class="box">${task.done ? icon("check") : ""}</span><span class="row-text"><strong>${esc(task.title)}</strong>${sub ? `<small class="${late ? "neg" : ""}">${esc(sub)}</small>` : ""}</span></button><button type="button" class="row-act" data-act="delete" data-id="${esc(task.id)}" aria-label="Delete ${esc(task.title)}">${icon("trash")}</button></div>`;
    }).join("")}</div>` : empty("No tasks", "Notes to yourself. They stay on this phone — the app doesn't send reminders.", { art: "check" })}`;
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
    render({ keepScroll: true });
  },
  async onClick(act, el) {
    // keep whatever is half-typed in the add form across the re-render
    const formEl = document.getElementById("task-form");
    if (formEl) taskQuery = { ...taskQuery, ...Object.fromEntries(new FormData(formEl).entries()), error: "" };
    if (act === "toggle") {
      const result = await toggleTask(el.dataset.id);
      if (!result.ok) return toast(result.error || "Couldn't update that task.");
      return render({ keepScroll: true });
    }
    if (act === "delete") {
      const result = await deleteTask(el.dataset.id);
      if (!result.ok) return toast(result.error);
      toast("Task deleted", result.undo);
      render({ keepScroll: true });
    }
  }
};

let settingsWorking = null;

function captureSettings() {
  const formEl = document.getElementById("settings-form");
  if (formEl && settingsWorking) settingsWorking = { ...settingsWorking, ...Object.fromEntries(new FormData(formEl).entries()) };
}
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
    const staged = restoreRaw && restoreArmed ? `<div class="banner warn" id="restore-summary"><p>${esc(restoreNote)}</p><div class="btn-row"><button type="button" class="btn danger-solid" data-act="do-restore">Replace my records</button><button type="button" class="btn" data-act="cancel-restore">Cancel</button></div></div>` : "";
    return `<form id="settings-form" data-guard novalidate>
      ${section("Business", `<div class="form-stack">${[
        field({ label: "Business name", name: "name", value: settingsWorking.name, autocomplete: "organization", autocapitalize: "words" }),
        `<div class="two-col">${field({ label: "Phone", name: "phone", value: settingsWorking.phone, type: "tel", inputmode: "tel", autocomplete: "tel", data: { phone: "1" } })}${field({ label: "Email", name: "email", value: settingsWorking.email, type: "email", inputmode: "email", autocomplete: "email", autocapitalize: "off", spellcheck: false })}</div>`,
        field({ label: "Address", name: "address", value: settingsWorking.address, multiline: true, rows: 2, autocomplete: "street-address", autocapitalize: "words" }),
        `<div class="logo-row">${settingsWorking.logoDataUrl ? `<img class="logo-preview" alt="Business logo" src="${esc(settingsWorking.logoDataUrl)}">` : `<span class="logo-ph">${icon("camera")}</span>`}<div class="logo-btns"><label class="btn sm" for="logo-file">${settingsWorking.logoDataUrl ? "Change logo" : "Add logo"}</label>${settingsWorking.logoDataUrl ? `<button type="button" class="text-btn" data-act="clear-logo">Remove</button>` : ""}</div><input id="logo-file" type="file" accept="image/*" hidden></div>`
      ].join("")}</div>`, { className: "form-group" })}
      ${section("Money defaults", `<div class="form-stack">${[
        `<div class="two-col">${field({ label: "Tax", name: "taxRate", value: settingsWorking.taxRate, inputmode: "decimal", suffix: "%" })}${field({ label: "Deposit", name: "defaultDepositPercent", value: settingsWorking.defaultDepositPercent, inputmode: "decimal", suffix: "%" })}</div>`,
        field({ label: "Footer on estimates and invoices", name: "documentFooter", value: settingsWorking.documentFooter, multiline: true, rows: 3, autocapitalize: "sentences" }),
        `<p class="hint">New estimates use these. Florida shops often add county surtax on top of the state rate — set the percent you actually charge.</p>`
      ].join("")}</div>`, { className: "form-group" })}
      ${err(settingsWorking.error)}
      <div class="form-bar"><button class="btn primary block" type="submit">Save settings</button></div>
    </form>
    ${section("Appearance", themeSeg(theme))}
    ${section("Export CSV", `<div class="btn-row three"><button type="button" class="btn" data-act="csv" data-kind="jobs">Jobs</button><button type="button" class="btn" data-act="csv" data-kind="customers">Customers</button><button type="button" class="btn" data-act="csv" data-kind="payments">Payments</button></div>`)}
    ${section("Backup", `<p class="meta">${esc(backupReminder())}</p>
      <p class="hint">Layouts, photos and paperwork are included. A passphrase scrambles the file; you'll need it to restore, so keep it somewhere besides this phone. Leave blank for a plain file.</p>
      <label class="field"><span class="lbl">Passphrase (optional)</span><input id="backup-pass" type="password" autocomplete="new-password" value="${esc(backupPass)}"></label>
      <button type="button" class="btn primary block" data-act="backup">${icon("download")} Export backup</button>
      <p class="err" id="backup-error" hidden></p>`)}
    ${section("Restore", `<p class="hint">Restoring replaces the customers, jobs, and paperwork on this phone. It also accepts a backup from the previous JOBS app.</p>
      <label class="btn block file-btn" for="restore-file">${icon("upload")} ${restoreName ? esc(restoreName) : "Choose backup file"}</label><input id="restore-file" type="file" accept="application/json,.json,text/plain" hidden>
      <label class="field"><span class="lbl">Passphrase, if the file is encrypted</span><input id="restore-pass" type="password" autocomplete="current-password" value="${esc(restorePass)}"></label>
      ${restoreError ? err(restoreError) : ""}
      ${staged || `<button type="button" class="btn danger-ghost block" data-act="stage-restore">Review backup</button>`}`)}
    <p class="meta small center">JOBS ${esc(APP_VERSION)} · Works offline · Cloud sync is off. After an update, open the site once in Safari, then use the home screen icon.</p>`;
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
    markSaved();
    render({ keepScroll: true });
  },
  leave() {
    settingsKey = "";
    settingsWorking = null;
  },
  onInput(event) {
    if (event.target.dataset?.phone) handlePhoneInput(event);
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
      captureSettings();
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
    // every re-render below keeps unsaved business fields
    captureSettings();
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
      const name = "jobs-" + kind + "-" + todayISO() + ".csv";
      const how = await shareOrDownload(csvBlob(csvRows(kind)), name, name);
      if (how === "shared") toast("CSV ready to share");
      else if (how === "downloaded") toast("CSV downloaded");
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
      const name = (result.encrypted ? "jobs-backup-encrypted-" : "jobs-backup-") + todayISO() + ".json";
      const how = await shareOrDownload(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }), name, name);
      if (how === "aborted") return;
      rememberBackupTime();
      if (how === "shared") toast(result.encrypted ? "Encrypted backup ready to share" : "Backup ready to share");
      else toast(result.encrypted ? "Encrypted backup downloaded" : "Backup downloaded");
      return render({ keepScroll: true });
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
      const ok = await confirmSheet({ title: "Replace everything on this phone?", message: restoreNote + " This can't be undone, so export a backup first if you're unsure.", confirm: "Replace my records" });
      if (!ok) return;
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
      settingsWorking = null;
      toast("Restored " + plural(result.customers, "customer", "customers") + " and " + plural(result.jobs, "job", "jobs"));
      return go("/", { replace: true, force: true });
    }
    if (act === "cancel-restore") {
      restoreArmed = false;
      render({ keepScroll: true });
    }
  }
};

function backupReminder() {
  const stamp = lastBackupTime();
  if (!stamp) return "No backup on this phone yet. Export one when you can.";
  const day = stamp.slice(0, 10);
  const label = niceDate(day, { year: true }) || day;
  const age = Math.max(0, Math.floor((Date.now() - Date.parse(stamp)) / 86400000));
  if (age >= 14) return "Last backup " + label + ". It's been a while — export a fresh one when you can.";
  return "Last backup " + label + ".";
}

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
    return `<div class="search-field">${icon("search")}<input id="q" type="search" placeholder="Name, phone, stone, invoice #" value="${esc(searchText)}" aria-label="Search everything" autocomplete="off" enterkeyhint="search"></div><div id="results">${searchHtml(searchText)}</div>`;
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
  if (!q.trim()) return `<p class="meta center">Search names, phone numbers, stone, addresses, and invoice numbers.</p>`;
  const blocks = [];
  const r = (href, title, sub, amt = "") => `<a class="row-main" href="${esc(href)}"><span class="row-text"><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${amt ? `<b class="row-amt">${esc(amt)}</b>` : ""}${icon("chevronRight")}</a>`;
  const add = (title, rows) => {
    if (!rows.length) return;
    blocks.push(section(title, `<div class="list">${rows.join("")}</div>`));
  };
  add("Customers", found.customers.map((c) => r("#/customers/" + c.id, c.name, c.phone || c.address || "")));
  add("Jobs", found.jobs.map((job) => r("#/jobs/" + job.id, customerById(job.customerId)?.name || "Customer", jobTitle(job))));
  add("Estimates", found.estimates.map((doc) => r("#/estimates/" + doc.id, docNumber("estimate", doc.number), customerById(doc.customerId)?.name || "", money(docTotals(doc).total))));
  add("Invoices", found.invoices.map((doc) => r("#/invoices/" + doc.id, docNumber("invoice", doc.number), customerById(doc.customerId)?.name || "", money(docTotals(doc).total))));
  add("Inventory", found.slabs.map((slab) => r("#/inventory/" + slab.id, slab.stoneColor || slab.material, slab.kind === "remnant" ? "Remnant" : "Slab")));
  add("Tasks", found.tasks.map((task) => r("#/tasks", task.title, task.dueDate ? niceDate(task.dueDate, { weekday: true }) : "")));
  return blocks.join("") || empty("Nothing matches", "No records match “" + q + "”.", { art: "search" });
}
