import { state, customerById, jobById } from "../state.js";
import { saveDocument, deleteDocument, convertEstimateToJob, createInvoiceFromEstimate } from "../actions.js";
import { empty, err, field, section, selectField, segmented, avatar } from "../components.js";
import { confirmSheet } from "../sheet.js";
import { estimateLinesFromLayout, layoutStats, summaryLines, PALETTES } from "../layout.js";
import { blueprintSvg, layoutJpegBytes } from "../blueprint.js";
import { icon } from "../icons.js";
import { esc, centsToInput, downloadBlob, formatQty, money, niceDate, parseDollarsToCents, parsePercent, parseQty, shareOrDownload, todayISO, uid } from "../format.js";
import { docTotals, invoiceBalanceCents, lineTotalCents } from "../calc.js";
import { docNumber, jobTitle } from "../model.js";
import { buildPdf, pdfFileName } from "../pdf.js";
import { dataUrlToJpegBytes } from "../images.js";
import { go, render, toast, markSaved, currentRoute } from "../nav.js";

let working = null;
let workingKey = "";
let picking = false;

function kindOf(route) {
  return route.parts[0] === "invoices" ? "invoice" : "estimate";
}

function storeOf(kind) {
  return kind === "invoice" ? state.invoices : state.estimates;
}

function findDoc(kind, id) {
  return storeOf(kind).find((doc) => doc.id === id) || null;
}

function statusLabel(doc, kind) {
  if (kind === "estimate") return doc.status[0].toUpperCase() + doc.status.slice(1);
  if (doc.status === "void") return "Void";
  if (doc.status === "draft") return "Draft";
  const total = docTotals(doc).total;
  const paid = total - invoiceBalanceCents(doc, state.payments, state.invoices);
  if (total > 0 && paid >= total) return "Paid";
  if (paid > 0) return "Partial";
  return "Open";
}

function wrapCards(html, kind) {
  return storeOf(kind).length ? `<div class="list">${html}</div>` : html;
}

const unitOf = (u) => (u === "each" || u === "lf" ? u : "sqft");
const unitShort = (u) => (u === "each" ? " ea" : u === "lf" ? " lf" : " sq ft");

function listCards(kind) {
  const rows = storeOf(kind).slice().sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)) || b.number - a.number);
  if (!rows.length) {
    return empty(kind === "invoice" ? "No invoices yet" : "No estimates yet", kind === "invoice" ? "Create one from an estimate or a job." : "Draw the countertops on a job and the estimate fills itself in.", { art: "doc" });
  }
  return rows
    .map((doc) => {
      const customer = customerById(doc.customerId);
      const status = statusLabel(doc, kind);
      return `<a class="row-main" href="#/${kind}s/${esc(doc.id)}">${avatar(customer?.name || "?", { size: "sm" })}<span class="row-text"><strong>${esc(customer?.name || "No customer")}</strong><small>${esc(docNumber(kind, doc.number))}${doc.issueDate ? " · " + esc(niceDate(doc.issueDate, { year: true })) : ""}</small></span><span class="doc-end"><b class="row-amt">${esc(money(docTotals(doc).total))}</b><span class="status-chip" data-status="${esc(status.toLowerCase())}">${esc(status)}</span></span></a>`;
    })
    .join("");
}

export const estimates = {
  title: () => "Estimates",
  back: () => "#/more",
  action: () => `<a class="icon-btn" href="#/estimates/new" aria-label="New estimate">${icon("plus")}</a>`,
  html: () => wrapCards(listCards("estimate"), "estimate") + `<a class="btn primary block" href="#/estimates/new">${icon("plus")} New estimate</a>`
};

export const invoices = {
  title: () => "Invoices",
  back: () => "#/money",
  action: () => `<a class="icon-btn" href="#/invoices/new" aria-label="New invoice">${icon("plus")}</a>`,
  html: () => wrapCards(listCards("invoice"), "invoice") + `<a class="btn primary block" href="#/invoices/new">${icon("plus")} New invoice</a>`
};

function blankLine() {
  return { id: uid(), description: "", qty: "1", price: "", unit: "sqft", priceBookId: "" };
}

function lineFromRecord(line) {
  return {
    id: line.id || uid(),
    description: line.description || "",
    qty: formatQty(line.qty || 0) || (line.qty === 0 ? "0" : ""),
    price: centsToInput(line.unitPriceCents),
    unit: unitOf(line.unit),
    priceBookId: line.priceBookId || ""
  };
}

