// Client-side project storage (IndexedDB). Everything lives in the user's browser
// — nothing is uploaded. Three object stores:
//   - "projects": one record per project (name, timestamps, thumbnail, workflow stage,
//     status, narrative pipeline data, and the serialisable edit state; NO media bytes).
//   - "media":    the actual image/audio/video Blobs, keyed "<projectId>/<mediaId>".
//   - "settings": global configurable production presets & preferences.

const DB_NAME = "autoeditor";
const DB_VERSION = 2;
const STORE_PROJECTS = "projects";
const STORE_MEDIA = "media";
const STORE_SETTINGS = "settings";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB not available")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_MEDIA)) db.createObjectStore(STORE_MEDIA);
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; }).catch(reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- storage durability ----------------------------------------------------

export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); }
  catch (_) {}
  return false;
}

export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch (_) {}
  return { usage: 0, quota: 0 };
}

// ---- Cloud SQL Online Sync Helpers ------------------------------------------

async function fetchApi(path, options = {}) {
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function checkCloudDatabaseStatus() {
  return await fetchApi("/api/db/status");
}

// ---- projects --------------------------------------------------------------

export function newId() {
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// Metadata for the projects grid — pulls from online Cloud SQL with IndexedDB cache fallback.
export async function listProjects() {
  // 1. Try fetching from online Cloud SQL database
  try {
    const remote = await fetchApi("/api/db/projects");
    if (Array.isArray(remote)) {
      // Background update to local IndexedDB cache
      tx(STORE_PROJECTS, "readwrite", (s) => {
        for (const p of remote) {
          s.put(p);
        }
      }).catch(() => {});

      return remote
        .map((p) => {
          const np = p.data && p.data.narrative;
          return {
            id: p.id,
            name: p.name,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            thumb: p.thumb || (np && np.reference && np.reference.thumbnailUrl) || null,
            durationSec: p.durationSec || (np && np.actualDurationSec) || (np && np.config && np.config.targetDurationMinutes ? np.config.targetDurationMinutes * 60 : 0),
            clipCount: p.clipCount || (np && np.scenes ? np.scenes.length : 0),
            niche: p.niche || (np && np.selectedConcept && np.selectedConcept.niche) || (np && np.analysis && np.analysis.niche) || "Documentary",
            currentStage: p.currentStage || (np && np.currentStage) || 1,
            progressPct: p.progressPct != null ? p.progressPct : (np && np.progressPct != null ? np.progressPct : 0),
            status: p.status || (np && np.status) || "Draft",
            archived: !!p.archived,
          };
        })
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
  } catch (_) {}

  // 2. Offline / local fallback
  const all = await tx(STORE_PROJECTS, "readonly", (s) => reqP(s.getAll()));
  return (all || [])
    .map((p) => {
      const np = p.data && p.data.narrative;
      return {
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        thumb: p.thumb || (np && np.reference && np.reference.thumbnailUrl) || null,
        durationSec: p.durationSec || (np && np.actualDurationSec) || (np && np.config && np.config.targetDurationMinutes ? np.config.targetDurationMinutes * 60 : 0),
        clipCount: p.clipCount || (np && np.scenes ? np.scenes.length : 0),
        niche: p.niche || (np && np.selectedConcept && np.selectedConcept.niche) || (np && np.analysis && np.analysis.niche) || "Documentary",
        currentStage: p.currentStage || (np && np.currentStage) || 1,
        progressPct: p.progressPct != null ? p.progressPct : (np && np.progressPct != null ? np.progressPct : 0),
        status: p.status || (np && np.status) || "Draft",
        archived: !!p.archived,
      };
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getProject(id) {
  // 1. Try fetching full project data from Cloud SQL
  try {
    const remote = await fetchApi(`/api/db/projects/${id}`);
    if (remote && remote.id) {
      tx(STORE_PROJECTS, "readwrite", (s) => reqP(s.put(remote))).catch(() => {});
      return remote;
    }
  } catch (_) {}

  // 2. Fallback to local IndexedDB
  return tx(STORE_PROJECTS, "readonly", (s) => reqP(s.get(id)));
}

export async function saveProject(record) {
  const rec = { ...record, updatedAt: Date.now() };
  // Save locally in IndexedDB first
  await tx(STORE_PROJECTS, "readwrite", (s) => reqP(s.put(rec)));

  // Sync to Cloud SQL online database
  fetchApi("/api/db/projects", {
    method: "POST",
    body: JSON.stringify(rec),
  }).catch((err) => {
    console.warn("[Cloud SQL Sync] Could not save project online:", err);
  });

  return rec;
}

export async function renameProject(id, name) {
  const rec = await getProject(id);
  if (!rec) return null;
  rec.name = name;
  rec.updatedAt = Date.now();
  await tx(STORE_PROJECTS, "readwrite", (s) => reqP(s.put(rec)));

  fetchApi(`/api/db/projects/${id}/rename`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  }).catch(() => {});

  return rec;
}

export async function archiveProject(id, archived = true) {
  const rec = await getProject(id);
  if (!rec) return null;
  rec.archived = !!archived;
  rec.updatedAt = Date.now();
  await tx(STORE_PROJECTS, "readwrite", (s) => reqP(s.put(rec)));

  fetchApi(`/api/db/projects/${id}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  }).catch(() => {});

  return rec;
}

export async function duplicateProject(id) {
  const rec = await getProject(id);
  if (!rec) return null;
  const copyId = newId();
  const now = Date.now();
  const cloned = JSON.parse(JSON.stringify(rec));
  cloned.id = copyId;
  cloned.name = `${rec.name || "Untitled"} (Copy)`;
  cloned.createdAt = now;
  cloned.updatedAt = now;
  await tx(STORE_PROJECTS, "readwrite", (s) => reqP(s.put(cloned)));

  // Duplicate in Cloud SQL online database
  fetchApi(`/api/db/projects/${id}/duplicate`, {
    method: "POST",
  }).catch(() => {});

  // Copy all media blobs from original project to duplicate
  try {
    const mediaIds = await listMediaIds(id);
    for (const mid of mediaIds) {
      const blob = await getMedia(id, mid);
      if (blob) await putMedia(copyId, mid, blob);
    }
  } catch (_) {}

  return cloned;
}

export async function deleteProject(id) {
  await deleteProjectMedia(id);
  await tx(STORE_PROJECTS, "readwrite", (s) => reqP(s.delete(id)));

  fetchApi(`/api/db/projects/${id}`, {
    method: "DELETE",
  }).catch(() => {});
}

// ---- media -----------------------------------------------------------------

const mediaKey = (projectId, mediaId) => `${projectId}/${mediaId}`;

export async function putMedia(projectId, mediaId, blob) {
  await tx(STORE_MEDIA, "readwrite", (s) => reqP(s.put(blob, mediaKey(projectId, mediaId))));
}

export async function getMedia(projectId, mediaId) {
  return tx(STORE_MEDIA, "readonly", (s) => reqP(s.get(mediaKey(projectId, mediaId))));
}

export async function deleteMedia(projectId, mediaId) {
  await tx(STORE_MEDIA, "readwrite", (s) => reqP(s.delete(mediaKey(projectId, mediaId))));
}

export async function listMediaIds(projectId) {
  const prefix = `${projectId}/`;
  const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
  const keys = await tx(STORE_MEDIA, "readonly", (s) => reqP(s.getAllKeys(range)));
  return (keys || []).map((k) => String(k).slice(prefix.length));
}

export async function deleteProjectMedia(projectId) {
  const prefix = `${projectId}/`;
  const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
  await tx(STORE_MEDIA, "readwrite", (s) => reqP(s.delete(range)));
}

export async function syncMedia(projectId, wanted) {
  const have = new Set(await listMediaIds(projectId));
  const wantIds = new Set(wanted.keys());
  const puts = [];
  for (const [id, blob] of wanted) if (!have.has(id) && blob) puts.push([mediaKey(projectId, id), blob]);
  const dels = [];
  for (const id of have) if (!wantIds.has(id)) dels.push(mediaKey(projectId, id));
  if (!puts.length && !dels.length) return;
  await tx(STORE_MEDIA, "readwrite", (s) => {
    for (const [k, blob] of puts) s.put(blob, k);
    for (const k of dels) s.delete(k);
  });
}

// ---- global production settings --------------------------------------------

export async function getGlobalSettings() {
  // 1. Try remote Cloud SQL
  try {
    const remote = await fetchApi("/api/db/settings");
    if (remote && typeof remote === "object" && Object.keys(remote).length > 0) {
      tx(STORE_SETTINGS, "readwrite", (s) => reqP(s.put(remote, "production_settings"))).catch(() => {});
      return remote;
    }
  } catch (_) {}

  // 2. Local fallback
  try {
    return await tx(STORE_SETTINGS, "readonly", (s) => reqP(s.get("production_settings")));
  } catch (_) {
    return null;
  }
}

export async function saveGlobalSettings(settings) {
  try {
    await tx(STORE_SETTINGS, "readwrite", (s) => reqP(s.put(settings, "production_settings")));
  } catch (_) {}

  fetchApi("/api/db/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  }).catch(() => {});

  return settings;
}
