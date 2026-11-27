import { esc, money } from "./format.js";
import { icon } from "./icons.js";
import { STAGES, stageLabel, SUGGEST } from "./model.js";

// Text input with iOS keyboard ergonomics and optional $ / ″ adornments.
export function field(opts) {
  const name = opts.name;
  const id = opts.id || name;
  const value = esc(opts.value ?? "");
  const a = [];
  if (opts.placeholder) a.push(`placeholder="${esc(opts.placeholder)}"`);
  if (opts.inputmode) a.push(`inputmode="${esc(opts.inputmode)}"`);
  if (opts.list) a.push(`list="${esc(opts.list)}"`);
  if (opts.enterkeyhint) a.push(`enterkeyhint="${esc(opts.enterkeyhint)}"`);
  if (opts.autocomplete) a.push(`autocomplete="${esc(opts.autocomplete)}"`);
  if (opts.autocapitalize) a.push(`autocapitalize="${esc(opts.autocapitalize)}"`);
  if (opts.autocorrect) a.push(`autocorrect="${esc(opts.autocorrect)}"`);
  if (opts.spellcheck !== undefined) a.push(`spellcheck="${opts.spellcheck ? "true" : "false"}"`);
  if (opts.maxlength) a.push(`maxlength="${Number(opts.maxlength)}"`);
  if (opts.required) a.push("required");
  if (opts.autofocus) a.push("autofocus");
  if (opts.pattern) a.push(`pattern="${esc(opts.pattern)}"`);
  if (opts.data) for (const [k, v] of Object.entries(opts.data)) a.push(`data-${esc(k)}="${esc(v)}"`);
  const attrs = a.length ? " " + a.join(" ") : "";
  const nameAttr = name ? ` name="${esc(name)}"` : "";
  const control = opts.multiline
    ? `<textarea${nameAttr} id="${esc(id)}" rows="${opts.rows || 4}"${attrs}>${value}</textarea>`
    : `<input${nameAttr} id="${esc(id)}" type="${esc(opts.type || "text")}" value="${value}"${attrs}>`;
  const prefix = opts.currency ? "$" : opts.prefix || "";
  const suffix = opts.suffix || "";
  const wrapped = prefix || suffix
    ? `<span class="adorned${prefix ? " has-prefix" : ""}${suffix ? " has-suffix" : ""}">${prefix ? `<span class="adorn pre" aria-hidden="true">${esc(prefix)}</span>` : ""}${control}${suffix ? `<span class="adorn suf" aria-hidden="true">${esc(suffix)}</span>` : ""}</span>`
    : control;
  const hint = opts.hint ? `<span class="hint">${esc(opts.hint)}</span>` : "";
  return `<label class="field${opts.className ? " " + esc(opts.className) : ""}" for="${esc(id)}"><span class="lbl">${esc(opts.label)}</span>${wrapped}${hint}</label>`;
}

export function selectField({ label, name, value, options, id, className = "" }) {
  const html = options
    .map((option) => `<option value="${esc(option.value)}"${String(option.value) === String(value) ? " selected" : ""}>${esc(option.label)}</option>`)
    .join("");
  const fid = id || name;
  return `<label class="field${className ? " " + esc(className) : ""}" for="${esc(fid)}"><span class="lbl">${esc(label)}</span><span class="select"><select name="${esc(name)}" id="${esc(fid)}">${html}</select></span></label>`;
}

export function section(title, body, { action = "", className = "", id = "" } = {}) {
  return `<section class="group${className ? " " + esc(className) : ""}"${id ? ` id="${esc(id)}"` : ""}>${title || action ? `<div class="group-head"><h2>${esc(title)}</h2>${action}</div>` : ""}${body}</section>`;
}

export function segmented(items, current, act, { label = "", attr = "val", className = "" } = {}) {
  const index = Math.max(0, items.findIndex(([id]) => String(id) === String(current)));
  return `<div class="seg${className ? " " + className : ""}" role="tablist"${label ? ` aria-label="${esc(label)}"` : ""} style="--n:${items.length};--i:${index}"><i class="seg-thumb" aria-hidden="true"></i>${items
    .map(([id, text]) => `<button type="button" role="tab" class="${String(current) === String(id) ? "is-on" : ""}" aria-selected="${String(current) === String(id)}" data-act="${esc(act)}" data-${attr}="${esc(id)}">${esc(text)}</button>`)
    .join("")}</div>`;
}

export function badge(stage) {
  return `<span class="badge" data-stage="${esc(stage)}"><i></i>${esc(stageLabel(stage))}</span>`;
}

export function err(message) {
  return message ? `<p class="err" role="alert">${icon("alert")}<span>${esc(message)}</span></p>` : "";
}

export function empty(title, text, { art = "", action = "" } = {}) {
  return `<div class="empty">${art ? `<div class="empty-art">${icon(art)}</div>` : ""}<h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</div>`;
}

export function avatar(name, { size = "" } = {}) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  let hash = 0;
  for (const ch of String(name || "")) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return `<span class="avatar${size ? " " + size : ""}" style="--hue:${hash % 360}" aria-hidden="true">${esc(initials)}</span>`;
}

