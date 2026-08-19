PRAGMA foreign_keys = ON;

CREATE TABLE packages (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'concluded')),
  code TEXT, description TEXT, planned_start INTEGER, planned_end INTEGER,
  total_hours REAL, assigned_companies_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(assigned_companies_json)),
  services_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  os TEXT NOT NULL DEFAULT '', oc TEXT, code TEXT, tag TEXT,
  equipment_name TEXT, sector TEXT,
  planned_start INTEGER, planned_end INTEGER, total_hours REAL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'concluded')),
  progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  company_id TEXT, company_name TEXT, cnpj TEXT, package_id TEXT,
  previous_progress REAL, has_checklist INTEGER NOT NULL DEFAULT 0 CHECK (has_checklist IN (0, 1)),
  checklist_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(checklist_json)),
  planned_daily_json TEXT CHECK (planned_daily_json IS NULL OR json_valid(planned_daily_json)),
  import_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL
);

CREATE TABLE package_folders (
  id TEXT PRIMARY KEY, package_id TEXT NOT NULL, name TEXT NOT NULL,
  company_id TEXT, service_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(service_ids_json)),
  token_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, token_created_at INTEGER,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);

CREATE TABLE service_updates (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  report_date INTEGER, manual_percent REAL, real_percent REAL, description TEXT,
  mode TEXT, token_code TEXT, previous_percent REAL,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)), source TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE access_tokens (
  token_code TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  company_id TEXT, package_id TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  status TEXT, expires_at INTEGER, one_time INTEGER NOT NULL DEFAULT 0 CHECK (one_time IN (0, 1)),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE service_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1), total INTEGER NOT NULL DEFAULT 0,
  open INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0,
  concluded INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
INSERT INTO service_stats (id, updated_at) VALUES (1, unixepoch('subsec') * 1000);

CREATE INDEX idx_services_updated ON services(updated_at DESC, id DESC);
CREATE INDEX idx_services_status_updated ON services(status, updated_at DESC, id DESC);
CREATE INDEX idx_services_company_updated ON services(company_id, updated_at DESC, id DESC);
CREATE INDEX idx_services_package_created ON services(package_id, created_at DESC, id DESC) WHERE package_id IS NOT NULL;
CREATE UNIQUE INDEX idx_services_import_key ON services(import_key) WHERE import_key IS NOT NULL;
CREATE INDEX idx_services_os ON services(os);
CREATE INDEX idx_packages_created ON packages(created_at DESC, id DESC);
CREATE INDEX idx_folders_package_name ON package_folders(package_id, name COLLATE NOCASE, id);
CREATE INDEX idx_service_updates_service_created ON service_updates(service_id, created_at DESC, id DESC);
CREATE INDEX idx_access_tokens_target ON access_tokens(target_type, target_id, active, created_at DESC);

CREATE TRIGGER services_status_on_insert AFTER INSERT ON services BEGIN
  UPDATE service_stats SET total=total+1,
    open=open+(NEW.status='open'), pending=pending+(NEW.status='pending'),
    concluded=concluded+(NEW.status='concluded'), updated_at=NEW.updated_at WHERE id=1;
  UPDATE packages SET services_count=services_count+1, updated_at=MAX(updated_at, NEW.updated_at)
    WHERE id=NEW.package_id;
END;
CREATE TRIGGER services_status_on_update AFTER UPDATE OF status, package_id ON services BEGIN
  UPDATE service_stats SET open=open-(OLD.status='open')+(NEW.status='open'),
    pending=pending-(OLD.status='pending')+(NEW.status='pending'),
    concluded=concluded-(OLD.status='concluded')+(NEW.status='concluded'),
    updated_at=NEW.updated_at WHERE id=1;
  UPDATE packages SET services_count=MAX(0,services_count-1) WHERE id=OLD.package_id AND OLD.package_id IS NOT NEW.package_id;
  UPDATE packages SET services_count=services_count+1 WHERE id=NEW.package_id AND OLD.package_id IS NOT NEW.package_id;
END;
CREATE TRIGGER services_status_on_delete AFTER DELETE ON services BEGIN
  UPDATE service_stats SET total=MAX(0,total-1), open=MAX(0,open-(OLD.status='open')),
    pending=MAX(0,pending-(OLD.status='pending')), concluded=MAX(0,concluded-(OLD.status='concluded')),
    updated_at=unixepoch('subsec')*1000 WHERE id=1;
  UPDATE packages SET services_count=MAX(0,services_count-1) WHERE id=OLD.package_id;
END;

-- Guarantees the displayed status invariant even if a caller forgets to normalize it.
CREATE TRIGGER services_progress_complete_on_insert AFTER INSERT ON services
WHEN NEW.progress >= 100 AND NEW.status <> 'concluded' BEGIN
  UPDATE services SET status='concluded' WHERE id=NEW.id;
END;
CREATE TRIGGER services_progress_complete_on_update AFTER UPDATE OF progress ON services
WHEN NEW.progress >= 100 AND NEW.status <> 'concluded' BEGIN
  UPDATE services SET status='concluded' WHERE id=NEW.id;
END;
