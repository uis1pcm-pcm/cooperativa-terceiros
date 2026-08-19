CREATE INDEX idx_services_available ON services(created_at DESC,id DESC)
WHERE package_id IS NULL AND status IN ('open','pending') AND progress < 100;
CREATE INDEX idx_access_tokens_latest ON access_tokens(target_type,target_id,active,created_at DESC)
WHERE active=1;

CREATE VIRTUAL TABLE services_fts USING fts5(id UNINDEXED,os,oc,code,tag,equipment_name,sector,company_id,company_name,cnpj,tokenize='trigram');
INSERT INTO services_fts(rowid,id,os,oc,code,tag,equipment_name,sector,company_id,company_name,cnpj)
SELECT rowid,id,os,coalesce(oc,''),coalesce(code,''),coalesce(tag,''),coalesce(equipment_name,''),coalesce(sector,''),coalesce(company_id,''),coalesce(company_name,''),coalesce(cnpj,'') FROM services;
CREATE TRIGGER services_fts_insert AFTER INSERT ON services BEGIN INSERT INTO services_fts(rowid,id,os,oc,code,tag,equipment_name,sector,company_id,company_name,cnpj) VALUES(new.rowid,new.id,new.os,coalesce(new.oc,''),coalesce(new.code,''),coalesce(new.tag,''),coalesce(new.equipment_name,''),coalesce(new.sector,''),coalesce(new.company_id,''),coalesce(new.company_name,''),coalesce(new.cnpj,'')); END;
CREATE TRIGGER services_fts_delete AFTER DELETE ON services BEGIN DELETE FROM services_fts WHERE rowid=old.rowid; END;
CREATE TRIGGER services_fts_update AFTER UPDATE OF os,oc,code,tag,equipment_name,sector,company_id,company_name,cnpj ON services BEGIN DELETE FROM services_fts WHERE rowid=old.rowid; INSERT INTO services_fts(rowid,id,os,oc,code,tag,equipment_name,sector,company_id,company_name,cnpj) VALUES(new.rowid,new.id,new.os,coalesce(new.oc,''),coalesce(new.code,''),coalesce(new.tag,''),coalesce(new.equipment_name,''),coalesce(new.sector,''),coalesce(new.company_id,''),coalesce(new.company_name,''),coalesce(new.cnpj,'')); END;

CREATE TABLE package_shares(id TEXT PRIMARY KEY,token TEXT NOT NULL UNIQUE,package_id TEXT NOT NULL,service_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(service_ids_json)),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),expires_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,FOREIGN KEY(package_id) REFERENCES packages(id) ON DELETE CASCADE);
CREATE INDEX idx_package_shares_token_active ON package_shares(token,active);
