import { state, jobById, customerById } from "../state.js";
import { saveSlab, deleteSlab } from "../actions.js";
import { empty, err, field, section, selectField, suggestLists, segmented } from "../components.js";
import { icon } from "../icons.js";
import { esc, centsToInput, money, parseDollarsToCents, plural } from "../format.js";
import { jobTitle } from "../model.js";
import { goBackTo, go, render, toast } from "../nav.js";
import { confirmSheet } from "../sheet.js";
import { parseInches, formatInches, fmtNum } from "../layout.js";

let statusFilter = "all";
let kindFilter = "all";
let working = null;
let key = "";

function filtered() {
  return state.slabs.filter((slab) => (statusFilter === "all" || slab.status === statusFilter) && (kindFilter === "all" || slab.kind === kindFilter));
}

function sizeLine(slab) {
  return slab.lengthIn && slab.widthIn ? formatInches(slab.lengthIn) + " × " + formatInches(slab.widthIn) : "";
}

export const list = {
  title: () => "Inventory",
  back: () => "#/more",
  action: () => `<a class="icon-btn" href="#/inventory/new" aria-label="Add stone">${icon("plus")}</a>`,
  html() {
    const rows = filtered().sort((a, b) => (a.stoneColor || a.material || "").localeCompare(b.stoneColor || b.material || ""));
    const chips = (values, current, act) => values.map(([id, label]) => `<button type="button" class="chip${current === id ? " is-on" : ""}" data-act="${act}" data-val="${id}" aria-pressed="${current === id}">${label}</button>`).join("");
    const totalSqft = rows.filter((s) => s.status !== "used").reduce((sum, s) => sum + (Number(s.sqft) || 0), 0);
    const cards = rows
      .map((slab) => {
        const job = jobById(slab.jobId);
        const who = job ? customerById(job.customerId)?.name : "";
        return `<a class="row-main" href="#/inventory/${esc(slab.id)}"><span class="slab-swatch" data-kind="${esc(slab.kind)}">${icon("slab")}</span><span class="row-text"><strong>${esc(slab.stoneColor || slab.material || "Stone")}</strong><small>${esc([slab.kind === "remnant" ? "Remnant" : "Slab", slab.material && slab.stoneColor ? slab.material : "", sizeLine(slab), slab.sqft ? fmtNum(slab.sqft, 1) + " sq ft" : "", who].filter(Boolean).join(" · "))}</small></span><span class="status-dot" data-status="${esc(slab.status)}">${esc(slab.status[0].toUpperCase() + slab.status.slice(1))}</span>${icon("chevronRight")}</a>`;
      })
      .join("");
    return `${segmented([["all", "All"], ["slab", "Slabs"], ["remnant", "Remnants"]], kindFilter, "kind", { label: "Kind" })}
      <div class="chips">${chips([["all", "Any status"], ["available", "Available"], ["reserved", "Reserved"], ["used", "Used"]], statusFilter, "status")}</div>
      <p class="count-line">${esc(plural(rows.length, "piece", "pieces"))}${totalSqft ? " · " + esc(fmtNum(totalSqft, 1)) + " sq ft on hand" : ""}</p>
      ${cards ? `<div class="list">${cards}</div>` : empty(state.slabs.length ? "No stone matches" : "No stone yet", "Track full slabs and leftover remnants, then assign one to a job.", { art: "slab" })}
      <a class="btn primary block" href="#/inventory/new">${icon("plus")} Add stone</a>`;
  },
  onClick(act, el) {
    if (act === "kind") kindFilter = el.dataset.val;
    if (act === "status") statusFilter = el.dataset.val;
    if (act === "kind" || act === "status") render({ keepScroll: true });
  }
};

function blank() {
  return { id: "", kind: "slab", material: "", stoneColor: "", lengthIn: "", widthIn: "", thickness: "", cost: "", location: "", status: "available", jobId: "", notes: "", error: "" };
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
    error: ""
  };
}

function sqftText(l, w) {
  const a = parseInches(l);
  const b = parseInches(w);
  if (!a || !b) return "Enter length and width to see square feet.";
  return "About " + fmtNum((a * b) / 144, 1) + " sq ft";
}

