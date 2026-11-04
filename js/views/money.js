import { state, customerById, jobById } from "../state.js";
import { esc, money as formatMoney, niceDate, periodLabel, plural, todayISO } from "../format.js";
import { periodSummary, unpaidJobs, profitCents, jobRevenueCents, balanceCents } from "../calc.js";
import { jobTitle, methodLabel, kindLabel } from "../model.js";
import { render } from "../nav.js";
import { empty } from "../components.js";

let moneyPeriod = "month";
let reportPeriod = "month";

function owedLabel(row, today) {
  if (!row.since) return "No date";
  if (row.since > today) return "Install " + niceDate(row.since, { weekday: true });
  if (row.age === 0) return "Today";
  return plural(row.age, "day", "days");
}

function periodButtons(current, act) {
  return `<div class="seg">${["week", "month", "year"].map((period) => `<button type="button" class="${current === period ? "is-on" : ""}" data-act="${act}" data-period="${period}">${period[0].toUpperCase() + period.slice(1)}</button>`).join("")}</div>`;
}

export const money = {
  root: true,
  title: () => "Money",
  html() {
    const today = todayISO();
    const summary = periodSummary(state.jobs, state.invoices, state.payments, moneyPeriod, today);
    const owed = unpaidJobs(state.jobs, state.invoices, state.payments, today);
    const owedTotal = owed.reduce((sum, row) => sum + row.balance, 0);
    const recent = state.payments.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);
    return `${periodButtons(moneyPeriod, "period")}
      <p class="meta">${esc(periodLabel(moneyPeriod, today))}. Profit is counted on the install date. Collected is money received in this period.</p>
      <div class="stats">
        <div class="stat"><span>Profit</span><b class="${summary.profit < 0 ? "neg" : ""}">${esc(formatMoney(summary.profit))}</b></div>
        <div class="stat"><span>Collected</span><b>${esc(formatMoney(summary.collected))}</b></div>
      </div>
      <div class="stat wide"><span>Still owed, all open jobs</span><b class="${owedTotal > 0 ? "neg" : ""}">${esc(formatMoney(owedTotal))}</b><small>${esc(plural(owed.length, "job", "jobs"))}</small></div>
      <h2>Unpaid, oldest first</h2>
      ${owed.length ? owed.map((row) => {
        const customer = customerById(row.job.customerId);
        return `<a class="card card-link" href="#/jobs/${esc(row.job.id)}"><div class="card-top"><strong>${esc(customer?.name || "Customer")}</strong><b>${esc(formatMoney(row.balance))}</b></div><div class="meta">${esc(owedLabel(row, today))} · ${esc(jobTitle(row.job))}</div></a>`;
      }).join("") : empty("No unpaid balances", "When a job has a price and payments don't cover it, it shows here.")}
      <h2>Recent payments</h2>
      ${recent.length ? recent.map((payment) => {
        const job = jobById(payment.jobId);
        return `<a class="pay-row" href="#/jobs/${esc(payment.jobId)}/pay/${esc(payment.id)}"><span><b>${esc(formatMoney(payment.amountCents))}</b><small>${esc(customerById(payment.customerId)?.name || "Customer")} · ${esc(niceDate(payment.date, { year: true }))} · ${esc(methodLabel(payment.method))} · ${esc(kindLabel(payment.kind))}</small></span></a>`;
      }).join("") : `<p class="meta">No payments recorded.</p>`}
      <div class="btn-col"><a class="btn" href="#/reports">Full report</a><a class="btn" href="#/invoices">Invoices</a></div>`;
  },
  onClick(act, el) {
    if (act === "period") {
      moneyPeriod = el.dataset.period;
      render();
    }
  }
};

export const reports = {
  title: () => "Reports",
  back: () => "#/money",
  html() {
    const today = todayISO();
    const periods = ["week", "month", "year", "all"];
    const summary = periodSummary(state.jobs, state.invoices, state.payments, reportPeriod, today);
    const rows = summary.jobs
      .slice()
      .sort((a, b) => String(b.installDate || b.createdAt).localeCompare(String(a.installDate || a.createdAt)))
      .map((job) => {
        const profit = profitCents(job, state.invoices);
        return `<a class="card card-link" href="#/jobs/${esc(job.id)}"><div class="card-top"><strong>${esc(customerById(job.customerId)?.name || "Customer")}</strong><b class="${profit < 0 ? "neg" : ""}">${esc(formatMoney(profit))}</b></div><div class="meta">${esc(jobTitle(job))} · Total ${esc(formatMoney(jobRevenueCents(job, state.invoices)))} · Due ${esc(formatMoney(balanceCents(job, state.invoices, state.payments)))}</div></a>`;
      })
      .join("");
    return `<div class="seg">${periods.map((period) => `<button type="button" class="${reportPeriod === period ? "is-on" : ""}" data-act="period" data-period="${period}">${period === "all" ? "All" : period[0].toUpperCase() + period.slice(1)}</button>`).join("")}</div>
      <p class="meta">${esc(periodLabel(reportPeriod, today))}. A job counts in the period of its install date, or the old sales date if it was imported without one.</p>
      <div class="sums">
        <div><span>Job total</span><b>${esc(formatMoney(summary.revenue))}</b></div>
        <div><span>Material</span><b>${esc(formatMoney(summary.material))}</b></div>
        <div><span>Labor</span><b>${esc(formatMoney(summary.labor))}</b></div>
        <div><span>Other costs</span><b>${esc(formatMoney(summary.other))}</b></div>
        <div class="grand ${summary.profit < 0 ? "neg" : ""}"><span>Profit</span><b>${esc(formatMoney(summary.profit))}</b></div>
        <div><span>Collected in this period</span><b>${esc(formatMoney(summary.collected))}</b></div>
      </div>
      <h2>${esc(plural(summary.jobs.length, "job", "jobs"))}</h2>
      ${rows || `<p class="meta">No jobs in this period.</p>`}
      <p class="meta">Invoice totals are the job price once an invoice exists. Void invoices are left out.</p>`;
  },
  onClick(act, el) {
    if (act === "period") {
      reportPeriod = el.dataset.period;
      render();
    }
  }
};

