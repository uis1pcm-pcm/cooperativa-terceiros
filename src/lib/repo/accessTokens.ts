import "server-only";
import { randomBytes } from "crypto";
import { getD1 } from "@/lib/d1/runtime";
import { firstWithMetrics } from "@/lib/d1/metrics";
export type ServiceAccessToken={code:string;company?:string;createdAt?:number;expiresAt?:number};
type Row={token_code:string;company_id:string|null;created_at:number;expires_at:number|null};
const map=(r:Row):ServiceAccessToken=>({code:r.token_code,company:r.company_id??undefined,createdAt:r.created_at,expiresAt:r.expires_at??undefined});
export async function getLatestServiceToken(id:string){const r=await firstWithMetrics<Row>("tokens.latestActive",getD1().prepare("SELECT token_code,company_id,created_at,expires_at FROM access_tokens WHERE target_type='service' AND target_id=?1 AND active=1 AND status<>'revoked' AND(expires_at IS NULL OR expires_at>=?2) ORDER BY created_at DESC LIMIT 1").bind(id,Date.now()));return r?map(r):null;}
const code=()=>{const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",b=randomBytes(8);return Array.from(b,x=>a[x%a.length]).join("");};
export async function ensureServiceAccessToken({serviceId,company}:{serviceId:string;company?:string|null}){const old=await getLatestServiceToken(serviceId);if(old&&(!company||old.company===company))return old;for(let i=0;i<5;i++){const token=code(),now=Date.now();try{await getD1().prepare("INSERT INTO access_tokens(token_code,target_type,target_id,company_id,active,status,created_at,updated_at) VALUES(?1,'service',?2,?3,1,'active',?4,?4)").bind(token,serviceId,company??null,now).run();return{code:token,company:company??undefined,createdAt:now};}catch{continue}}throw new Error("Não foi possível gerar um token único para o serviço.");}
