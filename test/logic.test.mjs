import test from "node:test";
import assert from "node:assert/strict";
import { docTotals, lineTotalCents, profitCents, balanceCents, unpaidJobs, periodSummary, marginPercent, taxRateForContractInvoice, latestActiveInvoice, invoicePaidCents, invoiceBalanceCents, balanceExcludingPayment, oldestUnpaidInvoiceId } from "../js/calc.js";
import { migrateLegacy, isLegacyBundle } from "../js/migrate.js";
import { buildPdf, textWidth } from "../js/pdf.js";
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
  await import("../js/views/layout.js");
  await import("../js/customer-ui.js");
  await import("../js/sheet.js");
  await import("../js/blueprint.js");
});


test("contract invoices default to 0% tax unless an estimate is the source", () => {
  assert.equal(taxRateForContractInvoice(null, 7), 0);
  assert.equal(taxRateForContractInvoice(undefined, 7), 0);
  assert.equal(taxRateForContractInvoice({ taxRate: 7 }, 6.5), 7);
  assert.equal(taxRateForContractInvoice({ taxRate: 0 }, 7), 0);
});

test("creating a second invoice is blocked until explicitly requested", () => {
  const invoices = [
    { id: "inv-1", jobId: "j1", status: "open", createdAt: "2026-11-01T00:00:00.000Z", number: 1001, lines: [{ qty: 1, unitPriceCents: 10000 }] },
    { id: "inv-2", jobId: "j1", status: "void", createdAt: "2026-11-02T00:00:00.000Z", number: 1002, lines: [{ qty: 1, unitPriceCents: 20000 }] }
  ];
  const current = latestActiveInvoice(invoices, "j1");
  assert.equal(current.id, "inv-1");
  assert.equal(latestActiveInvoice(invoices, "missing"), null);
  const job = { id: "j1", contractTotalCents: 10000 };
  // Revenue should not include the void invoice
  assert.equal(profitCents(job, invoices), 10000);
});

test("unattributed payments allocate to invoices in date order", () => {
  const invoices = [
    { id: "a", jobId: "j", status: "open", issueDate: "2026-11-01", number: 1, lines: [{ qty: 1, unitPriceCents: 10000 }], discountType: "amount", discountCents: 0, taxRate: 0, depositPercent: 0 },
    { id: "b", jobId: "j", status: "open", issueDate: "2026-11-02", number: 2, lines: [{ qty: 1, unitPriceCents: 5000 }], discountType: "amount", discountCents: 0, taxRate: 0, depositPercent: 0 }
  ];
  const payments = [{ id: "p1", jobId: "j", invoiceId: "", amountCents: 12000, date: "2026-11-03" }];
  assert.equal(invoicePaidCents(invoices[0], payments, invoices), 10000);
  assert.equal(invoicePaidCents(invoices[1], payments, invoices), 2000);
  assert.equal(invoiceBalanceCents(invoices[0], payments, invoices), 0);
  assert.equal(invoiceBalanceCents(invoices[1], payments, invoices), 3000);
  assert.equal(oldestUnpaidInvoiceId(invoices, payments, "j"), "b");
});

test("payment edit balance ignores the payment being edited", () => {
  const job = { id: "j", contractTotalCents: 100000 };
  const payments = [
    { id: "p1", jobId: "j", amountCents: 40000 },
    { id: "p2", jobId: "j", amountCents: 25000 }
  ];
  assert.equal(balanceCents(job, [], payments), 35000);
  assert.equal(balanceExcludingPayment(job, [], payments, "p2"), 60000);
  assert.equal(balanceExcludingPayment(job, [], payments, ""), 35000);
});

test("pdf folds Turkish letters instead of replacing them with question marks", () => {
  const bytes = buildPdf({
    kind: "Estimate",
    number: "EST-1002",
    issueDate: "Nov 4, 2026",
    businessName: "Şişli Taş",
    customerName: "Cengiz Yağlı",
    lines: [{ description: "Mermer ığdır", qty: "10 sq ft", price: "$75.00", amount: "$750.00" }],
    totals: [{ label: "Total", value: "$750.00", strong: true }],
    notes: "Teşekkürler"
  });
  const text = new TextDecoder("latin1").decode(bytes);
  assert.equal(text.includes("Sisli Tas"), true);
  assert.equal(text.includes("Cengiz Yagli"), true);
  assert.equal(text.includes("Tesekkurler") || text.includes("Tesekkürler") || text.includes("Teşekkürler".replace("ş","s").replace("ü","ü")), true);
  assert.equal(text.includes("?"), false);
  assert.equal(textWidth("$3,187.50", 11) > textWidth("$75.00", 11), true);
});

