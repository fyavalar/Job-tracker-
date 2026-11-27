import { docNumber, jobTitle } from "./model.js";
import { normName, foldText, digits } from "./format.js";

let qDigits = "";

// Accent-insensitive text match, plus phone numbers match whatever punctuation was typed.
function hit(parts, q) {
  const text = parts.filter(Boolean).join(" ");
  if (foldText(text).includes(q)) return true;
  return qDigits.length >= 3 && digits(text).includes(qDigits);
}

export function searchAll(state, query) {
  const q = foldText(String(query || "").trim()).replace(/\s+/g, " ");
  qDigits = /^[\d\s().+-]+$/.test(String(query || "").trim()) ? digits(query) : "";
  const empty = { customers: [], jobs: [], estimates: [], invoices: [], slabs: [], tasks: [] };
  if (!q) return empty;
  const customerName = (id) => state.customers.find((c) => c.id === id)?.name || "";
  empty.customers = state.customers.filter((c) => hit([c.name, c.phone, c.email, c.address, c.notes], q));
  empty.jobs = state.jobs.filter((job) =>
    hit(
      [customerName(job.customerId), jobTitle(job), job.siteAddress, job.material, job.stoneColor, job.edgeProfile, job.sinkType, job.backsplash, job.notes, job.legacyStatus],
      q
    )
  );
  empty.estimates = state.estimates.filter((doc) =>
    hit([docNumber("estimate", doc.number), customerName(doc.customerId), doc.notes, ...(doc.lines || []).map((l) => l.description)], q)
  );
  empty.invoices = state.invoices.filter((doc) =>
    hit([docNumber("invoice", doc.number), customerName(doc.customerId), doc.notes, ...(doc.lines || []).map((l) => l.description)], q)
  );
  empty.slabs = state.slabs.filter((slab) => hit([slab.material, slab.stoneColor, slab.location, slab.kind, slab.notes, slab.status], q));
  empty.tasks = state.tasks.filter((task) => hit([task.title, task.notes, customerName(task.customerId)], q));
  return empty;
}

export function customerMatches(customers, name) {
  const wanted = normName(name);
  if (!wanted) return [];
  return customers.filter((c) => normName(c.name) === wanted);
}
