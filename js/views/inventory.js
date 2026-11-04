import { state, jobById, customerById } from "../state.js";
import { saveSlab, deleteSlab } from "../actions.js";
import { empty, err, field, section, selectField, suggestLists } from "../components.js";
import { icon } from "../icons.js";
import { esc, centsToInput, money, parseDollarsToCents, plural } from "../format.js";
import { slabSqft } from "../calc.js";
import { jobTitle } from "../model.js";
import { go, render, toast } from "../nav.js";

let statusFilter = "all";
let kindFilter = "all";
let working = null;
let key = "";

function filtered() {
  return state.slabs.filter((slab) => {
    if (statusFilter !== "all" && slab.status !== statusFilter) return false;
    if (kindFilter !== "all" && slab.kind !== kindFilter) return false;
    return true;
  });
}

export const list = {
  title: () => "Inventory",
  back: () => "#/more",
  html() {
    const rows = filtered().sort((a, b) => (a.stoneColor || a.material || "").localeCompare(b.stoneColor || b.material || ""));
    const chips = (values, current, act) => values.map(([id, label]) => `<button type="button" class="chip${current === id ? " is-on" : ""}" data-act="${act}" data-val="${id}">${label}</button>`).join("");
    const cards = rows
      .map((slab) => {
        const job = jobById(slab.jobId);
        const who = job ? customerById(job.customerId)?.name : "";
        return `<a class="card card-link" href="#/inventory/${esc(slab.id)}"><div class="card-top"><strong>${esc(slab.stoneColor || slab.material || "Stone")}</strong><b>${esc(slab.kind === "remnant" ? "Remnant" : "Slab")}</b></div><div class="meta">${esc([slab.material, slab.sqft ? slab.sqft + " sq ft" : "", slab.status, who].filter(Boolean).join(" · "))}</div></a>`;
      })
      .join("");
    return `<div class="chips">${chips([["all", "All"], ["slab", "Slabs"], ["remnant", "Remnants"]], kindFilter, "kind")}</div>
      <div class="chips">${chips([["all", "Any status"], ["available", "Available"], ["reserved", "Reserved"], ["used", "Used"]], statusFilter, "status")}</div>
      <p class="meta">${esc(plural(rows.length, "piece", "pieces"))}</p>
      ${cards || empty("No stone matches", "Track full slabs and leftover remnants, then assign one to a job.")}
      <a class="btn primary block" href="#/inventory/new">${icon("plus")} Add stone</a>`;
  },
  onClick(act, el) {
    if (act === "kind") kindFilter = el.dataset.val;
    if (act === "status") statusFilter = el.dataset.val;
    if (act === "kind" || act === "status") render();
  }
};

function blank() {
  return { id: "", kind: "slab", material: "", stoneColor: "", lengthIn: "", widthIn: "", thickness: "", cost: "", location: "", status: "available", jobId: "", notes: "", error: "", confirm: false };
}

function fromRecord(slab) {
  return {
    id: slab.id,
    kind: slab.kind,
    material: slab.material || "",
    stoneColor: slab.stoneColor || "",
    lengthIn: slab.lengthIn ? String(slab.lengthIn) : "",
    widthIn: slab.widthIn ? String(slab.widthIn) : "",
    thickness: slab.thickness || "",
    cost: centsToInput(slab.costCents),
    location: slab.location || "",
    status: slab.status || "available",
    jobId: slab.jobId || "",
    notes: slab.notes || "",
    error: "",
    confirm: false
  };
}

export const form = {
  title(route) {
    return route.parts[1] === "new" ? "Add stone" : "Edit stone";
  },
  back: () => "#/inventory",
  html(route) {
    const formKey = route.path;
    if (key !== formKey) {
      key = formKey;
      if (route.parts[1] === "new") working = blank();
      else {
        const slab = state.slabs.find((item) => item.id === route.parts[1]);
        working = slab ? fromRecord(slab) : null;
      }
    }
    if (!working) return empty("That piece isn't on this phone", "It may have been deleted.");
    const jobs = state.jobs.map((job) => ({ value: job.id, label: (customerById(job.customerId)?.name || "Customer") + " · " + jobTitle(job) }));
    return `<form id="slab-form">${suggestLists()}
      ${section("Stone", [
        selectField({ label: "Kind", name: "kind", value: working.kind, options: [{ value: "slab", label: "Slab" }, { value: "remnant", label: "Remnant" }] }),
        field({ label: "Material", name: "material", value: working.material, list: "suggest-material" }),
        field({ label: "Color", name: "stoneColor", value: working.stoneColor })
      ].join(""))}
      ${section("Size", [
        field({ label: "Length (inches)", name: "lengthIn", value: working.lengthIn, inputmode: "decimal" }),
        field({ label: "Width (inches)", name: "widthIn", value: working.widthIn, inputmode: "decimal" }),
        field({ label: "Thickness", name: "thickness", value: working.thickness, placeholder: "3 cm" }),
        `<p class="meta" id="slab-sqft">About ${esc(String(slabSqft(working.lengthIn, working.widthIn)))} sq ft</p>`
      ].join(""))}
      ${section("Assignment", [
        field({ label: "What you paid", name: "cost", value: working.cost, inputmode: "decimal" }),
        field({ label: "Location", name: "location", value: working.location, placeholder: "Rack, shop, yard" }),
        selectField({ label: "Status", name: "status", value: working.status, options: [{ value: "available", label: "Available" }, { value: "reserved", label: "Reserved" }, { value: "used", label: "Used" }] }),
        selectField({ label: "Job", name: "jobId", value: working.jobId, options: [{ value: "", label: "Not assigned" }, ...jobs] }),
        field({ label: "Notes", name: "notes", value: working.notes, multiline: true }),
        `<p class="meta">Assigning a slab does not add its cost to the job. Put that cost in the job's material cost if it should count toward profit.</p>`
      ].join(""))}
      ${err(working.error)}
      <button class="btn primary block" type="submit">${working.id ? "Save changes" : "Save stone"}</button>
      ${working.id ? `<button class="btn danger block" type="button" data-act="delete">${working.confirm ? "Delete this piece" : "Delete"}</button>` : ""}
    </form>`;
  },
  onInput(event) {
    if (!event.target.form || event.target.form.id !== "slab-form") return;
    const formEl = event.target.form;
    const el = document.getElementById("slab-sqft");
    if (el) el.textContent = "About " + slabSqft(formEl.lengthIn.value, formEl.widthIn.value) + " sq ft";
  },
  async onSubmit(event) {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const cost = parseDollarsToCents(data.cost);
    if (cost === null) {
      working = { ...working, ...data, error: "Enter the cost like 400 or 400.00, or leave it blank." };
      return render({ keepScroll: true });
    }
    const result = await saveSlab({ ...working, ...data, costCents: cost });
    if (!result.ok) {
      working = { ...working, ...data, error: result.error, confirm: false };
      return render({ keepScroll: true });
    }
    key = "";
    toast("Stone saved");
    go("/inventory");
  },
  async onClick(act) {
    if (act !== "delete" || !working?.id) return;
    if (!working.confirm) {
      const data = Object.fromEntries(new FormData(document.getElementById("slab-form")).entries());
      working = { ...working, ...data, confirm: true };
      return render({ keepScroll: true });
    }
    const result = await deleteSlab(working.id);
    if (!result.ok) {
      working.error = result.error;
      return render({ keepScroll: true });
    }
    key = "";
    toast("Stone deleted");
    go("/inventory");
  }
};
