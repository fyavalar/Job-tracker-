import { state, customerById, jobById } from "../state.js";
import { saveCustomer, saveJob, deleteJob, setStage, savePayment, deletePayment, createInvoiceFromJob, saveSlab, addPhotos, deletePhoto, loadPhotos, addJobMaterialCost, savePhotoCaption, saveJobLayout } from "../actions.js";
import { contactLinks } from "../phone.js";
import { avatar, badge, contactActions, empty, err, field, section, segmented, selectField, stageStepper, statTiles, suggestLists, sumRows } from "../components.js";
import { icon } from "../icons.js";
import { esc, centsToInput, formatQty, money, niceDate, parseDollarsToCents, parsePercent, parseQty, plural, todayISO, foldText, digits } from "../format.js";
import { balanceCents, marginPercent, paidCents, profitCents, revenueSource, latestActiveInvoice, balanceExcludingPayment, jobRevenueCents } from "../calc.js";
import { PAY_KINDS, PAY_METHODS, PHOTO_CATEGORIES, STAGES, docNumber, jobTitle, kindLabel, methodLabel, stageLabel } from "../model.js";
import { go, goBackTo, render, toast, currentRoute, markSaved } from "../nav.js";
import { confirmSheet, chooseSheet } from "../sheet.js";
import { quickPasteHtml, customerFieldsHtml, handlePhoneInput, paintDupes, fillFromText, filledMessage, readClipboard } from "../customer-ui.js";
import { presetLayout, layoutStats, fmtNum, jobFieldsFromLayout, PRESETS, summaryLines } from "../layout.js";
import { presetGrid, layoutPreviewHtml, shareLayoutPng } from "./layout.js";

let jobQuery = "";
let lightbox = "";
let photoCategory = "site";
let jobWorking = null;
let jobKey = "";
let pendingAssign = "";
let dupeDismissed = false;

const STAGE_SWATCH = { lead: "#7b8aa6", quoted: "#3d7ab8", approved: "#2a9a88", templated: "#7a62c4", fabrication: "#c98a1b", installed: "#2e8a4a", paid: "#b8862b" };

function nextDate(job) {
  const today = todayISO();
  return [job.templateDate, job.installDate].filter((date) => date && date >= today).sort()[0] || "9999-99-99";
}

