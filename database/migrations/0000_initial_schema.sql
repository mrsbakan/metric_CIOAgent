-- CIO Agent — Initial Schema Migration
-- Generated: 2026-05-07
-- Run: psql $DATABASE_URL -f 0000_initial_schema.sql

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE account_status        AS ENUM ('active', 'suspended', 'terminated');
CREATE TYPE package_status        AS ENUM ('draft', 'active', 'archived');
CREATE TYPE user_type             AS ENUM ('admin', 'power', 'standard', 'readonly');
CREATE TYPE user_status           AS ENUM ('active', 'inactive', 'pending');
CREATE TYPE agent_state           AS ENUM (
  'RECEIVED', 'CONTEXT_LOADED', 'PROMPT_COMPILED', 'LLM_CALLED',
  'ACTION_DECIDED', 'AWAITING_APPROVAL', 'EXECUTING', 'COMPLETED', 'FAILED'
);
CREATE TYPE approval_status       AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE prompt_layer_type     AS ENUM ('system', 'general', 'role', 'project', 'user');
CREATE TYPE connector_type        AS ENUM ('jira', 'servicenow', 'azure', 'spirai');
CREATE TYPE connector_event_status AS ENUM ('pending', 'processed', 'dlq');
CREATE TYPE document_access_level AS ENUM ('private', 'role', 'shared');
CREATE TYPE credit_type           AS ENUM ('credit', 'debit');
CREATE TYPE license_status        AS ENUM ('active', 'expiring', 'expired', 'read_only');

-- ─── Account & Licensing ──────────────────────────────────────────────────────
CREATE TABLE accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  status     account_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE packages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  code           TEXT NOT NULL UNIQUE,
  status         package_status NOT NULL DEFAULT 'draft',
  application_id TEXT NOT NULL,
  config         JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account_applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES accounts(id),
  application_id TEXT NOT NULL,
  package_id     UUID NOT NULL REFERENCES packages(id),
  status         account_status NOT NULL DEFAULT 'active',
  activated_at   TIMESTAMPTZ
);

CREATE TABLE account_overrides (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES accounts(id),
  application_id TEXT NOT NULL,
  param_key      TEXT NOT NULL,
  param_value    TEXT NOT NULL
);

-- ─── Credits — Append-only ────────────────────────────────────────────────────
CREATE TABLE credit_ledger (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL,
  account_application_id UUID NOT NULL REFERENCES account_applications(id),
  amount                 INTEGER NOT NULL,
  type                   credit_type NOT NULL,
  action_type            TEXT NOT NULL,
  reference_id           UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users & Roles ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id),
  email      TEXT NOT NULL,
  user_type  user_type NOT NULL DEFAULT 'standard',
  status     user_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  permissions       JSONB NOT NULL DEFAULT '{}',
  escalation_config JSONB NOT NULL DEFAULT '{}',
  alert_thresholds  JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE user_roles (
  user_id     UUID NOT NULL REFERENCES users(id),
  role_id     UUID NOT NULL REFERENCES roles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);

-- ─── Memory ───────────────────────────────────────────────────────────────────
CREATE TABLE memory_private_user (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,  -- AES-256 ciphertext
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, key)
);

CREATE TABLE memory_private_role (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,  -- AES-256 ciphertext
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, role_id, key)
);

CREATE TABLE memory_shared (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, key)
);

-- ─── Prompt & Skill ───────────────────────────────────────────────────────────
CREATE TABLE prompt_layers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  layer_type prompt_layer_type NOT NULL,
  scope_id   UUID,
  content    TEXT NOT NULL,  -- AES-256 ciphertext
  version    INTEGER NOT NULL DEFAULT 1,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prompt_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_layer_id UUID NOT NULL REFERENCES prompt_layers(id),
  content         TEXT NOT NULL,  -- AES-256 ciphertext
  version         INTEGER NOT NULL,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revert_of       INTEGER
);

