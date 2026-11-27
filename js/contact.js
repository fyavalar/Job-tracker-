// Customer-input helpers: lead/text parsing and US phone formatting. Pure, testable in Node.
import { digits } from "./format.js";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?1[\s.\-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.\-]*\d{3}[\s.\-]*\d{4}(?!\d)/;
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ");
const STATE_NAMES = ["Florida", "Georgia", "Alabama", "Texas", "California", "New York", "North Carolina", "South Carolina", "Tennessee", "Virginia"];
const STREET = "St|Street|Ave|Av|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Trl|Trail|Loop|Run|Row|Sq|Square|Path|Pike|Pt|Point|Cv|Cove|Xing|Crossing|Bnd|Bend|Aly|Alley";
const LABELS = {
  name: /^(?:customer\s*name|full\s*name|client|customer|name|contact)\s*[:\-–]\s*/i,
  phone: /^(?:phone(?:\s*number)?|cell|mobile|tel|telephone|ph)\s*[:\-–#]?\s*/i,
  email: /^(?:e-?mail(?:\s*address)?)\s*[:\-–]\s*/i,
  address: /^(?:address|job\s*(?:site|address)|site|location|property|addr)\s*[:\-–]\s*/i
};

export function phoneDigits(value) {
  let d = digits(value);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
}

export function formatPhoneUS(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("+") && !raw.startsWith("+1")) return raw;
  const d = phoneDigits(raw);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

// Formats while typing. Returns the new value and where the caret should go.
export function formatPhoneInput(value, caret = String(value ?? "").length) {
  const raw = String(value ?? "");
  if (raw.trim().startsWith("+") && !raw.trim().startsWith("+1")) return { value: raw, caret };
  let d = digits(raw);
  const before = digits(raw.slice(0, caret)).length;
  let lead = 0;
  if (d.length > 10 && d.startsWith("1")) {
    d = d.slice(1);
    lead = 1;
  }
  if (d.length > 10) return { value: raw, caret };
  let out;
  if (d.length === 0) out = "";
  else if (d.length <= 3) out = d;
  else if (d.length <= 6) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
  else out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  const want = Math.max(0, before - lead);
  let pos = 0;
  let seen = 0;
  if (want === 0) pos = d.length <= 3 ? 0 : 1;
  else {
    for (; pos < out.length; pos++) {
      if (/\d/.test(out[pos])) seen++;
      if (seen === want) {
        pos++;
        break;
      }
    }
  }
  return { value: out, caret: Math.min(pos, out.length) };
}

function titleCase(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  const shouting = s === s.toUpperCase() || s === s.toLowerCase();
  if (!shouting) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())
    .replace(/\bMc(\p{L})/gu, (m, ch) => "Mc" + ch.toUpperCase());
}

