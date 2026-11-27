// Shared customer-entry UI: quick paste, live phone formatting, inline duplicate check.
import { state } from "./state.js";
import { esc, digits, plural } from "./format.js";
import { icon } from "./icons.js";
import { field, avatar } from "./components.js";
import { parseLead, formatPhoneInput, findCustomerMatches } from "./contact.js";

export function quickPasteHtml({ open = false } = {}) {
  return `<details class="paste-box"${open ? " open" : ""}>
    <summary><span class="paste-ico">${icon("paste")}</span><span><b>Quick paste</b><small>Drop in a text, email, or lead and we'll fill the fields</small></span>${icon("chevronDown")}</summary>
    <div class="paste-body">
      <textarea id="paste-text" class="no-autoscroll" rows="3" placeholder="John Smith 941-555-1234 842 Brickell Ave Sarasota FL 34234 john@email.com" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Text to read customer details from"></textarea>
      <div class="btn-row"><button type="button" class="btn sm" data-act="paste-clip">${icon("paste")} Paste</button><button type="button" class="btn sm primary" data-act="paste-fill">${icon("sparkle")} Fill fields</button></div>
    </div>
  </details>`;
}

export function customerFieldsHtml(values = {}, { notes = false } = {}) {
  return [
    field({ label: "Name", name: "name", value: values.name, autocomplete: "name", autocapitalize: "words", enterkeyhint: "next", placeholder: "First and last name", data: { dupe: "name" } }),
    field({ label: "Phone", name: "phone", value: values.phone, type: "tel", inputmode: "tel", autocomplete: "tel", enterkeyhint: "next", placeholder: "(941) 555-1234", data: { phone: "1", dupe: "phone" } }),
    field({ label: "Email", name: "email", value: values.email, type: "email", inputmode: "email", autocomplete: "email", autocapitalize: "off", autocorrect: "off", spellcheck: false, enterkeyhint: "next", placeholder: "name@email.com" }),
    field({ label: "Address", name: "address", value: values.address, autocomplete: "street-address", autocapitalize: "words", enterkeyhint: notes ? "next" : "done", placeholder: "Street, city, state ZIP" }),
    notes ? field({ label: "Notes", name: "notes", value: values.notes, multiline: true, rows: 3, autocapitalize: "sentences", placeholder: "Gate code, best time to call…" }) : ""
  ].join("");
}

// Keeps (941) 555-1234 formatting while typing without fighting the caret or Backspace.
export function handlePhoneInput(event) {
  const el = event.target;
  if (!el?.dataset?.phone) return false;
  let value = el.value;
  let caret = el.selectionStart ?? value.length;
  const prev = el.dataset.prev || "";
  if (event.inputType === "deleteContentBackward" && digits(value) === digits(prev) && value.length < prev.length) {
    // Backspace hit a bracket/space/dash: remove the digit before it instead.
    const left = value.slice(0, caret);
    const idx = left.search(/\d(?=\D*$)/);
    if (idx >= 0) {
      value = value.slice(0, idx) + value.slice(idx + 1);
      caret = idx;
    }
  }
  const next = formatPhoneInput(value, caret);
  el.value = next.value;
  el.dataset.prev = next.value;
  try {
    if (document.activeElement === el) el.setSelectionRange(next.caret, next.caret);
  } catch {
    /* some input types disallow selection */
  }
  return true;
}

export function matchesFor(form, excludeId = "") {
  const name = form.elements.name?.value || "";
  const phone = form.elements.phone?.value || "";
  return findCustomerMatches(state.customers, { name, phone, excludeId });
}

export function dupeCardHtml(matches, { mode = "customer" } = {}) {
  if (!matches.length) return "";
  const m = matches[0];
  const c = m.customer;
  const why = m.reason === "phone" ? "has this phone number" : m.reason === "both" ? "is already in your customers with this phone" : "is already in your customers";
  const more = matches.length > 1 ? ` <small>+${plural(matches.length - 1, "other", "others")}</small>` : "";
  const primary = mode === "job"
    ? `<button type="button" class="btn sm primary" data-act="use-existing" data-id="${esc(c.id)}">Use ${esc(c.name.split(" ")[0])}</button>`
    : `<a class="btn sm primary" href="#/customers/${esc(c.id)}">Open</a>`;
  return `<div class="dupe-card" role="status">${avatar(c.name)}<div class="dupe-text"><b>${esc(c.name)}</b> ${esc(why)}.${more}<small>${esc([c.phone, c.address].filter(Boolean).join(" · "))}</small></div>
    <div class="dupe-actions">${primary}<button type="button" class="btn sm" data-act="dupe-dismiss">Keep adding</button></div></div>`;
}

export function paintDupes(form, { excludeId = "", mode = "customer", dismissed = false } = {}) {
  const slot = form.querySelector("#dupe-slot");
  if (!slot) return [];
  const matches = dismissed ? [] : matchesFor(form, excludeId);
  const html = dupeCardHtml(matches, { mode });
  if (slot.innerHTML !== html) slot.innerHTML = html;
  return matches;
}

export function fillFromText(form, text) {
  const parsed = parseLead(text);
  const filled = [];
  for (const key of ["name", "phone", "email", "address"]) {
    const el = form.elements[key];
    if (!el || !parsed[key]) continue;
    el.value = parsed[key];
    if (key === "phone") el.dataset.prev = parsed[key];
    filled.push(key);
    const wrap = el.closest(".field");
    wrap?.classList.remove("is-filled");
    void wrap?.offsetWidth;
    wrap?.classList.add("is-filled");
  }
  return { parsed, filled };
}

export function filledMessage(filled) {
  if (!filled.length) return "Couldn't find a name, phone, email, or address in that text.";
  const names = { name: "name", phone: "phone", email: "email", address: "address" };
  const list = filled.map((k) => names[k]);
  const text = list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list[0];
  return "Filled " + text + ". Check it over, then save.";
}

export async function readClipboard() {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {
    /* permission denied */
  }
  return null;
}
