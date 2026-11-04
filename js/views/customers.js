import { state, customerById, jobsForCustomer } from "../state.js";
import { saveCustomer, deleteCustomer } from "../actions.js";
import { contactLinks } from "../phone.js";
import { badge, contactActions, empty, err, field, section } from "../components.js";
import { icon } from "../icons.js";
import { esc, plural } from "../format.js";
import { balanceCents } from "../calc.js";
import { money } from "../format.js";
import { jobTitle } from "../model.js";
import { go, render, toast } from "../nav.js";

let query = "";
let working = null;
let key = "";

function customerCards() {
  const q = query.trim().toLowerCase();
  const rows = state.customers
    .filter((customer) => !q || [customer.name, customer.phone, customer.email, customer.address].join(" ").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) return empty(state.customers.length ? "No matches" : "No customers yet", state.customers.length ? "Try a different name or phone." : "A customer can have more than one job.");
  return rows
    .map((customer) => {
      const count = jobsForCustomer(customer.id).length;
      const links = contactLinks({ phone: customer.phone, email: customer.email, address: customer.address });
      return `<article class="card">
        <a class="card-main" href="#/customers/${esc(customer.id)}"><strong>${esc(customer.name)}</strong><div class="meta">${esc(plural(count, "job", "jobs"))}${customer.phone ? " · " + esc(customer.phone) : ""}</div></a>
        <div class="mini-actions">${links.tel ? `<a href="${esc(links.tel)}">${icon("phone")} Call</a>` : ""}${links.sms ? `<a href="${esc(links.sms)}">${icon("message")} Text</a>` : ""}</div>
      </article>`;
    })
    .join("");
}

export const list = {
  title: () => "Customers",
  back: () => "#/more",
  html() {
    return `<div class="toolbar"><input id="customer-q" placeholder="Search customers" value="${esc(query)}" aria-label="Search customers"></div>
      <div id="customer-list">${customerCards()}</div>
      <a class="btn primary block" href="#/customers/new">${icon("plus")} New customer</a>`;
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
  html(route) {
    const customer = customerById(route.parts[1]);
    if (!customer) return empty("That customer isn't on this phone", "They may have been deleted.");
    const jobs = jobsForCustomer(customer.id).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const links = contactLinks({ phone: customer.phone, email: customer.email, address: customer.address, subject: state.business.name || "" });
    return `${contactActions(links)}
      ${section("Contact", [
        customer.phone ? `<div class="fact"><span>Phone</span><b>${esc(customer.phone)}</b></div>` : "",
        customer.email ? `<div class="fact"><span>Email</span><b>${esc(customer.email)}</b></div>` : "",
        customer.address ? `<div class="fact"><span>Address</span><b>${esc(customer.address)}</b></div>` : "",
        customer.notes ? `<p>${esc(customer.notes)}</p>` : "",
        !customer.phone && !customer.email && !customer.address && !customer.notes ? `<p class="meta">No contact details yet.</p>` : ""
      ].join(""))}
      <div class="card-top"><h2>Jobs</h2><a class="btn" href="#/jobs/new?customer=${esc(customer.id)}">New job</a></div>
      ${jobs.length ? jobs.map((job) => `<a class="card card-link" href="#/jobs/${esc(job.id)}"><div class="card-top"><strong>${esc(jobTitle(job))}</strong>${badge(job.stage)}</div><div class="meta">Due ${esc(money(balanceCents(job, state.invoices, state.payments)))}</div></a>`).join("") : `<p class="meta">No jobs for this customer yet.</p>`}
      <div class="btn-col"><a class="btn" href="#/customers/${esc(customer.id)}/edit">Edit customer</a><a class="btn" href="#/estimates/new?customer=${esc(customer.id)}">New estimate</a></div>`;
  }
};

function blank() {
  return { id: "", name: "", phone: "", email: "", address: "", notes: "", error: "", confirm: false };
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
      if (route.parts[1] === "new") working = blank();
      else {
        const customer = customerById(route.parts[1]);
        working = customer ? { ...customer, error: "", confirm: false } : null;
      }
    }
    if (!working) return empty("That customer isn't on this phone", "Go back to customers.");
    return `<form id="customer-form">
      ${section("Customer", [
        field({ label: "Name", name: "name", value: working.name }),
        field({ label: "Phone", name: "phone", value: working.phone, type: "tel", inputmode: "tel" }),
        field({ label: "Email", name: "email", value: working.email, type: "email", inputmode: "email" }),
        field({ label: "Address", name: "address", value: working.address, multiline: true, rows: 3 }),
        field({ label: "Notes", name: "notes", value: working.notes, multiline: true })
      ].join(""))}
      ${err(working.error)}
      <button class="btn primary block" type="submit">${working.id ? "Save changes" : "Save customer"}</button>
      ${working.id ? `<button class="btn danger block" type="button" data-act="delete">${working.confirm ? "Delete this customer" : "Delete customer"}</button>` : ""}
    </form>`;
  },
  async onSubmit(event) {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const result = await saveCustomer({ id: working.id, ...data });
    if (!result.ok) {
      working = { ...working, ...data, error: result.error, confirm: false };
      return render({ keepScroll: true });
    }
    key = "";
    toast(working.id ? "Customer saved" : "Customer added");
    go("/customers/" + result.id);
  },
  async onClick(act) {
    if (act !== "delete" || !working?.id) return;
    if (!working.confirm) {
      const data = Object.fromEntries(new FormData(document.getElementById("customer-form")).entries());
      working = { ...working, ...data, confirm: true };
      return render({ keepScroll: true });
    }
    const result = await deleteCustomer(working.id);
    if (!result.ok) {
      working.error = result.error;
      working.confirm = false;
      return render({ keepScroll: true });
    }
    key = "";
    toast("Customer deleted");
    go("/customers");
  }
};