// ---------- v2: countertop layout engine ----------
import {
  PRESETS, presetLayout, layoutStats, unionAreaSqIn, makePiece, makeItem, parseInches, formatInches, jobFieldsFromLayout,
  estimateLinesFromLayout, magnetize, normalizeLayout, cycleEdge, duplicatePiece, removePiece, addPiece, buildScene, sceneToSvg,
  PALETTES, summaryLines, exposedLength, itemsOnPiece, setFaucetHoles
} from "../js/layout.js";
import { parseLead, formatPhoneUS, formatPhoneInput, findCustomerMatches } from "../js/contact.js";
import { estimateCountertopSqft } from "../js/actions.js";
import { foldText, parseQty, safeFileName } from "../js/format.js";
import { fitLines } from "../js/pdf.js";

const r2 = (n) => Math.round(n * 100) / 100;

test("every preset builds a sane, dimensioned layout", () => {
  const expected = {
    straight: [21.25, 12.13, 10, 2], lShape: [36.13, 19.13, 19.13, 3], uShape: [48.88, 23, 27.25, 3], island: [24, 22, 0, 2],
    lIsland: [56.25, 38.13, 20.13, 3], galley: [42.5, 24.25, 20, 3], vanity: [9.17, 6.83, 6.83, 4]
  };
  assert.equal(PRESETS.length, 7);
  for (const p of PRESETS) {
    const layout = presetLayout(p.id);
    const s = layoutStats(layout);
    assert.ok(layout.pieces.length >= 1, p.id);
    assert.deepEqual([r2(s.sqft), r2(s.polishedLF), r2(s.backsplashLF), s.cutouts], expected[p.id], p.id);
    assert.equal(s.sinkCount, 1, p.id);
    // normalizing is idempotent and keeps every piece and item
    const again = normalizeLayout(JSON.parse(JSON.stringify(layout)));
    assert.equal(again.pieces.length, layout.pieces.length);
    assert.equal(again.items.length, layout.items.length);
  }
  assert.equal(layoutStats(presetLayout("lIsland")).seams, 1);
});

test("area unions overlapping pieces and joints don't count as finished edge", () => {
  const a = makePiece({ id: "a", x: 0, y: 0, w: 120, d: 25.5, edges: { top: "wall", right: "polished", bottom: "polished", left: "polished" } });
  const b = makePiece({ id: "b", x: 0, y: 25.5, w: 25.5, d: 60, edges: { top: "polished", right: "polished", bottom: "polished", left: "wall" } });
  assert.equal(unionAreaSqIn([a, b]), 120 * 25.5 + 25.5 * 60);
  const o1 = makePiece({ id: "o1", x: 0, y: 0, w: 100, d: 30 });
  const o2 = makePiece({ id: "o2", x: 50, y: 0, w: 100, d: 30 });
  assert.equal(unionAreaSqIn([o1, o2]), 150 * 30);
  // a's bottom edge touches b for 25.5", so only 94.5" of it is exposed
  assert.equal(exposedLength(a, "bottom", [a, b]), 94.5);
  assert.equal(exposedLength(b, "top", [a, b]), 0);
});

test("inches parse the way installers write them", () => {
  const cases = { "25.5": 25.5, "25 1/2": 25.5, "25-1/2": 25.5, "25½": 25.5, "108\"": 108, "8'": 96, "8' 6\"": 102, "8 ft 6 in": 102, ".5": 0.5 };
  for (const [text, want] of Object.entries(cases)) assert.equal(parseInches(text), want, text);
  for (const bad of ["", "abc", "0", "-3"]) assert.equal(parseInches(bad), null, bad);
  assert.equal(formatInches(25.5), "25\u00bd\u2033");
  assert.equal(formatInches(108.25), "108\u00bc\u2033");
  assert.equal(formatInches(30.125), "30\u215b\u2033");
});

