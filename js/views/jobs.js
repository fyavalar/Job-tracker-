import { state, customerById, jobById } from "../state.js";
import { saveCustomer, saveJob, deleteJob, setStage, savePayment, deletePayment, createInvoiceFromJob, saveSlab, addPhotos, deletePhoto, loadPhotos } from "../actions.js";
import { contactLinks } from "../phone.js";
import { badge, contactActions, empty, err, field, section, selectField, suggestLists, sumRows } from "../components.js";
import { icon } from "../icons.js";
import { esc, centsToInput, formatQty, money, niceDate, parseDollarsToCents, parsePercent, parseQty, plural, todayISO } from "../format.js";
import { balanceCents, marginPercent, paidCents, profitCents, revenueSource } from "../calc.js";
import { PAY_KINDS, PAY_METHODS, PHOTO_CATEGORIES, STAGES, docNumber, jobTitle, kindLabel, methodLabel, stageLabel } from "../model.js";
import { go, render, toast, currentRoute } from "../nav.js";

let jobQuery = "";
let lightbox = "";
let photoCategory = "site";
let jobWorking = null;
let jobKey = "";

function nextDate(job) {
  const today = todayISO();
  return [job.templateDate, job.installDate].filter((date) => date && date >= today).sort()[0] || "9999-99-99";
}