function cleanName(text) {
  let s = String(text || "")
    .replace(/^(?:new\s+)?(?:lead|request|message|inquiry|enquiry|quote request)(?:\s+from\s+[\w .]+?)?\s*[:\-–]?\s*$/i, "")
    .replace(/^(?:hi|hello|hey|good (?:morning|afternoon|evening))[,!.\s]+/i, "")
    .replace(/^(?:this is|it'?s|i am|i'm|my name is|name is|from|customer|client|name)\s*[:\-–]?\s+/i, "")
    .replace(/^(?:this is|it'?s|i am|i'm|my name is)\s+/i, "");
  s = s.split(/[.,;!?\n|]|\s[-–]\s|\b(?:and|looking|need|needs|wants|would|interested|call|text|at|phone|cell|email|lives?)\b/i)[0] || "";
  s = s.replace(/[^\p{L}\s'’.\-]/gu, " ").replace(/\s+/g, " ").trim();
  const words = s.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 4) return "";
  if (!words.every((w) => /^\p{L}[\p{L}'’.\-]*$/u.test(w))) return "";
  if (words.length === 1 && words[0].length < 2) return "";
  return titleCase(words.join(" "));
}

function findAddress(line) {
  const start = new RegExp(`\\b\\d{1,6}[A-Za-z]?\\s+(?:[NSEW]{1,2}\\.?\\s+)?[\\p{L}0-9]`, "u").exec(line);
  if (!start) return null;
  const rest = line.slice(start.index);
  const hasStreet = new RegExp(`\\b(?:${STREET})\\b\\.?`, "i").test(rest);
  const zip = /\b\d{5}(?:-\d{4})?\b/.exec(rest.slice(1));
  const state = new RegExp(`(?:,|\\s)\\s*(?:${STATES.join("|")}|${STATE_NAMES.join("|")})\\b\\.?`).exec(rest);
  if (!hasStreet && !zip && !state) return null;
  let end = rest.length;
  if (zip) end = zip.index + 1 + zip[0].length;
  else if (state) end = state.index + state[0].length;
  else {
    const stop = /[.;!?](\s|$)|\s[-–]\s/.exec(rest);
    if (stop) end = stop.index;
  }
  const text = rest.slice(0, end).replace(/[\s,]+$/, "").trim();
  if (text.length < 6) return null;
  return { text, index: start.index, end: start.index + end };
}

function tidyAddress(text) {
  let s = String(text || "").trim();
  if (!s.includes(",") && !s.includes("\n")) {
    s = s.replace(new RegExp(`^(.*\\b(?:${STREET})\\b\\.?(?:\\s+(?:#|Apt|Unit|Suite|Ste)\\.?\\s*[\\w-]+)?)\\s+(?=\\p{L})`, "iu"), "$1, ");
    s = s.replace(new RegExp(`\\s+(${STATES.join("|")})(\\s+\\d{5}(?:-\\d{4})?)?$`), ", $1$2");
  }
  s = s
    .replace(/\s*\n\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,(?=\S)/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .trim();
  // "Sarasota FL 34236" -> "Sarasota, FL 34236" (multi-line and already-comma'd addresses too)
  return s.replace(new RegExp(`([^,\\s])\\s+(${STATES.join("|")})(\\s+\\d{5}(?:-\\d{4})?)?$`), "$1, $2$3");
}

export function parseLead(input) {
  const text = String(input ?? "").replace(/\r/g, "").replace(/\t/g, " ").trim();
  const out = { name: "", phone: "", email: "", address: "" };
  if (!text) return out;
  const lines = text.split(/\n|\s\|\s|;\s*/).map((l) => l.trim()).filter(Boolean);
  const loose = [];
  // labelled lines first ("Name: …", "Phone: …")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let used = false;
    for (const [key, re] of Object.entries(LABELS)) {
      if (!re.test(line)) continue;
      const value = line.replace(re, "").trim();
      if (!value) continue;
      if (key === "address" && !out.address) {
        // an address may continue on the next line (city, state zip)
        const next = lines[i + 1] || "";
        const continues = next && !Object.values(LABELS).some((r) => r.test(next)) && /\b\d{5}\b|,\s*[A-Z]{2}\b/.test(next) && !/\b\d{5}\b/.test(value);
        out.address = tidyAddress(continues ? value + ", " + next : value);
        if (continues) i++;
        used = true;
      } else if (key === "name" && !out.name) {
        out.name = cleanName(value) || titleCase(value.replace(/[^\p{L}\s'’.\-]/gu, " ").replace(/\s+/g, " ").trim());
        used = true;
      } else if (key === "phone" && !out.phone && PHONE_RE.test(value)) {
        out.phone = formatPhoneUS(PHONE_RE.exec(value)[0]);
        used = true;
      } else if (key === "email" && !out.email && EMAIL_RE.test(value)) {
        out.email = EMAIL_RE.exec(value)[0].toLowerCase();
        used = true;
      }
      break;
    }
    if (!used) loose.push(line);
  }
  let rest = loose.join("\n");
  if (!out.email) {
    const m = EMAIL_RE.exec(rest);
    if (m) {
      out.email = m[0].toLowerCase();
      rest = rest.replace(m[0], "\n");
    }
  } else rest = rest.replace(EMAIL_RE, "\n");
  if (!out.phone) {
    const m = PHONE_RE.exec(rest);
    if (m) {
      out.phone = formatPhoneUS(m[0]);
      rest = rest.slice(0, m.index) + "\n" + rest.slice(m.index + m[0].length);
    }
  } else {
    const m = PHONE_RE.exec(rest);
    if (m) rest = rest.slice(0, m.index) + "\n" + rest.slice(m.index + m[0].length);
  }
  rest = rest.replace(/\b(?:call|text|cell|phone|email|e-mail|reach)\s+(?:me\s+)?(?:at|on)?\s*$/gim, "");
  const chunks = rest.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!out.address) {
    for (let i = 0; i < chunks.length; i++) {
      const hit = findAddress(chunks[i]);
      if (!hit) continue;
      let address = hit.text;
      // city/state/zip on the following line
      const next = chunks[i + 1] || "";
      if (!/\b\d{5}\b/.test(address) && /^[\p{L} .'-]+,?\s+[A-Z]{2}\b(?:\s+\d{5}(?:-\d{4})?)?$/u.test(next)) {
        address += ", " + next;
        chunks.splice(i + 1, 1);
      }
      out.address = tidyAddress(address.replace(/^(?:at|we'?re at|i'?m at|located at|address is|lives? at)\s+/i, ""));
      chunks[i] = (chunks[i].slice(0, hit.index) + " " + chunks[i].slice(hit.end)).trim();
      break;
    }
  }
  if (!out.name) {
    for (const chunk of chunks) {
      const candidate = chunk.split(/\bat\s+\d/)[0];
      const name = cleanName(candidate);
      if (name && !/^(?:quote|kitchen|countertops?|granite|quartz|marble|thanks|thank you|regards)$/i.test(name)) {
        out.name = name;
        break;
      }
    }
  }
  return out;
}

export function findCustomerMatches(customers, { name = "", phone = "", excludeId = "" } = {}) {
  const wanted = normalize(name);
  const tel = phoneDigits(phone);
  const hits = [];
  for (const c of customers || []) {
    if (c.id === excludeId) continue;
    const byName = wanted.length >= 3 && normalize(c.name) === wanted;
    const byPhone = tel.length === 10 && phoneDigits(c.phone) === tel;
    if (byName || byPhone) hits.push({ customer: c, reason: byName && byPhone ? "both" : byName ? "name" : "phone" });
  }
  return hits;
}

export function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