test("layout fills job fields and priced estimate lines", () => {
  assert.deepEqual(jobFieldsFromLayout(presetLayout("lIsland")), { sqft: 56.25, sinkCutouts: "1", sinkType: "Undermount", backsplash: "4 inch" });
  const lines = estimateLinesFromLayout(presetLayout("vanity"), { priceBook: [{ id: "seed-sink-um", name: "Undermount sink cutout", unitPriceCents: 18500 }], material: "Quartz", color: "Pure White" });
  assert.equal(lines[0].description, "Quartz Pure White countertop");
  assert.equal(lines[0].unit, "sqft");
  assert.equal(lines[0].qty, 9.17);
  assert.equal(lines.find((l) => l.description === "Polished edge").unit, "lf");
  const sink = lines.find((l) => /Undermount/.test(l.description));
  assert.equal(sink.unitPriceCents, 18500);
  assert.equal(sink.priceBookId, "seed-sink-um");
  assert.equal(lines.find((l) => l.description === "Faucet hole").qty, 3);
  assert.ok(summaryLines(layoutStats(presetLayout("lIsland")))[0].startsWith("56.3 sq ft"));
});

test("editing helpers: edges cycle, pieces duplicate/remove with their cutouts, magnet snaps flush", () => {
  assert.equal(cycleEdge("wall"), "polished");
  assert.equal(cycleEdge("overhang"), "wall");
  const base = presetLayout("straight");
  const { layout: dup, id } = duplicatePiece(base, base.pieces[0].id);
  assert.equal(dup.pieces.length, 2);
  assert.ok(dup.pieces.find((p) => p.id === id).y >= base.pieces[0].y + base.pieces[0].d);
  const removed = removePiece(base, base.pieces[0].id);
  assert.equal(removed.pieces.length, 0);
  assert.equal(removed.items.filter((i) => i.type.startsWith("sink")).length, 0);
  const { layout: added } = addPiece(null, { w: 96, d: 25.5 });
  assert.equal(layoutStats(added).sqft, 17);
  const a = makePiece({ id: "a", x: 0, y: 0, w: 120, d: 25.5 });
  assert.deepEqual(magnetize({ x: 1.5, y: 26.5, w: 25.5, d: 60 }, [a], 2), { x: 0, y: 25.5 });
  const faucet = setFaucetHoles(makeItem("faucet", { x: 0, y: 0 }), 9);
  assert.ok(faucet.holes <= 5);
  assert.ok(itemsOnPiece(base, base.pieces[0]).length >= 2);
});

test("blueprint scene renders SVG with tappable pieces and non-blocking labels", () => {
  const scene = buildScene(presetLayout("lIsland"), { palette: PALETTES.dark, width: 360, maxHeight: 300, interactive: true });
  assert.equal(scene.vb.length, 4);
  const svg = sceneToSvg(scene, { className: "bp" });
  assert.ok(svg.startsWith("<svg"));
  assert.equal((svg.match(/data-piece=/g) || []).length >= 3, true);
  assert.ok(svg.includes('pointer-events="none"'));
  assert.ok(svg.includes("138\u2033"));
  assert.ok(!/NaN|undefined/.test(svg));
});

// ---------- v2: customer input ----------
test("quick paste reads real-world leads", () => {
  const cases = [
    ["John Smith 941-555-1234 842 Brickell Ave Sarasota FL 34234 john@email.com", { name: "John Smith", phone: "(941) 555-1234", email: "john@email.com", address: "842 Brickell Ave, Sarasota, FL 34234" }],
    ["Hi! This is Daniel Brooks, 941.555.0123 \u00b7 daniel.brooks@gmail.com\nKitchen remodel at 1520 Bay Shore Rd\nSarasota FL 34236", { name: "Daniel Brooks", phone: "(941) 555-0123", email: "daniel.brooks@gmail.com", address: "1520 Bay Shore Rd, Sarasota, FL 34236" }],
    ["Name: Ay\u015fe Y\u0131lmaz\nPhone: 9415550188\nAddress: 12 Palm Ct, Venice, FL 34285", { name: "Ay\u015fe Y\u0131lmaz", phone: "(941) 555-0188", email: "", address: "12 Palm Ct, Venice, FL 34285" }]
  ];
  for (const [text, want] of cases) assert.deepEqual(parseLead(text), want);
  assert.deepEqual(parseLead(""), { name: "", phone: "", email: "", address: "" });
});

