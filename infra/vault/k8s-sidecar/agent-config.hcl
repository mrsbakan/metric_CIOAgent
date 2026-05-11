# Vault Agent Sidecar Config Template
# Used by Vault Agent Injector (Kubernetes).
# This file is referenced by the K8s annotations — not applied manually.
#
# Auth: Kubernetes Service Account JWT
# The agent authenticates using the pod's SA token, then fetches secrets
# and writes them as environment variables or files into the pod.

vault {
  address = "http://vault.vault.svc.cluster.local:8200"
}

auto_auth {
  method "kubernetes" {
    mount_path = "auth/kubernetes"
    config = {
      role = "cio-agent"
    }
  }

  sink "file" {
    config = {
      path = "/vault/secrets/.token"
    }
  }
}

# Render secrets as env-var files consumed by the application via `envFrom`
template {
  source      = "/vault/templates/postgres.tpl"
  destination = "/vault/secrets/postgres.env"
  perms       = "0400"
}

template {
  source      = "/vault/templates/redis.tpl"
  destination = "/vault/secrets/redis.env"
  perms       = "0400"
}

template {
  source      = "/vault/templates/jwt.tpl"
  destination = "/vault/secrets/jwt.env"
  perms       = "0400"
}
