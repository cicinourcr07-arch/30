import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

let app = null;
let db = null;

try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    db = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
  }
} catch (err) {
  console.warn("[Firebase] Initialization notice:", err?.message || err);
}

export { app, db };

export async function testConnection() {
  if (!db) return false;
  try {
    const colRef = collection(db, "projects");
    await getDocs(colRef);
    return true;
  } catch (err) {
    console.warn("[Firebase] Connection test warning:", err?.message || err);
    return false;
  }
}
