import { uid, normName, digits, numberToCents } from "./format.js";
import { STAGE_IDS } from "./model.js";

export function isLegacyBundle(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (data.encrypted) return false;
  if (data.schemaVersion === 2 || Array.isArray(data.customers)) return false;
  return Array.isArray(data.jobs) || Array.isArray(data.tasks);
}

function str(record, key) {
  const value = record?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function legacyColor(value) {
  if (value === "red") return "attn";
  if (value === "green") return "done";
  if (value === "blue") return "prog";
  if (value === "attn" || value === "done" || value === "prog") return value;
  return "";
}

function stamp(iso, fallback) {
  return iso ? iso + "T16:00:00.000Z" : fallback;
}

function legacySplit(totalCents) {
  if (!totalCents) return { depositCents: 0, balanceCents: 0 };
  const dollars = totalCents / 100;
  const deposit = Math.round(dollars * 0.75 * 100) / 100;
  const depositCents = numberToCents(deposit);
  return { depositCents, balanceCents: totalCents - depositCents };
}

function stageFor(job, totalCents, today) {
  const color = legacyColor(job.color);
  const sale = color === "done" && job.completed === true;
  const bothPaid = job.depositPaid === true && job.balancePaid === true;
  if (bothPaid && totalCents > 0) return "paid";
  if (sale || color === "done") return "installed";
  if (color === "prog" && job.templateDate && job.templateDate <= today) return "fabrication";
  if (color === "prog" && job.templateDate) return "templated";
  if (color === "prog") return "approved";
  if (job.templateDate || job.installDate) return "approved";
  if (totalCents > 0) return "quoted";
  return "lead";
}

function findCustomer(customers, name, phone) {
  const wantedName = normName(name);
  const wantedPhone = digits(phone);
  const sameName = customers.filter((c) => normName(c.name) === wantedName);
  if (!sameName.length) return null;
  if (wantedPhone) {
    return sameName.find((c) => digits(c.phone) === wantedPhone) || null;
  }
  if (sameName.length === 1) return sameName[0];
  const noPhone = sameName.filter((c) => !digits(c.phone));
  if (noPhone.length === 1) return noPhone[0];
  return null;
}

function fillCustomer(customer, job) {
  const phone = str(job, "phone").trim();
  const email = str(job, "email").trim();
  const address = str(job, "address").trim();
  const notes = [];
  if (!customer.phone && phone) customer.phone = phone;
  else if (phone && digits(phone) && digits(customer.phone) && digits(phone) !== digits(customer.phone)) {
    notes.push("Other phone on a job: " + phone);
  }
  if (!customer.email && email) customer.email = email;
  else if (email && customer.email && email.toLowerCase() !== customer.email.toLowerCase()) {
    notes.push("Other email on a job: " + email);
  }
  if (!customer.address && address) customer.address = address;
  if (notes.length) {
    customer.notes = [customer.notes, ...notes].filter(Boolean).join("\n");
  }
}

export function migrateLegacy(data, { today, now } = {}) {
  if (!isLegacyBundle(data)) throw new Error("That file isn't a JOBS backup.");
  const fallbackNow = now || new Date().toISOString();
  const todayStr = today || fallbackNow.slice(0, 10);
  const customers = [];
  const jobs = [];
  const payments = [];

  for (const raw of data.jobs || []) {
    if (!raw || typeof raw !== "object") continue;
    const name = str(raw, "customer").trim() || "Untitled customer";
    let customer = findCustomer(customers, name, str(raw, "phone"));
    if (!customer) {
      customer = {
        id: uid(),
        name,
        phone: str(raw, "phone").trim(),
        email: str(raw, "email").trim(),
        address: str(raw, "address").trim(),
        notes: "",
        createdAt: stamp(str(raw, "salesDate") || str(raw, "installDate") || str(raw, "templateDate"), fallbackNow),
        updatedAt: fallbackNow
      };
      customers.push(customer);
    } else {
      fillCustomer(customer, raw);
      customer.updatedAt = fallbackNow;
    }

    const totalCents = numberToCents(str(raw, "totalAmount"));
    const knownDate = str(raw, "installDate") || str(raw, "templateDate") || str(raw, "salesDate");
    const sqftRaw = str(raw, "totalSqft").trim();
    const sqft = sqftRaw === "" ? null : numberToCents(sqftRaw) / 100;
    const job = {
      id: str(raw, "id") || uid(),
      customerId: customer.id,
      title: "",
      stage: stageFor({ ...raw, templateDate: str(raw, "templateDate"), installDate: str(raw, "installDate") }, totalCents, todayStr),
      siteAddress: str(raw, "address").trim(),
      material: str(raw, "material").trim(),
      stoneColor: "",
      edgeProfile: "",
      sinkType: str(raw, "sinks").trim(),
      sinkCutouts: "",
      backsplash: "",
      sqft: Number.isFinite(sqft) ? sqft : null,
      templateDate: str(raw, "templateDate"),
      installDate: str(raw, "installDate"),
      notes: str(raw, "notes"),
      contractTotalCents: totalCents,
      materialCostCents: numberToCents(str(raw, "materialCost")),
      laborCostCents: 0,
      otherCostCents: 0,
      depositPercent: 75,
      legacyStatus: str(raw, "statusText").trim(),
      legacySalesDate: str(raw, "salesDate"),
      createdAt: stamp(knownDate, fallbackNow),
      updatedAt: fallbackNow
    };
    if (!STAGE_IDS.includes(job.stage)) job.stage = "lead";
    jobs.push(job);

    const split = legacySplit(totalCents);
    const payDate = str(raw, "salesDate") || str(raw, "installDate") || str(raw, "templateDate") || todayStr;
    const payBase = {
      jobId: job.id,
      customerId: customer.id,
      invoiceId: "",
      date: payDate,
      method: "other",
      legacy: true,
      createdAt: stamp(payDate, fallbackNow),
      updatedAt: fallbackNow
    };
    if (raw.depositPaid === true && split.depositCents > 0) {
      payments.push({
        ...payBase,
        id: uid(),
        amountCents: split.depositCents,
        kind: "deposit",
        note: "Imported from the previous JOBS app. The payment method was not recorded."
      });
    }
    if (raw.balancePaid === true && split.balanceCents > 0) {
      payments.push({
        ...payBase,
        id: uid(),
        amountCents: split.balanceCents,
        kind: "final",
        note: "Imported from the previous JOBS app. The payment method was not recorded."
      });
    }
    if ((raw.depositPaid === true || raw.balancePaid === true) && totalCents <= 0) {
      job.notes = [job.notes, "Marked paid in the previous app, but no job total was saved."].filter(Boolean).join("\n");
    }
  }

  const tasks = (data.tasks || []).filter((task) => task && typeof task === "object").map((raw) => {
    const name = str(raw, "customer").trim();
    const matches = name ? customers.filter((c) => normName(c.name) === normName(name)) : [];
    return {
      id: str(raw, "id") || uid(),
      title: str(raw, "task").trim() || "Task",
      customerId: matches.length === 1 ? matches[0].id : "",
      dueDate: str(raw, "dueDate"),
      done: legacyColor(raw.color) === "done",
      notes: str(raw, "notes"),
      createdAt: stamp(str(raw, "dueDate"), fallbackNow),
      updatedAt: fallbackNow
    };
  });

  return { customers, jobs, payments, tasks, estimates: [], invoices: [], slabs: [] };
}
