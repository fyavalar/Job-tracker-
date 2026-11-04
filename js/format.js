export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

export function plural(n, one, many) {
  const count = Number(n) || 0;
  return count + " " + (count === 1 ? one : many);
}

export function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

export function isoFromDate(date) {
  return todayISO(date);
}

export function parseISODate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dayNumber(iso) {
  const dt = parseISODate(iso);
  if (!dt) return null;
  return Math.floor(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000);
}

export function addDays(iso, days) {
  const dt = parseISODate(iso);
  if (!dt) return "";
  dt.setDate(dt.getDate() + days);
  return isoFromDate(dt);
}

export function niceDate(iso, opts = {}) {
  const dt = parseISODate(iso);
  if (!dt) return "";
  const withYear = opts.year || dt.getFullYear() !== new Date().getFullYear();
  return dt.toLocaleDateString("en-US", {
    weekday: opts.weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined
  });
}

export function niceMonth(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function weekdayName(iso) {
  const dt = parseISODate(iso);
  if (!dt) return "";
  return dt.toLocaleDateString("en-US", { weekday: "long" });
}

export function ageDays(iso, today = todayISO()) {
  const a = dayNumber(iso);
  const b = dayNumber(today);
  if (a === null || b === null) return 0;
  return Math.max(0, b - a);
}

export function inRange(iso, start, end) {
  return !!iso && iso >= start && iso <= end;
}

export function weekRange(today = todayISO()) {
  const dt = parseISODate(today);
  const start = new Date(dt);
  start.setDate(dt.getDate() - dt.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: isoFromDate(start), end: isoFromDate(end) };
}

export function monthRange(today = todayISO()) {
  const dt = parseISODate(today);
  const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
  const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
  return { start: isoFromDate(start), end: isoFromDate(end) };
}

export function yearRange(today = todayISO()) {
  const y = parseISODate(today).getFullYear();
  return { start: y + "-01-01", end: y + "-12-31" };
}

export function periodRange(period, today = todayISO()) {
  if (period === "week") return weekRange(today);
  if (period === "year") return yearRange(today);
  if (period === "all") return { start: "0000-01-01", end: "9999-12-31" };
  return monthRange(today);
}

export function periodLabel(period, today = todayISO()) {
  if (period === "week") {
    const r = weekRange(today);
    return niceDate(r.start, { year: true }) + " – " + niceDate(r.end, { year: true });
  }
  if (period === "year") return String(parseISODate(today).getFullYear());
  if (period === "all") return "All time";
  const dt = parseISODate(today);
  return niceMonth(dt.getFullYear(), dt.getMonth());
}

export function monthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      iso: isoFromDate(d),
      inMonth: d.getMonth() === monthIndex,
      day: d.getDate()
    });
  }
  return cells;
}

export function shiftMonth(year, monthIndex, by) {
  const d = new Date(year, monthIndex + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function money(cents) {
  const n = Number.isFinite(cents) ? cents : 0;
  return moneyFmt.format(n / 100);
}

export function parseDollarsToCents(value) {
  const v = String(value ?? "").trim().replace(/[$,\s]/g, "");
  if (v === "") return 0;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
}

export function numberToCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return parseDollarsToCents(value.toFixed(2)) ?? 0;
  }
  return parseDollarsToCents(value) ?? 0;
}

export function centsToInput(cents) {
  const n = Number(cents) || 0;
  if (!n) return "";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  if (rem === 0) return sign + String(dollars);
  return sign + dollars + "." + String(rem).padStart(2, "0");
}

export function parseQty(value) {
  const v = String(value ?? "").trim();
  if (v === "") return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(v)) return null;
  return Math.round(Number(v) * 1000) / 1000;
}

export function formatQty(n) {
  if (!Number.isFinite(n) || n === 0) return "";
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

export function parsePercent(value, { max = 100, decimals = 3 } = {}) {
  const v = String(value ?? "").trim().replace(/%/g, "");
  if (v === "") return 0;
  const re = new RegExp("^\\d+(\\.\\d{1," + decimals + "})?$");
  if (!re.test(v)) return null;
  const n = Number(v);
  if (n < 0 || n > max) return null;
  return n;
}

export function percentInput(n) {
  if (!n) return "";
  return String(n);
}

export function normName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

export function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    let part = "";
    for (let j = 0; j < slice.length; j++) part += String.fromCharCode(slice[j]);
    bin += part;
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
