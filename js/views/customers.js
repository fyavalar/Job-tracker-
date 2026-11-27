import { state, customerById, jobsForCustomer } from "../state.js";
import { saveCustomer, deleteCustomer } from "../actions.js";
import { contactLinks } from "../phone.js";
import { avatar, badge, contactActions, empty, err, section } from "../components.js";
import { icon } from "../icons.js";
import { esc, plural, foldText, digits, money, niceDate } from "../format.js";
import { balanceCents } from "../calc.js";
import { jobTitle } from "../model.js";
import { go, goBackTo, render, toast } from "../nav.js";
import { confirmSheet } from "../sheet.js";
import { quickPasteHtml, customerFieldsHtml, handlePhoneInput, paintDupes, fillFromText, filledMessage, readClipboard } from "../customer-ui.js";

let query = "";
let working = null;
let key = "";
let dupeDismissed = false;

function customerCards() {
  const q = foldText(query.trim());
  const qd = /^[\d\s().+-]+$/.test(query.trim()) ? digits(query) : "";
  const rows = state.customers
    .filter((c) => !q || foldText([c.name, c.phone, c.email, c.address].join(" ")).includes(q) || (qd.length >= 3 && digits(c.phone).includes(qd)))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) {
    return state.customers.length
      ? empty("No matches", "Try a different name, phone, or street.", { art: "search" })
      : empty("No customers yet", "Add one, or paste a lead text and JOBS fills in the details.", { art: "user", action: `<a class="btn primary" href="#/customers/new">${icon("plus")} New customer</a>` });
  }
  return `<div class="list">${rows
    .map((customer) => {
      const jobs = jobsForCustomer(customer.id);
      const owed = jobs.reduce((sum, job) => sum + Math.max(0, balanceCents(job, state.invoices, state.payments)), 0);
      const links = contactLinks({ phone: customer.phone, email: customer.email, address: customer.address });
      return `<div class="row">
        <a class="row-main" href="#/customers/${esc(customer.id)}">${avatar(customer.name)}<span class="row-text"><strong>${esc(customer.name)}</strong><small>${esc([plural(jobs.length, "job", "jobs"), customer.phone].filter(Boolean).join(" · "))}</small></span>${owed > 0 ? `<b class="row-amt neg">${esc(money(owed))}</b>` : ""}</a>
        ${links.tel ? `<a class="row-icon" href="${esc(links.tel)}" aria-label="Call ${esc(customer.name)}">${icon("phone")}</a>` : ""}
      </div>`;
    })
    .join("")}</div>`;
}

export const list = {
  title: () => "Customers",
  back: () => "#/more",
  action: () => `<a class="icon-btn" href="#/customers/new" aria-label="New customer">${icon("plus")}</a>`,
  html() {
    return `<div class="search-field">${icon("search")}<input id="customer-q" type="search" placeholder="Search name, phone, street" value="${esc(query)}" aria-label="Search customers" autocomplete="off" enterkeyhint="search"></div>
      <p class="count-line" id="customer-count">${esc(plural(state.customers.length, "customer", "customers"))}</p>
      <div id="customer-list">${customerCards()}</div>
      ${state.customers.length ? `<a class="btn primary block" href="#/customers/new">${icon("plus")} New customer</a>` : ""}`;
  },
  onInput(event) {
    if (event.target.id !== "customer-q") return;
    query = event.target.value;
    const box = document.getElementById("customer-list");
    if (box) box.innerHTML = customerCards();
  }
};

export const detail = {
  title(route) {
    return customerById(route.parts[1])?.name || "Customer";
  },
  back: () => "#/customers",
  action: (route) => (customerById(route.parts[1]) ? `<a class="text-btn" href="#/customers/${esc(route.parts[1])}/edit">Edit</a>` : ""),
  html(route) {
    const customer = customerById(route.parts[1]);
    if (!customer) return empty("That customer isn't on this phone", "They may have been deleted.", { art: "user" });
    const jobs = jobsForCustomer(customer.id).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const links = contactLinks({ phone: customer.phone, email: customer.email, address: customer.address, subject: state.business.name || "" });
    const owed = jobs.reduce((sum, job) => sum + Math.max(0, balanceCents(job, state.invoices, state.payments)), 0);
    const facts = [
      ["Phone", customer.phone, links.tel],
      ["Email", customer.email, links.mail],
      ["Address", customer.address, links.map]
    ].filter((row) => row[1]);
    return `<div class="profile">${avatar(customer.name, { size: "lg" })}<div><h2 class="h-title">${esc(customer.name)}</h2><p class="meta">${esc(plural(jobs.length, "job", "jobs"))}${owed > 0 ? ` · <span class="neg">${esc(money(owed))} owed</span>` : ""}</p></div></div>
      ${contactActions(links)}
      ${section("Contact", facts.length ? `<div class="facts">${facts.map(([label, value, href]) => `<div class="fact"><span>${esc(label)}</span>${href ? `<a href="${esc(href)}"${label === "Address" ? ' target="_blank" rel="noopener"' : ""}>${esc(value)}</a>` : `<b>${esc(value)}</b>`}</div>`).join("")}</div>` : `<p class="meta">No contact details yet. <a class="text-link" href="#/customers/${esc(customer.id)}/edit">Add them</a></p>`)}
      ${customer.notes ? section("Notes", `<p class="notes">${esc(customer.notes)}</p>`) : ""}
      ${section("Jobs", jobs.length ? `<div class="list inset">${jobs.map((job) => {
        const due = balanceCents(job, state.invoices, state.payments);
        const when = job.installDate ? "Install " + niceDate(job.installDate) : job.templateDate ? "Template " + niceDate(job.templateDate) : "";
        return `<a class="row-main" href="#/jobs/${esc(job.id)}"><span class="row-text"><strong>${esc(jobTitle(job))}</strong><small>${esc([when, due > 0 ? "Due " + money(due) : "Paid up"].filter(Boolean).join(" · "))}</small></span>${badge(job.stage)}${icon("chevronRight")}</a>`;
      }).join("")}</div>` : `<p class="meta">No jobs for this customer yet.</p>`, { action: `<a class="text-btn" href="#/jobs/new?customer=${esc(customer.id)}">${icon("plus")} New job</a>` })}
      <div class="btn-col"><a class="btn primary" href="#/jobs/new?customer=${esc(customer.id)}">${icon("plus")} New job</a><a class="btn" href="#/estimates/new?customer=${esc(customer.id)}">${icon("doc")} New estimate</a></div>`;
  }
};

