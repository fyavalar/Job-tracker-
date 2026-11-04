import { defaultBusiness, starterPriceBook } from "./model.js";
import { isLegacyBundle, migrateLegacy } from "./migrate.js";
import { todayISO, uid } from "./format.js";

const DB_NAME = "jobs-tracker";
const DB_VERSION = 1;
const DATA_STORES = ["customers", "jobs", "estimates", "invoices", "payments", "priceBook", "slabs", "tasks", "photos"];
const ALL_STORES = [...DATA_STORES, "outbox", "meta"];

let backend = null;

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Storage request failed"));
  });
}

function openIdb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ALL_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === "meta" ? "key" : "id" });
        }
      }
      const photos = request.transaction.objectStore("photos");
      if (!photos.indexNames.contains("byJob")) photos.createIndex("byJob", "jobId", { unique: false });
    };
    request.onsuccess = () => resolve(idbBackend(request.result));
    request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
  });
}

function idbBackend(db) {
  const txDone = (tx) =>
    new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Storage transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("Storage transaction aborted"));
    });

  return {
    kind: "idb",
    async getAll(name) {
      const tx = db.transaction(name, "readonly");
      const rows = await req(tx.objectStore(name).getAll());
      await txDone(tx);
      return rows || [];
    },
    async put(name, record) {
      const tx = db.transaction(name, "readwrite");
      tx.objectStore(name).put(record);
      await txDone(tx);
    },
    async del(name, id) {
      const tx = db.transaction(name, "readwrite");
      tx.objectStore(name).delete(id);
      await txDone(tx);
    },
    async getMeta(key) {
      const tx = db.transaction("meta", "readonly");
      const row = await req(tx.objectStore("meta").get(key));
      await txDone(tx);
      return row ? row.value : undefined;
    },
    async setMeta(key, value) {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key, value });
      await txDone(tx);
    },
    async photosFor(jobId) {
      const tx = db.transaction("photos", "readonly");
      const rows = await req(tx.objectStore("photos").index("byJob").getAll(jobId));
      await txDone(tx);
      return rows || [];
    },
    async allPhotos() {
      return this.getAll("photos");
    },
    async replaceAll({ records, meta }) {
      const tx = db.transaction(ALL_STORES, "readwrite");
      for (const name of DATA_STORES) {
        const store = tx.objectStore(name);
        store.clear();
        for (const record of records[name] || []) store.put(record);
      }
      tx.objectStore("outbox").clear();
      const metaStore = tx.objectStore("meta");
      metaStore.put({ key: "business", value: meta.business });
      metaStore.put({ key: "tombstones", value: [] });
      metaStore.put({ key: "migratedV1", value: meta.migratedV1 });
      tx.objectStore("outbox").put({
        id: uid(),
        collection: "all",
        recordId: "all",
        op: "replace",
        at: new Date().toISOString()
      });
      await txDone(tx);
    },
    async commitBatch(groups, meta) {
      const names = [...new Set([...Object.keys(groups), "meta"])];
      const tx = db.transaction(names, "readwrite");
      for (const [name, records] of Object.entries(groups)) {
        const store = tx.objectStore(name);
        for (const record of records) store.put(record);
      }
      const metaStore = tx.objectStore("meta");
      for (const [key, value] of Object.entries(meta)) metaStore.put({ key, value });
      await txDone(tx);
    }
  };
}

const FALLBACK_KEY = "jobs-tracker-idb-fallback-v2";

function emptyLocal() {
  return {
    customers: [],
    jobs: [],
    estimates: [],
    invoices: [],
    payments: [],
    priceBook: [],
    slabs: [],
    tasks: [],
    photos: [],
    outbox: [],
    meta: {}
  };
}