function linesForJob(job) {
  if (!job) return [blankLine()];
  if (job.layout?.pieces?.length) {
    const lines = estimateLinesFromLayout(job.layout, { priceBook: state.priceBook, material: job.material, color: job.stoneColor });
    if (lines.length) return lines.map(lineFromRecord);
  }
  return [{ id: uid(), description: [job.material, job.stoneColor].filter(Boolean).join(" ") || "Countertop", qty: formatQty(job.sqft || 0), price: "", unit: "sqft", priceBookId: "" }];
}

function initialDoc(route) {
  const kind = kindOf(route);
  const job = jobById(route.params.job || "");
  const base = {
    id: "",
    number: "",
    kind,
    customerId: route.params.customer || job?.customerId || "",
    jobId: job?.id || "",
    status: kind === "invoice" ? "open" : "draft",
    issueDate: todayISO(),
    dueDate: "",
    lines: linesForJob(job),
    discountType: "amount",
    discountValue: "",
    tax: String(state.business.taxRate ?? ""),
    deposit: String(job?.depositPercent ?? state.business.defaultDepositPercent ?? ""),
    notes: "",
    error: ""
  };
  if (route.parts[1] === "new") return base;
  const doc = findDoc(kind, route.parts[1]);
  if (!doc) return null;
  return {
    ...base,
    id: doc.id,
    number: doc.number,
    customerId: doc.customerId,
    jobId: doc.jobId || "",
    status: doc.status,
    issueDate: doc.issueDate || todayISO(),
    dueDate: doc.dueDate || "",
    lines: (doc.lines || []).map(lineFromRecord),
    discountType: doc.discountType || "amount",
    discountValue: doc.discountType === "percent" ? String(doc.discountPercent || "") : centsToInput(doc.discountCents),
    tax: String(doc.taxRate ?? ""),
    deposit: String(doc.depositPercent ?? ""),
    notes: doc.notes || ""
  };
}

function readRaw(form) {
  const lines = [...form.querySelectorAll("[data-line]")].map((row) => ({
    id: row.dataset.line,
    description: row.querySelector("[data-k=description]").value,
    qty: row.querySelector("[data-k=qty]").value,
    price: row.querySelector("[data-k=price]").value,
    unit: unitOf(row.querySelector("[data-k=unit]").value),
    priceBookId: row.querySelector("[data-k=priceBookId]").value
  }));
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    ...(working || {}),
    customerId: data.customerId || "",
    jobId: data.jobId || "",
    status: data.status,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    discountType: data.discountType,
    discountValue: data.discountValue,
    tax: data.tax,
    deposit: data.deposit,
    notes: data.notes,
    lines
  };
}

function parseRaw(raw) {
  if (!raw.customerId) return { error: "Choose a customer first." };
  const lines = [];
  for (const line of raw.lines) {
    const qty = line.qty.trim() === "" ? 0 : parseQty(line.qty);
    const price = parseDollarsToCents(line.price);
    if (qty === null || price === null) return { error: "Check quantities and prices. Use numbers like 42.5 and 75.00." };
    if (!line.description.trim() && !qty && !price) continue;
    lines.push({ id: line.id, description: line.description.trim(), unit: line.unit, qty, unitPriceCents: price, priceBookId: line.priceBookId });
  }
  const tax = parsePercent(raw.tax, { max: 50, decimals: 3 });
  const deposit = parsePercent(raw.deposit, { max: 100, decimals: 2 });
  if (tax === null) return { error: "Enter tax as a percent, like 7 or 6.5." };
  if (deposit === null) return { error: "Enter the deposit percent from 0 to 100." };
  let discountCents = 0;
  let discountPercent = 0;
  if (raw.discountType === "percent") {
    const value = parsePercent(raw.discountValue, { max: 100, decimals: 2 });
    if (value === null) return { error: "Enter the discount percent from 0 to 100." };
    discountPercent = value;
  } else {
    const value = parseDollarsToCents(raw.discountValue);
    if (value === null) return { error: "Enter the discount like 100 or 100.00, or leave it blank." };
    discountCents = value;
  }
  return {
    value: {
      id: raw.id,
      customerId: raw.customerId,
      jobId: raw.jobId,
      status: raw.status,
      issueDate: raw.issueDate,
      dueDate: raw.dueDate,
      lines,
      discountType: raw.discountType,
      discountCents,
      discountPercent,
      taxRate: tax,
      depositPercent: deposit,
      notes: raw.notes
    }
  };
}