function blank() {
  return { id: "", name: "", phone: "", email: "", address: "", notes: "", error: "" };
}

export const form = {
  title(route) {
    return route.parts[1] === "new" ? "New customer" : "Edit customer";
  },
  back(route) {
    return route.parts[1] === "new" ? "#/customers" : "#/customers/" + route.parts[1];
  },
  html(route) {
    const formKey = route.path;
    if (key !== formKey) {
      key = formKey;
      dupeDismissed = false;
      if (route.parts[1] === "new") working = blank();
      else {
        const customer = customerById(route.parts[1]);
        working = customer ? { ...customer, error: "" } : null;
      }
    }
    if (!working) return empty("That customer isn't on this phone", "Go back to customers.", { art: "user" });
    const creating = !working.id;
    return `<form id="customer-form" data-guard novalidate>
      ${creating ? quickPasteHtml({ open: false }) : ""}
      ${section("", `<div class="form-stack">${customerFieldsHtml(working, { notes: true })}</div><div id="dupe-slot"></div>`, { className: "form-group" })}
      ${err(working.error)}
      <div class="form-bar"><button class="btn primary block" type="submit">${creating ? "Save customer" : "Save changes"}</button></div>
      ${working.id ? `<button class="btn danger-ghost block" type="button" data-act="delete">${icon("trash")} Delete customer</button>` : ""}
    </form>`;
  },
  mount(root) {
    const formEl = root.querySelector("#customer-form");
    if (!formEl) return;
    if (formEl.elements.phone) formEl.elements.phone.dataset.prev = formEl.elements.phone.value;
    paintDupes(formEl, { excludeId: working?.id, dismissed: dupeDismissed });
    if (!working?.id && !working?.name) setTimeout(() => formEl.elements.name?.focus({ preventScroll: true }), 350);
  },
  leave() {
    key = "";
  },
  onInput(event) {
    const formEl = event.target.form;
    if (!formEl || formEl.id !== "customer-form") return;
    handlePhoneInput(event);
    if (event.target.dataset?.dupe) {
      dupeDismissed = false;
      paintDupes(formEl, { excludeId: working?.id });
    }
  },
  onPaste(event) {
    if (event.target.id !== "paste-text") return;
    setTimeout(() => runFill(), 30);
  },
  async onSubmit(event) {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const result = await saveCustomer({ id: working.id, ...data, allowDuplicate: true });
    if (!result.ok) {
      working = { ...working, ...data, error: result.error };
      return render({ keepScroll: true });
    }
    const wasNew = !working.id;
    key = "";
    toast(wasNew ? "Customer added" : "Customer saved");
    if (wasNew) return go("/customers/" + result.id, { replace: true, force: true });
    return goBackTo("/customers/" + result.id, { force: true });
  },
  async onClick(act) {
    if (act === "paste-clip") {
      const text = await readClipboard();
      const box = document.getElementById("paste-text");
      if (text === null) {
        box?.focus();
        return toast("Long-press the box and tap Paste.");
      }
      if (box) box.value = text;
      return runFill();
    }
    if (act === "paste-fill") return runFill();
    if (act === "dupe-dismiss") {
      dupeDismissed = true;
      const slot = document.getElementById("dupe-slot");
      if (slot) slot.innerHTML = "";
      return;
    }
    if (act !== "delete" || !working?.id) return;
    const jobs = jobsForCustomer(working.id).length;
    if (jobs) return toast("This customer still has " + plural(jobs, "job", "jobs") + ". Delete those first.");
    const ok = await confirmSheet({ title: "Delete " + working.name + "?", message: "Their contact details are removed from this phone. This can't be undone.", confirm: "Delete customer" });
    if (!ok) return;
    const result = await deleteCustomer(working.id);
    if (!result.ok) {
      working.error = result.error;
      return render({ keepScroll: true });
    }
    key = "";
    toast("Customer deleted");
    go("/customers", { replace: true, force: true });
  }
};

function runFill() {
  const formEl = document.getElementById("customer-form");
  const box = document.getElementById("paste-text");
  if (!formEl || !box) return;
  const { filled } = fillFromText(formEl, box.value);
  toast(filledMessage(filled));
  if (filled.length) {
    box.value = "";
    formEl.querySelector(".paste-box")?.removeAttribute("open");
    dupeDismissed = false;
    paintDupes(formEl, { excludeId: working?.id });
  }
}