function filtered(route) {
  const stage = route.params.stage || "all";
  const q = jobQuery.trim().toLowerCase();
  return state.jobs
    .filter((job) => {
      if (stage !== "all" && job.stage !== stage) return false;
      if (!q) return true;
      const customer = customerById(job.customerId);
      return [customer?.name, customer?.phone, job.siteAddress, job.material, job.stoneColor, job.notes, jobTitle(job)].join(" ").toLowerCase().includes(q);
    })
    .sort((a, b) => nextDate(a).localeCompare(nextDate(b)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function listHtml(route) {
  const stage = route.params.stage || "all";
  const rows = filtered(route);
  if (!state.jobs.length) return empty("No jobs yet", "Add a customer, then a job. Each customer can have more than one.");
  if (!rows.length) return `<p class="meta">No ${stage === "all" ? "" : stageLabel(stage).toLowerCase() + " "}jobs match.</p>`;
  return rows
    .map((job) => {
      const customer = customerById(job.customerId);
      const balance = balanceCents(job, state.invoices, state.payments);
      const when = [job.templateDate ? "Template " + niceDate(job.templateDate) : "", job.installDate ? "Install " + niceDate(job.installDate) : ""].filter(Boolean).join(" · ");
      return `<a class="card card-link" href="#/jobs/${esc(job.id)}">
        <div class="card-top"><strong>${esc(customer?.name || "Customer")}</strong><b>${esc(money(jobRevenueSafe(job)))}</b></div>
        <div class="meta">${esc(jobTitle(job))}</div>
        <div class="card-foot">${badge(job.stage)}${balance > 0 ? `<span>Due ${esc(money(balance))}</span>` : `<span>${esc(money(paidCents(state.payments, job.id)))} paid</span>`}</div>
        ${when ? `<div class="meta">${esc(when)}</div>` : ""}
      </a>`;
    })
    .join("");
}

function jobRevenueSafe(job) {
  return balanceCents(job, state.invoices, state.payments) + paidCents(state.payments, job.id);
}

export const list = {
  root: true,
  title: () => "Jobs",
  html(route) {
    const stage = route.params.stage || "all";
    const chips = [["all", "All"], ...STAGES.map((item) => [item.id, item.label])]
      .map(([id, label]) => `<a class="chip${stage === id ? " is-on" : ""}" href="#/jobs${id === "all" ? "" : "?stage=" + id}">${esc(label)}</a>`)
      .join("");
    return `<div class="toolbar"><input id="job-q" placeholder="Search jobs" value="${esc(jobQuery)}" aria-label="Search jobs"></div>
      <div class="chips">${chips}</div>
      <p class="meta">${esc(plural(filtered(route).length, "job", "jobs"))}</p>
      <div id="job-list">${listHtml(route)}</div>
      <a class="btn primary block" href="#/jobs/new">${icon("plus")} New job</a>`;
  },
  onInput(event) {
    if (event.target.id !== "job-q") return;
    jobQuery = event.target.value;
    const box = document.getElementById("job-list");
    if (box) box.innerHTML = listHtml(currentRoute());
    const count = document.querySelector(".main .meta");
    if (count) count.textContent = plural(filtered(currentRoute()).length, "job", "jobs");
  }
};

export const detail = {
  title(route) {
    const job = jobById(route.parts[1]);
    return job ? jobTitle(job) : "Job";
  },
  back: () => "#/jobs",
  async prepare(route) {
    await loadPhotos(route.parts[1]);
  },
  html(route) {
    const job = jobById(route.parts[1]);
    if (!job) return empty("That job isn't on this phone", "It may have been deleted.");
    const customer = customerById(job.customerId);
    const address = job.siteAddress || customer?.address || "";
    const links = contactLinks({ phone: customer?.phone, email: customer?.email, address, subject: state.business.name || "" });
    const revenue = jobRevenueSafe(job);
    const paid = paidCents(state.payments, job.id);
    const balance = balanceCents(job, state.invoices, state.payments);
    const profit = profitCents(job, state.invoices);
    const margin = marginPercent(job, state.invoices);
    const source = revenueSource(job, state.invoices);
    const payments = state.payments.filter((payment) => payment.jobId === job.id).sort((a, b) => b.date.localeCompare(a.date));
    const estimates = state.estimates.filter((doc) => doc.jobId === job.id);
    const invoices = state.invoices.filter((doc) => doc.jobId === job.id);
    const slabs = state.slabs.filter((slab) => slab.jobId === job.id);
    const available = state.slabs.filter((slab) => !slab.jobId && slab.status !== "used");
    const facts = [
      ["Material", job.material],
      ["Color", job.stoneColor],
      ["Edge", job.edgeProfile],
      ["Sink", [job.sinkType, job.sinkCutouts ? plural(Number(job.sinkCutouts), "cutout", "cutouts") : ""].filter(Boolean).join(" · ")],
      ["Backsplash", job.backsplash],
      ["Square feet", job.sqft ? String(job.sqft) : ""]
    ].filter((row) => row[1]);
    return `<a class="text-link" href="#/customers/${esc(job.customerId)}">${esc(customer?.name || "Customer")}</a>
      <p class="page-sub">${esc(jobTitle(job))}</p>
      ${contactActions(links)}
      <div class="stages" id="stages">${STAGES.map((stage) => `<button type="button" class="stage${job.stage === stage.id ? " is-on" : ""}" data-act="stage" data-id="${esc(job.id)}" data-stage="${stage.id}">${esc(stage.label)}</button>`).join("")}</div>
      ${job.legacyStatus ? `<p class="meta">Previous status: ${esc(job.legacyStatus)}</p>` : ""}
      ${section("Job details", facts.length ? facts.map((row) => `<div class="fact"><span>${esc(row[0])}</span><b>${esc(row[1])}</b></div>`).join("") : `<p class="meta">No material details yet.</p>`)}
      ${section("Dates", `<div class="fact"><span>Template</span><b>${esc(job.templateDate ? niceDate(job.templateDate, { weekday: true, year: true }) : "Not set")}</b></div><div class="fact"><span>Install</span><b>${esc(job.installDate ? niceDate(job.installDate, { weekday: true, year: true }) : "Not set")}</b></div>`)}
      ${section("Money", sumRows([
        { label: source === "invoice" ? "Job total (invoice)" : "Job total (contract)", value: money(revenue) },
        { label: "Paid", value: money(paid) },
        { label: "Balance due", value: money(balance), strong: true, negative: balance > 0 },
        { label: "Material", value: money(job.materialCostCents || 0) },
        { label: "Labor", value: money(job.laborCostCents || 0) },
        { label: "Other costs", value: money(job.otherCostCents || 0) },
        { label: margin === null ? "Profit" : "Profit (" + margin + "%)", value: money(profit), strong: true, negative: profit < 0 }
      ]) + `<div class="btn-row"><a class="btn primary" href="#/jobs/${esc(job.id)}/pay/new">Add payment</a><button type="button" class="btn" data-act="invoice" data-id="${esc(job.id)}">Create invoice</button></div>`
        + (payments.length ? `<div class="stack">${payments.map((payment) => `<a class="pay-row" href="#/jobs/${esc(job.id)}/pay/${esc(payment.id)}"><span><b>${esc(money(payment.amountCents))}</b><small>${esc(niceDate(payment.date, { year: true }))} · ${esc(methodLabel(payment.method))} · ${esc(kindLabel(payment.kind))}</small></span><span class="meta">Edit</span></a>`).join("")}</div>` : `<p class="meta">No payments yet.</p>`)
        + docsBlock(estimates, invoices))}
      ${section("Photos", PHOTO_CATEGORIES.map((cat) => {
        const photos = state.photos.filter((photo) => photo.category === cat.id);
        return `<div class="photo-block"><div class="card-top"><h3>${esc(cat.label)}</h3><button type="button" class="btn" data-act="add-photo" data-cat="${cat.id}">${icon("camera")} Add</button></div>${photos.length ? `<div class="photos">${photos.map((photo) => `<button type="button" class="photo-btn" data-act="photo" data-id="${esc(photo.id)}"><img alt="${esc(cat.label)} photo" data-photo="${esc(photo.id)}"></button>`).join("")}</div>` : `<p class="meta">No ${esc(cat.label.toLowerCase())} photos.</p>`}</div>`;
      }).join("") + `<input id="photo-file" type="file" accept="image/*" multiple hidden>`)}
      ${section("Stone on this job", (slabs.length ? slabs.map((slab) => `<div class="card-top"><div><strong>${esc(slab.stoneColor || slab.material || "Stone")}</strong><div class="meta">${esc(slab.kind)} · ${esc(slab.sqft || 0)} sq ft · ${esc(slab.status)}</div></div><button type="button" class="btn" data-act="unassign" data-id="${esc(slab.id)}">Unassign</button></div>`).join("") : `<p class="meta">No slab assigned. Slab cost is not added into profit. Put what you paid in material cost if it should count.</p>`)
        + (available.length ? `<label class="field"><span class="lbl">Assign from inventory</span><span class="select"><select id="slab-pick">${available.map((slab) => `<option value="${esc(slab.id)}">${esc((slab.stoneColor || slab.material) + " · " + slab.kind)}</option>`).join("")}</select></span></label><button type="button" class="btn" data-act="assign" data-job="${esc(job.id)}">Assign slab</button>` : `<a class="text-link" href="#/inventory/new">Add a slab</a>`))}
      ${job.notes ? section("Notes", `<p>${esc(job.notes)}</p>`) : ""}
      <div class="btn-col"><a class="btn primary" href="#/jobs/${esc(job.id)}/edit">Edit job</a><a class="btn" href="#/estimates/new?job=${esc(job.id)}">New estimate</a></div>
      ${lightbox ? lightboxHtml(job.id) : ""}`;
  },
  mount(root) {
    const urls = [];
    root.querySelectorAll("img[data-photo]").forEach((img) => {
      const photo = state.photos.find((item) => item.id === img.dataset.photo);
      if (!photo?.blob) return;
      const url = URL.createObjectURL(photo.blob);
      urls.push(url);
      img.src = url;
    });
    root.querySelector(".stage.is-on")?.scrollIntoView({ inline: "center", block: "nearest" });
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  },
  async onClick(act, el) {
    const jobId = currentRoute().parts[1];
    if (act === "stage") {
      const result = await setStage(el.dataset.id, el.dataset.stage);
      if (!result.ok) return toast(result.error);
      toast("Stage set to " + stageLabel(el.dataset.stage), result.undo);
      return render({ keepScroll: true });
    }
    if (act === "invoice") {
      const result = await createInvoiceFromJob(el.dataset.id);
      if (!result.ok) return toast(result.error);
      toast("Invoice created. Review it before you share.");
      return go("/invoices/" + result.id);
    }
    if (act === "add-photo") {
      photoCategory = el.dataset.cat;
      document.getElementById("photo-file")?.click();
      return;
    }
    if (act === "photo") {
      lightbox = el.dataset.id;
      return render({ keepScroll: true });
    }
    if (act === "close-photo") {
      lightbox = "";
      return render({ keepScroll: true });
    }
    if (act === "delete-photo") {
      const result = await deletePhoto(el.dataset.id);
      lightbox = "";
      if (!result.ok) toast(result.error);
      return render({ keepScroll: true });
    }
    if (act === "assign") {
      const slab = state.slabs.find((item) => item.id === document.getElementById("slab-pick")?.value);
      if (!slab) return;
      const result = await saveSlab({ ...slab, jobId: el.dataset.job, status: "reserved" });
      if (!result.ok) return toast(result.error);
      toast("Slab assigned");
      return render({ keepScroll: true });
    }
    if (act === "unassign") {
      const slab = state.slabs.find((item) => item.id === el.dataset.id);
      if (!slab) return;
      const result = await saveSlab({ ...slab, jobId: "", status: slab.status === "used" ? "used" : "available" });
      if (!result.ok) return toast(result.error);
      return render({ keepScroll: true });
    }
  },
  async onChange(event) {
    if (event.target.id !== "photo-file") return;
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    const result = await addPhotos(currentRoute().parts[1], photoCategory, files);
    if (!result.ok) toast(result.error);
    else toast(plural(files.length, "photo added", "photos added"));
    render({ keepScroll: true });
  }
};

function docsBlock(estimates, invoices) {
  const links = [
    ...estimates.map((doc) => `<a href="#/estimates/${esc(doc.id)}">${esc(docNumber("estimate", doc.number))}</a>`),
    ...invoices.map((doc) => `<a href="#/invoices/${esc(doc.id)}">${esc(docNumber("invoice", doc.number))}</a>`)
  ];
  return links.length ? `<div class="link-row">${links.join("")}</div>` : "";
}

function lightboxHtml(jobId) {
  const photo = state.photos.find((item) => item.id === lightbox);
  if (!photo) return "";
  const label = PHOTO_CATEGORIES.find((cat) => cat.id === photo.category)?.label || "Photo";
  return `<div class="lightbox"><button type="button" class="btn" data-act="close-photo">Close</button><img alt="${esc(label)} photo" data-photo="${esc(photo.id)}"><button type="button" class="btn danger" data-act="delete-photo" data-id="${esc(photo.id)}">Delete photo</button></div>`;
}

function blankJob(customerId) {
  return {
    id: "",
    customerId: customerId || "",
    name: "",
    phone: "",
    email: "",
    address: "",
    title: "",
    stage: "lead",
    siteAddress: "",
    material: "",
    stoneColor: "",
    edgeProfile: "",
    sinkType: "",
    sinkCutouts: "",
    backsplash: "",
    sqft: "",
    templateDate: "",
    installDate: "",
    notes: "",
    contractTotal: "",
    depositPercent: String(state.business.defaultDepositPercent || 0),
    materialCost: "",
    laborCost: "",
    otherCost: "",
    error: "",
    confirm: false
  };
}

function jobFromRecord(job) {
  return {
    id: job.id,
    customerId: job.customerId,
    title: job.title || "",
    stage: job.stage,
    siteAddress: job.siteAddress || "",
    material: job.material || "",
    stoneColor: job.stoneColor || "",
    edgeProfile: job.edgeProfile || "",
    sinkType: job.sinkType || "",
    sinkCutouts: job.sinkCutouts || "",
    backsplash: job.backsplash || "",
    sqft: formatQty(job.sqft || 0),
    templateDate: job.templateDate || "",
    installDate: job.installDate || "",
    notes: job.notes || "",
    contractTotal: centsToInput(job.contractTotalCents),
    depositPercent: String(job.depositPercent ?? state.business.defaultDepositPercent ?? 0),
    materialCost: centsToInput(job.materialCostCents),
    laborCost: centsToInput(job.laborCostCents),
    otherCost: centsToInput(job.otherCostCents),
    error: "",
    confirm: false
  };
}

function readJobForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  return { ...(jobWorking || {}), ...data, confirm: jobWorking?.confirm || false };
}

export const form = {
  title(route) {
    return route.parts[1] === "new" ? "New job" : "Edit job";
  },
  back(route) {
    return route.parts[1] === "new" ? "#/jobs" : "#/jobs/" + route.parts[1];
  },
  html(route) {
    const key = route.path + (route.params.customer || "");
    if (jobKey !== key) {
      jobKey = key;
      if (route.parts[1] === "new") jobWorking = blankJob(route.params.customer || "");
      else {
        const job = jobById(route.parts[1]);
        jobWorking = job ? jobFromRecord(job) : null;
      }
    }
    if (!jobWorking) return empty("That job isn't on this phone", "Go back to the job list.");
    const creating = !jobWorking.id;
    const customerChoices = state.customers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((customer) => ({ value: customer.id, label: customer.name }));
    const customerBlock = creating
      ? `${state.customers.length ? selectField({ label: "Customer", name: "customerId", value: jobWorking.customerId, options: [{ value: "", label: "Select a customer" }, ...customerChoices, { value: "__new", label: "New customer" }] }) : ""}
        <div id="new-customer"${state.customers.length && jobWorking.customerId !== "__new" ? " hidden" : ""}>
          ${field({ label: "Customer name", name: "name", value: jobWorking.name })}
          ${field({ label: "Phone", name: "phone", value: jobWorking.phone, type: "tel", inputmode: "tel" })}
          ${field({ label: "Email", name: "email", value: jobWorking.email, type: "email", inputmode: "email" })}
          ${field({ label: "Address", name: "address", value: jobWorking.address })}
        </div>`
      : selectField({ label: "Customer", name: "customerId", value: jobWorking.customerId, options: customerChoices });
    const hasInvoice = state.invoices.some((inv) => inv.jobId === jobWorking.id && inv.status !== "void");
    return `<form id="job-form">${suggestLists()}
      ${section("Customer", customerBlock)}
      ${section("Job details", [
        field({ label: "Job name", name: "title", value: jobWorking.title, placeholder: "Kitchen, vanities…" }),
        selectField({ label: "Stage", name: "stage", value: jobWorking.stage, options: STAGES.map((stage) => ({ value: stage.id, label: stage.label })) }),
        field({ label: "Job site address", name: "siteAddress", value: jobWorking.siteAddress, placeholder: "If it's different from the customer" }),
        field({ label: "Material", name: "material", value: jobWorking.material, list: "suggest-material" }),
        field({ label: "Color", name: "stoneColor", value: jobWorking.stoneColor, placeholder: "Calacatta, Black Pearl…" }),
        field({ label: "Edge profile", name: "edgeProfile", value: jobWorking.edgeProfile, list: "suggest-edge" }),
        field({ label: "Sink type", name: "sinkType", value: jobWorking.sinkType, list: "suggest-sink" }),
        field({ label: "Sink cutouts", name: "sinkCutouts", value: jobWorking.sinkCutouts, inputmode: "numeric" }),
        field({ label: "Backsplash", name: "backsplash", value: jobWorking.backsplash, list: "suggest-backsplash" }),
        field({ label: "Square feet", name: "sqft", value: jobWorking.sqft, inputmode: "decimal" }),
        field({ label: "Notes", name: "notes", value: jobWorking.notes, multiline: true })
      ].join(""))}
      ${section("Dates", field({ label: "Template date", name: "templateDate", value: jobWorking.templateDate, type: "date" }) + field({ label: "Install date", name: "installDate", value: jobWorking.installDate, type: "date" }))}
      ${section("Money", [
        field({ label: "Contract amount", name: "contractTotal", value: jobWorking.contractTotal, inputmode: "decimal", placeholder: "Price you agreed" }),
        field({ label: "Deposit percent", name: "depositPercent", value: jobWorking.depositPercent, inputmode: "decimal" }),
        field({ label: "Material cost", name: "materialCost", value: jobWorking.materialCost, inputmode: "decimal" }),
        field({ label: "Labor cost", name: "laborCost", value: jobWorking.laborCost, inputmode: "decimal" }),
        field({ label: "Other costs", name: "otherCost", value: jobWorking.otherCost, inputmode: "decimal" }),
        `<div class="sums"><div class="grand"><span>Profit preview</span><b id="live-profit">—</b></div></div>`,
        hasInvoice ? `<p class="meta">This job has an invoice. The profit on the job page uses the invoice total.</p>` : `<p class="meta">Profit here is the contract amount minus these costs.</p>`
      ].join(""))}
      ${err(jobWorking.error)}
      <button class="btn primary block" type="submit">${creating ? "Save job" : "Save changes"}</button>
      ${jobWorking.id ? `<button class="btn danger block" type="button" data-act="delete">${jobWorking.confirm ? "Delete this job, its payments, and its photos" : "Delete job"}</button>` : ""}
    </form>`;
  },
  mount() {
    paintJobProfit();
  },
  onInput(event) {
    if (event.target.form?.id === "job-form") paintJobProfit();
  },
  onChange(event) {
    if (event.target.id !== "customerId") return;
    const box = document.getElementById("new-customer");
    if (box) box.hidden = event.target.value !== "__new";
  },
  async onSubmit() {
    const formEl = document.getElementById("job-form");
    const raw = readJobForm(formEl);
    const moneyFields = [
      ["contractTotal", "the contract amount"],
      ["materialCost", "material cost"],
      ["laborCost", "labor cost"],
      ["otherCost", "other costs"]
    ];
    const cents = {};
    for (const [key, label] of moneyFields) {
      const parsed = parseDollarsToCents(raw[key]);
      if (parsed === null) return fail(raw, "Enter " + label + " like 150 or 150.00, or leave it blank.");
      cents[key] = parsed;
    }
    const deposit = parsePercent(raw.depositPercent, { max: 100, decimals: 2 });
    if (deposit === null) return fail(raw, "Enter the deposit percent from 0 to 100.");
    const sqft = raw.sqft.trim() === "" ? null : parseQty(raw.sqft);
    if (sqft === null) return fail(raw, "Enter square footage like 42 or 42.5, or leave it blank.");
    if (raw.sinkCutouts && !/^\d+$/.test(String(raw.sinkCutouts).trim())) return fail(raw, "Enter sink cutouts as a whole number, or leave it blank.");
    let customerId = raw.customerId;
    if (!raw.id && (customerId === "__new" || !state.customers.length)) {
      const created = await saveCustomer({ name: raw.name, phone: raw.phone, email: raw.email, address: raw.address });
      if (!created.ok) return fail(raw, created.error);
      customerId = created.id;
    }
    if (!customerId || customerId === "__new") return fail(raw, "Choose a customer or enter a new one.");
    const result = await saveJob({
      id: raw.id,
      customerId,
      title: raw.title,
      stage: raw.stage,
      siteAddress: raw.siteAddress,
      material: raw.material,
      stoneColor: raw.stoneColor,
      edgeProfile: raw.edgeProfile,
      sinkType: raw.sinkType,
      sinkCutouts: raw.sinkCutouts,
      backsplash: raw.backsplash,
      sqft,
      templateDate: raw.templateDate,
      installDate: raw.installDate,
      notes: raw.notes,
      contractTotalCents: cents.contractTotal,
      materialCostCents: cents.materialCost,
      laborCostCents: cents.laborCost,
      otherCostCents: cents.otherCost,
      depositPercent: deposit
    });
    if (!result.ok) return fail(raw, result.error);
    jobKey = "";
    toast(raw.id ? "Job saved" : "Job added");
    go("/jobs/" + result.id);
  },
  async onClick(act) {
    if (act !== "delete") return;
    if (!jobWorking?.confirm) {
      jobWorking.confirm = true;
      const formEl = document.getElementById("job-form");
      jobWorking = { ...jobWorking, ...readJobForm(formEl), confirm: true };
      return render({ keepScroll: true });
    }
    const result = await deleteJob(jobWorking.id);
    if (!result.ok) {
      jobWorking.error = result.error;
      return render({ keepScroll: true });
    }
    jobKey = "";
    toast("Job deleted");
    go("/jobs");
  }
};

function fail(raw, error) {
  jobWorking = { ...raw, error, confirm: false };
  render({ keepScroll: true });
}

function paintJobProfit() {
  const formEl = document.getElementById("job-form");
  const el = document.getElementById("live-profit");
  if (!formEl || !el) return;
  const values = ["contractTotal", "materialCost", "laborCost", "otherCost"].map((name) => parseDollarsToCents(formEl.elements[name].value));
  if (values.some((value) => value === null)) {
    el.textContent = "Check the amounts";
    return;
  }
  const profit = values[0] - values[1] - values[2] - values[3];
  el.textContent = money(profit);
  el.classList.toggle("neg", profit < 0);
}

export const payment = {
  title(route) {
    return route.parts[3] === "new" ? "Add payment" : "Edit payment";
  },
  back(route) {
    return "#/jobs/" + route.parts[1];
  },
  html(route) {
    const job = jobById(route.parts[1]);
    if (!job) return empty("That job isn't on this phone", "Go back to the job list.");
    const existing = route.parts[3] === "new" ? null : state.payments.find((item) => item.id === route.parts[3]);
    if (route.parts[3] !== "new" && !existing) return empty("That payment isn't on this phone", "It may have been deleted.");
    const customer = customerById(job.customerId);
    const balance = balanceCents(job, state.invoices, state.payments);
    return `<form id="pay-form">
      <p class="lede">${esc(customer?.name || "Customer")}</p>
      <p class="meta">Balance due ${esc(money(balance))}. Saving a payment updates it. Nothing is marked paid until you enter the amount.</p>
      ${section("Payment", [
        field({ label: "Amount", name: "amount", value: existing ? centsToInput(existing.amountCents) : "", inputmode: "decimal", placeholder: "150.00" }),
        field({ label: "Date", name: "date", value: existing?.date || todayISO(), type: "date" }),
        selectField({ label: "Method", name: "method", value: existing?.method || "zelle", options: PAY_METHODS.map((method) => ({ value: method.id, label: method.label })) }),
        selectField({ label: "Type", name: "kind", value: existing?.kind || "deposit", options: PAY_KINDS.map((kind) => ({ value: kind.id, label: kind.label })) }),
        field({ label: "Note", name: "note", value: existing?.note || "", multiline: true, rows: 3 })
      ].join(""))}
      <p class="err" id="pay-error" hidden></p>
      <button class="btn primary block" type="submit">${existing ? "Save payment" : "Add payment"}</button>
      ${existing ? `<button class="btn danger block" type="button" data-act="ask-delete">Delete payment</button><div id="confirm-delete" hidden><p>Delete this payment? The balance due will update.</p><button type="button" class="btn danger block" data-act="confirm-delete" data-id="${esc(existing.id)}">Delete this payment</button></div>` : ""}
    </form>`;
  },
  async onSubmit(event) {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const amount = parseDollarsToCents(data.amount);
    const error = document.getElementById("pay-error");
    if (amount === null || amount <= 0) {
      error.hidden = false;
      error.textContent = "Enter a payment amount like 150 or 150.00.";
      return;
    }
    const route = currentRoute();
    const result = await savePayment({
      id: route.parts[3] === "new" ? "" : route.parts[3],
      jobId: route.parts[1],
      amountCents: amount,
      date: data.date,
      method: data.method,
      kind: data.kind,
      note: data.note
    });
    if (!result.ok) {
      error.hidden = false;
      error.textContent = result.error;
      return;
    }
    toast(result.stage === "paid" ? "Payment saved. Balance is paid, so the job moved to Paid." : "Payment saved");
    go("/jobs/" + route.parts[1]);
  },
  onClick(act, el) {
    if (act === "ask-delete") {
      const box = document.getElementById("confirm-delete");
      if (box) box.hidden = false;
      return;
    }
    if (act === "confirm-delete") {
      deletePayment(el.dataset.id).then((result) => {
        if (!result.ok) return toast(result.error);
        toast("Payment deleted", result.undo);
        go("/jobs/" + currentRoute().parts[1]);
      });
    }
  }
};
