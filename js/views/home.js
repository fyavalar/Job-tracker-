import { state, customerById } from "../state.js";
import { dismissTips } from "../actions.js";
import { contactLinks } from "../phone.js";
import { avatar, contactActions, heroMoney, section } from "../components.js";
import { icon } from "../icons.js";
import { esc, greeting, money, niceDate, plural, todayISO } from "../format.js";
import { periodSummary, unpaidJobs } from "../calc.js";
import { STAGES, jobTitle } from "../model.js";
import { render, toast } from "../nav.js";
import { layoutStats, fmtNum } from "../layout.js";

export const root = true;

export function title() {
  return state.business.name || "JOBS";
}

export function action() {
  return `<a class="icon-btn" href="#/jobs/new" aria-label="New job">${icon("plus")}</a>`;
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
    const s = job.layout?.pieces?.length ? layoutStats(job.layout) : null;
    cards.push(`<article class="today-card">
      <a class="today-main" href="#/jobs/${esc(job.id)}">
        <span class="today-kicker"><i></i>${esc(labels.join(" + "))} today</span>
        <strong>${esc(customer?.name || "Customer")}</strong>
        ${address ? `<span class="today-address">${esc(address)}</span>` : ""}
        <span class="meta">${esc([jobTitle(job), [job.material, job.stoneColor].filter(Boolean).join(" "), s ? fmtNum(s.sqft, 1) + " sq ft" : ""].filter(Boolean).join(" · "))}</span>
      </a>
      ${contactActions(links, { compact: true })}
    </article>`);
  }
  return cards;
}

function lateItems(today) {
  const rows = [];
  for (const job of state.jobs) {
    if (job.stage === "installed" || job.stage === "paid") continue;
    const customer = customerById(job.customerId);
    if (job.installDate && job.installDate < today) rows.push({ job, customer, label: "Past install date", date: job.installDate });
    else if (job.templateDate && job.templateDate < today && ["lead", "quoted", "approved"].includes(job.stage)) rows.push({ job, customer, label: "Past template date", date: job.templateDate });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
}

function dueTasks(today) {
  return state.tasks.filter((task) => !task.done && task.dueDate && task.dueDate <= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
}

function upcoming(today) {
  const rows = [];
  for (const job of state.jobs) {
    for (const [label, date] of [["Template", job.templateDate], ["Install", job.installDate]]) {
      if (date && date > today) rows.push({ job, label, date });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
}

function row(href, title, sub, right = "", lead = "") {
  return `<a class="row-main" href="${esc(href)}">${lead}<span class="row-text"><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${right}${icon("chevronRight")}</a>`;
}

export function html() {
  const today = todayISO();
  const summary = periodSummary(state.jobs, state.invoices, state.payments, "month", today);
  const owed = unpaidJobs(state.jobs, state.invoices, state.payments, today);
  const owedTotal = owed.reduce((sum, r) => sum + r.balance, 0);
  const counts = Object.fromEntries(STAGES.map((stage) => [stage.id, state.jobs.filter((job) => job.stage === stage.id).length]));
  const todayCards = dayCards(today);
  const late = lateItems(today);
  const tasks = dueTasks(today);
  const next = upcoming(today);
  const banner = !state.business.tipsDismissed && !state.business.name
    ? `<div class="banner"><p>Add your business name in Settings before you send a quote. Your records stay on this phone.</p><div class="btn-row"><a class="btn sm primary" href="#/settings">Open Settings</a><button type="button" class="btn sm" data-act="dismiss">Later</button></div></div>`
    : "";
  const storage = state.storage === "local" ? `<div class="banner warn"><p>This browser blocked its database, so records are in a fallback store. Export a backup from Settings.</p></div>` : "";

  const todayBlock = todayCards.length
    ? todayCards.join("")
    : `<div class="quiet-card">${icon("calendar")}<div><strong>Nothing on the schedule today</strong><small>${next.length ? "Next: " + esc(next[0].label.toLowerCase()) + " " + esc(niceDate(next[0].date, { weekday: true })) + " · " + esc(customerById(next[0].job.customerId)?.name || "Customer") : "Set template and install dates on a job to see them here."}</small></div></div>`;

  const attention = [
    ...late.map((r) => row("#/jobs/" + r.job.id, r.customer?.name || "Customer", r.label + " · " + niceDate(r.date, { weekday: true }), "", `<span class="row-icon warn">${icon("alert")}</span>`)),
    ...tasks.map((task) => row("#/tasks", task.title, (task.dueDate < today ? "Overdue · " : "Due today · ") + niceDate(task.dueDate, { weekday: true }) + (task.customerId ? " · " + (customerById(task.customerId)?.name || "") : ""), "", `<span class="row-icon">${icon("check")}</span>`))
  ];

  const unpaid = owed.length
    ? `<div class="list">${owed.slice(0, 4).map((r) => {
        const customer = customerById(r.job.customerId);
        return row("#/jobs/" + r.job.id, customer?.name || "Customer", (r.since > today ? "Install " + niceDate(r.since, { weekday: true }) : r.age ? plural(r.age, "day", "days") + " open" : "Today") + " · " + jobTitle(r.job), `<b class="row-amt neg">${esc(money(r.balance))}</b>`, avatar(customer?.name || "?", { size: "sm" }));
      }).join("")}</div>${owed.length > 4 ? `<a class="text-link center" href="#/money">See all ${owed.length} unpaid</a>` : ""}`
    : `<p class="meta">Nobody owes you right now.</p>`;

  return `${banner}${storage}
    <header class="home-head"><p class="date-line">${esc(niceDate(today, { weekday: true, year: true }))}</p><p class="lede">${esc(greeting())}</p></header>
    ${section("Today", todayBlock, { className: "plain" })}
    ${attention.length ? section("Needs a look", `<div class="list">${attention.join("")}</div>`) : ""}
    ${heroMoney({ kicker: "This month", profit: summary.profit, revenue: summary.revenue, costs: summary.costs, owedTotal, owedCount: plural(owed.length, "job", "jobs"), owedHref: "#/money" })}
    <div class="quick-grid">
      <a class="quick" href="#/jobs/new"><span class="quick-ico accent">${icon("plus")}</span><span>New job</span></a>
      <a class="quick" href="${owed.length ? "#/jobs/" + esc(owed[0].job.id) + "/pay/new" : "#/money"}"><span class="quick-ico">${icon("money")}</span><span>Log payment</span></a>
      <a class="quick" href="#/estimates/new"><span class="quick-ico">${icon("doc")}</span><span>Estimate</span></a>
      <a class="quick" href="#/customers/new"><span class="quick-ico">${icon("user")}</span><span>Customer</span></a>
    </div>
    ${section("Pipeline", `<div class="pipeline">${STAGES.map((stage) => `<a href="#/jobs?stage=${stage.id}" data-stage="${stage.id}"${counts[stage.id] ? "" : ' class="is-zero"'}><b>${counts[stage.id]}</b><span>${esc(stage.label)}</span></a>`).join("")}</div>`, { action: `<a class="text-btn" href="#/jobs">All jobs</a>`, className: "plain" })}
    ${section("Unpaid", unpaid, { action: owed.length ? `<a class="text-btn" href="#/money">${esc(money(owedTotal))}</a>` : "" })}`;
}

export async function onClick(act) {
  if (act === "dismiss") {
    const result = await dismissTips();
    if (!result.ok) toast(result.error);
    render({ keepScroll: true });
  }
}
