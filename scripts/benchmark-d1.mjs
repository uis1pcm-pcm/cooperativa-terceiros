#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const directory = mkdtempSync(join(tmpdir(), "cooperativa-d1-benchmark-"));
const database = join(directory, "benchmark.sqlite");
const sqlite = (sql, options = {}) => execFileSync("sqlite3", [database, sql], { encoding: "utf8", ...options }).trim();
const apply = (file) => execFileSync("sqlite3", [database], { input: readFileSync(file) });
const timed = (name, sql) => {
  const start = performance.now();
  const output = sqlite(sql);
  return { query: name, milliseconds: Number((performance.now() - start).toFixed(2)), returned: output ? output.split("\n").length : 0 };
};

try {
  for (const migration of ["0001_d1_initial.sql", "0002_d1_runtime.sql", "0003_d1_performance.sql"]) apply(`migrations/${migration}`);
  sqlite(`BEGIN;
    WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100)
      INSERT INTO packages(id,name,created_at,updated_at) SELECT printf('p%03d',x),printf('Pacote %03d',x),x,x FROM n;
    WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000)
      INSERT INTO services(id,os,oc,code,tag,equipment_name,sector,status,progress,company_id,company_name,cnpj,package_id,created_at,updated_at)
      SELECT printf('s%05d',x),printf('OS-%05d',x),printf('OC-%05d',x),printf('COD-%05d',x),printf('TAG-%05d',x),printf('Equipamento %05d',x),printf('Setor %d',x%20),CASE x%3 WHEN 0 THEN 'pending' ELSE 'open' END,x%99,printf('c%03d',x%50),printf('Empresa %03d',x%50),printf('000000000%05d',x),CASE WHEN x%4=0 THEN printf('p%03d',(x%100)+1) END,x,x FROM n;
    WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<200)
      INSERT INTO package_folders(id,package_id,name,service_ids_json,created_at,updated_at) SELECT printf('f%03d',x),printf('p%03d',(x%100)+1),printf('Pasta %03d',x),json_array(printf('s%05d',x*4)),x,x FROM n;
    WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2000)
      INSERT INTO access_tokens(token_code,target_type,target_id,active,status,created_at,updated_at) SELECT printf('TOKEN%05d',x),'service',printf('s%05d',x),1,'active',x,x FROM n;
    WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100)
      INSERT INTO package_shares(id,token,package_id,service_ids_json,created_at,updated_at) SELECT printf('sh%03d',x),printf('share-%03d',x),printf('p%03d',x),json_array(printf('s%05d',x*4)),x,x FROM n;
    WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<50000)
      INSERT INTO service_updates(id,service_id,created_at,real_percent,payload_json,source) SELECT printf('u%05d',x),printf('s%05d',(x%10000)+1),x,x%101,'{}','benchmark' FROM n;
    COMMIT;`);
  const results = [
    timed("dashboard stats", "SELECT total,open,pending,concluded FROM service_stats WHERE id=1;"),
    timed("recent services", "SELECT id,os,status,progress FROM services ORDER BY updated_at DESC,id DESC LIMIT 20;"),
    timed("page 1", "SELECT id FROM services ORDER BY updated_at DESC,id DESC LIMIT 15;"),
    timed("deep keyset page", "SELECT id FROM services WHERE updated_at<2000 OR(updated_at=2000 AND id<'s02000') ORDER BY updated_at DESC,id DESC LIMIT 15;"),
    timed("FTS one", `SELECT id FROM services_fts WHERE services_fts MATCH '"OS-09999"' LIMIT 20;`),
    timed("FTS none", `SELECT id FROM services_fts WHERE services_fts MATCH '"inexistente"' LIMIT 20;`),
    timed("available", "SELECT id FROM services INDEXED BY idx_services_available WHERE package_id IS NULL AND status IN('open','pending') AND progress<100 ORDER BY created_at DESC,id DESC LIMIT 20;"),
    timed("package services", "SELECT id FROM services WHERE package_id='p001' ORDER BY created_at DESC,id DESC LIMIT 100;"),
    timed("folder services", "SELECT id FROM services WHERE id IN('s00004','s00008','s00012');"),
    timed("service history", "SELECT id,created_at,real_percent FROM service_updates WHERE service_id='s00001' ORDER BY created_at DESC,id DESC LIMIT 50;"),
    timed("token lookup", "SELECT target_type,target_id FROM access_tokens WHERE token_code='TOKEN01000' LIMIT 1;"),
    timed("package share", "SELECT package_id,service_ids_json FROM package_shares WHERE token='share-050' LIMIT 1;"),
  ];
  console.table(results);
  console.log("Timing includes sqlite3 process startup; use it for relative/local regression checks, not D1 billing metrics.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