function totalsFromRaw(raw) {
  const parsed = parseRaw({ ...raw, customerId: raw.customerId || "x" });
  if (parsed.error && !parsed.value) return parsed.error === "Choose a customer first." ? "" : parsed.error;
  if (!parsed.value) return "";
  return totalsHtml(parsed.value);
}

function totalsHtml(doc) {
  const totals = docTotals(doc);
  const rows = [
    { label: "Subtotal", value: money(totals.subtotal) },
    { label: "Discount", value: money(totals.discount) },
    { label: "Tax", value: money(totals.tax) },
    { label: "Total", value: money(totals.total), strong: true },
    { label: "Deposit due", value: money(totals.deposit) }
  ];
  const zero = (doc.lines || []).some((line) => line.qty > 0 && !line.unitPriceCents && line.description);
  return `<div class="sums">${rows.map((row) => `<div class="${row.strong ? "grand" : ""}"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`).join("")}</div>${zero ? `<p class="hint warn-text">A line is priced at $0. That's fine for something included — otherwise set a price.</p>` : ""}`;
}

function lineHtml(line) {
  const u = unitOf(line.unit);
  return `<div class="line" data-line="${esc(line.id)}">
    <label class="field"><span class="lbl">Description</span><input data-k="description" value="${esc(line.description)}" autocapitalize="sentences" placeholder="Quartz countertop"></label>
    <div class="line-grid">
      <label class="field"><span class="lbl">Qty</span><input data-k="qty" inputmode="decimal" value="${esc(line.qty)}"></label>
      <label class="field"><span class="lbl">Unit</span><span class="select"><select data-k="unit"><option value="sqft"${u === "sqft" ? " selected" : ""}>sq ft</option><option value="lf"${u === "lf" ? " selected" : ""}>lin ft</option><option value="each"${u === "each" ? " selected" : ""}>each</option></select></span></label>
      <label class="field"><span class="lbl">Price</span><span class="adorned has-prefix"><span class="adorn pre" aria-hidden="true">$</span><input data-k="price" inputmode="decimal" value="${esc(line.price)}" enterkeyhint="next" placeholder="0.00"></span></label>
    </div>
    <div class="line-foot"><b data-amt>${esc(amountLabel(line))}</b><button type="button" class="text-btn danger-text" data-act="remove-line" data-id="${esc(line.id)}">${icon("trash")} Remove</button></div>
    <input type="hidden" data-k="priceBookId" value="${esc(line.priceBookId)}">
  </div>`;
}

function amountLabel(line) {
  const qty = parseQty(line.qty);
  const price = parseDollarsToCents(line.price);
  if (qty === null || price === null) return "—";
  return money(lineTotalCents({ qty, unitPriceCents: price }));
}

function pickerHtml(jobId) {
  const job = jobById(jobId);
  const items = state.priceBook.filter((item) => item.active !== false).slice().sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  if (!items.length) return `<p class="meta">Your price book is empty.</p>`;
  return `<div class="picker">${items
    .map((item) => `<button type="button" class="picker-row" data-act="use-price" data-id="${esc(item.id)}" data-job="${esc(job?.id || "")}"><span class="row-text"><strong>${esc(item.name)}</strong><small>${esc(item.category)} · per${esc(unitShort(item.unit))}${item.starter ? " · Starter price" : ""}</small></span><b>${esc(money(item.unitPriceCents))}</b>${icon("plus")}</button>`)
    .join("")}</div>`;
}

