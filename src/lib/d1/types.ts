export type D1Status = "open" | "pending" | "concluded";
export interface D1Result<T = unknown> { results?: T[]; success: boolean; meta?: unknown }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(sql: string): Promise<unknown>;
}
export type Page<T> = { items: T[]; nextCursor: string | null };
export interface D1Service { id:string; os:string; oc:string|null; code:string|null; tag:string|null; equipment_name:string|null; sector:string|null; planned_start:number|null; planned_end:number|null; total_hours:number|null; description:string|null; status:D1Status; progress:number; company_id:string|null; company_name:string|null; cnpj:string|null; package_id:string|null; previous_progress:number|null; has_checklist:number; checklist_json:string; planned_daily_json:string|null; import_key:string|null; created_at:number; updated_at:number; }
export interface D1Update { id:string; service_id:string; created_at:number; report_date:number|null; manual_percent:number|null; real_percent:number|null; description:string|null; mode:string|null; token_code:string|null; previous_percent:number|null; payload_json:string; source:string; }
