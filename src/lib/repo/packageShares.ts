"use server";
import { randomUUID } from "crypto";
import { getD1 } from "@/lib/d1/runtime";
import { firstWithMetrics } from "@/lib/d1/metrics";
export type PackageShare={id:string;token:string;packageId:string;serviceIds:string[];createdAt:Date;expiresAt?:Date|null;active:boolean};
type Row={id:string;token:string;package_id:string;service_ids_json:string;created_at:number;expires_at:number|null;active:number};
const map=(r:Row):PackageShare=>({id:r.id,token:r.token,packageId:r.package_id,serviceIds:JSON.parse(r.service_ids_json),createdAt:new Date(r.created_at),expiresAt:r.expires_at?new Date(r.expires_at):null,active:Boolean(r.active)});
export async function createPackageShare({packageId,serviceIds,ttlSeconds=604800}:{packageId:string;serviceIds:string[];ttlSeconds?:number}){const ids=[...new Set(serviceIds.map(x=>x.trim()).filter(Boolean))];if(!packageId.trim()||!ids.length)throw new Error("Pacote e serviços são obrigatórios.");const id=randomUUID(),token=randomUUID(),now=Date.now(),expires=ttlSeconds>0?now+ttlSeconds*1000:null;await getD1().prepare("INSERT INTO package_shares(id,token,package_id,service_ids_json,active,expires_at,created_at,updated_at) VALUES(?1,?2,?3,?4,1,?5,?6,?6)").bind(id,token,packageId,JSON.stringify(ids),expires,now).run();return map({id,token,package_id:packageId,service_ids_json:JSON.stringify(ids),active:1,expires_at:expires,created_at:now});}
export async function getPackageShareByToken(token:string){const r=await firstWithMetrics<Row>("packageShares.get",getD1().prepare("SELECT id,token,package_id,service_ids_json,created_at,expires_at,active FROM package_shares WHERE token=?1 AND active=1 AND(expires_at IS NULL OR expires_at>?2) LIMIT 1").bind(token.trim(),Date.now()));return r?map(r):null;}
export async function deactivatePackageShare(value:string){await getD1().prepare("UPDATE package_shares SET active=0,updated_at=?1 WHERE id=?2 OR token=?2").bind(Date.now(),value.trim()).run();}