function openLocalBackend() {
  let data = emptyLocal();
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) data = { ...emptyLocal(), ...JSON.parse(raw) };
  } catch {
    data = emptyLocal();
  }
  const save = () => {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
    } catch {
      /* The caller surfaces a save error if the write was a user action. */
    }
  };
  return {
    kind: "local",
    async getAll(name) {
      return (data[name] || []).map((row) => ({ ...row }));
    },
    async put(name, record) {
      const list = data[name] || (data[name] = []);
      const index = list.findIndex((row) => row.id === record.id);
      if (index >= 0) list[index] = record;
      else list.push(record);
      save();
    },
    async del(name, id) {
      data[name] = (data[name] || []).filter((row) => row.id !== id);
      save();
    },
    async getMeta(key) {
      return data.meta[key];
    },
    async setMeta(key, value) {
      data.meta[key] = value;
      save();
    },
    async photosFor(jobId) {
      return (data.photos || []).filter((photo) => photo.jobId === jobId).map((photo) => ({ ...photo }));
    },
    async allPhotos() {
      return (data.photos || []).map((photo) => ({ ...photo }));
    },
    async replaceAll({ records, meta }) {
      for (const name of DATA_STORES) data[name] = records[name] || [];
      data.outbox = [{ id: uid(), collection: "all", recordId: "all", op: "replace", at: new Date().toISOString() }];
      data.meta.business = meta.business;
      data.meta.tombstones = [];
      data.meta.migratedV1 = meta.migratedV1;
      save();
    },
    async commitBatch(groups, meta) {
      for (const [name, records] of Object.entries(groups)) {
        const list = data[name] || (data[name] = []);
        for (const record of records) {
          const index = list.findIndex((row) => row.id === record.id);
          if (index >= 0) list[index] = record;
          else list.push(record);
        }
      }
      Object.assign(data.meta, meta);
      save();
    }
  };
}

async function remember(collection, recordId, op) {
  if (collection === "outbox") return;
  const entry = { id: uid(), collection, recordId, op, at: new Date().toISOString() };
  await backend.put("outbox", entry);
  const all = await backend.getAll("outbox");
  if (all.length > 2000) {
    const extra = all.slice(0, all.length - 2000);
    for (const row of extra) await backend.del("outbox", row.id);
    await backend.setMeta("outboxTrimmed", true);
  }
}

export async function open() {
  try {
    backend = await openIdb();
  } catch {
    backend = openLocalBackend();
  }
  return backend.kind;
}

export function storageKind() {
  return backend ? backend.kind : "memory";
}

export async function loadAll() {
  const [customers, jobs, estimates, invoices, payments, priceBook, slabs, tasks, business] = await Promise.all([
    backend.getAll("customers"),
    backend.getAll("jobs"),
    backend.getAll("estimates"),
    backend.getAll("invoices"),
    backend.getAll("payments"),
    backend.getAll("priceBook"),
    backend.getAll("slabs"),
    backend.getAll("tasks"),
    backend.getMeta("business")
  ]);
  return {
    customers,
    jobs,
    estimates,
    invoices,
    payments,
    priceBook,
    slabs,
    tasks,
    business: { ...defaultBusiness(), ...(business || {}) }
  };
}

export async function migrateIfNeeded() {
  const flag = await backend.getMeta("migratedV1");
  if (flag) return null;
  const now = new Date().toISOString();
  const groups = {};
  const existingBook = await backend.getAll("priceBook");
  if (!existingBook.length) groups.priceBook = starterPriceBook(now);
  const meta = { business: (await backend.getMeta("business")) || defaultBusiness() };
  let raw = null;
  try {
    raw = localStorage.getItem("jobs-tracker-data-v1");
  } catch {
    raw = null;
  }
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { invalid: true };
    }
  }
  let migrated = null;
  if (parsed && parsed.invalid) {
    meta.migratedV1 = { at: now, error: "parse", jobs: 0, customers: 0 };
  } else if (parsed && isLegacyBundle(parsed)) {
    const result = migrateLegacy(parsed, { today: todayISO(), now });
    groups.customers = result.customers;
    groups.jobs = result.jobs;
    groups.payments = result.payments;
    groups.tasks = result.tasks;
    meta.migratedV1 = {
      at: now,
      jobs: result.jobs.length,
      customers: result.customers.length,
      source: "jobs-tracker-data-v1"
    };
    migrated = { jobs: result.jobs.length, customers: result.customers.length };
  } else {
    meta.migratedV1 = { at: now, jobs: 0, customers: 0 };
  }
  await backend.commitBatch(groups, meta);
  return migrated;
}

export async function put(store, record) {
  const next = { ...record, updatedAt: record.updatedAt || new Date().toISOString() };
  await backend.put(store, next);
  await remember(store, next.id, "put");
  return next;
}

