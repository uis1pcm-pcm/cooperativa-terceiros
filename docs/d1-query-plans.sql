-- Apply migrations 0001..0003 before running this file.
EXPLAIN QUERY PLAN SELECT id FROM services WHERE id='s' LIMIT 1;
EXPLAIN QUERY PLAN SELECT id,os,status,progress,updated_at FROM services ORDER BY updated_at DESC,id DESC LIMIT 20;
EXPLAIN QUERY PLAN SELECT id FROM services WHERE updated_at<2 OR(updated_at=2 AND id<'z') ORDER BY updated_at DESC,id DESC LIMIT 20;
EXPLAIN QUERY PLAN SELECT id FROM services WHERE status='open' ORDER BY updated_at DESC,id DESC LIMIT 20;
EXPLAIN QUERY PLAN SELECT id FROM services WHERE company_id='c' ORDER BY updated_at DESC,id DESC LIMIT 20;
EXPLAIN QUERY PLAN SELECT id FROM services WHERE package_id='p' ORDER BY created_at DESC,id DESC LIMIT 20;
EXPLAIN QUERY PLAN SELECT id FROM services INDEXED BY idx_services_available WHERE package_id IS NULL AND status IN('open','pending') AND progress<100 ORDER BY created_at DESC,id DESC LIMIT 20;
EXPLAIN QUERY PLAN SELECT id FROM packages ORDER BY created_at DESC,id DESC LIMIT 20;
EXPLAIN QUERY PLAN SELECT id FROM package_folders WHERE package_id='p' ORDER BY name COLLATE NOCASE,id;
EXPLAIN QUERY PLAN SELECT id FROM services WHERE id IN('s1','s2','s3');
EXPLAIN QUERY PLAN SELECT token_code FROM access_tokens WHERE token_code='T' LIMIT 1;
EXPLAIN QUERY PLAN SELECT token_code FROM access_tokens WHERE target_type='service' AND target_id='s' AND active=1 AND(expires_at IS NULL OR expires_at>=0) ORDER BY created_at DESC LIMIT 1;
EXPLAIN QUERY PLAN SELECT id FROM service_updates WHERE service_id='s' ORDER BY created_at DESC,id DESC LIMIT 50;
EXPLAIN QUERY PLAN SELECT id FROM package_shares WHERE token='share' AND active=1 LIMIT 1;
EXPLAIN QUERY PLAN SELECT id FROM services_fts WHERE services_fts MATCH 'term' LIMIT 20;