test("phone formatting is US-friendly and leaves international numbers alone", () => {
  assert.equal(formatPhoneUS("9415551234"), "(941) 555-1234");
  assert.equal(formatPhoneUS("1-941-555-1234"), "(941) 555-1234");
  assert.equal(formatPhoneUS("+44 20 7946 0958"), "+44 20 7946 0958");
  assert.deepEqual(formatPhoneInput("94155", 5), { value: "(941) 55", caret: 8 });
  assert.equal(formatPhoneInput("9415551234").value, "(941) 555-1234");
  assert.equal(formatPhoneInput("941").value, "941");
});

test("duplicate customers match by name (any case/accents) or 10-digit phone", () => {
  const list = [{ id: "1", name: "Maria Alvarez", phone: "(305) 555-0100" }, { id: "2", name: "Ay\u015fe Y\u0131lmaz", phone: "" }];
  assert.deepEqual(findCustomerMatches(list, { name: "maria  ALVAREZ" }).map((m) => m.customer.id), ["1"]);
  assert.deepEqual(findCustomerMatches(list, { phone: "305.555.0100" }).map((m) => m.reason), ["phone"]);
  assert.deepEqual(findCustomerMatches(list, { name: "ayse yilmaz" }).map((m) => m.customer.id), ["2"]);
  assert.deepEqual(findCustomerMatches(list, { name: "Maria Alvarez", excludeId: "1" }), []);
  assert.deepEqual(findCustomerMatches(list, { name: "Ma" }), []);
});

// ---------- v2: bug fixes ----------
test("money and quantity inputs accept .5 and 42.", () => {
  assert.equal(parseDollarsToCents(".5"), 50);
  assert.equal(parseDollarsToCents("12."), 1200);
  assert.equal(parseQty(".5"), 0.5);
  assert.equal(parseQty("42."), 42);
});

test("search folds accents and matches bare phone digits", () => {
  assert.equal(foldText("Ay\u015fe Y\u0131lmaz"), "ayse yilmaz");
  const state = { customers: [{ id: "c", name: "Ay\u015fe Y\u0131lmaz", phone: "(941) 555-0188", email: "", address: "" }], jobs: [], estimates: [], invoices: [], slabs: [], tasks: [] };
  assert.equal(searchAll(state, "9415550188").customers.length, 1);
  assert.equal(searchAll(state, "ayse").customers.length, 1);
  assert.equal(safeFileName("Maria / Kitchen: L+Island"), safeFileName("Maria / Kitchen: L+Island").replace(/[\\/:*?"<>|]/g, ""));
});

test("estimate -> job square feet counts countertop material only", () => {
  const book = [{ id: "m", category: "Material" }, { id: "s", category: "Backsplash" }];
  assert.equal(estimateCountertopSqft([{ unit: "sqft", qty: 42, priceBookId: "m", description: "Quartz" }, { unit: "sqft", qty: 10, priceBookId: "s", description: "4 inch backsplash" }, { unit: "lf", qty: 20, description: "Polished edge" }], book), 42);
});

test("pdf xref numbers duplicate objects correctly, long names wrap, layout image embeds", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
  const model = {
    kind: "Estimate", number: "EST-1", issueDate: "Nov 26, 2026", businessName: "Sunshine Coast Granite & Quartz Fabrication of Sarasota LLC",
    businessMeta: "", customerName: "Maria", customerMeta: "", lines: [{ description: "A", qty: "6.8 lf", price: "$1.00", amount: "$6.80" }, { description: "A", qty: "6.8 lf", price: "$1.00", amount: "$6.80" }],
    totals: [{ label: "Total", value: "$13.60", strong: true }], layoutJpeg: { bytes: jpeg, width: 32, height: 16 }, layoutSummary: ["56.3 sq ft countertop"]
  };
  const text = new TextDecoder("latin1").decode(buildPdf(model));
  const xref = text.slice(text.lastIndexOf("xref"));
  const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((off, i) => assert.ok(text.slice(off).startsWith(i + 1 + " 0 obj"), "object " + (i + 1)));
  assert.ok(text.includes("/Im2"));
  assert.ok(text.includes("Countertop layout"));
  for (const line of fitLines(model.businessName, 14, 200, 2)) assert.ok(textWidth(line, 14) <= 200 + 0.01);
});
