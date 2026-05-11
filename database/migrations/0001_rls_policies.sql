-- CIO Agent — Migration 0001: RLS Policies
-- Depends on: 0000_initial_schema.sql
-- Apply: psql $DATABASE_URL -f 0001_rls_policies.sql

\i ../policies/rls_policies.sql
