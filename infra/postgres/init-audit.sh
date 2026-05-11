#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  -- audit_events table: INSERT only — no UPDATE, no DELETE
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

  -- Partition by month for efficient retention management
  -- (full partitioning applied via migration; this is the base table for dev)

  -- Indexes for common query patterns
  CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_events (tenant_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_user_created   ON audit_events (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_event_type     ON audit_events (event_type, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_session        ON audit_events (session_id);

  -- Revoke UPDATE and DELETE from the app user — INSERT only
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM "$POSTGRES_USER";

  -- Enforce via row-level: no rows can be updated (belt-and-suspenders)
  ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

  CREATE POLICY audit_insert_only ON audit_events
    FOR INSERT WITH CHECK (true);

  CREATE POLICY audit_no_update ON audit_events
    FOR UPDATE USING (false);

  CREATE POLICY audit_no_delete ON audit_events
    FOR DELETE USING (false);
EOSQL
