# CIO Agent — Vault policy for the application service account.
# Least-privilege: read-only on system secrets, read+write on tenant secrets.
# Applied via: vault policy write cio-agent-app /vault/policies/app-policy.hcl

# ── System secrets — read only ────────────────────────────────────────────────
path "secret/cioagent/data/+/system/*" {
  capabilities = ["read"]
}

path "secret/cioagent/metadata/+/system/*" {
  capabilities = ["read", "list"]
}

# ── Tenant secrets — read + create (for new tenant provisioning) ──────────────
path "secret/cioagent/data/+/tenant/*" {
  capabilities = ["read", "create", "update"]
}

path "secret/cioagent/metadata/+/tenant/*" {
  capabilities = ["read", "list"]
}

# ── Deny everything else explicitly ──────────────────────────────────────────
path "secret/*" {
  capabilities = ["deny"]
}

path "sys/*" {
  capabilities = ["deny"]
}
