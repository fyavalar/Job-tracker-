import { state, customerById, jobById } from "../state.js";
import { saveDocument, deleteDocument, convertEstimateToJob, createInvoiceFromEstimate } from "../actions.js";
import { empty, err, field, section, selectField } from "../components.js";
import { icon } from "../icons.js";
import { esc, centsToInput, downloadBlob, formatQty, money, niceDate, parseDollarsToCents, parsePercent, parseQty, todayISO, uid } from "../format.js";
import { docTotals, invoiceBalanceCents, lineTotalCents } from "../calc.js";
import { docNumber, jobTitle } from "../model.js";
import { buildPdf, pdfFileName } from "../pdf.js";
import { dataUrlToJpegBytes } from "../images.js";
import { go, render, toast } from "../nav.js";

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
  const paid = total - invoiceBalanceCents(doc, state.payments);
  if (total > 0 && paid >= total) return "Paid";
  if (paid > 0) return "Partial";
  return "Open";
}

function listCards(kind) {
  const rows = storeOf(kind).slice().sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)) || b.number - a.number);
  if (!rows.length) {
    return empty(kind === "invoice" ? "No invoices yet" : "No estimates yet", kind === "invoice" ? "Create one from an estimate or a job." : "An estimate can turn into a job, then an invoice.");
  }
  return rows
    .map((doc) => {
      const customer = customerById(doc.customerId);
      return `<a class="card card-link" href="#/${kind}s/${esc(doc.id)}"><div class="card-top"><strong>${esc(docNumber(kind, doc.number))}</strong><b>${esc(money(docTotals(doc).total))}</b></div><div class="meta">${esc(customer?.name || "No customer")} · ${esc(statusLabel(doc, kind))}${doc.issueDate ? " · " + esc(niceDate(doc.issueDate, { year: true })) : ""}</div></a>`;
    })
    .join("");
}

export const estimates = {
  title: () => "Estimates",
  back: () => "#/more",
  html: () => listCards("estimate") + `<a class="btn primary block" href="#/estimates/new">${icon("plus")} New estimate</a>`
};

export const invoices = {
  title: () => "Invoices",
  back: () => "#/money",
  html: () => listCards("invoice") + `<a class="btn primary block" href="#/invoices/new">${icon("plus")} New invoice</a>`
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
    unit: line.unit === "each" ? "each" : "sqft",
    priceBookId: line.priceBookId || ""
  };
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
    lines: job ? [{ id: uid(), description: [job.material, job.stoneColor].filter(Boolean).join(" ") || "Countertop", qty: formatQty(job.sqft || 0), price: "", unit: "sqft", priceBookId: "" }] : [blankLine()],
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
    unit: row.querySelector("[data-k=unit]").value === "each" ? "each" : "sqft",
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
  return `<div class="sums">${rows.map((row) => `<div class="${row.strong ? "grand" : ""}"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`).join("")}</div>${zero ? `<p class="meta">A line is priced at $0. That's fine for something included, otherwise set a price.</p>` : ""}`;
}

