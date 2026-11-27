import { state, customerById } from "../state.js";
import { esc, money as formatMoney, niceDate, periodLabel, plural, todayISO } from "../format.js";
import { periodSummary, unpaidJobs, profitCents, jobRevenueCents, balanceCents } from "../calc.js";
import { jobTitle, methodLabel, kindLabel } from "../model.js";
import { render } from "../nav.js";
import { avatar, empty, heroMoney, section, segmented, sumRows } from "../components.js";
import { icon } from "../icons.js";

let moneyPeriod = "month";
let reportPeriod = "month";

function owedLabel(row, today) {
  if (!row.since) return "No date";
  if (row.since > today) return "Install " + niceDate(row.since, { weekday: true });
  if (row.age === 0) return "Due today";
  return plural(row.age, "day", "days") + " open";
}

function periods(current, act, includeAll) {
  const list = includeAll ? ["week", "month", "year", "all"] : ["week", "month", "year"];
  return segmented(list.map((p) => [p, p === "all" ? "All" : p[0].toUpperCase() + p.slice(1)]), current, act, { label: "Period", attr: "period" });
}

export const money = {
  root: true,
  title: () => "Money",
  action: () => `<a class="icon-btn" href="#/invoices" aria-label="Invoices">${icon("doc")}</a>`,
  html() {
    const today = todayISO();
    const summary = periodSummary(state.jobs, state.invoices, state.payments, moneyPeriod, today);
    const owed = unpaidJobs(state.jobs, state.invoices, state.payments, today);
    const owedTotal = owed.reduce((sum, row) => sum + row.balance, 0);
    const recent = state.payments.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);
    return `${periods(moneyPeriod, "period")}
      ${heroMoney({ kicker: periodLabel(moneyPeriod, today), profit: summary.profit, revenue: summary.revenue, costs: summary.costs, owedTotal, owedCount: plural(owed.length, "job", "jobs"), collected: summary.collected })}
      <p class="meta small">Profit counts on the install date. Collected is money received in this period.</p>
      ${section("Unpaid, oldest first", owed.length ? `<div class="list">${owed.map((row) => {
        const customer = customerById(row.job.customerId);
        return `<div class="row">
          <a class="row-main" href="#/jobs/${esc(row.job.id)}">${avatar(customer?.name || "?", { size: "sm" })}<span class="row-text"><strong>${esc(customer?.name || "Customer")}</strong><small>${esc(owedLabel(row, today))} · ${esc(jobTitle(row.job))}</small></span><b class="row-amt neg">${esc(formatMoney(row.balance))}</b></a>
          <a class="row-act" href="#/jobs/${esc(row.job.id)}/pay/new" aria-label="Log payment for ${esc(customer?.name || "customer")}">${icon("plus")}</a>
        </div>`;
      }).join("")}</div>` : empty("No unpaid balances", "When a job has a price and payments don't cover it, it shows here.", { art: "money" }), { action: owed.length ? `<span class="group-total">${esc(formatMoney(owedTotal))}</span>` : "" })}
      ${section("Recent payments", recent.length ? `<div class="list">${recent.map((payment) => `<a class="row-main" href="#/jobs/${esc(payment.jobId)}/pay/${esc(payment.id)}"><span class="pay-ico">${icon("money")}</span><span class="row-text"><strong>${esc(customerById(payment.customerId)?.name || "Customer")}</strong><small>${esc(niceDate(payment.date, { year: true }))} · ${esc(methodLabel(payment.method))} · ${esc(kindLabel(payment.kind))}</small></span><b class="row-amt pos">+${esc(formatMoney(payment.amountCents))}</b></a>`).join("")}</div>` : `<p class="meta">No payments recorded.</p>`)}
      <div class="btn-row"><a class="btn" href="#/reports">${icon("chart")} Full report</a><a class="btn" href="#/invoices">${icon("doc")} Invoices</a></div>`;
  },
  onClick(act, el) {
    if (act === "period") {
      moneyPeriod = el.dataset.period;
      render({ keepScroll: true });
    }
  }
};

export const reports = {
  title: () => "Reports",
  back: () => "#/money",
  html() {
    const today = todayISO();
    const summary = periodSummary(state.jobs, state.invoices, state.payments, reportPeriod, today);
    const rows = summary.jobs
      .slice()
      .sort((a, b) => String(b.installDate || b.createdAt).localeCompare(String(a.installDate || a.createdAt)))
      .map((job) => {
        const profit = profitCents(job, state.invoices);
        return `<a class="row-main" href="#/jobs/${esc(job.id)}"><span class="row-text"><strong>${esc(customerById(job.customerId)?.name || "Customer")}</strong><small>${esc(jobTitle(job))} · Total ${esc(formatMoney(jobRevenueCents(job, state.invoices)))} · Due ${esc(formatMoney(balanceCents(job, state.invoices, state.payments)))}</small></span><b class="row-amt${profit < 0 ? " neg" : ""}">${esc(formatMoney(profit))}</b></a>`;
      })
      .join("");
    return `${periods(reportPeriod, "period", true)}
      <p class="meta small">${esc(periodLabel(reportPeriod, today))}. A job counts in the period of its install date, or its old sales date if it was imported without one.</p>
      ${section("Summary", sumRows([
        { label: "Job total", value: formatMoney(summary.revenue) },
        { label: "Material", value: formatMoney(summary.material), muted: true },
        { label: "Labor", value: formatMoney(summary.labor), muted: true },
        { label: "Other costs", value: formatMoney(summary.other), muted: true },
        { label: "Profit", value: formatMoney(summary.profit), strong: true, negative: summary.profit < 0 },
        { label: "Collected in this period", value: formatMoney(summary.collected) }
      ]))}
      ${section(plural(summary.jobs.length, "job", "jobs"), rows ? `<div class="list">${rows}</div>` : `<p class="meta">No jobs in this period.</p>`)}
      <p class="meta small">Once a job has an invoice, the invoice total is its price. Void invoices are left out.</p>`;
  },
  onClick(act, el) {
    if (act === "period") {
      reportPeriod = el.dataset.period;
      render({ keepScroll: true });
    }
  }
};
