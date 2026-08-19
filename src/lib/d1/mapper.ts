import type { Package, Service, ServiceUpdate } from "@/lib/types";
import type { PackageFolder } from "@/types";
import type { D1Service, D1Update } from "./types";

const status = (value: string) => value === "concluded" ? "Concluído" : value === "pending" ? "Pendente" : "Aberto";
const parse = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

export function mapService(row: D1Service): Service {
  return { id: row.id, os: row.os, oc: row.oc ?? undefined, code: row.code ?? undefined, tag: row.tag ?? undefined,
    equipmentName: row.equipment_name ?? undefined, setor: row.sector ?? undefined, sector: row.sector ?? undefined,
    plannedStart: row.planned_start ? new Date(row.planned_start).toISOString() : "", plannedEnd: row.planned_end ? new Date(row.planned_end).toISOString() : "",
    totalHours: row.total_hours ?? 0, description: row.description, status: status(row.status), progress: row.progress,
    andamento: row.progress, realPercent: row.progress, company: row.company_name ?? row.company_id, empresa: row.company_name ?? row.company_id,
    cnpj: row.cnpj, assignedTo: row.company_id ? { companyId: row.company_id, companyName: row.company_name ?? undefined } : undefined,
    packageId: row.package_id ?? undefined, checklist: parse(row.checklist_json, []), plannedDaily: parse(row.planned_daily_json, []),
    previousProgress: row.previous_progress, createdAt: row.created_at, updatedAt: row.updated_at, importKey: row.import_key };
}

export function mapPackage(row: Record<string, unknown>): Package {
  return { id:String(row.id), name:String(row.name), status:status(String(row.status)), plannedStart:row.planned_start ? new Date(Number(row.planned_start)).toISOString().slice(0,10):"",
    plannedEnd:row.planned_end ? new Date(Number(row.planned_end)).toISOString().slice(0,10):"", totalHours:Number(row.total_hours ?? 0), code:row.code ? String(row.code):undefined,
    description:row.description ? String(row.description):null, assignedCompanies:parse(String(row.assigned_companies_json ?? "[]"),[]), createdAt:Number(row.created_at) };
}
export function mapFolder(row: Record<string, unknown>): PackageFolder { return { id:String(row.id), packageId:String(row.package_id), name:String(row.name), companyId:row.company_id ? String(row.company_id):null, services:parse(String(row.service_ids_json),[]), tokenId:row.token_code ? String(row.token_code):null, tokenCode:row.token_code ? String(row.token_code):null, createdAt:Number(row.created_at), updatedAt:Number(row.updated_at), tokenCreatedAt:row.token_created_at ? Number(row.token_created_at):null }; }
export function mapUpdate(row:D1Update):ServiceUpdate { const payload=parse<Record<string,unknown>>(row.payload_json,{}); return { ...payload, id:row.id, serviceId:row.service_id, createdAt:row.created_at, date:row.report_date, description:row.description ?? "", manualPercent:row.manual_percent ?? undefined, percent:row.real_percent ?? undefined, realPercentSnapshot:row.real_percent ?? undefined, previousPercent:row.previous_percent, mode:(row.mode as ServiceUpdate["mode"]) ?? undefined } as ServiceUpdate; }