function filtered(route) {
  const stage = route.params.stage || "all";
  const q = foldText(jobQuery.trim());
  const qd = /^[\d\s().+-]+$/.test(jobQuery.trim()) ? digits(jobQuery) : "";
  return state.jobs
    .filter((job) => {
      if (stage === "open" && (job.stage === "paid")) return false;
      if (stage !== "all" && stage !== "open" && job.stage !== stage) return false;
      if (!q) return true;
      const customer = customerById(job.customerId);
      const text = [customer?.name, customer?.phone, job.siteAddress, job.material, job.stoneColor, job.notes, jobTitle(job)].join(" ");
      return foldText(text).includes(q) || (qd.length >= 3 && digits(customer?.phone).includes(qd));
    })
    .sort((a, b) => nextDate(a).localeCompare(nextDate(b)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function whenLabel(job) {
  const today = todayISO();
  const upcoming = [["Template", job.templateDate], ["Install", job.installDate]].filter(([, d]) => d && d >= today).sort((a, b) => a[1].localeCompare(b[1]))[0];
  if (upcoming) return (upcoming[1] === today ? upcoming[0] + " today" : upcoming[0] + " " + niceDate(upcoming[1], { weekday: true }));
  if (job.installDate) return "Installed " + niceDate(job.installDate);
  return "";
}

function jobCard(job) {
  const customer = customerById(job.customerId);
  const balance = balanceCents(job, state.invoices, state.payments);
  const total = jobRevenueCents(job, state.invoices);
  const when = whenLabel(job);
  const today = when.endsWith("today");
  return `<a class="job-card" href="#/jobs/${esc(job.id)}">
    <div class="jc-top"><strong>${esc(customer?.name || "Customer")}</strong><b class="jc-amt">${esc(money(total))}</b></div>
    <div class="jc-sub">${esc([jobTitle(job), [job.material, job.stoneColor].filter(Boolean).join(" ")].filter(Boolean).join(" · "))}</div>
    <div class="jc-foot">${badge(job.stage)}${when ? `<span class="pill${today ? " is-today" : ""}">${icon("calendar")}${esc(when)}</span>` : ""}<span class="jc-due${balance > 0 ? " neg" : " ok"}">${balance > 0 ? "Due " + esc(money(balance)) : total > 0 ? "Paid" : ""}</span></div>
  </a>`;
}

function listHtml(route) {
  const stage = route.params.stage || "all";
  const rows = filtered(route);
  if (!state.jobs.length) return empty("No jobs yet", "Start a job for a new or existing customer. You can draw the countertops right away.", { art: "jobs", action: `<a class="btn primary" href="#/jobs/new">${icon("plus")} New job</a>` });
  if (!rows.length) return empty("Nothing here", jobQuery ? "No jobs match “" + jobQuery + "”." : "No " + (stage === "all" || stage === "open" ? "" : stageLabel(stage).toLowerCase() + " ") + "jobs right now.", { art: "search" });
  return `<div class="stack-cards">${rows.map(jobCard).join("")}</div>`;
}

export const list = {
  root: true,
  title: () => "Jobs",
  action: () => `<a class="icon-btn" href="#/jobs/new" aria-label="New job">${icon("plus")}</a>`,
  html(route) {
    const stage = route.params.stage || "all";
    const count = (id) => (id === "all" ? state.jobs.length : id === "open" ? state.jobs.filter((j) => j.stage !== "paid").length : state.jobs.filter((j) => j.stage === id).length);
    const chips = [["all", "All"], ["open", "Open"], ...STAGES.map((item) => [item.id, item.label])]
      .map(([id, label]) => `<a class="chip${stage === id ? " is-on" : ""}" href="#/jobs${id === "all" ? "" : "?stage=" + id}">${esc(label)}<span class="chip-n">${count(id)}</span></a>`)
      .join("");
    return `<div class="search-field">${icon("search")}<input id="job-q" type="search" placeholder="Search name, phone, stone, street" value="${esc(jobQuery)}" aria-label="Search jobs" autocomplete="off" enterkeyhint="search"></div>
      <div class="chips" role="tablist" aria-label="Filter by stage">${chips}</div>
      <p class="count-line" id="job-count">${esc(plural(filtered(route).length, "job", "jobs"))}</p>
      <div id="job-list">${listHtml(route)}</div>
      ${state.jobs.length ? `<a class="btn primary block" href="#/jobs/new">${icon("plus")} New job</a>` : ""}`;
  },
  mount(root) {
    root.querySelector(".chip.is-on")?.scrollIntoView({ inline: "center", block: "nearest" });
  },
  onInput(event) {
    if (event.target.id !== "job-q") return;
    jobQuery = event.target.value;
    const box = document.getElementById("job-list");
    if (box) box.innerHTML = listHtml(currentRoute());
    const count = document.getElementById("job-count");
    if (count) count.textContent = plural(filtered(currentRoute()).length, "job", "jobs");
  }
};

function layoutCard(job) {
  const href = "#/jobs/" + job.id + "/layout";
  if (!job.layout?.pieces?.length) {
    return section("Countertop layout", `<p class="meta">Pick a shape to start a dimensioned drawing with cabinets and cutouts.</p>${presetGrid("start-layout")}`, { className: "bp-card is-empty" });
  }
  const s = layoutStats(job.layout);
  return section("Countertop layout", `${layoutPreviewHtml(job, { href })}
    ${statTiles([
      { value: fmtNum(s.sqft, 1), label: "sq ft", accent: true },
      { value: fmtNum(s.polishedLF, 1), label: "polish lf" },
      { value: fmtNum(s.backsplashLF, 1), label: "splash lf" },
      { value: String(s.cutouts), label: s.cutouts === 1 ? "cutout" : "cutouts" }
    ], { className: "sm" })}
    <div class="btn-row"><a class="btn" href="${esc(href)}">${icon("edit")} Edit layout</a><button type="button" class="btn" data-act="share-layout">${icon("share")} Share PNG</button></div>`, { className: "bp-card" });
}

function moneyCard(job, payments, estimates, invoices) {
  const revenue = jobRevenueCents(job, state.invoices);
  const paid = paidCents(state.payments, job.id);
  const balance = balanceCents(job, state.invoices, state.payments);
  const profit = profitCents(job, state.invoices);
  const margin = marginPercent(job, state.invoices);
  const source = revenueSource(job, state.invoices);
  const pct = revenue > 0 ? Math.min(100, Math.round((paid / revenue) * 100)) : 0;
  const head = `<div class="money-head">
      <div><span class="mh-kicker">${balance > 0 ? "Balance due" : revenue > 0 ? "Paid in full" : "No price yet"}</span><b class="mh-value${balance > 0 ? " neg" : ""}">${esc(money(Math.max(0, balance)))}</b></div>
      <div class="mh-side"><span>${esc(money(paid))} of ${esc(money(revenue))}</span><div class="meter thin"><i class="meter-paid" style="width:${pct}%"></i></div></div>
    </div>`;
  const rows = sumRows([
    { label: source === "invoice" ? "Job total (invoice)" : "Job total (contract)", value: money(revenue) },
    { label: "Paid", value: money(paid) },
    { label: "Costs", value: money((job.materialCostCents || 0) + (job.laborCostCents || 0) + (job.otherCostCents || 0)), muted: true },
    { label: margin === null ? "Profit" : "Profit · " + margin + "%", value: money(profit), strong: true, negative: profit < 0 }
  ]);
  const payList = payments.length
    ? `<div class="list inset">${payments.map((payment) => `<a class="row-main" href="#/jobs/${esc(job.id)}/pay/${esc(payment.id)}"><span class="pay-ico">${icon("money")}</span><span class="row-text"><strong>${esc(money(payment.amountCents))}</strong><small>${esc(niceDate(payment.date, { year: true }))} · ${esc(methodLabel(payment.method))} · ${esc(kindLabel(payment.kind))}</small></span>${icon("chevronRight")}</a>`).join("")}</div>`
    : `<p class="meta">No payments yet.</p>`;
  const docLinks = [
    ...estimates.map((doc) => `<a class="pill link" href="#/estimates/${esc(doc.id)}">${icon("doc")}${esc(docNumber("estimate", doc.number))}</a>`),
    ...invoices.map((doc) => `<a class="pill link" href="#/invoices/${esc(doc.id)}">${icon("doc")}${esc(docNumber("invoice", doc.number))}${doc.status === "void" ? " · void" : ""}</a>`)
  ];
  return section("Money", head + `<div class="btn-row"><a class="btn primary" href="#/jobs/${esc(job.id)}/pay/new">${icon("plus")} Log payment</a>${invoiceButton(job)}</div>` + rows + `<h3 class="sub-h">Payments</h3>` + payList + (docLinks.length ? `<div class="pill-row">${docLinks.join("")}</div>` : ""), { className: "money-card" });
}

function invoiceButton(job) {
  const current = latestActiveInvoice(state.invoices, job.id);
  if (!current) return `<button type="button" class="btn" data-act="invoice" data-id="${esc(job.id)}">${icon("doc")} Invoice</button>`;
  return `<a class="btn" href="#/invoices/${esc(current.id)}">${icon("doc")} View invoice</a>`;
}

export const detail = {
  title(route) {
    const job = jobById(route.parts[1]);
    return job ? jobTitle(job) : "Job";
  },
  back: () => "#/jobs",
  action: (route) => (jobById(route.parts[1]) ? `<a class="text-btn" href="#/jobs/${esc(route.parts[1])}/edit">Edit</a>` : ""),
  async prepare(route) {
    if (state.photoJobId !== route.parts[1]) lightbox = "";
    await loadPhotos(route.parts[1]);
  },
  html(route) {
    const job = jobById(route.parts[1]);
    if (!job) return empty("That job isn't on this phone", "It may have been deleted.", { art: "jobs" });
    const customer = customerById(job.customerId);
    const address = job.siteAddress || customer?.address || "";
    const links = contactLinks({ phone: customer?.phone, email: customer?.email, address, subject: state.business.name || "" });
    const payments = state.payments.filter((payment) => payment.jobId === job.id).sort((a, b) => b.date.localeCompare(a.date));
    const estimates = state.estimates.filter((doc) => doc.jobId === job.id);
    const invoices = state.invoices.filter((doc) => doc.jobId === job.id);
    const slabs = state.slabs.filter((slab) => slab.jobId === job.id);
    const available = state.slabs.filter((slab) => !slab.jobId && slab.status !== "used");
    const facts = [
      ["Material", job.material],
      ["Color", job.stoneColor],
      ["Edge", job.edgeProfile],
      ["Sink", [job.sinkType, job.sinkCutouts && job.sinkCutouts !== "0" ? plural(Number(job.sinkCutouts), "cutout", "cutouts") : ""].filter(Boolean).join(" · ")],
      ["Backsplash", job.backsplash],
      ["Square feet", job.sqft ? formatQty(job.sqft) + " sq ft" : ""]
    ].filter((row) => row[1]);
    const dateRow = (label, iso) => `<div class="fact"><span>${label}</span><b class="${iso === todayISO() ? "is-today-text" : ""}">${esc(iso ? (iso === todayISO() ? "Today · " : "") + niceDate(iso, { weekday: true, year: true }) : "Not set")}</b></div>`;
    return `<a class="who-link" href="#/customers/${esc(job.customerId)}">${avatar(customer?.name || "?")}<span><strong>${esc(customer?.name || "Customer")}</strong><small>${esc(address || customer?.phone || "View customer")}</small></span>${icon("chevronRight")}</a>
      ${contactActions(links)}
      ${stageStepper(job)}
      ${job.legacyStatus ? `<p class="meta">Previous status: ${esc(job.legacyStatus)}</p>` : ""}
      ${layoutCard(job)}
      ${moneyCard(job, payments, estimates, invoices)}
      ${section("Job details", facts.length ? `<div class="facts">${facts.map((row) => `<div class="fact"><span>${esc(row[0])}</span><b>${esc(row[1])}</b></div>`).join("")}</div>` : `<p class="meta">No stone details yet. <a class="text-link" href="#/jobs/${esc(job.id)}/edit">Add them</a></p>`)}
      ${section("Schedule", `<div class="facts">${dateRow("Template", job.templateDate)}${dateRow("Install", job.installDate)}</div>`)}
      ${section("Photos", PHOTO_CATEGORIES.map((cat) => {
        const photos = state.photos.filter((photo) => photo.category === cat.id);
        return `<div class="photo-block"><div class="photo-head"><h3>${esc(cat.label)}${photos.length ? ` <small>${photos.length}</small>` : ""}</h3><button type="button" class="btn sm" data-act="add-photo" data-cat="${cat.id}">${icon("camera")} Add</button></div>${photos.length ? `<div class="photos">${photos.map((photo) => `<button type="button" class="photo-btn" data-act="photo" data-id="${esc(photo.id)}" aria-label="Open ${esc(cat.label)} photo"><img alt="${esc(photo.caption || cat.label + " photo")}" data-photo="${esc(photo.id)}"></button>`).join("")}</div>` : ""}</div>`;
      }).join("") + `<input id="photo-file" type="file" accept="image/*" multiple hidden>`, { className: "photos-card" })}
      ${section("Stone on this job", (slabs.length ? `<div class="list inset">${slabs.map((slab) => `<div class="row-main static"><span class="pay-ico">${icon("slab")}</span><span class="row-text"><strong>${esc(slab.stoneColor || slab.material || "Stone")}</strong><small>${esc([slab.kind === "remnant" ? "Remnant" : "Slab", slab.sqft ? slab.sqft + " sq ft" : "", slab.status].filter(Boolean).join(" · "))}</small></span><button type="button" class="btn sm" data-act="unassign" data-id="${esc(slab.id)}">Unassign</button></div>`).join("")}</div>` : `<p class="meta">No slab assigned yet.</p>`)
        + (available.length ? `<div class="assign-row">${selectField({ label: "Assign from inventory", name: "slab-pick", id: "slab-pick", value: pendingAssign, options: available.map((slab) => ({ value: slab.id, label: (slab.stoneColor || slab.material) + " · " + (slab.kind === "remnant" ? "remnant" : "slab") + (slab.costCents ? " · " + money(slab.costCents) : "") })) })}<button type="button" class="btn" data-act="assign" data-job="${esc(job.id)}">Assign</button></div>` : `<a class="text-link" href="#/inventory/new">${icon("plus")} Add a slab to inventory</a>`)
        + assignPrompt())}
      ${job.notes ? section("Notes", `<p class="notes">${esc(job.notes)}</p>`) : ""}
      <div class="btn-col"><a class="btn" href="#/jobs/${esc(job.id)}/edit">${icon("edit")} Edit job</a><a class="btn" href="#/estimates/new?job=${esc(job.id)}">${icon("doc")} New estimate${job.layout?.pieces?.length ? " from layout" : ""}</a></div>
      ${lightbox ? lightboxHtml() : ""}`;
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
    const onKey = (event) => {
      if (event.key === "Escape" && lightbox) {
        lightbox = "";
        render({ keepScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  },
  leave() {
    lightbox = "";
    pendingAssign = "";
  },
  async onClick(act, el) {
    const jobId = currentRoute().parts[1];
    const job = jobById(jobId);
    if (act === "stage") {
      const result = await setStage(el.dataset.id, el.dataset.stage);
      if (!result.ok) return toast(result.error);
      if (result.undo) toast("Moved to " + stageLabel(el.dataset.stage), result.undo);
      return render({ keepScroll: true });
    }
    if (act === "stage-picker") {
      const choice = await chooseSheet({
        title: "Set stage",
        options: STAGES.map((s, i) => ({ value: s.id, label: s.label, sub: "Step " + (i + 1) + " of " + STAGES.length, selected: job?.stage === s.id, swatch: STAGE_SWATCH[s.id] }))
      });
      if (!choice || choice === job?.stage) return;
      const result = await setStage(jobId, choice);
      if (!result.ok) return toast(result.error);
      toast("Moved to " + stageLabel(choice), result.undo);
      return render({ keepScroll: true });
    }
    if (act === "start-layout") {
      const result = await saveJobLayout(jobId, presetLayout(el.dataset.preset));
      if (!result.ok) return toast(result.error);
      return go("/jobs/" + jobId + "/layout");
    }
    if (act === "share-layout" && job) return shareLayoutPng(job, job.layout);
    if (act === "invoice") {
      const result = await createInvoiceFromJob(el.dataset.id);
      if (!result.ok) return toast(result.error);
      toast(result.existing ? "This job already has an invoice." : "Invoice created. Review it before you share.");
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
      const ok = await confirmSheet({ title: "Delete this photo?", message: "It's removed from this phone. Photos in a backup you already exported stay there.", confirm: "Delete photo" });
      if (!ok) return;
      const result = await deletePhoto(el.dataset.id);
      lightbox = "";
      if (!result.ok) toast(result.error);
      else toast("Photo deleted");
      return render({ keepScroll: true });
    }
    if (act === "assign") {
      const slab = state.slabs.find((item) => item.id === document.getElementById("slab-pick")?.value);
      if (!slab) return;
      if (slab.costCents > 0) {
        pendingAssign = slab.id;
        return render({ keepScroll: true });
      }
      const result = await saveSlab({ ...slab, jobId: el.dataset.job, status: "reserved" });
      if (!result.ok) return toast(result.error);
      toast("Slab assigned");
      return render({ keepScroll: true });
    }
    if (act === "assign-only" || act === "assign-cost") {
      const slab = state.slabs.find((item) => item.id === el.dataset.id);
      pendingAssign = "";
      if (!slab) return render({ keepScroll: true });
      const result = await saveSlab({ ...slab, jobId, status: "reserved" });
      if (!result.ok) return toast(result.error);
      if (act === "assign-cost") {
        const added = await addJobMaterialCost(jobId, slab.costCents);
        if (!added.ok) return toast(added.error);
        toast("Slab assigned and " + money(slab.costCents) + " added to material cost");
      } else {
        toast("Slab assigned");
      }
      return render({ keepScroll: true });
    }
    if (act === "cancel-assign") {
      pendingAssign = "";
      return render({ keepScroll: true });
    }
    if (act === "save-caption") {
      const value = document.getElementById("photo-caption")?.value || "";
      const result = await savePhotoCaption(el.dataset.id, value);
      if (!result.ok) return toast(result.error);
      toast("Caption saved");
      return render({ keepScroll: true });
    }
    if (act === "unassign") {
      const slab = state.slabs.find((item) => item.id === el.dataset.id);
      if (!slab) return;
      const result = await saveSlab({ ...slab, jobId: "", status: slab.status === "used" ? "used" : "available" });
      if (!result.ok) return toast(result.error);
      toast("Slab back in inventory");
      return render({ keepScroll: true });
    }
  },
  async onChange(event) {
    if (event.target.id !== "photo-file") return;
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    toast("Adding " + plural(files.length, "photo", "photos") + "…");
    const result = await addPhotos(currentRoute().parts[1], photoCategory, files);
    if (!result.ok) toast(result.error);
    else toast(plural(files.length, "photo added", "photos added"));
    render({ keepScroll: true });
  }
};

function assignPrompt() {
  const slab = state.slabs.find((item) => item.id === pendingAssign);
  if (!slab) return "";
  return `<div class="banner"><p>Add the ${esc(money(slab.costCents))} you paid for this stone to the job's material cost?</p><div class="btn-row"><button type="button" class="btn primary" data-act="assign-cost" data-id="${esc(slab.id)}">Add cost</button><button type="button" class="btn" data-act="assign-only" data-id="${esc(slab.id)}">Assign only</button></div><button type="button" class="text-btn" data-act="cancel-assign">Cancel</button></div>`;
}

function lightboxHtml() {
  const photo = state.photos.find((item) => item.id === lightbox);
  if (!photo) return "";
  const label = PHOTO_CATEGORIES.find((cat) => cat.id === photo.category)?.label || "Photo";
  return `<div class="lightbox" role="dialog" aria-modal="true" aria-label="${esc(label)} photo">
    <div class="lb-top"><span>${esc(label)} photo</span><button type="button" class="icon-btn lb-close" data-act="close-photo" aria-label="Close">${icon("close")}</button></div>
    <img alt="${esc(photo.caption || label + " photo")}" data-photo="${esc(photo.id)}">
    <div class="lb-bottom">
      <div class="lb-caption"><input class="caption" id="photo-caption" value="${esc(photo.caption || "")}" placeholder="Add a caption" enterkeyhint="done" aria-label="Caption"><button type="button" class="btn sm" data-act="save-caption" data-id="${esc(photo.id)}">Save</button></div>
      <button type="button" class="btn danger-ghost block" data-act="delete-photo" data-id="${esc(photo.id)}">${icon("trash")} Delete photo</button>
    </div>
  </div>`;
}

function blankJob(customerId) {
  return {
    id: "",
    customerId: customerId || "",
    customerMode: state.customers.length ? "existing" : "new",
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
    layoutPreset: "",
    error: ""
  };
}

function jobFromRecord(job) {
  return {
    id: job.id,
    customerId: job.customerId,
    customerMode: "existing",
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
    layoutPreset: "",
    error: ""
  };
}

function readJobForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  return { ...(jobWorking || {}), ...data };
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
      dupeDismissed = false;
      if (route.parts[1] === "new") jobWorking = blankJob(route.params.customer || "");
      else {
        const job = jobById(route.parts[1]);
        jobWorking = job ? jobFromRecord(job) : null;
      }
    }
    if (!jobWorking) return empty("That job isn't on this phone", "Go back to the job list.", { art: "jobs" });
    const creating = !jobWorking.id;
    const record = creating ? null : jobById(jobWorking.id);
    const customerChoices = state.customers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((customer) => ({ value: customer.id, label: customer.name + (customer.phone ? " · " + customer.phone : "") }));
    const mode = !state.customers.length ? "new" : jobWorking.customerMode || "existing";
    const customerBlock = creating
      ? `${state.customers.length ? segmented([["existing", "Existing customer"], ["new", "+ New customer"]], mode, "cust-mode", { label: "Customer" }) : ""}
        <input type="hidden" name="customerMode" id="customerMode" value="${esc(mode)}">
        <div id="existing-customer"${mode === "new" ? " hidden" : ""}>${state.customers.length ? selectField({ label: "Customer", name: "customerId", value: jobWorking.customerId, options: [{ value: "", label: "Choose a customer" }, ...customerChoices] }) : ""}</div>
        <div id="new-customer" class="inline-customer"${mode === "new" ? "" : " hidden"}>
          ${quickPasteHtml()}
          <div class="form-stack">${customerFieldsHtml(jobWorking)}</div>
          <div id="dupe-slot"></div>
          <p class="hint">The customer is saved with the job. Nothing you've typed below is lost.</p>
        </div>`
      : selectField({ label: "Customer", name: "customerId", value: jobWorking.customerId, options: customerChoices });
    const hasInvoice = state.invoices.some((inv) => inv.jobId === jobWorking.id && inv.status !== "void");
    const layoutBlock = creating
      ? `<p class="meta">Optional. Pick a shape and you'll land in the drawing right after saving.</p>${presetGrid("pick-preset", jobWorking.layoutPreset)}<input type="hidden" name="layoutPreset" id="layoutPreset" value="${esc(jobWorking.layoutPreset)}">`
      : record?.layout?.pieces?.length
        ? `${layoutPreviewHtml(record, { href: "#/jobs/" + record.id + "/layout" })}<p class="meta">${esc(summaryLines(layoutStats(record.layout)).slice(0, 3).join(" · "))}</p>`
        : `<a class="btn block" href="#/jobs/${esc(jobWorking.id)}/layout">${icon("layout")} Draw countertops</a>`;
    const moreOpen = jobWorking.edgeProfile || jobWorking.sinkType || jobWorking.sinkCutouts || jobWorking.backsplash;
    return `<form id="job-form" data-guard novalidate>${suggestLists()}
      ${section("Customer", customerBlock, { className: "form-group" })}
      ${section("Job", `<div class="form-stack">${[
        field({ label: "Job name", name: "title", value: jobWorking.title, placeholder: "Kitchen, primary bath, island…", enterkeyhint: "next", autocapitalize: "words" }),
        field({ label: "Job site address", name: "siteAddress", value: jobWorking.siteAddress, placeholder: "Leave blank if it's the customer's address", autocomplete: "street-address", autocapitalize: "words", enterkeyhint: "next" }),
        selectField({ label: "Stage", name: "stage", value: jobWorking.stage, options: STAGES.map((stage) => ({ value: stage.id, label: stage.label })) })
      ].join("")}</div>`, { className: "form-group" })}
      ${section("Schedule", `<div class="two-col">${field({ label: "Template", name: "templateDate", value: jobWorking.templateDate, type: "date" })}${field({ label: "Install", name: "installDate", value: jobWorking.installDate, type: "date" })}</div>`, { className: "form-group" })}
      ${section("Stone", `<div class="form-stack">${[
        `<div class="two-col">${field({ label: "Material", name: "material", value: jobWorking.material, list: "suggest-material", enterkeyhint: "next", autocapitalize: "words", placeholder: "Quartz" })}${field({ label: "Color", name: "stoneColor", value: jobWorking.stoneColor, placeholder: "Calacatta", enterkeyhint: "next", autocapitalize: "words" })}</div>`,
        field({ label: "Square feet", name: "sqft", value: jobWorking.sqft, inputmode: "decimal", enterkeyhint: "next", suffix: "sq ft", placeholder: creating ? "Filled from the layout if blank" : "", hint: record?.layout?.pieces?.length ? "Layout says " + fmtNum(layoutStats(record.layout).sqft, 1) + " sq ft" : "" }),
        `<details class="more-fields"${moreOpen ? " open" : ""}><summary>Edge, sink & backsplash ${icon("chevronDown")}</summary><div class="form-stack">` +
        field({ label: "Edge profile", name: "edgeProfile", value: jobWorking.edgeProfile, list: "suggest-edge", autocapitalize: "words" }) +
        `<div class="two-col">${field({ label: "Sink type", name: "sinkType", value: jobWorking.sinkType, list: "suggest-sink", autocapitalize: "words" })}${field({ label: "Sink cutouts", name: "sinkCutouts", value: jobWorking.sinkCutouts, inputmode: "numeric", pattern: "[0-9]*" })}</div>` +
        field({ label: "Backsplash", name: "backsplash", value: jobWorking.backsplash, list: "suggest-backsplash", autocapitalize: "sentences" }) +
        `</div></details>`
      ].join("")}</div>`, { className: "form-group" })}
      ${section("Countertop layout", layoutBlock, { className: "form-group" })}
      ${section("Money", `<div class="form-stack">${[
        `<div class="two-col">${field({ label: "Contract price", name: "contractTotal", value: jobWorking.contractTotal, inputmode: "decimal", placeholder: "0", currency: true, enterkeyhint: "next" })}${field({ label: "Deposit", name: "depositPercent", value: jobWorking.depositPercent, inputmode: "decimal", enterkeyhint: "next", suffix: "%" })}</div>`,
        `<details class="more-fields"${jobWorking.materialCost || jobWorking.laborCost || jobWorking.otherCost ? " open" : ""}><summary>Your costs, for profit ${icon("chevronDown")}</summary><div class="form-stack">` +
        `<div class="three-col">${field({ label: "Material", name: "materialCost", value: jobWorking.materialCost, inputmode: "decimal", currency: true })}${field({ label: "Labor", name: "laborCost", value: jobWorking.laborCost, inputmode: "decimal", currency: true })}${field({ label: "Other", name: "otherCost", value: jobWorking.otherCost, inputmode: "decimal", currency: true })}</div>` +
        `</div></details>`,
        `<div class="sums"><div class="grand"><span>Profit preview</span><b id="live-profit">—</b></div></div>`,
        `<p class="hint">${hasInvoice ? "This job has an invoice, so the job page uses the invoice total." : "Contract price minus your costs."}</p>`
      ].join("")}</div>`, { className: "form-group" })}
      ${section("Notes", field({ label: "Notes", name: "notes", value: jobWorking.notes, multiline: true, rows: 3, autocapitalize: "sentences", placeholder: "Gate code, dog in yard, seam location…" }), { className: "form-group" })}
      ${err(jobWorking.error)}
      <div class="form-bar"><button class="btn primary block" type="submit">${creating ? (jobWorking.layoutPreset ? "Save & draw layout" : "Save job") : "Save changes"}</button></div>
      ${jobWorking.id ? `<button class="btn danger-ghost block" type="button" data-act="delete">${icon("trash")} Delete job</button>` : ""}
    </form>`;
  },
  mount(root) {
    paintJobProfit();
    const formEl = root.querySelector("#job-form");
    if (formEl?.elements.phone) formEl.elements.phone.dataset.prev = formEl.elements.phone.value;
    if (formEl && (jobWorking?.customerMode === "new" || !state.customers.length)) paintDupes(formEl, { mode: "job", dismissed: dupeDismissed });
  },
  leave() {
    jobKey = "";
    jobWorking = null;
  },
  onInput(event) {
    const formEl = event.target.form;
    if (formEl?.id !== "job-form") return;
    handlePhoneInput(event);
    if (event.target.dataset?.dupe) {
      dupeDismissed = false;
      paintDupes(formEl, { mode: "job" });
    }
    paintJobProfit();
  },
  onPaste(event) {
    if (event.target.id === "paste-text") setTimeout(() => runJobFill(), 30);
  },
  async onSubmit() {
    const formEl = document.getElementById("job-form");
    const raw = readJobForm(formEl);
    const moneyFields = [
      ["contractTotal", "the contract price"],
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
    let sqft = String(raw.sqft || "").trim() === "" ? null : parseQty(String(raw.sqft).replace(/[^\d.]/g, ""));
    if (sqft === null && String(raw.sqft || "").trim() !== "") return fail(raw, "Enter square footage like 42 or 42.5, or leave it blank.");
    if (raw.sinkCutouts && !/^\d+$/.test(String(raw.sinkCutouts).trim())) return fail(raw, "Enter sink cutouts as a whole number, or leave it blank.");
    if (raw.templateDate && raw.installDate && raw.installDate < raw.templateDate) return fail(raw, "The install date is before the template date.");
    const creating = !raw.id;
    const mode = !state.customers.length ? "new" : raw.customerMode;
    let customerId = raw.customerId;
    if (creating && mode === "new") {
      if (!String(raw.name || "").trim()) return fail(raw, "Enter the new customer's name, or switch to Existing customer.");
    } else if (!customerId) return fail(raw, "Choose a customer, or tap + New customer.");
    // layout preset (new jobs) fills the numbers that were left blank
    let layout;
    let fill = {};
    if (creating && raw.layoutPreset && PRESETS.some((p) => p.id === raw.layoutPreset)) {
      layout = presetLayout(raw.layoutPreset);
      const f = jobFieldsFromLayout(layout);
      if (sqft === null) fill.sqft = f.sqft;
      if (!raw.sinkCutouts) fill.sinkCutouts = f.sinkCutouts;
      if (!raw.sinkType) fill.sinkType = f.sinkType;
      if (!raw.backsplash) fill.backsplash = f.backsplash;
    }
    if (creating && mode === "new") {
      const created = await saveCustomer({ name: raw.name, phone: raw.phone, email: raw.email, address: raw.address, allowDuplicate: true });
      if (!created.ok) return fail(raw, created.error);
      customerId = created.id;
      jobWorking = { ...raw, customerMode: "existing", customerId };
    }
    const result = await saveJob({
      id: raw.id,
      customerId,
      title: raw.title,
      stage: raw.stage,
      siteAddress: raw.siteAddress,
      material: raw.material,
      stoneColor: raw.stoneColor,
      edgeProfile: raw.edgeProfile,
      sinkType: fill.sinkType ?? raw.sinkType,
      sinkCutouts: fill.sinkCutouts ?? raw.sinkCutouts,
      backsplash: fill.backsplash ?? raw.backsplash,
      sqft: fill.sqft ?? sqft,
      templateDate: raw.templateDate,
      installDate: raw.installDate,
      notes: raw.notes,
      contractTotalCents: cents.contractTotal,
      materialCostCents: cents.materialCost,
      laborCostCents: cents.laborCost,
      otherCostCents: cents.otherCost,
      depositPercent: deposit,
      ...(layout ? { layout } : {})
    });
    if (!result.ok) return fail({ ...raw, customerMode: jobWorking?.customerMode || raw.customerMode, customerId }, result.error);
    jobKey = "";
    if (creating) {
      toast(layout ? "Job added. Size the pieces to the inch." : "Job added");
      if (layout) {
        await go("/jobs/" + result.id, { replace: true, force: true });
        return go("/jobs/" + result.id + "/layout", { force: true });
      }
      return go("/jobs/" + result.id, { replace: true, force: true });
    }
    toast("Job saved");
    return goBackTo("/jobs/" + result.id, { force: true });
  },
  async onClick(act, el) {
    const formEl = document.getElementById("job-form");
    if (act === "cust-mode") {
      const mode = el.dataset.val === "new" ? "new" : "existing";
      jobWorking = { ...readJobForm(formEl), customerMode: mode };
      formEl.querySelector("#customerMode").value = mode;
      formEl.querySelector("#existing-customer").hidden = mode === "new";
      formEl.querySelector("#new-customer").hidden = mode !== "new";
      const seg = el.closest(".seg");
      seg.outerHTML = segmented([["existing", "Existing customer"], ["new", "+ New customer"]], mode, "cust-mode", { label: "Customer" });
      if (mode === "new") {
        paintDupes(formEl, { mode: "job", dismissed: dupeDismissed });
        setTimeout(() => formEl.elements.name?.focus(), 80);
      }
      return;
    }
    if (act === "use-existing") {
      const id = el.dataset.id;
      jobWorking = { ...readJobForm(formEl), customerMode: "existing", customerId: id, name: "", phone: "", email: "", address: "" };
      toast("Using " + (customerById(id)?.name || "that customer"));
      return render({ keepScroll: true });
    }
    if (act === "dupe-dismiss") {
      dupeDismissed = true;
      const slot = document.getElementById("dupe-slot");
      if (slot) slot.innerHTML = "";
      return;
    }
    if (act === "paste-clip") {
      const text = await readClipboard();
      const box = document.getElementById("paste-text");
      if (text === null) {
        box?.focus();
        return toast("Long-press the box and tap Paste.");
      }
      if (box) box.value = text;
      return runJobFill();
    }
    if (act === "paste-fill") return runJobFill();
    if (act === "pick-preset") {
      const input = document.getElementById("layoutPreset");
      const next = input.value === el.dataset.preset ? "" : el.dataset.preset;
      input.value = next;
      formEl.querySelectorAll("[data-act=pick-preset]").forEach((b) => b.classList.toggle("is-on", b.dataset.preset === next));
      const submit = formEl.querySelector("button[type=submit]");
      if (submit) submit.textContent = next ? "Save & draw layout" : "Save job";
      return;
    }
    if (act !== "delete" || !jobWorking?.id) return;
    const ok = await confirmSheet({ title: "Delete this job?", message: "Its payments and photos are deleted too. Estimates and invoices stay, unlinked from the job.", confirm: "Delete job" });
    if (!ok) return;
    const result = await deleteJob(jobWorking.id);
    if (!result.ok) {
      jobWorking = { ...readJobForm(formEl), error: result.error };
      return render({ keepScroll: true });
    }
    jobKey = "";
    toast("Job deleted");
    go("/jobs", { replace: true, force: true });
  }
};

function runJobFill() {
  const formEl = document.getElementById("job-form");
  const box = document.getElementById("paste-text");
  if (!formEl || !box) return;
  const { parsed, filled } = fillFromText(formEl, box.value);
  if (parsed.address && formEl.elements.siteAddress && !formEl.elements.siteAddress.value) {
    // the customer's address is the job site unless told otherwise; leave site blank
  }
  toast(filledMessage(filled));
  if (filled.length) {
    box.value = "";
    formEl.querySelector(".paste-box")?.removeAttribute("open");
    dupeDismissed = false;
    paintDupes(formEl, { mode: "job" });
  }
}

function fail(raw, error) {
  jobWorking = { ...raw, error };
  render({ keepScroll: true });
  setTimeout(() => document.querySelector("#job-form .err")?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
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
    return route.parts[3] === "new" ? "Log payment" : "Edit payment";
  },
  back(route) {
    return "#/jobs/" + route.parts[1];
  },
  html(route) {
    const job = jobById(route.parts[1]);
    if (!job) return empty("That job isn't on this phone", "Go back to the job list.", { art: "jobs" });
    const existing = route.parts[3] === "new" ? null : state.payments.find((item) => item.id === route.parts[3]);
    if (route.parts[3] !== "new" && !existing) return empty("That payment isn't on this phone", "It may have been deleted.", { art: "money" });
    const customer = customerById(job.customerId);
    const editingId = route.parts[3] === "new" ? "" : route.parts[3];
    const balance = balanceExcludingPayment(job, state.invoices, state.payments, editingId);
    const priorCount = state.payments.filter((p) => p.jobId === job.id && p.id !== editingId).length;
    const total = jobRevenueCents(job, state.invoices);
    const deposit = Math.round((total * (Number(job.depositPercent) || 0)) / 100);
    const suggestDeposit = !existing && !priorCount && deposit > 0 && deposit < balance;
    const defaultAmount = existing ? centsToInput(existing.amountCents) : centsToInput(suggestDeposit ? deposit : Math.max(0, balance));
    const quick = !existing && balance > 0
      ? `<div class="quick-chips">${suggestDeposit ? `<button type="button" class="chip sm" data-act="amount" data-cents="${deposit}" data-kind="deposit">Deposit ${esc(money(deposit))}</button>` : ""}<button type="button" class="chip sm" data-act="amount" data-cents="${balance}" data-kind="final">Full balance ${esc(money(balance))}</button></div>`
      : "";
    return `<form id="pay-form" data-guard novalidate>
      <div class="pay-hero">${avatar(customer?.name || "?")}<div><strong>${esc(customer?.name || "Customer")}</strong><small>${esc(jobTitle(job))} · ${balance > 0 ? esc(money(balance)) + " left to pay" : "Nothing left to pay"}</small></div></div>
      ${section("", `<div class="form-stack">
        ${field({ label: "Amount", name: "amount", value: defaultAmount, inputmode: "decimal", placeholder: "0.00", currency: true, enterkeyhint: "done", className: "big-money" })}
        ${quick}
        <div class="two-col">${field({ label: "Date", name: "date", value: existing?.date || todayISO(), type: "date" })}${selectField({ label: "Type", name: "kind", value: existing?.kind || (priorCount || !suggestDeposit ? "final" : "deposit"), options: PAY_KINDS.map((kind) => ({ value: kind.id, label: kind.label })) })}</div>
        <div class="field"><span class="lbl">Method</span>${segmented(PAY_METHODS.map((m) => [m.id, m.label]), existing?.method || "zelle", "method", { label: "Payment method", className: "seg-wrap" })}<input type="hidden" name="method" id="pay-method" value="${esc(existing?.method || "zelle")}"></div>
        ${field({ label: "Note", name: "note", value: existing?.note || "", multiline: true, rows: 2, placeholder: "Check number, who paid…", autocapitalize: "sentences" })}
      </div>`, { className: "form-group" })}
      <p class="err" id="pay-error" hidden></p>
      <div class="form-bar"><button class="btn primary block" type="submit">${existing ? "Save payment" : "Log payment"}</button></div>
      ${existing ? `<button class="btn danger-ghost block" type="button" data-act="delete-pay" data-id="${esc(existing.id)}">${icon("trash")} Delete payment</button>` : ""}
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
    toast(result.stage === "paid" ? "Payment saved. Paid in full, so the job moved to Paid." : "Payment saved");
    return goBackTo("/jobs/" + route.parts[1], { force: true });
  },
  async onClick(act, el) {
    if (act === "amount") {
      const formEl = document.getElementById("pay-form");
      formEl.elements.amount.value = centsToInput(Number(el.dataset.cents));
      if (el.dataset.kind) formEl.elements.kind.value = el.dataset.kind;
      return;
    }
    if (act === "method") {
      const input = document.getElementById("pay-method");
      input.value = el.dataset.val;
      const seg = el.closest(".seg");
      seg.outerHTML = segmented(PAY_METHODS.map((m) => [m.id, m.label]), el.dataset.val, "method", { label: "Payment method", className: "seg-wrap" });
      return;
    }
    if (act === "delete-pay") {
      const ok = await confirmSheet({ title: "Delete this payment?", message: "The balance due goes back up. You can undo right after.", confirm: "Delete payment" });
      if (!ok) return;
      const result = await deletePayment(el.dataset.id);
      if (!result.ok) return toast(result.error);
      toast("Payment deleted", result.undo);
      return goBackTo("/jobs/" + currentRoute().parts[1], { force: true });
    }
  }
};
