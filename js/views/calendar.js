import { state, customerById } from "../state.js";
import { esc, addDays, monthGrid, niceDate, niceMonth, parseISODate, shiftMonth, todayISO, weekRange } from "../format.js";
import { jobTitle } from "../model.js";
import { icon } from "../icons.js";
import { render } from "../nav.js";
import { segmented } from "../components.js";

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
    if (job.templateDate === iso) events.push({ type: "Template", kind: "job", job, customer });
    if (job.installDate === iso) events.push({ type: "Install", kind: "job", job, customer });
  }
  for (const task of state.tasks) {
    if (task.dueDate === iso) {
      const customer = task.customerId ? customerById(task.customerId) : null;
      events.push({ type: task.done ? "Task done" : "Task", kind: "task", task, customer });
    }
  }
  return events;
}

function eventCard(event) {
  if (event.kind === "task") {
    const who = event.customer?.name || "";
    return `<a class="ev-row" href="#/tasks" data-kind="task"><i class="ev-bar"></i><span class="row-text"><span class="ev-type">${esc(event.type)}</span><strong>${esc(event.task.title)}</strong><small>${esc(who || event.task.notes || "Task")}</small></span>${icon("chevronRight")}</a>`;
  }
  const address = event.job.siteAddress || event.customer?.address || "";
  return `<a class="ev-row" href="#/jobs/${esc(event.job.id)}" data-kind="${event.type === "Install" ? "install" : "template"}"><i class="ev-bar"></i><span class="row-text"><span class="ev-type">${esc(event.type)}</span><strong>${esc(event.customer?.name || "Customer")}</strong><small>${esc(jobTitle(event.job))}${address ? " · " + esc(address) : ""}</small></span>${icon("chevronRight")}</a>`;
}

function agenda(iso) {
  const events = eventsOn(iso);
  if (!events.length) return `<p class="meta ev-none">Nothing scheduled.</p>`;
  return `<div class="list ev-list">${events.map(eventCard).join("")}</div>`;
}

export const view = {
  root: true,
  title: () => "Schedule",
  html() {
    ensure();
    const today = todayISO();
    const modeButtons = segmented([["month", "Month"], ["week", "Week"]], mode, "mode", { label: "Calendar view", attr: "mode" });
    const legend = `<p class="legend"><i class="dot template"></i> Template <i class="dot install"></i> Install <i class="dot task"></i> Task</p>`;
    if (mode === "week") {
      const start = weekRange(selected).start;
      const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
      return `${modeButtons}
        <div class="cal-nav"><button type="button" class="icon-btn" data-act="shift" data-by="-7" aria-label="Previous week">${icon("back")}</button><strong>${esc(niceDate(days[0], { year: true }))} – ${esc(niceDate(days[6], { year: true }))}</strong><button type="button" class="icon-btn" data-act="shift" data-by="7" aria-label="Next week">${icon("forward")}</button></div>
        ${legend.replace("</p>", `<button type="button" class="text-btn" data-act="today">This week</button></p>`)}
        ${days.map((iso) => `<section class="group day-block${iso === today ? " is-today" : ""}"><div class="group-head"><h2>${esc(niceDate(iso, { weekday: true, year: true }))}</h2></div>${agenda(iso)}</section>`).join("")}`;
    }
    const cells = monthGrid(year, month);
    const head = ["S", "M", "T", "W", "T", "F", "S"].map((day) => `<span>${day}</span>`).join("");
    const grid = cells
      .map((cell) => {
        const events = eventsOn(cell.iso);
        const dots = [
          events.some((event) => event.type === "Template") ? `<i class="dot template"></i>` : "",
          events.some((event) => event.type === "Install") ? `<i class="dot install"></i>` : "",
          events.some((event) => event.kind === "task") ? `<i class="dot task"></i>` : ""
        ].join("");
        return `<button type="button" class="cal-cell${cell.inMonth ? "" : " is-out"}${cell.iso === today ? " is-today" : ""}${cell.iso === selected ? " is-on" : ""}" data-act="day" data-iso="${cell.iso}" aria-label="${esc(niceDate(cell.iso, { weekday: true }))}${events.length ? ", " + events.length + " scheduled" : ""}"${cell.iso === selected ? ' aria-pressed="true"' : ""}><b>${cell.day}</b><span class="dots">${dots}</span></button>`;
      })
      .join("");
    return `${modeButtons}
      <div class="cal-nav"><button type="button" class="icon-btn" data-act="month" data-by="-1" aria-label="Previous month">${icon("back")}</button><strong>${esc(niceMonth(year, month))}</strong><button type="button" class="icon-btn" data-act="month" data-by="1" aria-label="Next month">${icon("forward")}</button></div>
      ${legend.replace("</p>", `<button type="button" class="text-btn" data-act="today">Today</button></p>`)}
      <div class="cal-card"><div class="cal-head">${head}</div><div class="cal-grid">${grid}</div></div>
      <section class="group"><div class="group-head"><h2>${esc(selected === today ? "Today · " : "")}${esc(niceDate(selected, { weekday: true, year: true }))}</h2></div>${agenda(selected)}</section>`;
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