export const editor = {
  title(route) {
    const kind = kindOf(route);
    const word = kind === "invoice" ? "invoice" : "estimate";
    return route.parts[1] === "new" ? "New " + word : "Edit " + word;
  },
  back(route) {
    return "#/" + route.parts[0];
  },
  html(route) {
    const key = route.path + "|" + (route.params.job || "") + "|" + (route.params.customer || "");
    if (workingKey !== key) {
      workingKey = key;
      working = initialDoc(route);
      picking = false;
    }
    if (!working) return empty("That document isn't on this phone", "It may have been deleted.");
    const customers = state.customers.slice().sort((a, b) => a.name.localeCompare(b.name));
    const jobs = state.jobs.filter((job) => !working.customerId || job.customerId === working.customerId);
    const statuses = working.kind === "invoice"
      ? [["draft", "Draft"], ["open", "Open"], ["void", "Void"]]
      : [["draft", "Draft"], ["sent", "Sent"], ["accepted", "Accepted"], ["declined", "Declined"]];
    const linkedJob = jobById(working.jobId);
    const layoutNote = linkedJob?.layout?.pieces?.length
      ? `<div class="layout-note">${blueprintSvg(linkedJob.layout, { width: 120, maxHeight: 70, cabinets: false, dims: false, labels: false, className: "bp bp-thumb" }).svg}<div><strong>Layout on file</strong><small>${esc(summaryLines(layoutStats(linkedJob.layout)).slice(0, 2).join(" · "))}</small><button type="button" class="text-btn" data-act="from-layout">Fill lines from layout</button></div></div>`
      : "";
    const existingInvoice = working.kind === "estimate" && working.id ? state.invoices.find((inv) => inv.sourceEstimateId === working.id && inv.status !== "void") : null;
    return `<form id="doc-form" data-guard novalidate>
      ${section("Customer & job", `<div class="form-stack">${[
        selectField({ label: "Customer", name: "customerId", value: working.customerId, options: [{ value: "", label: "Select a customer" }, ...customers.map((c) => ({ value: c.id, label: c.name }))] }),
        selectField({ label: "Job", name: "jobId", value: working.jobId, options: [{ value: "", label: "No job yet" }, ...jobs.map((job) => ({ value: job.id, label: (working.customerId ? "" : (customerById(job.customerId)?.name || "") + " · ") + jobTitle(job) }))] }),
        layoutNote,
        selectField({ label: "Status", name: "status", value: working.status, options: statuses.map(([value, label]) => ({ value, label })) }),
        `<div class="two-col">${field({ label: "Date", name: "issueDate", value: working.issueDate, type: "date" })}${field({ label: "Due date", name: "dueDate", value: working.dueDate, type: "date" })}</div>`
      ].join("")}</div>`, { className: "form-group" })}
      ${section("Line items", working.lines.map(lineHtml).join("") + `<div class="btn-row"><button type="button" class="btn${picking ? " is-on" : ""}" data-act="pick" aria-expanded="${picking}">${icon("tag")} ${picking ? "Close price book" : "Price book"}</button><button type="button" class="btn" data-act="add-line">${icon("plus")} Custom line</button></div>` + (picking ? pickerHtml(working.jobId) : ""), { className: "form-group lines-group" })}
      ${section("Tax & totals", `<div class="form-stack">${[
        `<div class="discount-row">${segmented([["amount", "$ off"], ["percent", "% off"]], working.discountType, "disc-type", { label: "Discount type", className: "seg-sm" })}<input type="hidden" name="discountType" id="discountType" value="${esc(working.discountType)}">${field({ label: "Discount", name: "discountValue", value: working.discountValue, inputmode: "decimal", placeholder: "0", ...(working.discountType === "percent" ? { suffix: "%" } : { currency: true }) })}</div>`,
        `<div class="two-col">${field({ label: "Tax", name: "tax", value: working.tax, inputmode: "decimal", suffix: "%" })}${field({ label: "Deposit", name: "deposit", value: working.deposit, inputmode: "decimal", suffix: "%" })}</div>`,
        `<div id="doc-totals">${totalsFromRaw(working)}</div>`
      ].join("")}</div>`, { className: "form-group" })}
      ${section("Notes", field({ label: "Note for the customer", name: "notes", value: working.notes, multiline: true, rows: 3, autocapitalize: "sentences" }), { className: "form-group" })}
      ${err(working.error)}
      <div class="form-bar two"><button class="btn" type="submit">Save</button><button class="btn primary" type="button" data-act="preview">${icon("doc")} Save & preview</button></div>
      ${working.kind === "estimate" ? `<div class="btn-row"><button class="btn" type="button" data-act="to-job">${icon("jobs")} Make it a job</button><button class="btn" type="button" data-act="to-invoice">${icon("doc")} ${existingInvoice ? "View invoice" : "Create invoice"}</button></div>` : ""}
      ${working.id ? `<button class="btn danger-ghost block" type="button" data-act="delete">${icon("trash")} Delete ${working.kind === "invoice" ? "invoice" : "estimate"}</button>` : ""}
    </form>`;
  },
  onInput(event) {
    if (event.target.closest("#doc-form")) paint();
  },
  onChange(event) {
    if (event.target.closest("[data-line]")) return paint();
    if (!event.target.form || event.target.form.id !== "doc-form") return;
    if (["customerId", "jobId", "status"].includes(event.target.id)) {
      working = readRaw(event.target.form);
      if (event.target.id === "customerId" && working.jobId) {
        const job = jobById(working.jobId);
        if (job && job.customerId !== working.customerId) working.jobId = "";
      }
      render({ keepScroll: true });
    }
  },
  async onSubmit(event) {
    await persist(event.target, "stay");
  },
  leave() {
    workingKey = "";
    working = null;
    picking = false;
  },
  async onClick(act, el) {
    const form = document.getElementById("doc-form");
    if (!form) return;
    if (act === "disc-type") {
      working = readRaw(form);
      working.discountType = el.dataset.val === "percent" ? "percent" : "amount";
      return render({ keepScroll: true });
    }
    if (act === "from-layout") {
      working = readRaw(form);
      const job = jobById(working.jobId);
      if (!job?.layout) return;
      const hasContent = working.lines.some((l) => l.description.trim() || l.price.trim());
      if (hasContent) {
        const ok = await confirmSheet({ title: "Replace the line items?", message: "Lines are rebuilt from the layout: square feet, polished edge, backsplash and cutouts, priced from your price book.", confirm: "Replace lines", danger: false });
        if (!ok) return;
      }
      working.lines = linesForJob(job);
      toast("Lines filled from the layout");
      return render({ keepScroll: true });
    }
    if (act === "add-line") {
      working = readRaw(form);
      working.lines.push(blankLine());
      return render({ keepScroll: true });
    }
    if (act === "remove-line") {
      working = readRaw(form);
      working.lines = working.lines.filter((line) => line.id !== el.dataset.id);
      if (!working.lines.length) working.lines.push(blankLine());
      return render({ keepScroll: true });
    }
    if (act === "pick") {
      working = readRaw(form);
      picking = !picking;
      return render({ keepScroll: true });
    }
    if (act === "use-price") {
      const item = state.priceBook.find((row) => row.id === el.dataset.id);
      if (!item) return;
      working = readRaw(form);
      const job = jobById(working.jobId);
      const stats = job?.layout?.pieces?.length ? layoutStats(job.layout) : null;
      const qty = item.unit === "sqft" && job?.sqft ? formatQty(job.sqft) : item.unit === "lf" && stats?.polishedLF ? formatQty(Math.round(stats.polishedLF * 100) / 100) : "1";
      working.lines.push({ id: uid(), description: item.name, qty, price: centsToInput(item.unitPriceCents) || "0", unit: item.unit, priceBookId: item.id });
      picking = false;
      toast("Added " + item.name);
      return render({ keepScroll: true });
    }
    if (act === "preview") return persist(form, "preview");
    if (act === "to-job" || act === "to-invoice") return persist(form, act);
    if (act === "delete" && working?.id) {
      const word = working.kind === "invoice" ? "invoice" : "estimate";
      const ok = await confirmSheet({ title: "Delete this " + word + "?", message: working.kind === "invoice" ? "Payments stay on the job. The invoice number isn't reused." : "The job it created (if any) stays.", confirm: "Delete " + word });
      if (!ok) return;
      const result = await deleteDocument(working.kind, working.id);
      if (!result.ok) {
        working.error = result.error;
        return render({ keepScroll: true });
      }
      const kind = working.kind;
      workingKey = "";
      toast("Deleted");
      go("/" + (kind === "invoice" ? "invoices" : "estimates"), { replace: true, force: true });
    }
  }
};

