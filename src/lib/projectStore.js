import { db } from "./firebase.js";
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc } from "firebase/firestore";

// Client-side project storage (IndexedDB). Everything lives in the user's browser
// — three object stores:
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

// Metadata for the projects grid — pulls from Firebase Firestore / Cloud SQL with IndexedDB cache fallback.
export async function listProjects() {
  // 1. Try fetching from online Firebase Firestore database
  if (db) {
    try {
      const snap = await getDocs(collection(db, "projects"));
      if (!snap.empty) {
        const remote = snap.docs.map((d) => d.data());
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
    } catch (err) {
      console.warn("[Firebase Firestore] Error listing projects:", err?.message || err);
    }
  }

  // 2. Try fetching from online Cloud SQL database
  try {
    const remote = await fetchApi("/api/db/projects");
    if (Array.isArray(remote) && remote.length > 0) {
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

  // 3. Offline / local fallback
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
  // 1. Try fetching from Firebase Firestore
  if (db) {
    try {
      const cleanId = String(id || "").replace(/[^a-zA-Z0-9_\-]/g, "_");
      if (cleanId) {
        const docRef = doc(db, "projects", cleanId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const remote = snap.data();
          tx(STORE_PROJECTS, "readwrite", (s) => reqP(s.put(remote))).catch(() => {});
          return remote;
        }
      }
    } catch (err) {
      console.warn("[Firebase Firestore] Error fetching project:", err?.message || err);
    }
  }

  // 2. Try fetching full project data from Cloud SQL
  try {
    const remote = await fetchApi(`/api/db/projects/${id}`);
    if (remote && remote.id) {
      tx(STORE_PROJECTS, "readwrite", (s) => reqP(s.put(remote))).catch(() => {});
      return remote;
    }
  } catch (_) {}

  // 3. Fallback to local IndexedDB
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

  // Sync directly to Firebase Firestore online database
  if (db) {
    try {
      const rawId = String(rec.id || "p_default");
      const cleanId = rawId.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const docRef = doc(db, "projects", cleanId);
      const np = rec.data && rec.data.narrative;
      await setDoc(docRef, {
        id: cleanId,
        name: String(rec.name || "Untitled Project"),
        createdAt: Number(rec.createdAt || Date.now()),
        updatedAt: Number(rec.updatedAt || Date.now()),
        thumb: rec.thumb || (np && np.reference && np.reference.thumbnailUrl) || null,
        durationSec: Number(rec.durationSec || (np && np.actualDurationSec) || 0),
        clipCount: Number(rec.clipCount || (np && np.scenes ? np.scenes.length : 0)),
        niche: String(rec.niche || (np && np.selectedConcept && np.selectedConcept.niche) || "Documentary"),
        currentStage: Number(rec.currentStage || (np && np.currentStage) || 1),
        progressPct: Number(rec.progressPct != null ? rec.progressPct : (np && np.progressPct != null ? np.progressPct : 0)),
        status: String(rec.status || (np && np.status) || "Draft"),
        archived: Boolean(rec.archived),
        data: rec.data || {},
      });
      console.log(`[Firebase Firestore] Synced project '${cleanId}' online to database.`);
    } catch (err) {
      console.warn("[Firebase Firestore] Error saving project:", err?.message || err);
    }
  }

  return rec;
}

export async function renameProject(id, name) {
  const rec = await getProject(id);
  if (!rec) return null;
  rec.name = name;
  rec.updatedAt = Date.now();
  await saveProject(rec);
  return rec;
}

export async function archiveProject(id, archived = true) {
  const rec = await getProject(id);
  if (!rec) return null;
  rec.archived = !!archived;
  rec.updatedAt = Date.now();
  await saveProject(rec);
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
  await saveProject(cloned);

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

  if (db) {
    try {
      const cleanId = String(id || "").replace(/[^a-zA-Z0-9_\-]/g, "_");
      if (cleanId) {
        await deleteDoc(doc(db, "projects", cleanId));
      }
    } catch (_) {}
  }
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
  // 1. Try remote Firebase Firestore database
  if (db) {
    try {
      const docRef = doc(db, "settings", "production_settings");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        tx(STORE_SETTINGS, "readwrite", (s) => reqP(s.put(data, "production_settings"))).catch(() => {});
        return data;
      }
    } catch (err) {
      console.warn("[Firebase Firestore] Error reading settings:", err?.message || err);
    }
  }

  // 2. Try remote Cloud SQL
  try {
    const remote = await fetchApi("/api/db/settings");
    if (remote && typeof remote === "object" && Object.keys(remote).length > 0) {
      tx(STORE_SETTINGS, "readwrite", (s) => reqP(s.put(remote, "production_settings"))).catch(() => {});
      return remote;
    }
  } catch (_) {}

  // 3. Local fallback
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

  // 1. Sync to Cloud SQL online database
  fetchApi("/api/db/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  }).catch(() => {});

  // 2. Sync to Firebase Firestore online database
  if (db) {
    try {
      const docRef = doc(db, "settings", "production_settings");
      await setDoc(docRef, {
        id: "production_settings",
        updatedAt: Date.now(),
        ...settings,
      });
      console.log("[Firebase Firestore] Synced global settings & channels online to database.");
    } catch (err) {
      console.warn("[Firebase Firestore] Error saving settings:", err?.message || err);
    }
  }

  return settings;
}

export async function ensureFirestoreSettingsSeeded(defaultSettings) {
  if (!db || !defaultSettings) return;
  try {
    const docRef = doc(db, "settings", "production_settings");
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        id: "production_settings",
        updatedAt: Date.now(),
        ...defaultSettings,
      });
      console.log("[Firebase Firestore] Initialized and seeded 'production_settings' collection in Firestore.");
    }
  } catch (err) {
    console.warn("[Firebase Firestore] Seed notice:", err?.message || err);
  }
}
