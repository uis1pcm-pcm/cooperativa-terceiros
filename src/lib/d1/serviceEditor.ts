import "server-only";

import { getD1 } from "./runtime";
import { logD1Metrics } from "./metrics";
import type { D1Database, D1Result, D1Service, D1Update } from "./types";

export type CanonicalChecklistItem = {
  id: string;
  description: string;
  weight: number;
  progress: number;
  status: "nao-iniciado" | "em-andamento" | "concluido";
};

export type ServiceEditorPatch = {
  os?: string;
  oc?: string | null;
  tag?: string;
  equipmentName?: string;
  sector?: string | null;
  plannedStart?: number;
  plannedEnd?: number;
  totalHours?: number;
  companyId?: string | null;
  companyName?: string | null;
  cnpj?: string | null;
  description?: string | null;
  packageId?: string | null;
  status?: "open" | "pending" | "concluded";
  progress?: number;
  checklist?: Array<{ id: string; description: string; weight: number }>;
};

const SERVICE_DETAIL_FIELDS = `id,os,oc,code,tag,equipment_name,sector,planned_start,planned_end,
  total_hours,description,status,progress,company_id,company_name,cnpj,package_id,
  previous_progress,has_checklist,checklist_json,planned_daily_json,import_key,created_at,updated_at`;

function metrics(name: string, result: D1Result<unknown>, returned?: number) {
  logD1Metrics(name, result, returned);
}

export async function getServiceEditorData(serviceId: string) {
  const db = getD1();
  const [serviceResult, packagesResult, updatesResult] = await Promise.all([
    db.prepare(`SELECT ${SERVICE_DETAIL_FIELDS} FROM services WHERE id=?1 LIMIT 1`).bind(serviceId).all<D1Service>(),
    db.prepare("SELECT id,name FROM packages ORDER BY name COLLATE NOCASE,id LIMIT 1000").all<{ id: string; name: string }>(),
    db.prepare(`SELECT id,service_id,created_at,report_date,manual_percent,real_percent,description,
      mode,token_code,previous_percent,payload_json,source
      FROM service_updates WHERE service_id=?1 ORDER BY created_at DESC,id DESC LIMIT 50`)
      .bind(serviceId).all<D1Update>(),
  ]);
  metrics("editor.get.service", serviceResult, serviceResult.results?.length);
  metrics("editor.get.packages", packagesResult, packagesResult.results?.length);
  metrics("editor.get.updates", updatesResult, updatesResult.results?.length);
  return {
    service: serviceResult.results?.[0] ?? null,
    packages: packagesResult.results ?? [],
    updates: updatesResult.results ?? [],
  };
}

function checklistStatus(progress: number): CanonicalChecklistItem["status"] {
  return progress >= 100 ? "concluido" : progress > 0 ? "em-andamento" : "nao-iniciado";
}

function mergeChecklist(
  currentJson: string,
  incoming: NonNullable<ServiceEditorPatch["checklist"]>,
): CanonicalChecklistItem[] {
  let current: CanonicalChecklistItem[] = [];
  try {
    current = JSON.parse(currentJson) as CanonicalChecklistItem[];
  } catch {
    current = [];
  }
  const progressById = new Map(current.map((item) => [item.id, item.progress]));
  return incoming.map((item) => {
    const progress = Math.max(0, Math.min(100, progressById.get(item.id) ?? 0));
    return { ...item, progress, status: checklistStatus(progress) };
  });
}