export async function remove(store, id) {
  await backend.del(store, id);
  const tombstones = (await backend.getMeta("tombstones")) || [];
  tombstones.push({ collection: store, id, at: new Date().toISOString() });
  await backend.setMeta("tombstones", tombstones.slice(-2000));
  await remember(store, id, "delete");
}

export async function saveBusiness(business) {
  const next = { ...business, updatedAt: new Date().toISOString() };
  await backend.setMeta("business", next);
  await remember("business", "business", "put");
  return next;
}

export async function photosFor(jobId) {
  const rows = await backend.photosFor(jobId);
  return Promise.all(rows.map(hydratePhoto));
}

export async function putPhoto(photo) {
  const stored = await dehydratePhoto(photo);
  stored.updatedAt = stored.updatedAt || new Date().toISOString();
  await backend.put("photos", stored);
  await remember("photos", stored.id, "put");
  return hydratePhoto(stored);
}

export async function deletePhoto(id) {
  await remove("photos", id);
}

async function hydratePhoto(photo) {
  if (photo.blob instanceof Blob) return photo;
  if (photo.dataUrl) {
    const blob = await (await fetch(photo.dataUrl)).blob();
    return { ...photo, blob };
  }
  return photo;
}

async function dehydratePhoto(photo) {
  if (backend.kind === "idb") {
    const { dataUrl, ...rest } = photo;
    return rest;
  }
  if (photo.dataUrl) {
    const { blob, ...rest } = photo;
    return rest;
  }
  if (photo.blob instanceof Blob) {
    const dataUrl = await blobToDataUrl(photo.blob);
    const { blob, ...rest } = photo;
    return { ...rest, dataUrl };
  }
  return photo;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function exportSnapshot() {
  const state = await loadAll();
  const photos = await Promise.all((await backend.allPhotos()).map(async (photo) => {
    const hydrated = await hydratePhoto(photo);
    const dataUrl = photo.dataUrl || (hydrated.blob ? await blobToDataUrl(hydrated.blob) : "");
    return {
      id: photo.id,
      jobId: photo.jobId,
      category: photo.category,
      caption: photo.caption || "",
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
      dataUrl
    };
  }));
  return {
    app: "JOBS",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    business: state.business,
    customers: state.customers,
    jobs: state.jobs,
    estimates: state.estimates,
    invoices: state.invoices,
    payments: state.payments,
    priceBook: state.priceBook,
    slabs: state.slabs,
    tasks: state.tasks,
    photos
  };
}

export async function replaceAll(snapshot) {
  const migratedV1 = (await backend.getMeta("migratedV1")) || { at: new Date().toISOString(), restored: true };
  const photos = [];
  for (const photo of snapshot.photos || []) {
    let blob = null;
    if (photo.dataUrl) blob = await (await fetch(photo.dataUrl)).blob();
    photos.push({
      id: photo.id,
      jobId: photo.jobId,
      category: photo.category,
      caption: photo.caption || "",
      createdAt: photo.createdAt || new Date().toISOString(),
      updatedAt: photo.updatedAt || new Date().toISOString(),
      ...(backend.kind === "idb" ? { blob } : { dataUrl: photo.dataUrl || "" })
    });
  }
  await backend.replaceAll({
    records: {
      customers: snapshot.customers || [],
      jobs: snapshot.jobs || [],
      estimates: snapshot.estimates || [],
      invoices: snapshot.invoices || [],
      payments: snapshot.payments || [],
      priceBook: snapshot.priceBook || [],
      slabs: snapshot.slabs || [],
      tasks: snapshot.tasks || [],
      photos
    },
    meta: {
      business: { ...defaultBusiness(), ...(snapshot.business || {}) },
      migratedV1
    }
  });
}

/**
 * Cloud sync seam. Nothing on the network reads this yet.
 * A future adapter can push `outbox` (and treat a `replace` op as a full pull),
 * then delete the entries it has acknowledged. Tombstones cover hard deletes.
 * If `outboxTrimmed` is set, do a full sync instead of trusting the queue.
 */
export async function getSyncState() {
  const [outbox, tombstones, outboxTrimmed] = await Promise.all([
    backend.getAll("outbox"),
    backend.getMeta("tombstones"),
    backend.getMeta("outboxTrimmed")
  ]);
  return { outbox, tombstones: tombstones || [], outboxTrimmed: !!outboxTrimmed };
}

export async function clearOutbox(ids) {
  for (const id of ids) await backend.del("outbox", id);
}
