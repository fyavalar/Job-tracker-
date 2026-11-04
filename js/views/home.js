import { state, customerById } from "../state.js";
import { dismissTips } from "../actions.js";
import { contactLinks } from "../phone.js";
import { badge, contactActions, empty } from "../components.js";
import { icon } from "../icons.js";
import { esc, greeting, money, niceDate, plural, todayISO } from "../format.js";
import { periodSummary, unpaidJobs } from "../calc.js";
import { STAGES, jobTitle } from "../model.js";
import { render, toast } from "../nav.js";

export const root = true;

export function title() {
  return state.business.name || "JOBS";
}

function dayCards(today) {
  const cards = [];
  for (const job of state.jobs) {
    const customer = customerById(job.customerId);
    const labels = [];
    if (job.templateDate === today) labels.push("Template");
    if (job.installDate === today) labels.push("Install");
    if (!labels.length) continue;
    const address = job.siteAddress || customer?.address || "";
    const links = contactLinks({ phone: customer?.phone, email: customer?.email, address });
    cards.push(`<article class="card">
      <a class="card-main" href="#/jobs/${esc(job.id)}">
        <div class="kicker">${esc(labels.join(" and "))} today</div>
        <strong>${esc(customer?.name || "Customer")}</strong>
        <div class="meta">${esc(jobTitle(job))}${address ? " · " + esc(address) : ""}</div>
      </a>
      ${contactActions(links)}
    </article>`);
  }
  return cards;
}

function lateItems(today) {
  const rows = [];
  for (const job of state.jobs) {
    if (job.stage === "installed" || job.stage === "paid") continue;
    const customer = customerById(job.customerId);
    if (job.installDate && job.installDate < today) {
      rows.push({ job, customer, label: "Past install date", date: job.installDate });
    } else if (job.templateDate && job.templateDate < today && ["lead", "quoted", "approved"].includes(job.stage)) {
      rows.push({ job, customer, label: "Past template date", date: job.templateDate });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
}

export function html() {
  const today = todayISO();
  const summary = periodSummary(state.jobs, state.invoices, state.payments, "month", today);
  const owed = unpaidJobs(state.jobs, state.invoices, state.payments, today);
  const owedTotal = owed.reduce((sum, row) => sum + row.balance, 0);
  const counts = Object.fromEntries(STAGES.map((stage) => [stage.id, state.jobs.filter((job) => job.stage === stage.id).length]));
  const todayCards = dayCards(today);
  const late = lateItems(today);
  const banner = !state.business.tipsDismissed && !state.business.name
    ? `<div class="banner"><p>Add your business name in Settings before you send a quote. Your records stay on this phone.</p><button type="button" class="btn" data-act="dismiss">Got it</button></div>`
    : "";
  const storage = state.storage === "local"
    ? `<div class="banner"><p>This browser blocked its database, so records are in a fallback store. Export a backup from Settings.</p></div>`
    : "";
  return `${banner}${storage}
    <p class="lede">${esc(greeting())}</p>
    <p class="date-line">${esc(niceDate(today, { weekday: true, year: true }))}</p>
    <h2>Today</h2>
    ${todayCards.length ? todayCards.join("") : `<p class="meta">Nothing to template or install today.</p>`}
    ${late.length ? `<h2>Needs a look</h2>${late.map((row) => `<a class="card card-link" href="#/jobs/${esc(row.job.id)}"><div class="kicker">${esc(row.label)}</div><strong>${esc(row.customer?.name || "Customer")}</strong><div class="meta">${esc(niceDate(row.date, { weekday: true }))} · ${esc(jobTitle(row.job))}</div></a>`).join("")}` : ""}
    <h2>This month</h2>
    <div class="stats">
      <a class="stat" href="#/reports"><span>Profit</span><b class="${summary.profit < 0 ? "neg" : ""}">${esc(money(summary.profit))}</b></a>
      <a class="stat" href="#/money"><span>Still owed</span><b class="${owedTotal > 0 ? "neg" : ""}">${esc(money(owedTotal))}</b></a>
    </div>
    <p class="meta">Profit uses the install date. Collected cash is on Money.</p>
    <h2>Stages</h2>
    <div class="pipeline">${STAGES.map((stage) => `<a href="#/jobs?stage=${stage.id}"><b>${counts[stage.id]}</b><span>${esc(stage.label)}</span></a>`).join("")}</div>
    <h2>Unpaid</h2>
    ${owed.length ? owed.slice(0, 5).map((row) => {
      const customer = customerById(row.job.customerId);
      return `<a class="card card-link" href="#/jobs/${esc(row.job.id)}"><div class="card-top"><strong>${esc(customer?.name || "Customer")}</strong><b>${esc(money(row.balance))}</b></div><div class="meta">${esc(row.since > todayISO() ? "Install " + niceDate(row.since, { weekday: true }) : row.age ? plural(row.age, "day", "days") + " old" : "Today")} · ${esc(jobTitle(row.job))}</div></a>`;
    }).join("") + (owed.length > 5 ? `<a class="text-link" href="#/money">All ${owed.length} unpaid</a>` : "") : empty("Nobody owes you right now", "Balances show up here after a job has a price and a payment still open.")}
    <div class="btn-col">
      <a class="btn primary" href="#/customers/new">${icon("plus")} New customer</a>
      <a class="btn" href="#/jobs/new">${icon("jobs")} New job</a>
      <a class="btn" href="#/estimates/new">${icon("doc")} New estimate</a>
    </div>`;
}

export async function onClick(act) {
  if (act === "dismiss") {
    const result = await dismissTips();
    if (!result.ok) toast(result.error);
    render();
  }
}