/** Applies one explicitly whitelisted partial update; column names never come from request data. */
export async function patchServiceForEditor(serviceId: string, patch: ServiceEditorPatch) {
  const db = getD1();
  const currentResult = await db.prepare(
    "SELECT status,progress,previous_progress,package_id,checklist_json FROM services WHERE id=?1 LIMIT 1",
  ).bind(serviceId).all<Pick<D1Service, "status" | "progress" | "previous_progress" | "package_id" | "checklist_json">>();
  metrics("editor.patch.current", currentResult, currentResult.results?.length);
  const current = currentResult.results?.[0];
  if (!current) return null;

  if (patch.packageId) {
    const packageResult = await db.prepare("SELECT id FROM packages WHERE id=?1 LIMIT 1")
      .bind(patch.packageId).all<{ id: string }>();
    metrics("editor.patch.package", packageResult, packageResult.results?.length);
    if (!packageResult.results?.length) throw new Error("PACKAGE_NOT_FOUND");
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column}=?${values.length}`);
  };
  if (patch.os !== undefined) set("os", patch.os);
  if (patch.oc !== undefined) set("oc", patch.oc);
  if (patch.tag !== undefined) set("tag", patch.tag);
  if (patch.equipmentName !== undefined) set("equipment_name", patch.equipmentName);
  if (patch.sector !== undefined) set("sector", patch.sector);
  if (patch.plannedStart !== undefined) set("planned_start", patch.plannedStart);
  if (patch.plannedEnd !== undefined) set("planned_end", patch.plannedEnd);
  if (patch.totalHours !== undefined) set("total_hours", patch.totalHours);
  if (patch.companyId !== undefined) set("company_id", patch.companyId);
  if (patch.companyName !== undefined) set("company_name", patch.companyName);
  if (patch.cnpj !== undefined) set("cnpj", patch.cnpj);
  if (patch.description !== undefined) set("description", patch.description);
  if (patch.packageId !== undefined) set("package_id", patch.packageId);

  let nextProgress = patch.progress;
  if (patch.status === "concluded") {
    set("previous_progress", current.progress);
    nextProgress = 100;
  } else if (patch.status && current.status === "concluded" && nextProgress === undefined) {
    nextProgress = current.previous_progress ?? 0;
  }
  if (nextProgress !== undefined) set("progress", nextProgress);
  if (patch.status !== undefined) set("status", nextProgress !== undefined && nextProgress >= 100 ? "concluded" : patch.status);
  else if (nextProgress !== undefined && nextProgress >= 100) set("status", "concluded");

  if (patch.checklist !== undefined) {
    const checklist = mergeChecklist(current.checklist_json, patch.checklist);
    set("checklist_json", JSON.stringify(checklist));
    set("has_checklist", checklist.length ? 1 : 0);
  }
  const now = Date.now();
  set("updated_at", now);
  values.push(serviceId);
  const update = db.prepare(`UPDATE services SET ${sets.join(",")} WHERE id=?${values.length}`).bind(...values);
  const statements = [update];

  if (patch.packageId !== undefined && current.package_id !== patch.packageId) {
    // A pasta é um recorte explícito do pacote anterior; removê-la evita vínculos órfãos.
    statements.push(db.prepare(`UPDATE package_folders
      SET service_ids_json=COALESCE((SELECT json_group_array(value) FROM json_each(service_ids_json) WHERE value<>?1),'[]'),
          updated_at=?2
      WHERE package_id=?3 AND EXISTS(SELECT 1 FROM json_each(service_ids_json) WHERE value=?1)`)
      .bind(serviceId, now, current.package_id));
  }
  const results = await db.batch(statements);
  results.forEach((result, index) => metrics(index === 0 ? "editor.patch.service" : "editor.patch.folders", result));
  return { updatedAt: now, progress: nextProgress ?? current.progress };
}

export async function patchServiceUpdateForEditor(
  serviceId: string,
  updateId: string,
  input: { reportDate: number; percent: number },
) {
  const db: D1Database = getD1();
  const now = Date.now();
  const existing = await db.prepare("SELECT id FROM service_updates WHERE id=?1 AND service_id=?2 LIMIT 1")
    .bind(updateId, serviceId).all<{ id: string }>();
  metrics("editor.update.get", existing, existing.results?.length);
  if (!existing.results?.length) return false;
  const results = await db.batch([
    db.prepare(`UPDATE service_updates SET report_date=?1,manual_percent=?2,real_percent=?2,
      payload_json=json_set(payload_json,'$.reportDate',?1,'$.manualPercent',?2,'$.realPercentSnapshot',?2)
      WHERE id=?3 AND service_id=?4`).bind(input.reportDate, input.percent, updateId, serviceId),
    db.prepare(`UPDATE services SET progress=?1,status=CASE WHEN ?1>=100 THEN 'concluded' ELSE status END,
      updated_at=?2 WHERE id=?3`).bind(input.percent, now, serviceId),
  ]);
  results.forEach((result, index) => metrics(index ? "editor.update.service" : "editor.update.history", result));
  return true;
}

