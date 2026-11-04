import * as db from "./db.js";
import { state } from "./state.js";
import { uid, todayISO, parseDollarsToCents, numberToCents } from "./format.js";
import { STAGE_IDS, jobTitle, docNumber } from "./model.js";
import { docTotals, balanceCents, jobRevenueCents, paidCents, profitCents, costCents } from "./calc.js";
import { migrateLegacy, isLegacyBundle } from "./migrate.js";
import { isEncryptedBackup, encryptSnapshot, decryptSnapshot } from "./backup.js";
import { compressImageFile } from "./images.js";

const FAIL = "This phone wouldn't store that change. Export a backup from Settings before you keep going.";

function nowIso() {
  return new Date().toISOString();
}

async function saveRecord(store, record, { prepend = false } = {}) {
  const list = state[store];
  const index = list.findIndex((row) => row.id === record.id);
  const saved = await db.put(store, { ...record, updatedAt: record.updatedAt || nowIso() });
  if (index >= 0) list[index] = saved;
  else if (prepend) list.unshift(saved);
  else list.push(saved);
  return saved;
}

async function deleteRecord(store, id) {
  const list = state[store];
  const index = list.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const prev = list[index];
  list.splice(index, 1);
  try {
    await db.remove(store, id);
  } catch (error) {
    list.splice(index, 0, prev);
    throw error;
  }
  return prev;
}

async function takeNumber(kind) {
  const key = kind === "invoice" ? "nextInvoice" : "nextEstimate";
  const number = Number(state.business[key]) || 1001;
  state.business = await db.saveBusiness({ ...state.business, [key]: number + 1 });
  return number;
}

function storageFail(error) {
  console.error(error);
  return { ok: false, error: FAIL };
}

export async function saveCustomer(input) {
  const name = String(input.name || "").trim();
  if (!name) return { ok: false, error: "Enter a customer name." };
  const existing = input.id ? state.customers.find((c) => c.id === input.id) : null;
  const record = {
    id: existing?.id || uid(),
    name,
    phone: String(input.phone || "").trim(),
    email: String(input.email || "").trim(),
    address: String(input.address || "").trim(),
    notes: String(input.notes || ""),
    createdAt: existing?.createdAt || nowIso()
  };
  try {
    await saveRecord("customers", record, { prepend: !existing });
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true, id: record.id };
}

