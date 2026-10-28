import { db } from "./index.ts";
import { projects, userSettings } from "./schema.ts";
import { eq, desc } from "drizzle-orm";

export async function listProjectsSql(userId?: string) {
  try {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        thumb: projects.thumb,
        durationSec: projects.durationSec,
        clipCount: projects.clipCount,
        niche: projects.niche,
        currentStage: projects.currentStage,
        progressPct: projects.progressPct,
        status: projects.status,
        archived: projects.archived,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .orderBy(desc(projects.updatedAt));

    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      archived: !!r.archived,
    }));
  } catch (err) {
    console.error("Cloud SQL listProjects failed:", err);
    throw new Error("Failed to load projects from cloud database.", { cause: err });
  }
}

export async function getProjectSql(id: string) {
  try {
    const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!rows.length) return null;
    const r = rows[0];
    let parsedData = {};
    try {
      parsedData = JSON.parse(r.data);
    } catch {}

    return {
      id: r.id,
      name: r.name,
      thumb: r.thumb,
      durationSec: r.durationSec,
      clipCount: r.clipCount,
      niche: r.niche,
      currentStage: r.currentStage,
      progressPct: r.progressPct,
      status: r.status,
      archived: !!r.archived,
      data: parsedData,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
    };
  } catch (err) {
    console.error(`Cloud SQL getProject(${id}) failed:`, err);
    throw new Error("Failed to load project from cloud database.", { cause: err });
  }
}

export async function saveProjectSql(record: any, userId?: string) {
  try {
    const now = new Date();
    const dataStr = typeof record.data === "string" ? record.data : JSON.stringify(record.data || {});
    const np = record.data?.narrative;

    const toSafeInt = (val: any, fallback = 0): number => {
      const n = Math.round(Number(val));
      return Number.isFinite(n) ? n : fallback;
    };

    const values = {
      id: String(record.id),
      userId: userId || record.userId || null,
      name: String(record.name || "Untitled Project"),
      thumb: record.thumb || (np && np.reference && np.reference.thumbnailUrl) || null,
      durationSec: toSafeInt(record.durationSec || (np && np.actualDurationSec), 0),
      clipCount: toSafeInt(record.clipCount || (np && np.scenes ? np.scenes.length : 0), 0),
      niche: String(record.niche || (np && np.selectedConcept && np.selectedConcept.niche) || "Documentary"),
      currentStage: toSafeInt(record.currentStage || (np && np.currentStage), 1),
      progressPct: toSafeInt(record.progressPct != null ? record.progressPct : (np && np.progressPct != null ? np.progressPct : 0), 0),
      status: String(record.status || (np && np.status) || "Draft"),
      archived: Boolean(record.archived),
      data: dataStr,
      createdAt: record.createdAt ? new Date(record.createdAt) : now,
      updatedAt: now,
    };

    await db
      .insert(projects)
      .values(values)
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: values.name,
          thumb: values.thumb,
          durationSec: values.durationSec,
          clipCount: values.clipCount,
          niche: values.niche,
          currentStage: values.currentStage,
          progressPct: values.progressPct,
          status: values.status,
          archived: values.archived,
          data: values.data,
          updatedAt: now,
        },
      });

    return {
      ...record,
      updatedAt: now.getTime(),
    };
  } catch (err) {
    console.error("Cloud SQL saveProject failed:", err);
    throw new Error("Failed to save project to cloud database.", { cause: err });
  }
}

export async function renameProjectSql(id: string, name: string) {
  try {
    const now = new Date();
    await db.update(projects).set({ name, updatedAt: now }).where(eq(projects.id, id));
    return { id, name, updatedAt: now.getTime() };
  } catch (err) {
    console.error(`Cloud SQL renameProject(${id}) failed:`, err);
    throw new Error("Failed to rename project in cloud database.", { cause: err });
  }
}

export async function archiveProjectSql(id: string, archived = true) {
  try {
    const now = new Date();
    await db.update(projects).set({ archived, updatedAt: now }).where(eq(projects.id, id));
    return { id, archived, updatedAt: now.getTime() };
  } catch (err) {
    console.error(`Cloud SQL archiveProject(${id}) failed:`, err);
    throw new Error("Failed to archive project in cloud database.", { cause: err });
  }
}

export async function duplicateProjectSql(id: string) {
  try {
    const original = await getProjectSql(id);
    if (!original) return null;
    const newId = "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const cloned = {
      ...original,
      id: newId,
      name: `${original.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveProjectSql(cloned);
    return cloned;
  } catch (err) {
    console.error(`Cloud SQL duplicateProject(${id}) failed:`, err);
    throw new Error("Failed to duplicate project in cloud database.", { cause: err });
  }
}

export async function deleteProjectSql(id: string) {
  try {
    await db.delete(projects).where(eq(projects.id, id));
    return true;
  } catch (err) {
    console.error(`Cloud SQL deleteProject(${id}) failed:`, err);
    throw new Error("Failed to delete project from cloud database.", { cause: err });
  }
}

export async function getGlobalSettingsSql(userId?: string) {
  try {
    const key = userId ? `settings_${userId}` : "production_settings";
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, key)).limit(1);
    if (!rows.length) return null;
    return JSON.parse(rows[0].data);
  } catch {
    return null;
  }
}

export async function saveGlobalSettingsSql(settings: any, userId?: string) {
  try {
    const key = userId ? `settings_${userId}` : "production_settings";
    const dataStr = JSON.stringify(settings || {});
    await db
      .insert(userSettings)
      .values({
        id: key,
        userId: userId || null,
        data: dataStr,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.id,
        set: {
          data: dataStr,
          updatedAt: new Date(),
        },
      });
    return settings;
  } catch (err) {
    console.error("Cloud SQL saveGlobalSettings failed:", err);
    return settings;
  }
}
