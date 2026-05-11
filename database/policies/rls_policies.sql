-- CIO Agent — Row Level Security Policies
-- Applied after 0000_initial_schema.sql
-- Every table with tenant_id enforces isolation at the DB level.
-- The app user sets: SET LOCAL app.tenant_id = '<uuid>' at transaction start.
-- Even if the application layer has a bug, cross-tenant leakage is blocked here.

-- ─── Helper: safe tenant_id getter ───────────────────────────────────────────
-- Returns NULL if app.tenant_id is not set (blocks all rows for unauthenticated connections).
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID;
$$;

-- ─── users ────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_tenant_id());

-- ─── roles ────────────────────────────────────────────────────────────────────
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON roles
  USING (tenant_id = current_tenant_id());

-- ─── user_roles — no direct tenant_id; isolated via users JOIN ───────────────
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_roles
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_roles.user_id
        AND u.tenant_id = current_tenant_id()
    )
  );

-- ─── memory_private_user ──────────────────────────────────────────────────────
ALTER TABLE memory_private_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_private_user FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON memory_private_user
  USING (tenant_id = current_tenant_id());

-- ─── memory_private_role ──────────────────────────────────────────────────────
ALTER TABLE memory_private_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_private_role FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON memory_private_role
  USING (tenant_id = current_tenant_id());

-- ─── memory_shared ────────────────────────────────────────────────────────────
ALTER TABLE memory_shared ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_shared FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON memory_shared
  USING (tenant_id = current_tenant_id());

-- ─── prompt_layers ────────────────────────────────────────────────────────────
ALTER TABLE prompt_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_layers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON prompt_layers
  USING (tenant_id = current_tenant_id());

-- ─── prompt_versions — isolated via prompt_layers JOIN ───────────────────────
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON prompt_versions
  USING (
    EXISTS (
      SELECT 1 FROM prompt_layers pl
      WHERE pl.id = prompt_versions.prompt_layer_id
        AND pl.tenant_id = current_tenant_id()
    )
  );

-- ─── skills ───────────────────────────────────────────────────────────────────
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON skills
  USING (tenant_id = current_tenant_id());

-- ─── agent_sessions ───────────────────────────────────────────────────────────
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON agent_sessions
  USING (tenant_id = current_tenant_id());

-- ─── pending_approvals ────────────────────────────────────────────────────────
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_approvals FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON pending_approvals
  USING (tenant_id = current_tenant_id());

-- ─── alerts ───────────────────────────────────────────────────────────────────
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON alerts
  USING (tenant_id = current_tenant_id());

-- ─── escalation_rules ─────────────────────────────────────────────────────────
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON escalation_rules
  USING (tenant_id = current_tenant_id());

-- ─── connectors ───────────────────────────────────────────────────────────────
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connectors
  USING (tenant_id = current_tenant_id());

-- ─── connector_events ─────────────────────────────────────────────────────────
ALTER TABLE connector_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON connector_events
  USING (tenant_id = current_tenant_id());

-- ─── documents ────────────────────────────────────────────────────────────────
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_tenant_id());

-- ─── document_chunks ──────────────────────────────────────────────────────────
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON document_chunks
  USING (tenant_id = current_tenant_id());

-- ─── credit_ledger — append-only: SELECT + INSERT only ───────────────────────
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON credit_ledger
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_insert ON credit_ledger
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- UPDATE and DELETE blocked at GRANT level (app user has no UPDATE/DELETE on credit_ledger)

-- ─── license_tokens ───────────────────────────────────────────────────────────
ALTER TABLE license_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON license_tokens
  USING (tenant_id = current_tenant_id());

-- ─── Revoke cross-table permissions from app user ────────────────────────────
-- credit_ledger: no UPDATE, no DELETE
REVOKE UPDATE, DELETE, TRUNCATE ON credit_ledger FROM cio_agent_app;
