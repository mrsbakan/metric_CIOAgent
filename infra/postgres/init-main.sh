#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- pgvector extension
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  -- Langfuse gets its own DB on this instance
  CREATE DATABASE langfuse;

  -- Separate read-only role for reporting (future use)
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cio_agent_readonly') THEN
      CREATE ROLE cio_agent_readonly;
    END IF;
  END
  \$\$;
EOSQL

# Apply schema + RLS migrations (order matters)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /migrations/0000_initial_schema.sql

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /migrations/0001_rls_policies.sql

echo "Schema and RLS policies applied."
