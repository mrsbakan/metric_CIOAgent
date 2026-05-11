-- Migration: 0002_users_password_hash
-- Adds password_hash column to users table for Phase 1 email/password auth

ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';

-- Remove the temporary default after backfill (new rows must supply a value)
ALTER TABLE users ALTER COLUMN password_hash DROP DEFAULT;