function paint() {
  const form = document.getElementById("doc-form");
  if (!form) return;
  const raw = readRaw(form);
  form.querySelectorAll("[data-line]").forEach((row) => {
    const line = raw.lines.find((item) => item.id === row.dataset.line);
    const amt = row.querySelector("[data-amt]");
    if (line && amt) amt.textContent = amountLabel(line);
  });
  const box = document.getElementById("doc-totals");
  if (box) box.innerHTML = totalsFromRaw(raw) || "";
}

async function persist(form, next) {
  const raw = readRaw(form);
  const parsed = parseRaw(raw);
  if (parsed.error) {
    working = { ...raw, error: parsed.error };
    return render({ keepScroll: true });
  }
  const result = await saveDocument(raw.kind, parsed.value);
  if (!result.ok) {
    working = { ...raw, error: result.error };
    return render({ keepScroll: true });
  }
  const base = "/" + (raw.kind === "invoice" ? "invoices" : "estimates") + "/" + result.id;
  const wasNew = !raw.id;
  workingKey = "";
  // a brand-new doc's "new" screen is replaced by its saved screen, so Back doesn't reopen a blank form
  if (wasNew) await go(base, { replace: true, force: true });
  else markSaved();
  if (next === "to-job") {
    const converted = await convertEstimateToJob(result.id);
    if (!converted.ok) return toast(converted.error);
    toast(converted.existing ? "This estimate is already linked to a job." : "Job created from this estimate.");
    return go("/jobs/" + converted.id, { force: true });
  }
  if (next === "to-invoice") {
    const converted = await createInvoiceFromEstimate(result.id);
    if (!converted.ok) return toast(converted.error);
    toast(converted.existing ? "This estimate already has an invoice." : "Invoice created. Review it before you share.");
    return go("/invoices/" + converted.id, { force: true });
  }
  toast("Saved");
  if (next === "preview") return go(base + "/preview", { force: true });
  if (!wasNew) return render({ keepScroll: true });
}

