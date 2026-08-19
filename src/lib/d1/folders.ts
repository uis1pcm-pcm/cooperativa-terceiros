import type { D1Database } from "./types";
const fields="id,package_id,name,company_id,service_ids_json,token_code,created_at,updated_at,token_created_at";
export class FoldersRepository { constructor(private readonly db:D1Database){} get(id:string){return this.db.prepare(`SELECT ${fields} FROM package_folders WHERE id=?1 LIMIT 1`).bind(id).first();} byPackage(packageId:string){return this.db.prepare(`SELECT ${fields} FROM package_folders WHERE package_id=?1 ORDER BY name COLLATE NOCASE,id LIMIT 500`).bind(packageId).all();} }
