-- Audit DB migration 0000 — audit_events (INSERT-only)
-- Applied to: cio_agent_audit database
-- Note: init-audit.sh bootstraps this for local dev; this file is the canonical migration for production.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS audit_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL,
  user_id       UUID,
  session_id    UUID,
  event_type    TEXT NOT NULL,
  action        TEXT,
  entity_type   TEXT,
  entity_id     UUID,
  before_state  JSONB,
  after_state   JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_created   ON audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type     ON audit_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_session        ON audit_events (session_id);

-- ─── Enforce INSERT-only at DB level ────────────────────────────────────────
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM CURRENT_USER;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_insert_only ON audit_events FOR INSERT WITH CHECK (true);
CREATE POLICY audit_select_all  ON audit_events FOR SELECT USING (true);
CREATE POLICY audit_no_update   ON audit_events FOR UPDATE USING (false);
CREATE POLICY audit_no_delete   ON audit_events FOR DELETE USING (false);
