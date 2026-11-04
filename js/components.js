import { esc } from "./format.js";
import { icon } from "./icons.js";
import { stageLabel, SUGGEST } from "./model.js";

export function field(opts) {
  const name = opts.name;
  const value = esc(opts.value ?? "");
  const placeholder = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
  const inputmode = opts.inputmode ? ` inputmode="${esc(opts.inputmode)}"` : "";
  const list = opts.list ? ` list="${esc(opts.list)}"` : "";
  const control = opts.multiline
    ? `<textarea name="${esc(name)}" id="${esc(name)}" rows="${opts.rows || 4}"${placeholder}>${value}</textarea>`
    : `<input name="${esc(name)}" id="${esc(name)}" type="${esc(opts.type || "text")}" value="${value}"${placeholder}${inputmode}${list}>`;
  return `<label class="field"><span class="lbl">${esc(opts.label)}</span>${control}</label>`;
}

export function selectField({ label, name, value, options }) {
  const html = options
    .map((option) => `<option value="${esc(option.value)}"${String(option.value) === String(value) ? " selected" : ""}>${esc(option.label)}</option>`)
    .join("");
  return `<label class="field"><span class="lbl">${esc(label)}</span><span class="select"><select name="${esc(name)}" id="${esc(name)}">${html}</select></span></label>`;
}

export function section(title, body) {
  return `<section class="group"><h2>${esc(title)}</h2>${body}</section>`;
}

export function badge(stage) {
  return `<span class="badge" data-stage="${esc(stage)}">${esc(stageLabel(stage))}</span>`;
}

export function err(message) {
  return message ? `<p class="err" role="alert">${esc(message)}</p>` : "";
}

export function empty(title, text) {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
}

export function contactActions(links) {
  const items = [
    ["tel", "Call", "phone", "No phone number yet"],
    ["sms", "Text", "message", "No phone number yet"],
    ["mail", "Email", "mail", "No email yet"],
    ["map", "Map", "pin", "No address yet"]
  ];
  return `<div class="contact-grid">${items
    .map(([key, label, name, missing]) => {
      const href = links[key];
      if (!href) return `<span class="contact is-disabled" title="${esc(missing)}">${icon(name)}<span>${label}</span></span>`;
      const extra = key === "map" ? ` target="_blank" rel="noopener"` : "";
      return `<a class="contact" href="${esc(href)}"${extra}>${icon(name)}<span>${label}</span></a>`;
    })
    .join("")}</div>`;
}

export function suggestLists() {
  return Object.entries(SUGGEST)
    .map(([id, values]) => `<datalist id="suggest-${id}">${values.map((value) => `<option value="${esc(value)}"></option>`).join("")}</datalist>`)
    .join("");
}

export function sumRows(rows) {
  return `<div class="sums">${rows
    .map((row) => `<div class="${row.strong ? "grand" : ""} ${row.negative ? "neg" : ""}"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`)
    .join("")}</div>`;
}
