#!/bin/sh
# Run this once during initial Vault setup on each K8s cluster.
# Requires: kubectl access + Vault root/admin token.
set -e

VAULT_ADDR="${VAULT_ADDR:-http://vault.vault.svc.cluster.local:8200}"
NAMESPACE="${K8S_NAMESPACE:-cio-agent}"
SA_NAME="cio-agent"

# Enable Kubernetes auth method
vault auth enable kubernetes 2>/dev/null || true

# Configure the K8s auth method using the cluster's API server
vault write auth/kubernetes/config \
  kubernetes_host="https://${KUBERNETES_PORT_443_TCP_ADDR}:443" \
  kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  token_reviewer_jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)"

# Create a role binding the K8s service account to the Vault policy
vault write auth/kubernetes/role/cio-agent \
  bound_service_account_names="${SA_NAME}" \
  bound_service_account_namespaces="${NAMESPACE}" \
  policies="cio-agent-app" \
  ttl="1h" \
  max_ttl="4h"

echo "Vault Kubernetes auth configured."
echo "  Role:      cio-agent"
echo "  Namespace: ${NAMESPACE}"
echo "  SA:        ${SA_NAME}"
echo "  Policy:    cio-agent-app"
