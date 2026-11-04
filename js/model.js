export const APP_VERSION = "2.0.0";

export const STAGES = [
  { id: "lead", label: "Lead" },
  { id: "quoted", label: "Quoted" },
  { id: "approved", label: "Approved" },
  { id: "templated", label: "Templated" },
  { id: "fabrication", label: "Fabrication" },
  { id: "installed", label: "Installed" },
  { id: "paid", label: "Paid" }
];

export const STAGE_IDS = STAGES.map((s) => s.id);

export function stageLabel(id) {
  return STAGES.find((s) => s.id === id)?.label || "Lead";
}

export const PHOTO_CATEGORIES = [
  { id: "site", label: "Site" },
  { id: "template", label: "Template" },
  { id: "install", label: "Install" },
  { id: "damage", label: "Damage" }
];

export const PAY_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "check", label: "Check" },
  { id: "zelle", label: "Zelle" },
  { id: "card", label: "Card" },
  { id: "other", label: "Other" }
];

export const PAY_KINDS = [
  { id: "deposit", label: "Deposit" },
  { id: "final", label: "Final" },
  { id: "other", label: "Other" }
];

export function methodLabel(id) {
  return PAY_METHODS.find((m) => m.id === id)?.label || "Other";
}

export function kindLabel(id) {
  return PAY_KINDS.find((m) => m.id === id)?.label || "Other";
}

export const SUGGEST = {
  material: ["Quartz", "Granite", "Marble", "Quartzite", "Porcelain", "Solid surface", "Laminate"],
  edge: ["Eased", "Bevel", "Half bullnose", "Full bullnose", "Ogee", "Dupont", "Mitered", "Waterfall"],
  sink: ["Undermount", "Drop-in", "Farmhouse", "Vessel", "None"],
  backsplash: ["None", "4 inch", "Full height"]
};

export function defaultBusiness() {
  return {
    name: "",
    phone: "",
    email: "",
    address: "",
    logoDataUrl: "",
    taxRate: 7,
    defaultDepositPercent: 50,
    documentFooter: "",
    nextEstimate: 1001,
    nextInvoice: 1001,
    tipsDismissed: false
  };
}

export function starterPriceBook(now) {
  const row = (id, name, category, unit, dollars) => ({
    id,
    name,
    category,
    unit,
    unitPriceCents: Math.round(dollars * 100),
    active: true,
    starter: true,
    createdAt: now,
    updatedAt: now
  });
  return [
    row("seed-quartz-1", "Quartz, group 1", "Material", "sqft", 55),
    row("seed-quartz-2", "Quartz, group 2", "Material", "sqft", 75),
    row("seed-quartz-3", "Quartz, group 3", "Material", "sqft", 95),
    row("seed-granite-a", "Granite, group A", "Material", "sqft", 48),
    row("seed-granite-b", "Granite, group B", "Material", "sqft", 68),
    row("seed-marble", "Marble", "Material", "sqft", 90),
    row("seed-quartzite", "Quartzite", "Material", "sqft", 110),
    row("seed-porcelain", "Porcelain slab", "Material", "sqft", 78),
    row("seed-edge-eased", "Eased edge", "Edge", "sqft", 0),
    row("seed-edge-bevel", "Bevel edge", "Edge", "sqft", 10),
    row("seed-edge-ogee", "Ogee edge", "Edge", "sqft", 18),
    row("seed-edge-miter", "Mitered edge", "Edge", "sqft", 35),
    row("seed-sink-um", "Undermount sink cutout", "Cutout", "each", 185),
    row("seed-sink-di", "Drop-in sink cutout", "Cutout", "each", 150),
    row("seed-cooktop", "Cooktop cutout", "Cutout", "each", 175),
    row("seed-faucet", "Faucet hole", "Cutout", "each", 35),
    row("seed-splash-4", "4 inch backsplash", "Backsplash", "sqft", 28),
    row("seed-splash-full", "Full height backsplash", "Backsplash", "sqft", 58),
    row("seed-tearout", "Tear-out and haul away", "Service", "each", 275),
    row("seed-plumb", "Plumbing disconnect and reconnect", "Service", "each", 175),
    row("seed-seam", "Seam", "Service", "each", 150),
    row("seed-trip", "Template trip", "Service", "each", 0)
  ];
}

export function jobTitle(job) {
  if (!job) return "Job";
  if (job.title && String(job.title).trim()) return String(job.title).trim();
  const bits = [job.material, job.stoneColor].filter(Boolean).join(" ");
  return bits || "Countertop job";
}

export function docNumber(kind, number) {
  const prefix = kind === "invoice" ? "INV" : "EST";
  return prefix + "-" + String(number || 0);
}