export function paperModel(doc, kind) {
  const customer = customerById(doc.customerId);
  const job = jobById(doc.jobId);
  const totals = docTotals(doc);
  const business = state.business;
  const rows = [
    { label: "Subtotal", value: money(totals.subtotal) },
    ...(totals.discount ? [{ label: "Discount", value: "−" + money(totals.discount) }] : []),
    { label: doc.taxRate ? "Tax " + doc.taxRate + "%" : "Tax", value: money(totals.tax) },
    { label: "Total", value: money(totals.total), strong: true },
    ...(doc.depositPercent ? [{ label: "Deposit " + doc.depositPercent + "%", value: money(totals.deposit) }] : [])
  ];
  const site = job?.siteAddress && job.siteAddress !== customer?.address ? "Job site: " + job.siteAddress : "";
  return {
    kind: kind === "invoice" ? "Invoice" : "Estimate",
    number: docNumber(kind, doc.number),
    issueDate: niceDate(doc.issueDate, { year: true }),
    dueDate: doc.dueDate ? niceDate(doc.dueDate, { year: true }) : "",
    businessName: business.name || (kind === "invoice" ? "Invoice" : "Estimate"),
    businessMeta: [business.address, business.phone, business.email].filter(Boolean).join("\n"),
    customerName: customer?.name || "Customer",
    customerMeta: [customer?.address, customer?.phone, customer?.email].filter(Boolean).join("\n"),
    jobLine: [job ? jobTitle(job) : "", site].filter(Boolean).join("\n"),
    lines: (doc.lines || []).map((line) => ({
      description: line.description || "Item",
      qty: (formatQty(line.qty) || "0") + unitShort(line.unit),
      price: money(line.unitPriceCents || 0),
      amount: money(lineTotalCents(line))
    })),
    totals: rows,
    notes: [doc.notes, business.documentFooter].filter(Boolean).join("\n\n"),
    logoDataUrl: business.logoDataUrl || "",
    layout: job?.layout?.pieces?.length ? job.layout : null,
    layoutSummary: job?.layout?.pieces?.length ? summaryLines(layoutStats(job.layout)) : []
  };
}

