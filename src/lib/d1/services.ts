import type { D1Database, D1Service, D1Status, Page } from "./types";
export type ServiceListOptions = { status?:D1Status; companyId?:string; packageId?:string; limit?:number; beforeUpdatedAt?:number; beforeId?:string };
export class ServicesRepository {
  constructor(private readonly db:D1Database) {}
  async get(id:string) { return this.db.prepare("SELECT id,os,oc,code,tag,equipment_name,sector,planned_start,planned_end,total_hours,description,status,progress,company_id,company_name,cnpj,package_id,previous_progress,has_checklist,checklist_json,planned_daily_json,import_key,created_at,updated_at FROM services WHERE id=?1 LIMIT 1").bind(id).first<D1Service>(); }
  async list(options:ServiceListOptions = {}):Promise<Page<D1Service>> {
    const clauses:string[]=[]; const values:unknown[]=[];
    const add=(sql:string,value:unknown)=>{ values.push(value); clauses.push(sql.replace("?",`?${values.length}`)); };
    if(options.status) add("status = ?",options.status); if(options.companyId) add("company_id = ?",options.companyId); if(options.packageId) add("package_id = ?",options.packageId);
    if(options.beforeUpdatedAt != null && options.beforeId) { values.push(options.beforeUpdatedAt,options.beforeId); clauses.push(`(updated_at < ?${values.length-1} OR (updated_at = ?${values.length-1} AND id < ?${values.length}))`); }
    const limit=Math.min(Math.max(options.limit ?? 50,1),200); values.push(limit+1);
    const sql=`SELECT id,os,oc,code,tag,equipment_name,sector,planned_start,planned_end,total_hours,description,status,progress,company_id,company_name,cnpj,package_id,previous_progress,has_checklist,checklist_json,planned_daily_json,import_key,created_at,updated_at FROM services ${clauses.length?`WHERE ${clauses.join(" AND ")}`:""} ORDER BY updated_at DESC, id DESC LIMIT ?${values.length}`;
    const rows=(await this.db.prepare(sql).bind(...values).all<D1Service>()).results ?? []; const more=rows.length>limit; const items=rows.slice(0,limit); const last=items.at(-1);
    return {items,nextCursor:more&&last?`${last.updated_at}:${last.id}`:null};
  }
  async upsert(row:D1Service) { const keys=Object.keys(row) as (keyof D1Service)[]; const sql=`INSERT INTO services (${keys.join(",")}) VALUES (${keys.map((_,i)=>`?${i+1}`).join(",")}) ON CONFLICT(id) DO UPDATE SET ${keys.filter(k=>k!=="id").map(k=>`${k}=excluded.${k}`).join(",")}`; return this.db.prepare(sql).bind(...keys.map(k=>row[k])).run(); }
}
export type { D1Service } from "./types";
