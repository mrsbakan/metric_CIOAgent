#!/bin/sh
# Vault dev mode — seed default secret paths on startup.
# In production, secrets are managed by the Vault operator; never by this script.
set -e

export VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_TOKEN="${VAULT_DEV_ROOT_TOKEN_ID:-dev-root-token}"

# Wait for Vault to be ready
until vault status > /dev/null 2>&1; do sleep 1; done

# ── Enable KV v2 ──────────────────────────────────────────────────────────────
vault secrets enable -path=secret/cioagent kv-v2 2>/dev/null || true

# ── Apply app policy ──────────────────────────────────────────────────────────
vault policy write cio-agent-app /vault/policies/app-policy.hcl 2>/dev/null || true

# ── Seed system secrets (dev values — never use in production) ────────────────
vault kv put secret/cioagent/development/system/postgres \
  host="postgres" port="5432" db="cio_agent" \
  user="cio_agent_app" password="change_me"

vault kv put secret/cioagent/development/system/postgres-audit \
  host="postgres-audit" port="5432" db="cio_agent_audit" \
  user="cio_agent_audit_app" password="change_me"

vault kv put secret/cioagent/development/system/redis \
  host="redis" port="6379" password="change_me"

# JWT keys — placeholders; replace with real RSA-256 keys before first run.
# Generate: openssl genrsa -out jwt.private.pem 4096
#           openssl rsa -in jwt.private.pem -pubout -out jwt.public.pem
vault kv put secret/cioagent/development/system/jwt \
  private_key="PLACEHOLDER_REPLACE_BEFORE_USE" \
  public_key="PLACEHOLDER_REPLACE_BEFORE_USE"

# ── Seed a dev tenant ─────────────────────────────────────────────────────────
DEV_TENANT="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

vault kv put "secret/cioagent/development/tenant/${DEV_TENANT}/llm/ollama" \
  api_key="not-required" endpoint="http://host.docker.internal:11434" model="llama3"

# AES-256 encryption key for dev tenant (32 random bytes base64-encoded)
# Replace with: openssl rand -base64 32
vault kv put "secret/cioagent/development/tenant/${DEV_TENANT}/encryption-key" \
  key="PLACEHOLDER_REPLACE_WITH_openssl_rand_base64_32" \
  iv="PLACEHOLDER_REPLACE_WITH_openssl_rand_base64_16"

echo "Vault dev secrets seeded successfully."
echo "Secret paths under: secret/cioagent/development/"
