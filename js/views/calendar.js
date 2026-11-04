import { state, customerById } from "../state.js";
import { esc, addDays, monthGrid, niceDate, niceMonth, parseISODate, shiftMonth, todayISO, weekRange } from "../format.js";
import { jobTitle } from "../model.js";
import { render } from "../nav.js";

let mode = "month";
let selected = "";
let year = null;
let month = null;

function ensure() {
  if (!selected) selected = todayISO();
  if (year === null) {
    const date = parseISODate(selected);
    year = date.getFullYear();
    month = date.getMonth();
  }
}

function eventsOn(iso) {
  const events = [];
  for (const job of state.jobs) {
    const customer = customerById(job.customerId);
    if (job.templateDate === iso) events.push({ type: "Template", job, customer });
    if (job.installDate === iso) events.push({ type: "Install", job, customer });
  }
  return events;
}

function eventCard(event) {
  const address = event.job.siteAddress || event.customer?.address || "";
  return `<a class="card card-link" href="#/jobs/${esc(event.job.id)}"><div class="kicker">${esc(event.type)}</div><strong>${esc(event.customer?.name || "Customer")}</strong><div class="meta">${esc(jobTitle(event.job))}${address ? " · " + esc(address) : ""}</div></a>`;
}

function agenda(iso) {
  const events = eventsOn(iso);
  if (!events.length) return `<p class="meta">Nothing scheduled.</p>`;
  return events.map(eventCard).join("");
}

export const view = {
  root: true,
  title: () => "Schedule",
  html() {
    ensure();
    const today = todayISO();
    const modeButtons = `<div class="seg">${["month", "week"].map((item) => `<button type="button" class="${mode === item ? "is-on" : ""}" data-act="mode" data-mode="${item}">${item === "month" ? "Month" : "Week"}</button>`).join("")}</div>`;
    if (mode === "week") {
      const start = weekRange(selected).start;
      const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
      return `${modeButtons}
        <div class="cal-nav"><button type="button" class="icon-btn light" data-act="shift" data-by="-7" aria-label="Previous week">‹</button><strong>${esc(niceDate(days[0], { year: true }))} – ${esc(niceDate(days[6], { year: true }))}</strong><button type="button" class="icon-btn light" data-act="shift" data-by="7" aria-label="Next week">›</button></div>
        <button type="button" class="btn" data-act="today">This week</button>
        <p class="legend"><i class="dot template"></i> Template <i class="dot install"></i> Install</p>
        ${days.map((iso) => `<section class="day-block${iso === today ? " is-today" : ""}"><h2>${esc(niceDate(iso, { weekday: true, year: true }))}</h2>${agenda(iso)}</section>`).join("")}`;
    }
    const cells = monthGrid(year, month);
    const head = ["S", "M", "T", "W", "T", "F", "S"].map((day) => `<span>${day}</span>`).join("");
    const grid = cells
      .map((cell) => {
        const events = eventsOn(cell.iso);
        const dots = events.some((event) => event.type === "Template") ? `<i class="dot template"></i>` : "";
        const dots2 = events.some((event) => event.type === "Install") ? `<i class="dot install"></i>` : "";
        return `<button type="button" class="cal-cell${cell.inMonth ? "" : " is-out"}${cell.iso === today ? " is-today" : ""}${cell.iso === selected ? " is-on" : ""}" data-act="day" data-iso="${cell.iso}"><b>${cell.day}</b><span class="dots">${dots}${dots2}</span></button>`;
      })
      .join("");
    return `${modeButtons}
      <div class="cal-nav"><button type="button" class="icon-btn light" data-act="month" data-by="-1" aria-label="Previous month">‹</button><strong>${esc(niceMonth(year, month))}</strong><button type="button" class="icon-btn light" data-act="month" data-by="1" aria-label="Next month">›</button></div>
      <button type="button" class="btn" data-act="today">Today</button>
      <p class="legend"><i class="dot template"></i> Template <i class="dot install"></i> Install</p>
      <div class="cal-head">${head}</div>
      <div class="cal-grid">${grid}</div>
      <h2>${esc(niceDate(selected, { weekday: true, year: true }))}</h2>
      ${agenda(selected)}`;
  },
  onClick(act, el) {
    ensure();
    if (act === "mode") {
      mode = el.dataset.mode === "week" ? "week" : "month";
      return render({ keepScroll: true });
    }
    if (act === "day") {
      selected = el.dataset.iso;
      const date = parseISODate(selected);
      year = date.getFullYear();
      month = date.getMonth();
      return render({ keepScroll: true });
    }
    if (act === "month") {
      const next = shiftMonth(year, month, Number(el.dataset.by));
      year = next.year;
      month = next.month;
      return render();
    }
    if (act === "shift") {
      selected = addDays(selected, Number(el.dataset.by));
      const date = parseISODate(selected);
      year = date.getFullYear();
      month = date.getMonth();
      return render();
    }
    if (act === "today") {
      selected = todayISO();
      const date = parseISODate(selected);
      year = date.getFullYear();
      month = date.getMonth();
      return render();
    }
  }
};
