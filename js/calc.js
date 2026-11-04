import { ageDays, inRange, periodRange, todayISO } from "./format.js";

export function lineTotalCents(line) {
  const qtyMilli = Math.round((Number(line.qty) || 0) * 1000);
  const unit = Number(line.unitPriceCents) || 0;
  return Math.round((qtyMilli * unit) / 1000);
}

export function docTotals(doc) {
  const lines = doc?.lines || [];
  const subtotal = lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
  let discount = 0;
  if (doc?.discountType === "percent") {
    const pct = Number(doc.discountPercent) || 0;
    discount = Math.round((subtotal * pct) / 100);
  } else {
    discount = Math.max(0, Number(doc?.discountCents) || 0);
  }
  if (discount > subtotal) discount = subtotal;
  const afterDiscount = subtotal - discount;
  const tax = Math.round((afterDiscount * (Number(doc?.taxRate) || 0)) / 100);
  const total = afterDiscount + tax;
  const deposit = Math.round((total * (Number(doc?.depositPercent) || 0)) / 100);
  return {
    subtotal,
    discount,
    afterDiscount,
    tax,
    total,
    deposit,
    remainder: total - deposit
  };
}

export function activeInvoices(invoices, jobId) {
  return (invoices || []).filter((inv) => inv.jobId === jobId && inv.status !== "void");
}

export function jobRevenueCents(job, invoices) {
  const list = activeInvoices(invoices, job?.id);
  if (list.length) return list.reduce((sum, inv) => sum + docTotals(inv).total, 0);
  return Number(job?.contractTotalCents) || 0;
}

export function revenueSource(job, invoices) {
  return activeInvoices(invoices, job?.id).length ? "invoice" : "contract";
}

export function paymentsForJob(payments, jobId) {
  return (payments || []).filter((p) => p.jobId === jobId);
}

export function paidCents(payments, jobId) {
  return paymentsForJob(payments, jobId).reduce((sum, p) => sum + (Number(p.amountCents) || 0), 0);
}

export function balanceCents(job, invoices, payments) {
  return jobRevenueCents(job, invoices) - paidCents(payments, job?.id);
}

export function costCents(job) {
  return (Number(job?.materialCostCents) || 0) + (Number(job?.laborCostCents) || 0) + (Number(job?.otherCostCents) || 0);
}

export function profitCents(job, invoices) {
  return jobRevenueCents(job, invoices) - costCents(job);
}

export function marginPercent(job, invoices) {
  const revenue = jobRevenueCents(job, invoices);
  if (revenue <= 0) return null;
  return Math.round((profitCents(job, invoices) * 1000) / revenue) / 10;
}

export function recognitionDate(job) {
  return job?.installDate || job?.legacySalesDate || job?.templateDate || String(job?.createdAt || "").slice(0, 10);
}

export function owedSince(job, invoices) {
  const dates = activeInvoices(invoices, job?.id).map((inv) => inv.issueDate).filter(Boolean).sort();
  return dates[0] || job?.installDate || job?.templateDate || job?.legacySalesDate || String(job?.createdAt || "").slice(0, 10);
}

export function unpaidJobs(jobs, invoices, payments, today = todayISO()) {
  return (jobs || [])
    .map((job) => {
      const balance = balanceCents(job, invoices, payments);
      const since = owedSince(job, invoices);
      return { job, balance, since, age: since ? ageDays(since, today) : 0 };
    })
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.age - a.age || b.balance - a.balance);
}

export function jobsInPeriod(jobs, period, today = todayISO()) {
  const range = periodRange(period, today);
  return (jobs || []).filter((job) => inRange(recognitionDate(job), range.start, range.end));
}

export function periodSummary(jobs, invoices, payments, period, today = todayISO()) {
  const range = periodRange(period, today);
  const included = jobsInPeriod(jobs, period, today);
  let revenue = 0;
  let material = 0;
  let labor = 0;
  let other = 0;
  for (const job of included) {
    revenue += jobRevenueCents(job, invoices);
    material += Number(job.materialCostCents) || 0;
    labor += Number(job.laborCostCents) || 0;
    other += Number(job.otherCostCents) || 0;
  }
  const collected = (payments || [])
    .filter((p) => inRange(p.date, range.start, range.end))
    .reduce((sum, p) => sum + (Number(p.amountCents) || 0), 0);
  const costs = material + labor + other;
  return {
    range,
    jobs: included,
    revenue,
    material,
    labor,
    other,
    costs,
    profit: revenue - costs,
    collected
  };
}

export function invoicePaidCents(invoice, payments) {
  return (payments || [])
    .filter((p) => p.invoiceId === invoice.id)
    .reduce((sum, p) => sum + (Number(p.amountCents) || 0), 0);
}

export function invoiceBalanceCents(invoice, payments) {
  if (!invoice || invoice.status === "void") return 0;
  return docTotals(invoice).total - invoicePaidCents(invoice, payments);
}

export function sqftFromLines(lines) {
  return (lines || [])
    .filter((line) => line.unit === "sqft")
    .reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
}

export function slabSqft(lengthIn, widthIn) {
  const l = Number(lengthIn) || 0;
  const w = Number(widthIn) || 0;
  if (l <= 0 || w <= 0) return 0;
  return Math.round((l * w) / 144 * 100) / 100;
}
