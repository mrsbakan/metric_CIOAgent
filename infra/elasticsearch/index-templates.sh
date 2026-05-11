#!/bin/bash
# Apply Elasticsearch index templates and ILM policies.
# Run once after ES is healthy: bash infra/elasticsearch/index-templates.sh
set -e

ES="${ELASTICSEARCH_URL:-http://localhost:9200}"

echo "Applying ILM policies..."

# App log policy — 90-day retention
curl -fsSL -X PUT "${ES}/_ilm/policy/cio-agent-app-logs" \
  -H "Content-Type: application/json" -d '{
  "policy": {
    "phases": {
      "hot":    { "actions": { "rollover": { "max_age": "7d", "max_size": "10gb" } } },
      "warm":   { "min_age": "30d", "actions": { "forcemerge": { "max_num_segments": 1 } } },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}'

# Audit log policy — 2-year retention
curl -fsSL -X PUT "${ES}/_ilm/policy/cio-audit-logs" \
  -H "Content-Type: application/json" -d '{
  "policy": {
    "phases": {
      "hot":    { "actions": { "rollover": { "max_age": "30d", "max_size": "20gb" } } },
      "warm":   { "min_age": "90d",  "actions": { "forcemerge": { "max_num_segments": 1 } } },
      "cold":   { "min_age": "365d", "actions": { "freeze": {} } },
      "delete": { "min_age": "730d", "actions": { "delete": {} } }
    }
  }
}'

echo "Applying index templates..."

# App log template
curl -fsSL -X PUT "${ES}/_index_template/cio-agent-app" \
  -H "Content-Type: application/json" -d '{
  "index_patterns": ["cio-agent-*"],
  "template": {
    "settings": {
      "index.lifecycle.name":          "cio-agent-app-logs",
      "index.lifecycle.rollover_alias": "cio-agent",
      "number_of_shards":   2,
      "number_of_replicas": 1
    },
    "mappings": {
      "properties": {
        "@timestamp":  { "type": "date" },
        "level":       { "type": "keyword" },
        "service":     { "type": "keyword" },
        "trace_id":    { "type": "keyword" },
        "tenant_id":   { "type": "keyword" },
        "session_id":  { "type": "keyword" },
        "message":     { "type": "text" }
      }
    }
  }
}'

# Audit log template
curl -fsSL -X PUT "${ES}/_index_template/cio-audit" \
  -H "Content-Type: application/json" -d '{
  "index_patterns": ["cio-audit-*"],
  "template": {
    "settings": {
      "index.lifecycle.name":          "cio-audit-logs",
      "index.lifecycle.rollover_alias": "cio-audit",
      "number_of_shards":   2,
      "number_of_replicas": 1
    },
    "mappings": {
      "properties": {
        "@timestamp":  { "type": "date" },
        "level":       { "type": "keyword" },
        "log_type":    { "type": "keyword" },
        "trace_id":    { "type": "keyword" },
        "tenant_id":   { "type": "keyword" },
        "session_id":  { "type": "keyword" },
        "event_type":  { "type": "keyword" },
        "action":      { "type": "keyword" },
        "entity_type": { "type": "keyword" },
        "entity_id":   { "type": "keyword" },
        "message":     { "type": "text" }
      }
    }
  }
}'

echo "Done. ES templates and ILM policies applied."