function lineHtml(line) {
  return `<div class="line" data-line="${esc(line.id)}">
    <label class="field"><span class="lbl">Description</span><input data-k="description" value="${esc(line.description)}"></label>
    <div class="line-grid">
      <label class="field"><span class="lbl">Qty</span><input data-k="qty" inputmode="decimal" value="${esc(line.qty)}"></label>
      <label class="field"><span class="lbl">Unit</span><span class="select"><select data-k="unit"><option value="sqft"${line.unit !== "each" ? " selected" : ""}>sq ft</option><option value="each"${line.unit === "each" ? " selected" : ""}>each</option></select></span></label>
      <label class="field"><span class="lbl">Price</span><input data-k="price" inputmode="decimal" value="${esc(line.price)}"></label>
    </div>
    <div class="line-foot"><span data-amt>${esc(amountLabel(line))}</span><button type="button" class="text-btn" data-act="remove-line" data-id="${esc(line.id)}">Remove</button></div>
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
    .map((item) => `<button type="button" class="picker-row" data-act="use-price" data-id="${esc(item.id)}" data-job="${esc(job?.id || "")}"><span><b>${esc(item.name)}</b><small>${esc(item.category)} · ${esc(item.unit === "sqft" ? "sq ft" : "each")}${item.starter ? " · Starter price" : ""}</small></span><b>${esc(money(item.unitPriceCents))}</b></button>`)
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
    return `<form id="doc-form">
      ${section("Customer and job", [
        selectField({ label: "Customer", name: "customerId", value: working.customerId, options: [{ value: "", label: "Select a customer" }, ...customers.map((c) => ({ value: c.id, label: c.name }))] }),
        selectField({ label: "Job", name: "jobId", value: working.jobId, options: [{ value: "", label: "No job yet" }, ...jobs.map((job) => ({ value: job.id, label: jobTitle(job) }))] }),
        selectField({ label: "Status", name: "status", value: working.status, options: statuses.map(([value, label]) => ({ value, label })) }),
        field({ label: "Date", name: "issueDate", value: working.issueDate, type: "date" }),
        field({ label: "Due date", name: "dueDate", value: working.dueDate, type: "date" })
      ].join(""))}
      ${section("Line items", (picking ? pickerHtml(working.jobId) : "") + working.lines.map(lineHtml).join("") + `<div class="btn-row"><button type="button" class="btn" data-act="pick">${picking ? "Close price book" : "Add from price book"}</button><button type="button" class="btn" data-act="add-line">Custom line</button></div>`)}
      ${section("Tax and totals", [
        selectField({ label: "Discount", name: "discountType", value: working.discountType, options: [{ value: "amount", label: "Dollar amount" }, { value: "percent", label: "Percent" }] }),
        field({ label: working.discountType === "percent" ? "Discount percent" : "Discount amount", name: "discountValue", value: working.discountValue, inputmode: "decimal" }),
        field({ label: "Tax percent", name: "tax", value: working.tax, inputmode: "decimal" }),
        field({ label: "Deposit percent", name: "deposit", value: working.deposit, inputmode: "decimal" }),
        `<div id="doc-totals">${totalsFromRaw(working)}</div>`
      ].join(""))}
      ${section("Notes", field({ label: "Note for the customer", name: "notes", value: working.notes, multiline: true }))}
      ${err(working.error)}
      <button class="btn primary block" type="submit">Save</button>
      <button class="btn block" type="button" data-act="preview">Save and preview</button>
      ${working.kind === "estimate" ? `<button class="btn block" type="button" data-act="to-job">Turn into a job</button><button class="btn block" type="button" data-act="to-invoice">Create invoice</button>` : ""}
      ${working.id ? `<button class="btn danger block" type="button" data-act="delete">${working.confirmDelete ? "Delete this " + (working.kind === "invoice" ? "invoice" : "estimate") : "Delete"}</button>` : ""}
    </form>`;
  },
  onInput(event) {
    if (event.target.closest("#doc-form")) paint();
  },
  onChange(event) {
    if (event.target.closest("[data-line]")) return paint();
    if (!event.target.form || event.target.form.id !== "doc-form") return;
    if (["customerId", "jobId", "discountType", "status"].includes(event.target.id)) {
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
  async onClick(act, el) {
    const form = document.getElementById("doc-form");
    if (!form) return;
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
      const qty = item.unit === "sqft" && job?.sqft ? formatQty(job.sqft) : "1";
      working.lines.push({ id: uid(), description: item.name, qty, price: centsToInput(item.unitPriceCents) || "0", unit: item.unit, priceBookId: item.id });
      picking = false;
      return render({ keepScroll: true });
    }
    if (act === "preview") return persist(form, "preview");
    if (act === "to-job" || act === "to-invoice") return persist(form, act);
    if (act === "delete" && working?.id) {
      if (!working.confirmDelete) {
        working = readRaw(form);
        working.confirmDelete = true;
        return render({ keepScroll: true });
      }
      const result = await deleteDocument(working.kind, working.id);
      if (!result.ok) {
        working.error = result.error;
        return render({ keepScroll: true });
      }
      workingKey = "";
      toast("Deleted");
      go("/" + (working.kind === "invoice" ? "invoices" : "estimates"));
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
  workingKey = "";
  if (next === "to-job") {
    const converted = await convertEstimateToJob(result.id);
    if (!converted.ok) return toast(converted.error);
    toast(converted.existing ? "This estimate is already linked to a job." : "Job created from this estimate.");
    return go("/jobs/" + converted.id);
  }
  if (next === "to-invoice") {
    const converted = await createInvoiceFromEstimate(result.id);
    if (!converted.ok) return toast(converted.error);
    toast("Invoice created. Review it before you share.");
    return go("/invoices/" + converted.id);
  }
  toast("Saved");
  if (next === "preview") return go("/" + (raw.kind === "invoice" ? "invoices" : "estimates") + "/" + result.id + "/preview");
  return go("/" + (raw.kind === "invoice" ? "invoices" : "estimates") + "/" + result.id);
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
      qty: (formatQty(line.qty) || "0") + (line.unit === "sqft" ? " sq ft" : " ea"),
      price: money(line.unitPriceCents || 0),
      amount: money(lineTotalCents(line))
    })),
    totals: rows,
    notes: [doc.notes, business.documentFooter].filter(Boolean).join("\n\n"),
    logoDataUrl: business.logoDataUrl || ""
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
    return `<div class="no-print btn-col">
      ${missingName ? `<p class="banner">Add your business name in Settings so this ${kind} shows it.</p>` : ""}
      ${starter ? `<p class="banner">This uses a starter price. Change it in the price book before you send it.</p>` : ""}
      <button type="button" class="btn primary" data-act="share">${icon("share")} Share PDF</button>
      <button type="button" class="btn" data-act="print">${icon("print")} Print</button>
      <p class="meta">Share opens your phone's share sheet. Nothing is sent until you choose Messages, Mail, or another app.</p>
      <a class="btn" href="#/${kind === "invoice" ? "invoices" : "estimates"}/${esc(doc.id)}">Edit</a>
      ${kind === "estimate" ? `<button type="button" class="btn" data-act="to-job">Turn into a job</button><button type="button" class="btn" data-act="to-invoice">Create invoice</button>` : doc.jobId ? `<a class="btn" href="#/jobs/${esc(doc.jobId)}/pay/new">Record a payment</a>` : ""}
    </div>
    ${paperHtml(model)}`;
  },
  async onClick(act, el, event) {
    const route = { parts: location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean) };
    const kind = kindOf(route);
    const doc = findDoc(kind, route.parts[1]);
    if (!doc) return;
    if (act === "print") return window.print();
    if (act === "share") return shareDoc(doc, kind);
    if (act === "to-job") {
      const result = await convertEstimateToJob(doc.id);
      if (!result.ok) return toast(result.error);
      toast(result.existing ? "Already linked to a job." : "Job created.");
      return go("/jobs/" + result.id);
    }
    if (act === "to-invoice") {
      const result = await createInvoiceFromEstimate(doc.id);
      if (!result.ok) return toast(result.error);
      toast("Invoice created.");
      return go("/invoices/" + result.id);
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
  const bytes = buildPdf(model);
  const name = pdfFileName(model.kind, model.number);
  const file = new File([bytes], name, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), name);
  toast("PDF downloaded. On your phone, Share sends it through the share sheet.");
}
