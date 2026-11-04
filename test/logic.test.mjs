import test from "node:test";
import assert from "node:assert/strict";
import { docTotals, lineTotalCents, profitCents, balanceCents, unpaidJobs, periodSummary, marginPercent } from "../js/calc.js";
import { migrateLegacy, isLegacyBundle } from "../js/migrate.js";
import { buildPdf } from "../js/pdf.js";
import { encryptSnapshot, decryptSnapshot } from "../js/backup.js";
import { phoneE164, contactLinks } from "../js/phone.js";
import { searchAll } from "../js/search.js";
import { toCsv } from "../js/csv.js";
import { weekRange, parseDollarsToCents, plural } from "../js/format.js";
import { docNumber } from "../js/model.js";

test("line totals, tax, discount, and deposit use cents", () => {
  const doc = {
    lines: [{ qty: 42.5, unitPriceCents: 7500 }],
    discountType: "percent",
    discountPercent: 10,
    taxRate: 7,
    depositPercent: 50
  };
  assert.equal(lineTotalCents(doc.lines[0]), 318750);
  const totals = docTotals(doc);
  assert.equal(totals.subtotal, 318750);
  assert.equal(totals.discount, 31875);
  assert.equal(totals.tax, 20081);
  assert.equal(totals.total, 306956);
  assert.equal(totals.deposit, 153478);
});

test("profit uses the invoice when one exists, otherwise the contract", () => {
  const job = { id: "j", contractTotalCents: 100000, materialCostCents: 20000, laborCostCents: 10000, otherCostCents: 5000 };
  assert.equal(profitCents(job, []), 65000);
  const invoices = [{ jobId: "j", status: "open", lines: [{ qty: 1, unitPriceCents: 200000 }], discountType: "amount", discountCents: 0, taxRate: 0, depositPercent: 0 }];
  assert.equal(profitCents(job, invoices), 165000);
  const voided = [{ ...invoices[0], status: "void" }];
  assert.equal(profitCents(job, voided), 65000);
  assert.equal(balanceCents(job, [], [{ jobId: "j", amountCents: 25000 }]), 75000);
  assert.equal(marginPercent(job, []), 65);
});

test("unpaid balances sort oldest first", () => {
  const jobs = [
    { id: "new", contractTotalCents: 5000, createdAt: "2026-11-01T00:00:00.000Z" },
    { id: "old", contractTotalCents: 8000, installDate: "2026-09-01" }
  ];
  const rows = unpaidJobs(jobs, [], [], "2026-11-04");
  assert.equal(rows[0].job.id, "old");
  assert.equal(rows[0].age, 64);
  assert.equal(rows[1].job.id, "new");
});

test("week and month profit follow install date, collected follows payment date", () => {
  const jobs = [
    { id: "a", installDate: "2026-11-03", contractTotalCents: 10000, materialCostCents: 4000, laborCostCents: 0, otherCostCents: 0 },
    { id: "b", installDate: "2026-10-02", contractTotalCents: 5000, materialCostCents: 0, laborCostCents: 0, otherCostCents: 0 }
  ];
  const payments = [{ date: "2026-11-04", amountCents: 3000, jobId: "a" }];
  const summary = periodSummary(jobs, [], payments, "week", "2026-11-04");
  assert.deepEqual(weekRange("2026-11-04"), { start: "2026-11-01", end: "2026-11-07" });
  assert.equal(summary.jobs.length, 1);
  assert.equal(summary.profit, 6000);
  assert.equal(summary.collected, 3000);
});