export function contactActions(links, { compact = false } = {}) {
  const items = [
    ["tel", "Call", "phone", "No phone number yet"],
    ["sms", "Text", "message", "No phone number yet"],
    ["mail", "Email", "mail", "No email yet"],
    ["map", "Map", "pin", "No address yet"]
  ];
  return `<div class="contact-grid${compact ? " is-compact" : ""}">${items
    .map(([key, label, name, missing]) => {
      const href = links[key];
      if (!href) return `<span class="contact is-disabled" aria-disabled="true" title="${esc(missing)}"><span class="contact-ico">${icon(name)}</span><span>${label}</span></span>`;
      const extra = key === "map" ? ` target="_blank" rel="noopener"` : "";
      return `<a class="contact" href="${esc(href)}"${extra}><span class="contact-ico">${icon(name)}</span><span>${label}</span></a>`;
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
    .map((row) => `<div class="${row.strong ? "grand" : ""} ${row.negative ? "neg" : ""} ${row.muted ? "muted" : ""}"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`)
    .join("")}</div>`;
}

export function stageStepper(job) {
  const index = Math.max(0, STAGES.findIndex((item) => item.id === job.stage));
  const stage = STAGES[index];
  const next = STAGES[index + 1];
  const segs = STAGES.map((item, i) => `<button type="button" class="ss-seg${i < index ? " is-done" : ""}${i === index ? " is-on" : ""}" data-act="stage" data-id="${esc(job.id)}" data-stage="${item.id}" aria-label="Set stage to ${esc(item.label)}"${i === index ? ' aria-current="step"' : ""}><i></i></button>`).join("");
  return `<section class="stage-card" data-stage="${esc(stage.id)}" aria-label="Job stage">
    <div class="ss-top">
      <div class="ss-now"><span class="ss-kicker">Stage ${index + 1} of ${STAGES.length}</span><strong><i class="ss-dot"></i>${esc(stage.label)}</strong></div>
      <button type="button" class="pill-btn" data-act="stage-picker" data-id="${esc(job.id)}">Change ${icon("chevronDown")}</button>
    </div>
    <div class="ss-track">${segs}</div>
    <div class="ss-labels"><span>${esc(STAGES[0].label)}</span><span>${esc(STAGES[STAGES.length - 1].label)}</span></div>
    ${next ? `<button type="button" class="btn primary block ss-next" data-act="stage" data-id="${esc(job.id)}" data-stage="${next.id}">Move to ${esc(next.label)} ${icon("forward")}</button>` : `<p class="ss-done">${icon("check")} Job complete</p>`}
  </section>`;
}

export function statTiles(tiles, { className = "" } = {}) {
  return `<div class="tiles${className ? " " + className : ""}">${tiles
    .map((tile) => `<div class="tile${tile.accent ? " is-accent" : ""}"><b>${esc(tile.value)}</b><span>${esc(tile.label)}</span></div>`)
    .join("")}</div>`;
}

export function heroMoney({ kicker, profit, revenue, costs, owedTotal, owedCount, owedHref, collected }) {
  const rev = Math.max(0, Number(revenue) || 0);
  const cost = Math.max(0, Number(costs) || 0);
  let bar;
  if (rev <= 0 && cost <= 0) {
    bar = `<div class="meter"></div>`;
  } else if (cost <= rev) {
    const costPct = rev ? (cost / rev) * 100 : 0;
    bar = `<div class="meter"><i class="meter-cost" style="width:${costPct}%"></i><i class="meter-rev" style="width:${100 - costPct}%"></i></div>`;
  } else {
    const revPct = cost ? (rev / cost) * 100 : 0;
    bar = `<div class="meter"><i class="meter-rev" style="width:${revPct}%"></i><i class="meter-over" style="width:${100 - revPct}%"></i></div>`;
  }
  const margin = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null;
  return `<section class="hero">
    <div class="hero-row"><span class="hero-kicker">${esc(kicker)}</span>${margin !== null ? `<span class="hero-chip${profit < 0 ? " neg" : ""}">${margin}% margin</span>` : ""}</div>
    <div class="hero-value${profit < 0 ? " neg" : ""}">${esc(money(profit))}</div>
    <div class="hero-label">Profit</div>
    ${bar}
    <div class="hero-sub"><span><i class="key rev"></i>Revenue <b>${esc(money(revenue))}</b></span><span><i class="key cost"></i>Costs <b>${esc(money(costs))}</b></span></div>
    ${collected !== undefined ? `<div class="hero-line"><span>Collected</span><b>${esc(money(collected))}</b></div>` : ""}
    <a class="hero-owed" href="${esc(owedHref || "#/money")}">
      <span>Still owed${owedCount ? ` <small>${esc(owedCount)}</small>` : ""}</span>
      <b class="${owedTotal > 0 ? "neg" : ""}">${esc(money(owedTotal))}</b>
      ${icon("forward")}
    </a>
  </section>`;
}