export const form = {
  title(route) {
    return route.parts[1] === "new" ? "Add stone" : "Edit stone";
  },
  back: () => "#/inventory",
  html(route) {
    if (key !== route.path) {
      key = route.path;
      if (route.parts[1] === "new") working = blank();
      else {
        const slab = state.slabs.find((item) => item.id === route.parts[1]);
        working = slab ? fromRecord(slab) : null;
      }
    }
    if (!working) return empty("That piece isn't on this phone", "It may have been deleted.", { art: "slab" });
    const jobs = state.jobs.map((job) => ({ value: job.id, label: (customerById(job.customerId)?.name || "Customer") + " · " + jobTitle(job) }));
    return `<form id="slab-form" data-guard novalidate>${suggestLists()}
      ${section("Stone", `<div class="form-stack">${[
        segmented([["slab", "Full slab"], ["remnant", "Remnant"]], working.kind, "slab-kind", { label: "Kind" }) + `<input type="hidden" name="kind" id="slab-kind" value="${esc(working.kind)}">`,
        `<div class="two-col">${field({ label: "Material", name: "material", value: working.material, list: "suggest-material", autocapitalize: "words" })}${field({ label: "Color", name: "stoneColor", value: working.stoneColor, autocapitalize: "words" })}</div>`
      ].join("")}</div>`, { className: "form-group" })}
      ${section("Size", `<div class="form-stack">
        <div class="three-col">${field({ label: "Length", name: "lengthIn", value: working.lengthIn, inputmode: "decimal", suffix: "″", placeholder: "126" })}${field({ label: "Width", name: "widthIn", value: working.widthIn, inputmode: "decimal", suffix: "″", placeholder: "63" })}${field({ label: "Thickness", name: "thickness", value: working.thickness, placeholder: "3 cm" })}</div>
        <p class="hint" id="slab-sqft">${esc(sqftText(working.lengthIn, working.widthIn))}</p></div>`, { className: "form-group" })}
      ${section("Where & who", `<div class="form-stack">${[
        `<div class="two-col">${field({ label: "What you paid", name: "cost", value: working.cost, inputmode: "decimal", currency: true, enterkeyhint: "next" })}${field({ label: "Location", name: "location", value: working.location, placeholder: "Rack, yard" , autocapitalize: "words" })}</div>`,
        `<div class="two-col">${selectField({ label: "Status", name: "status", value: working.status, options: [{ value: "available", label: "Available" }, { value: "reserved", label: "Reserved" }, { value: "used", label: "Used" }] })}${selectField({ label: "Job", name: "jobId", value: working.jobId, options: [{ value: "", label: "Not assigned" }, ...jobs] })}</div>`,
        field({ label: "Notes", name: "notes", value: working.notes, multiline: true, rows: 2, autocapitalize: "sentences" }),
        `<p class="hint">Assigning here doesn't add the cost to the job. Assign from the job page to be offered that.</p>`
      ].join("")}</div>`, { className: "form-group" })}
      ${err(working.error)}
      <div class="form-bar"><button class="btn primary block" type="submit">${working.id ? "Save changes" : "Save stone"}</button></div>
      ${working.id ? `<button class="btn danger-ghost block" type="button" data-act="delete">${icon("trash")} Delete stone</button>` : ""}
    </form>`;
  },
  leave() {
    key = "";
    working = null;
  },
  onInput(event) {
    const formEl = event.target.form;
    if (formEl?.id !== "slab-form") return;
    const el = document.getElementById("slab-sqft");
    if (el) el.textContent = sqftText(formEl.elements.lengthIn.value, formEl.elements.widthIn.value);
  },
  async onSubmit(event) {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const fail = (error) => {
      working = { ...working, ...data, error };
      return render({ keepScroll: true });
    };
    const cost = parseDollarsToCents(data.cost);
    if (cost === null) return fail("Enter the cost like 400 or 400.00, or leave it blank.");
    const lengthIn = String(data.lengthIn || "").trim() ? parseInches(data.lengthIn) : 0;
    const widthIn = String(data.widthIn || "").trim() ? parseInches(data.widthIn) : 0;
    if (lengthIn === null || widthIn === null) return fail("Enter sizes in inches, like 126 or 63 1/2.");
    const result = await saveSlab({ ...working, ...data, lengthIn, widthIn, costCents: cost });
    if (!result.ok) return fail(result.error);
    key = "";
    toast("Stone saved");
    if (working.id) return goBackTo("/inventory", { force: true });
    return go("/inventory", { replace: true, force: true });
  },
  async onClick(act, el) {
    if (act === "slab-kind") {
      document.getElementById("slab-kind").value = el.dataset.val;
      el.closest(".seg").outerHTML = segmented([["slab", "Full slab"], ["remnant", "Remnant"]], el.dataset.val, "slab-kind", { label: "Kind" });
      return;
    }
    if (act !== "delete" || !working?.id) return;
    const ok = await confirmSheet({ title: "Delete this stone?", message: "It's removed from inventory and from any job it was assigned to.", confirm: "Delete stone" });
    if (!ok) return;
    const result = await deleteSlab(working.id);
    if (!result.ok) return toast(result.error);
    key = "";
    toast("Stone deleted");
    goBackTo("/inventory", { force: true });
  }
};