test("legacy jobs become one customer with real payments", () => {
  const legacy = {
    version: 1,
    jobs: [
      {
        id: "j1", customer: "Maria Alvarez", address: "100 Ocean Dr", phone: "(305) 555-0100", email: "maria@example.com",
        sinks: "1 undermount", material: "Quartz", totalSqft: "42.5", materialCost: "1600", totalAmount: "4000",
        depositPaid: true, balancePaid: false, templateDate: "2026-10-01", installDate: "2026-10-08",
        statusText: "Waiting on sink", color: "prog", notes: "Dog in the yard", completed: false, salesDate: ""
      },
      {
        id: "j2", customer: "Maria Alvarez", address: "200 Biscayne", phone: "3055550100", email: "",
        sinks: "", material: "Granite", totalSqft: "10", materialCost: "400", totalAmount: "1000",
        depositPaid: true, balancePaid: true, templateDate: "", installDate: "",
        statusText: "", color: "done", notes: "", completed: true, salesDate: "2026-10-15"
      },
      {
        id: "j3", customer: "Maria Alvarez", address: "9 Other St", phone: "7865550199", email: "other@example.com",
        totalAmount: "", depositPaid: false, balancePaid: false, color: "", completed: false
      }
    ],
    tasks: [{ id: "t1", task: "Order sink", customer: "Maria Alvarez", dueDate: "2026-10-02", color: "", notes: "" }]
  };
  assert.equal(isLegacyBundle(legacy), true);
  assert.equal(isLegacyBundle({ schemaVersion: 2, customers: [] }), false);
  const result = migrateLegacy(legacy, { today: "2026-11-04", now: "2026-11-04T15:00:00.000Z" });
  assert.equal(result.customers.length, 2);
  assert.equal(result.jobs.length, 3);
  const first = result.jobs.find((job) => job.id === "j1");
  assert.equal(first.stage, "fabrication");
  assert.equal(first.sqft, 42.5);
  assert.equal(first.materialCostCents, 160000);
  assert.equal(first.contractTotalCents, 400000);
  assert.equal(first.legacyStatus, "Waiting on sink");
  assert.equal(first.sinkType, "1 undermount");
  const deposit = result.payments.find((payment) => payment.jobId === "j1");
  assert.equal(deposit.amountCents, 300000);
  assert.equal(deposit.kind, "deposit");
  assert.equal(deposit.method, "other");
  const paid = result.payments.filter((payment) => payment.jobId === "j2");
  assert.equal(paid.reduce((sum, payment) => sum + payment.amountCents, 0), 100000);
  assert.equal(result.jobs.find((job) => job.id === "j2").stage, "paid");
  assert.equal(result.tasks[0].customerId, "");
  assert.equal(result.jobs.filter((job) => job.customerId === result.customers[0].id).length >= 1, true);
});

test("pdf is a real file and backup encryption round-trips", async () => {
  const bytes = buildPdf({
    kind: "Estimate",
    number: "EST-1001",
    issueDate: "Nov 4, 2026",
    businessName: "Stone Co",
    businessMeta: "Miami, FL",
    customerName: "Maria Alvarez",
    customerMeta: "100 Ocean Dr",
    lines: [{ description: "Quartz", qty: "42.5 sq ft", price: "$75.00", amount: "$3,187.50" }],
    totals: [{ label: "Total", value: "$3,187.50", strong: true }],
    notes: "Thank you"
  });
  const text = new TextDecoder("latin1").decode(bytes);
  assert.equal(text.startsWith("%PDF-1.4"), true);
  assert.equal(text.includes("Maria Alvarez"), true);
  assert.equal(text.includes("%%EOF"), true);
  const snapshot = { schemaVersion: 2, customers: [{ name: "Maria" }], jobs: [] };
  const wrapped = await encryptSnapshot(snapshot, "stone");
  assert.equal(wrapped.encrypted, true);
  assert.equal(JSON.stringify(wrapped).includes("Maria"), false);
  const opened = await decryptSnapshot(wrapped, "stone");
  assert.equal(opened.customers[0].name, "Maria");
  await assert.rejects(() => decryptSnapshot(wrapped, "wrong"), /passphrase/);
});

test("phone, search, csv, and labels", () => {
  assert.equal(phoneE164("(305) 555-0100"), "+13055550100");
  const links = contactLinks({ phone: "3055550100", email: "a@b.co", address: "1 Main" });
  assert.equal(links.tel, "tel:+13055550100");
  assert.equal(links.sms, "sms:+13055550100");
  assert.equal(links.mail.startsWith("mailto:a@b.co"), true);
  assert.equal(links.map.includes("1%20Main") || links.map.includes("1+Main"), true);
  const found = searchAll({
    customers: [{ id: "c", name: "Maria Alvarez", phone: "305", email: "", address: "", notes: "" }],
    jobs: [{ id: "j", customerId: "c", title: "Kitchen", material: "Quartz", siteAddress: "", stoneColor: "", edgeProfile: "", sinkType: "", backsplash: "", notes: "", legacyStatus: "" }],
    estimates: [], invoices: [], slabs: [{ id: "s", material: "Quartz", stoneColor: "Calacatta", location: "", kind: "slab", notes: "", status: "available" }], tasks: []
  }, "calacatta");
  assert.equal(found.slabs.length, 1);
  assert.equal(found.jobs.length, 0);
  assert.equal(toCsv([["Name", "Note"], ["Maria", 'Says "hi", then leaves']]), 'Name,Note\r\nMaria,"Says ""hi"", then leaves"');
  assert.equal(docNumber("invoice", 1001), "INV-1001");
  assert.equal(plural(1, "job", "jobs"), "1 job");
  assert.equal(parseDollarsToCents("1,250.50"), 125050);
  assert.equal(parseDollarsToCents("12.5"), 1250);
  assert.equal(parseDollarsToCents("12.555"), null);
});

test("view modules load", async () => {
  await import("../js/views/home.js");
  await import("../js/views/jobs.js");
  await import("../js/views/customers.js");
  await import("../js/views/docs.js");
  await import("../js/views/calendar.js");
  await import("../js/views/money.js");
  await import("../js/views/inventory.js");
  await import("../js/views/more.js");
});