export function paperHtml(model) {
  return `<article class="paper">
    <header class="paper-top">
      <div>${model.logoDataUrl ? `<img class="logo" alt="" src="${esc(model.logoDataUrl)}">` : ""}<div class="biz-name">${esc(model.businessName)}</div><div class="biz-meta">${esc(model.businessMeta).split("\n").join("<br>")}</div></div>
      <div class="paper-kind"><div class="kind">${esc(model.kind.toUpperCase())}</div><div>${esc(model.number)}</div><div>${esc(model.issueDate)}</div>${model.dueDate ? `<div>Due ${esc(model.dueDate)}</div>` : ""}</div>
    </header>
    <div class="gold-rule"></div>
    <div class="kicker">Prepared for</div>
    <div class="who">${esc(model.customerName)}</div>
    <div class="biz-meta">${esc(model.customerMeta).split("\n").join("<br>")}</div>
    ${model.jobLine ? `<div class="biz-meta">${esc(model.jobLine).split("\n").join("<br>")}</div>` : ""}
    <table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
    <tbody>${model.lines.map((line) => `<tr><td>${esc(line.description)}</td><td class="num">${esc(line.qty)}</td><td class="num">${esc(line.price)}</td><td class="num">${esc(line.amount)}</td></tr>`).join("")}</tbody></table>
    <div class="paper-totals">${model.totals.map((row) => `<div class="${row.strong ? "grand" : ""}"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`).join("")}</div>
    ${model.layout ? `<div class="kicker">Countertop layout</div><div class="paper-layout">${blueprintSvg(model.layout, { width: 560, maxHeight: 300, palette: PALETTES.light, className: "bp bp-paper" }).svg}<ul>${model.layoutSummary.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}
    ${model.notes ? `<div class="kicker">Notes</div><p>${esc(model.notes).split("\n").join("<br>")}</p>` : ""}
  </article>`;
}

export const preview = {
  title(route) {
    const doc = findDoc(kindOf(route), route.parts[1]);
    return doc ? docNumber(kindOf(route), doc.number) : "Preview";
  },
  back(route) {
    return "#/" + route.parts[0] + "/" + route.parts[1];
  },
  html(route) {
    const kind = kindOf(route);
    const doc = findDoc(kind, route.parts[1]);
    if (!doc) return empty("That document isn't on this phone", "It may have been deleted.");
    const model = paperModel(doc, kind);
    const starter = (doc.lines || []).some((line) => state.priceBook.some((item) => item.id === line.priceBookId && item.starter));
    const missingName = !state.business.name;
    return `<div class="no-print preview-actions">
      ${missingName ? `<p class="banner warn">Add your business name in Settings so this ${kind} shows it. <a class="text-link" href="#/settings">Settings</a></p>` : ""}
      ${starter ? `<p class="banner warn">This uses a starter price. Change it in the price book before you send it.</p>` : ""}
      <div class="btn-row"><button type="button" class="btn primary" data-act="share">${icon("share")} Share PDF</button><button type="button" class="btn" data-act="print">${icon("print")} Print</button></div>
      <p class="hint center">Share opens your phone's share sheet. Nothing is sent until you pick Messages, Mail, or another app.</p>
      <div class="btn-row">${kind === "estimate" ? `<button type="button" class="btn sm" data-act="to-job">Make it a job</button><button type="button" class="btn sm" data-act="to-invoice">Invoice</button>` : doc.jobId ? `<a class="btn sm" href="#/jobs/${esc(doc.jobId)}/pay/new">Log payment</a>` : ""}</div>
    </div>
    ${paperHtml(model)}`;
  },
  action: (route) => `<a class="text-btn" href="#/${esc(route.parts[0])}/${esc(route.parts[1])}">Edit</a>`,
  async onClick(act, el, event) {
    const route = currentRoute();
    const kind = kindOf(route);
    const doc = findDoc(kind, route.parts[1]);
    if (!doc) return;
    if (act === "print") return window.print();
    if (act === "share") return shareDoc(doc, kind);
    if (act === "to-job") {
      const result = await convertEstimateToJob(doc.id);
      if (!result.ok) return toast(result.error);
      toast(result.existing ? "Already linked to a job." : "Job created.");
      return go("/jobs/" + result.id, { force: true });
    }
    if (act === "to-invoice") {
      const result = await createInvoiceFromEstimate(doc.id);
      if (!result.ok) return toast(result.error);
      toast(result.existing ? "This estimate already has an invoice." : "Invoice created. Review it before you share.");
      return go("/invoices/" + result.id, { force: true });
    }
  }
};

async function shareDoc(doc, kind) {
  const model = paperModel(doc, kind);
  try {
    model.logoJpeg = await dataUrlToJpegBytes(state.business.logoDataUrl);
  } catch {
    model.logoJpeg = null;
  }
  if (model.layout) {
    try {
      model.layoutJpeg = await layoutJpegBytes(model.layout, { width: 1400, maxHeight: 640 });
    } catch {
      model.layoutJpeg = null;
    }
  }
  const bytes = buildPdf(model);
  const name = pdfFileName(model.kind, model.number);
  // one path only: shareOrDownload shares, and falls back to a download if sharing fails (no second share sheet)
  const how = await shareOrDownload(new Blob([bytes], { type: "application/pdf" }), name, name);
  if (how === "downloaded") toast("PDF downloaded. On your phone, Share sends it through the share sheet.");
}
