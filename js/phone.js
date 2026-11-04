import { digits } from "./format.js";

export function phoneE164(phone) {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const d = digits(raw);
  if (!d) return "";
  if (raw.startsWith("+")) return "+" + d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return "+" + d;
}

export function contactLinks({ phone, email, address, subject } = {}) {
  const e164 = phoneE164(phone);
  const mail = String(email ?? "").trim();
  const addr = String(address ?? "").trim();
  const links = { tel: "", sms: "", mail: "", map: "" };
  if (e164) {
    links.tel = "tel:" + e164;
    links.sms = "sms:" + e164;
  }
  if (mail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    const q = subject ? "?subject=" + encodeURIComponent(subject) : "";
    links.mail = "mailto:" + encodeURIComponent(mail).replace(/%40/g, "@") + q;
  }
  if (addr) links.map = mapHref(addr);
  return links;
}

export function mapHref(address) {
  const q = encodeURIComponent(String(address).trim());
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "https://maps.apple.com/?q=" + q;
  return "https://www.google.com/maps/search/?api=1&query=" + q;
}