export async function deleteCustomer(id) {
  const jobs = state.jobs.filter((job) => job.customerId === id).length;
  const docs = [...state.estimates, ...state.invoices].filter((doc) => doc.customerId === id).length;
  if (jobs || docs) {
    return { ok: false, error: "This customer still has jobs or paperwork. Delete those first." };
  }
  try {
    await deleteRecord("customers", id);
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

export async function saveJob(input) {
  if (!input.customerId) return { ok: false, error: "Choose a customer." };
  if (!state.customers.some((c) => c.id === input.customerId)) return { ok: false, error: "Choose a customer." };
  if (input.templateDate && input.installDate && input.installDate < input.templateDate) {
    return { ok: false, error: "Install date is before the template date." };
  }
  const existing = input.id ? state.jobs.find((job) => job.id === input.id) : null;
  const sqft = input.sqft === null || input.sqft === undefined || input.sqft === "" ? null : Number(input.sqft);
  if (sqft !== null && (!Number.isFinite(sqft) || sqft < 0)) {
    return { ok: false, error: "Enter square footage as a number, or leave it blank." };
  }
  const record = {
    id: existing?.id || uid(),
    customerId: input.customerId,
    title: String(input.title || "").trim(),
    stage: STAGE_IDS.includes(input.stage) ? input.stage : "lead",
    siteAddress: String(input.siteAddress || "").trim(),
    material: String(input.material || "").trim(),
    stoneColor: String(input.stoneColor || "").trim(),
    edgeProfile: String(input.edgeProfile || "").trim(),
    sinkType: String(input.sinkType || "").trim(),
    sinkCutouts: String(input.sinkCutouts || "").trim(),
    backsplash: String(input.backsplash || "").trim(),
    sqft,
    templateDate: input.templateDate || "",
    installDate: input.installDate || "",
    notes: String(input.notes || ""),
    contractTotalCents: Math.max(0, Number(input.contractTotalCents) || 0),
    materialCostCents: Math.max(0, Number(input.materialCostCents) || 0),
    laborCostCents: Math.max(0, Number(input.laborCostCents) || 0),
    otherCostCents: Math.max(0, Number(input.otherCostCents) || 0),
    depositPercent: Math.min(100, Math.max(0, Number(input.depositPercent) || 0)),
    legacyStatus: existing?.legacyStatus || "",
    legacySalesDate: existing?.legacySalesDate || "",
    createdAt: existing?.createdAt || nowIso()
  };
  try {
    await saveRecord("jobs", record, { prepend: !existing });
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true, id: record.id };
}

export async function setStage(id, stage) {
  const job = state.jobs.find((row) => row.id === id);
  if (!job || !STAGE_IDS.includes(stage)) return { ok: false, error: "That stage isn't available." };
  const prev = job.stage;
  if (prev === stage) return { ok: true, id };
  job.stage = stage;
  try {
    const saved = await db.put("jobs", { ...job, updatedAt: nowIso() });
    Object.assign(job, saved);
  } catch (error) {
    job.stage = prev;
    return storageFail(error);
  }
  return {
    ok: true,
    undo: async () => {
      job.stage = prev;
      const saved = await db.put("jobs", { ...job, updatedAt: nowIso() });
      Object.assign(job, saved);
    }
  };
}

export async function deleteJob(id) {
  const job = state.jobs.find((row) => row.id === id);
  if (!job) return { ok: false, error: "That job is already gone." };
  try {
    for (const payment of state.payments.filter((row) => row.jobId === id)) await deleteRecord("payments", payment.id);
    for (const photo of await db.photosFor(id)) await db.deletePhoto(photo.id);
    for (const slab of state.slabs.filter((row) => row.jobId === id)) {
      slab.jobId = "";
      if (slab.status === "reserved") slab.status = "available";
      const saved = await db.put("slabs", { ...slab, updatedAt: nowIso() });
      Object.assign(slab, saved);
    }
    for (const doc of [...state.estimates, ...state.invoices]) {
      if (doc.jobId !== id) continue;
      doc.jobId = "";
      const store = state.estimates.includes(doc) ? "estimates" : "invoices";
      const saved = await db.put(store, { ...doc, updatedAt: nowIso() });
      Object.assign(doc, saved);
    }
    await deleteRecord("jobs", id);
    if (state.photoJobId === id) {
      state.photos = [];
      state.photoJobId = "";
    }
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

function syncPaidStage(job) {
  const total = jobRevenueCents(job, state.invoices);
  const balance = total - paidCents(state.payments, job.id);
  if (total > 0 && balance <= 0 && job.stage !== "paid") return "paid";
  if (balance > 0 && job.stage === "paid") return "installed";
  return "";
}

function onlyInvoiceId(jobId) {
  const list = state.invoices.filter((inv) => inv.jobId === jobId && inv.status !== "void");
  return list.length === 1 ? list[0].id : "";
}

export async function savePayment(input) {
  const amount = Number(input.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Enter a payment amount like 150 or 150.00." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "")) return { ok: false, error: "Enter the date you received the payment." };
  const job = state.jobs.find((row) => row.id === input.jobId);
  if (!job) return { ok: false, error: "That job is no longer on this phone." };
  const methods = ["cash", "check", "zelle", "card", "other"];
  const kinds = ["deposit", "final", "other"];
  const existing = input.id ? state.payments.find((row) => row.id === input.id) : null;
  const record = {
    id: existing?.id || input.id || uid(),
    jobId: job.id,
    customerId: job.customerId,
    invoiceId: input.invoiceId || existing?.invoiceId || onlyInvoiceId(job.id),
    amountCents: amount,
    date: input.date,
    method: methods.includes(input.method) ? input.method : "cash",
    kind: kinds.includes(input.kind) ? input.kind : "deposit",
    note: String(input.note || ""),
    legacy: existing?.legacy || input.legacy || false,
    createdAt: existing?.createdAt || input.createdAt || nowIso()
  };
  try {
    await saveRecord("payments", record, { prepend: !existing });
    const stage = syncPaidStage(job);
    if (stage) {
      job.stage = stage;
      const saved = await db.put("jobs", { ...job, updatedAt: nowIso() });
      Object.assign(job, saved);
    }
    return { ok: true, id: record.id, stage };
  } catch (error) {
    return storageFail(error);
  }
}

export async function deletePayment(id) {
  const payment = state.payments.find((row) => row.id === id);
  if (!payment) return { ok: false, error: "That payment is already gone." };
  const job = state.jobs.find((row) => row.id === payment.jobId);
  try {
    await deleteRecord("payments", id);
    if (job) {
      const stage = syncPaidStage(job);
      if (stage) {
        job.stage = stage;
        const saved = await db.put("jobs", { ...job, updatedAt: nowIso() });
        Object.assign(job, saved);
      }
    }
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true, undo: async () => savePayment(payment) };
}

function cleanLines(lines) {
  return (lines || [])
    .map((line) => ({
      id: line.id || uid(),
      priceBookId: line.priceBookId || "",
      description: String(line.description || "").trim(),
      unit: line.unit === "each" ? "each" : "sqft",
      qty: Number(line.qty) || 0,
      unitPriceCents: Math.max(0, Number(line.unitPriceCents) || 0)
    }))
    .filter((line) => line.description || line.qty || line.unitPriceCents);
}

export async function saveDocument(kind, input) {
  const store = kind === "invoice" ? "invoices" : "estimates";
  if (!input.customerId) return { ok: false, error: "Choose a customer first." };
  const existing = input.id ? state[store].find((doc) => doc.id === input.id) : null;
  let number = existing?.number;
  try {
    if (!number) number = await takeNumber(kind === "invoice" ? "invoice" : "estimate");
    const statuses = kind === "invoice" ? ["draft", "open", "void"] : ["draft", "sent", "accepted", "declined"];
    const record = {
      id: existing?.id || uid(),
      number,
      customerId: input.customerId,
      jobId: input.jobId || "",
      status: statuses.includes(input.status) ? input.status : kind === "invoice" ? "open" : "draft",
      issueDate: input.issueDate || todayISO(),
      dueDate: input.dueDate || "",
      lines: cleanLines(input.lines),
      discountType: input.discountType === "percent" ? "percent" : "amount",
      discountCents: Math.max(0, Number(input.discountCents) || 0),
      discountPercent: Math.min(100, Math.max(0, Number(input.discountPercent) || 0)),
      taxRate: Math.min(50, Math.max(0, Number(input.taxRate) || 0)),
      depositPercent: Math.min(100, Math.max(0, Number(input.depositPercent) || 0)),
      notes: String(input.notes || ""),
      createdAt: existing?.createdAt || nowIso()
    };
    await saveRecord(store, record, { prepend: !existing });
    return { ok: true, id: record.id };
  } catch (error) {
    return storageFail(error);
  }
}

export async function deleteDocument(kind, id) {
  const store = kind === "invoice" ? "invoices" : "estimates";
  try {
    await deleteRecord(store, id);
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

export async function convertEstimateToJob(id) {
  const estimate = state.estimates.find((doc) => doc.id === id);
  if (!estimate) return { ok: false, error: "That estimate is gone." };
  if (!estimate.customerId) return { ok: false, error: "Add a customer to this estimate first." };
  if (estimate.jobId && state.jobs.some((job) => job.id === estimate.jobId)) {
    return { ok: true, id: estimate.jobId, existing: true };
  }
  const customer = state.customers.find((row) => row.id === estimate.customerId);
  const totals = docTotals(estimate);
  const sqft = (estimate.lines || []).filter((line) => line.unit === "sqft").reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  const created = await saveJob({
    customerId: estimate.customerId,
    title: estimate.lines?.[0]?.description || "Countertop",
    stage: "quoted",
    siteAddress: customer?.address || "",
    sqft: sqft || null,
    contractTotalCents: totals.total,
    depositPercent: estimate.depositPercent,
    materialCostCents: 0,
    laborCostCents: 0,
    otherCostCents: 0
  });
  if (!created.ok) return created;
  try {
    estimate.jobId = created.id;
    if (estimate.status !== "declined") estimate.status = "accepted";
    const saved = await db.put("estimates", { ...estimate, updatedAt: nowIso() });
    Object.assign(estimate, saved);
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true, id: created.id };
}

export async function createInvoiceFromEstimate(id) {
  const estimate = state.estimates.find((doc) => doc.id === id);
  if (!estimate) return { ok: false, error: "That estimate is gone." };
  if (!estimate.customerId) return { ok: false, error: "Add a customer to this estimate first." };
  const created = await saveDocument("invoice", {
    customerId: estimate.customerId,
    jobId: estimate.jobId || "",
    status: "open",
    issueDate: todayISO(),
    lines: (estimate.lines || []).map((line) => ({ ...line, id: uid() })),
    discountType: estimate.discountType,
    discountCents: estimate.discountCents,
    discountPercent: estimate.discountPercent,
    taxRate: estimate.taxRate,
    depositPercent: estimate.depositPercent,
    notes: estimate.notes
  });
  if (!created.ok) return created;
  try {
    if (estimate.status !== "declined") {
      estimate.status = "accepted";
      const saved = await db.put("estimates", { ...estimate, updatedAt: nowIso() });
      Object.assign(estimate, saved);
    }
    const job = state.jobs.find((row) => row.id === estimate.jobId);
    if (job && (job.stage === "lead" || job.stage === "quoted")) {
      job.stage = "approved";
      const saved = await db.put("jobs", { ...job, updatedAt: nowIso() });
      Object.assign(job, saved);
    }
  } catch (error) {
    return storageFail(error);
  }
  return created;
}

export async function createInvoiceFromJob(jobId) {
  const job = state.jobs.find((row) => row.id === jobId);
  if (!job) return { ok: false, error: "That job is gone." };
  const source = state.estimates
    .filter((doc) => doc.jobId === jobId && doc.status !== "declined")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const lines = source?.lines?.length
    ? source.lines.map((line) => ({ ...line, id: uid() }))
    : [{
        id: uid(),
        priceBookId: "",
        description: job.sqft ? jobTitle(job) + " (" + job.sqft + " sq ft)" : jobTitle(job),
        unit: "each",
        qty: 1,
        unitPriceCents: job.contractTotalCents || 0
      }];
  return saveDocument("invoice", {
    customerId: job.customerId,
    jobId: job.id,
    status: "open",
    issueDate: todayISO(),
    lines,
    discountType: source?.discountType || "amount",
    discountCents: source?.discountCents || 0,
    discountPercent: source?.discountPercent || 0,
    taxRate: source?.taxRate ?? state.business.taxRate,
    depositPercent: source?.depositPercent ?? job.depositPercent ?? state.business.defaultDepositPercent,
    notes: source?.notes || ""
  });
}

export async function saveSlab(input) {
  const material = String(input.material || "").trim();
  const stoneColor = String(input.stoneColor || "").trim();
  if (!material && !stoneColor) return { ok: false, error: "Enter a material or a color." };
  const existing = input.id ? state.slabs.find((row) => row.id === input.id) : null;
  let status = ["available", "reserved", "used"].includes(input.status) ? input.status : "available";
  const jobId = input.jobId || "";
  if (jobId && status === "available") status = "reserved";
  if (!jobId && status === "reserved") status = "available";
  const lengthIn = Number(input.lengthIn) || 0;
  const widthIn = Number(input.widthIn) || 0;
  const sqft = lengthIn > 0 && widthIn > 0 ? Math.round(((lengthIn * widthIn) / 144) * 100) / 100 : Number(input.sqft) || 0;
  const record = {
    id: existing?.id || uid(),
    kind: input.kind === "remnant" ? "remnant" : "slab",
    material,
    stoneColor,
    lengthIn,
    widthIn,
    thickness: String(input.thickness || "").trim(),
    sqft,
    costCents: Math.max(0, Number(input.costCents) || 0),
    location: String(input.location || "").trim(),
    status,
    jobId,
    notes: String(input.notes || ""),
    createdAt: existing?.createdAt || nowIso()
  };
  try {
    await saveRecord("slabs", record, { prepend: !existing });
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true, id: record.id };
}

export async function deleteSlab(id) {
  try {
    await deleteRecord("slabs", id);
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

export async function savePriceItem(input) {
  const name = String(input.name || "").trim();
  if (!name) return { ok: false, error: "Enter a name for this price." };
  const existing = input.id ? state.priceBook.find((row) => row.id === input.id) : null;
  const record = {
    id: existing?.id || uid(),
    name,
    category: String(input.category || "Material").trim() || "Material",
    unit: input.unit === "each" ? "each" : "sqft",
    unitPriceCents: Math.max(0, Number(input.unitPriceCents) || 0),
    active: input.active !== false,
    starter: false,
    createdAt: existing?.createdAt || nowIso()
  };
  try {
    await saveRecord("priceBook", record, { prepend: !existing });
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true, id: record.id };
}

export async function deletePriceItem(id) {
  try {
    await deleteRecord("priceBook", id);
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

export async function saveTask(input) {
  const title = String(input.title || "").trim();
  if (!title) return { ok: false, error: "Enter what needs doing." };
  const existing = input.id ? state.tasks.find((row) => row.id === input.id) : null;
  const record = {
    id: existing?.id || uid(),
    title,
    customerId: input.customerId || "",
    dueDate: input.dueDate || "",
    done: input.done === undefined ? existing?.done === true : input.done === true,
    notes: String(input.notes || ""),
    createdAt: existing?.createdAt || nowIso()
  };
  try {
    await saveRecord("tasks", record, { prepend: !existing });
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true, id: record.id };
}

export async function toggleTask(id) {
  const task = state.tasks.find((row) => row.id === id);
  if (!task) return { ok: false };
  task.done = !task.done;
  try {
    const saved = await db.put("tasks", { ...task, updatedAt: nowIso() });
    Object.assign(task, saved);
  } catch (error) {
    task.done = !task.done;
    return storageFail(error);
  }
  return { ok: true };
}

export async function deleteTask(id) {
  try {
    await deleteRecord("tasks", id);
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

export async function saveBusiness(input) {
  const tax = Number(input.taxRate);
  const deposit = Number(input.defaultDepositPercent);
  if (!Number.isFinite(tax) || tax < 0 || tax > 50) return { ok: false, error: "Enter tax as a percent, like 7 or 6.5." };
  if (!Number.isFinite(deposit) || deposit < 0 || deposit > 100) return { ok: false, error: "Enter the deposit percent from 0 to 100." };
  try {
    state.business = await db.saveBusiness({
      ...state.business,
      name: String(input.name || "").trim(),
      phone: String(input.phone || "").trim(),
      email: String(input.email || "").trim(),
      address: String(input.address || "").trim(),
      logoDataUrl: input.logoDataUrl || "",
      taxRate: tax,
      defaultDepositPercent: deposit,
      documentFooter: String(input.documentFooter || "")
    });
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

export async function dismissTips() {
  try {
    state.business = await db.saveBusiness({ ...state.business, tipsDismissed: true });
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

export async function loadPhotos(jobId) {
  state.photos = await db.photosFor(jobId);
  state.photoJobId = jobId;
  return state.photos;
}

export async function addPhotos(jobId, category, files) {
  const allowed = ["site", "template", "install", "damage"];
  const cat = allowed.includes(category) ? category : "site";
  if (!files?.length) return { ok: false, error: "Choose a photo." };
  try {
    for (const file of files) {
      const blob = await compressImageFile(file);
      const photo = await db.putPhoto({
        id: uid(),
        jobId,
        category: cat,
        caption: "",
        blob,
        createdAt: nowIso()
      });
      if (state.photoJobId === jobId) state.photos.push(photo);
    }
  } catch (error) {
    return { ok: false, error: error.message || FAIL };
  }
  return { ok: true };
}

export async function deletePhoto(id) {
  try {
    await db.deletePhoto(id);
    state.photos = state.photos.filter((photo) => photo.id !== id);
  } catch (error) {
    return storageFail(error);
  }
  return { ok: true };
}

export async function buildBackup(passphrase) {
  try {
    const snapshot = await db.exportSnapshot();
    if (passphrase) {
      if (String(passphrase).length < 4) {
        return { ok: false, error: "Use at least 4 characters, or leave the box empty for a plain backup." };
      }
      return { ok: true, encrypted: true, data: await encryptSnapshot(snapshot, passphrase) };
    }
    return { ok: true, encrypted: false, data: snapshot };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Couldn't build the backup." };
  }
}

export async function restoreBackup(data, passphrase) {
  try {
    let snapshot = data;
    if (isEncryptedBackup(data)) {
      if (!passphrase) return { ok: false, error: "Enter the passphrase for this encrypted backup." };
      snapshot = await decryptSnapshot(data, passphrase);
    } else if (isLegacyBundle(data)) {
      const migrated = migrateLegacy(data, { today: todayISO(), now: nowIso() });
      snapshot = {
        schemaVersion: 2,
        business: state.business,
        priceBook: state.priceBook,
        photos: [],
        ...migrated
      };
    } else if (!(data && (data.schemaVersion === 2 || Array.isArray(data.customers)))) {
      return { ok: false, error: "That file isn't a JOBS backup." };
    }
    await db.replaceAll(snapshot);
    const loaded = await db.loadAll();
    state.business = loaded.business;
    state.customers = loaded.customers;
    state.jobs = loaded.jobs;
    state.estimates = loaded.estimates;
    state.invoices = loaded.invoices;
    state.payments = loaded.payments;
    state.priceBook = loaded.priceBook;
    state.slabs = loaded.slabs;
    state.tasks = loaded.tasks;
    state.photos = [];
    state.photoJobId = "";
    return { ok: true, customers: state.customers.length, jobs: state.jobs.length };
  } catch (error) {
    return { ok: false, error: error.message || "Couldn't restore that backup." };
  }
}

export function csvRows(kind) {
  const nameOf = (id) => state.customers.find((c) => c.id === id)?.name || "";
  if (kind === "customers") {
    return [
      ["Name", "Phone", "Email", "Address", "Notes", "Jobs"],
      ...state.customers.map((c) => [c.name, c.phone, c.email, c.address, c.notes, String(state.jobs.filter((j) => j.customerId === c.id).length)])
    ];
  }
  if (kind === "payments") {
    return [
      ["Date", "Customer", "Job", "Amount", "Method", "Type", "Note"],
      ...state.payments.map((p) => {
        const job = state.jobs.find((row) => row.id === p.jobId);
        return [p.date, nameOf(p.customerId), job ? jobTitle(job) : "", ((p.amountCents || 0) / 100).toFixed(2), p.method, p.kind, p.note];
      })
    ];
  }
  return [
    ["Customer", "Phone", "Email", "Site address", "Stage", "Material", "Color", "Edge", "Sink", "Cutouts", "Backsplash", "Sq ft", "Template date", "Install date", "Job total", "Material cost", "Labor cost", "Other cost", "Profit", "Paid", "Balance", "Notes"],
    ...state.jobs.map((job) => {
      const customer = state.customers.find((c) => c.id === job.customerId);
      const revenue = jobRevenueCents(job, state.invoices);
      return [
        customer?.name || "",
        customer?.phone || "",
        customer?.email || "",
        job.siteAddress || "",
        job.stage,
        job.material,
        job.stoneColor,
        job.edgeProfile,
        job.sinkType,
        job.sinkCutouts,
        job.backsplash,
        job.sqft ?? "",
        job.templateDate,
        job.installDate,
        (revenue / 100).toFixed(2),
        ((job.materialCostCents || 0) / 100).toFixed(2),
        ((job.laborCostCents || 0) / 100).toFixed(2),
        ((job.otherCostCents || 0) / 100).toFixed(2),
        (profitCents(job, state.invoices) / 100).toFixed(2),
        (paidCents(state.payments, job.id) / 100).toFixed(2),
        (balanceCents(job, state.invoices, state.payments) / 100).toFixed(2),
        job.notes
      ];
    })
  ];
}

export function moneySummary(job) {
  return {
    revenue: jobRevenueCents(job, state.invoices),
    paid: paidCents(state.payments, job.id),
    balance: balanceCents(job, state.invoices, state.payments),
    profit: profitCents(job, state.invoices),
    costs: costCents(job)
  };
}

export { parseDollarsToCents, numberToCents, docNumber };