CREATE TABLE skills (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  layer_type prompt_layer_type NOT NULL,
  scope_id   UUID,
  name       TEXT NOT NULL,
  definition JSONB NOT NULL DEFAULT '{}',
  version    INTEGER NOT NULL DEFAULT 1,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Agent Session & State ────────────────────────────────────────────────────
CREATE TABLE agent_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id),
  role_id    UUID NOT NULL REFERENCES roles(id),
  state      agent_state NOT NULL DEFAULT 'RECEIVED',
  context    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE pending_approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  session_id   UUID NOT NULL REFERENCES agent_sessions(id),
  action_type  TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       approval_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES users(id)
);

-- ─── Alerts & Escalation ──────────────────────────────────────────────────────
CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  name           TEXT NOT NULL,
  source_system  TEXT,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_config  JSONB NOT NULL DEFAULT '{}',
  owner_role_id  UUID REFERENCES roles(id),
  priority       INTEGER NOT NULL DEFAULT 3,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE escalation_rules (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL,
  role_id              UUID NOT NULL REFERENCES roles(id),
  trigger_config       JSONB NOT NULL DEFAULT '{}',
  target_role_id       UUID REFERENCES roles(id),
  target_user_id       UUID REFERENCES users(id),
  action_on_escalation TEXT NOT NULL,
  time_window_seconds  INTEGER NOT NULL
);

-- ─── Connectors ───────────────────────────────────────────────────────────────
CREATE TABLE connectors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  type           connector_type NOT NULL,
  name           TEXT NOT NULL,
  auth_config    TEXT NOT NULL,  -- AES-256 ciphertext
  field_mapping  JSONB NOT NULL DEFAULT '{}',
  webhook_config JSONB NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE connector_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  connector_id UUID NOT NULL REFERENCES connectors(id),
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       connector_event_status NOT NULL DEFAULT 'pending',
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  retry_count  INTEGER NOT NULL DEFAULT 0
);

-- ─── Knowledge Base (pgvector) ────────────────────────────────────────────────
CREATE TABLE documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  access_level document_access_level NOT NULL DEFAULT 'private',
  scope_id     UUID,
  version      INTEGER NOT NULL DEFAULT 1,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by  UUID REFERENCES users(id),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(1536),
  chunk_index INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast ANN search (pgvector)
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── License Tokens ───────────────────────────────────────────────────────────
CREATE TABLE license_tokens (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL,
  account_application_id UUID NOT NULL REFERENCES account_applications(id),
  token                  TEXT NOT NULL,
  jti                    TEXT NOT NULL UNIQUE,  -- replay attack prevention
  issued_at              TIMESTAMPTZ NOT NULL,
  expires_at             TIMESTAMPTZ NOT NULL,
  last_synced_at         TIMESTAMPTZ,
  status                 license_status NOT NULL DEFAULT 'active'
);

-- ─── Performance Indexes ──────────────────────────────────────────────────────
CREATE INDEX idx_users_tenant          ON users (tenant_id);
CREATE INDEX idx_users_email           ON users (email);
CREATE INDEX idx_roles_tenant          ON roles (tenant_id);
CREATE INDEX idx_agent_sessions_tenant ON agent_sessions (tenant_id, created_at DESC);
CREATE INDEX idx_agent_sessions_user   ON agent_sessions (user_id, created_at DESC);
CREATE INDEX idx_agent_sessions_state  ON agent_sessions (state) WHERE state NOT IN ('COMPLETED', 'FAILED');
CREATE INDEX idx_pending_approvals     ON pending_approvals (tenant_id, status) WHERE status = 'pending';
CREATE INDEX idx_connector_events_dlq  ON connector_events (tenant_id, status) WHERE status = 'dlq';
CREATE INDEX idx_credit_ledger_tenant  ON credit_ledger (tenant_id, created_at DESC);
CREATE INDEX idx_document_chunks_doc   ON document_chunks (document_id, chunk_index);
CREATE INDEX idx_memory_user_key       ON memory_private_user (tenant_id, user_id, key);
CREATE INDEX idx_memory_role_key       ON memory_private_role (tenant_id, role_id, key);
