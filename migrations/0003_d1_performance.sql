-- Runtime token reads only request active targets; keep the smaller partial index.
DROP INDEX IF EXISTS idx_access_tokens_target;
-- token is UNIQUE already, so its automatic unique index covers share lookup.
DROP INDEX IF EXISTS idx_package_shares_token_active;
-- The editor lists package choices alphabetically; packages are low-write/high-read.
CREATE INDEX idx_packages_name ON packages(name COLLATE NOCASE, id);

