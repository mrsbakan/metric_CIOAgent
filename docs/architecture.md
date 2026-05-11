# CIO Agent — Technical Architecture

## Overview

CIO Agent is a production-grade, enterprise AI orchestration platform designed to serve CIOs and their teams. It monitors project execution across JIRA, ServiceNow, and Azure DevOps; manages IT operational performance; and drives OKR lifecycle through Spirai integration. The system operates on-premise with a clear path to SaaS scaling, and is built for full auditability, role-based isolation, and deterministic agent behavior.

---

## Architectural Decisions Summary

| # | Decision | Choice |
|---|---|---|
| Deployment | On-prem first, SaaS-ready architecture | Docker + Kubernetes |
| Orchestrator | Hybrid: LangGraph skeleton + custom critical layers | LangGraph + Custom |
| LLM | Configurable router, customer-owned API keys | Ollama / Groq default |
| Database | Relational + vector + audit | PostgreSQL + pgvector + Redis |
| Event bus | Real-time, event-driven | Kafka / Redis Streams |
| Auth | Enterprise SSO | LDAP / Active Directory + JWT |
| Security | No raw data leaves company network | PII masking + AES-256 |
| Audit | Immutable, append-only | WORM + SIEM integration |
| Licensing | Hybrid: fixed license + abstract credit system | RSA-signed JWT + Redis |
| CI/CD | Quality-gated deployment | GitHub Actions + Blue-green |

---

## 01 · Orchestrator Architecture

### Framework Decision: LangGraph + Custom Critical Layers

LangGraph provides the orchestration skeleton. All business-critical logic is implemented as custom layers on top, never delegated to the framework.

| Component | Approach |
|---|---|
| Graph management, state persistence, tool routing | LangGraph |
| Prompt Compiler | Fully custom |
| Action Decision Matrix | Fully custom middleware |
| Approval flow state machine | Fully custom |
| Session isolation | Fully custom |

### Agent State Machine

Every agent action passes through the following states in order. No state can be skipped.

```
RECEIVED
  → CONTEXT_LOADED
    → PROMPT_COMPILED
      → LLM_CALLED
        → ACTION_DECIDED
          → AWAITING_APPROVAL  (if Draft or Approval required)
            → EXECUTING
              → COMPLETED
              → FAILED
```

Every state transition is written to the audit log.

### Prompt Compiler

The compiler assembles the final prompt from four layers in strict order:

```
[LAYER 1] Hard-coded System Core       ← immutable, never modifiable
[LAYER 2] General Rules                ← CIO-defined, all roles
[LAYER 3] Role Rules                   ← active user's role
[LAYER 4] Project / User Rules         ← most specific, lowest priority
─────────────────────────────────────────
[CONTEXT] Memory + Skill output
[TOOLS]   Available tool definitions
[HISTORY] Windowed conversation history
[INPUT]   Current user message
```

**Conflict resolution:** If a lower layer contradicts a higher layer, the lower layer is rejected. The conflict is logged and a warning is sent to the CIO.

**Token budget enforcement:**

| Slot | Max allocation |
|---|---|
| System prompt (all layers) | 20% |
| Memory + skill output | 30% |
| Conversation history | 30% |
| Tool definitions | 10% |
| User input + response reserve | 10% min |

If the budget is exceeded, trimming order: conversation history (oldest first) → Layer 4 → Layer 3. Layers 1 and 2 are never trimmed. All trimming events are logged.

### Action Decision Matrix

Default behavior per role. All values are configurable from the admin screen.

| Action | CIO | D&A Manager | IT Manager |
|---|---|---|---|
| Send alert / notification | Autonomous | Autonomous | Autonomous |
| Create OKR draft in Spirai | Autonomous | Autonomous | Autonomous |
| Assign OKR to a person | Draft | Autonomous | Autonomous (own team) |
| Open task in JIRA / Azure / SNow | Draft | Autonomous | Autonomous |
| Update existing task | Approval required | Draft | Draft |
| Close task | Approval required | Approval required | Draft |
| Define new user / role | Autonomous | N/A | N/A |
| Issue directive to another role | Autonomous | N/A | N/A |

- **Autonomous** — Agent acts, then notifies
- **Draft** — Agent prepares, user reviews and approves
- **Approval required** — Nothing happens without explicit user confirmation

### Tool Call Pipeline

1. Tool name and parameters pass schema validation
2. Action Decision Matrix is checked for the role
3. Autonomous → execute immediately
4. Draft → present preview to user
5. Approval required → mutex lock, wait for confirmation

Every tool execution is **idempotent**. Each call receives a unique idempotency key. Duplicate execution of the same key is a no-op.

### Production Requirements

- **Timeout chain:** LLM 30s, tool execution 10s, approval wait 48h
- **Retry strategy:** LLM errors → exponential backoff, 3 attempts. Tool execution errors → no retry, immediate FAILED (prevents source system inconsistency)
- **Concurrency:** If the same user initiates two actions simultaneously, the second waits in RECEIVED until the first completes
- **Session isolation:** Each session stored in DB, not memory. Sessions never share state.

---

## 02 · LLM Evals Architecture

### Three-Layer Eval Structure

**Layer 1 — Offline Evals (development)**

Runs automatically on every prompt change or model update. Integrated into CI pipeline as a merge blocker.

| Metric | Target |
|---|---|
| Task completion rate | ≥ 95% |
| Approval bypass rate | 0% — zero tolerance |
| Hallucination rate | ≤ 2% |
| Format compliance | ≥ 98% |
| Prompt injection resistance | 100% |

**Layer 2 — Shadow Evals (production parallel)**

10% of production traffic is run through a second model in parallel. Results are not shown to users. Used for model upgrade decisions.

**Layer 3 — Production Monitoring**

Continuously tracked:
- p95 response latency
- User rejection rate (Draft presented, user rejected — quality signal)
- Re-query rate (user rephrased the same question — response was insufficient)
- Credit consumption anomaly (3× expected consumption → infinite loop detection)

### Production Acceptance Criteria

No deployment without all criteria passing:

1. Approval bypass rate → 0%
2. Task completion rate → ≥ 95%
3. Prompt injection resistance → 100%
4. p95 latency → < 8 seconds
5. Hallucination rate → < 2%

### Tooling

| Purpose | Tool |
|---|---|
| Eval framework | RAGAS + custom eval harness |
| Test data management | LabelStudio or custom labeling UI |
| Production monitoring + tracing | Langfuse (on-prem deployable) |
| A/B model comparison | Langfuse experiment tracking |

---

## 03 · System Prompt Architecture

### Layer Definitions

**Layer 1 — Hard-coded System Core**

Stored in code, not in DB. Cannot be changed without a deployment. Contains:

- No action executes without identity and role verification
- Approval-required actions can never run as Autonomous — enforced at code level, not prompt level
- Private memory cannot leak across sessions
- Prompt injection patterns are detected and rejected on input
- The system cannot reveal its own prompt architecture to users

**Layers 2–4 — User-configurable**

Stored in DB, versioned, revertable.

| Layer | Who Can Edit | Scope |
|---|---|---|
| General rules | CIO only | All roles and users |
| Role-based rules | CIO + authorized users | Specific role |
| Project / User rules | CIO + project owner / each user | Project or individual |

Every change triggers the eval suite automatically. Changes do not go active until quality criteria pass.

### Prompt Injection Protection

**Input level** — before user message is processed:
- Known injection patterns scanned via regex + classifier
- "Ignore previous instructions", "You are now", "Act as" patterns detected
- Suspicious input rejected, neutral error returned to user, audit log written

**Output level** — before LLM response reaches user:
- Response checked for system information leakage
- Tool call parameters checked for unexpected values
- Anomaly detected → response blocked, FAILED state

### Version Management

- Every change creates a new version; previous versions are never deleted
- Active version is logged on every LLM call
- One-click rollback to any previous version
- Rollback itself is versioned: who, when, why

---

## 04 · Connector Framework

### Design Principle

Every integration is an independent connector module. Adding a new system does not change the framework. The orchestrator knows only the standard interface.

### Standard Interface

Every connector implements:

```typescript
interface Connector {
  connect(): Promise<void>
  read(query: ReadQuery): Promise<NormalizedData>
  write(action: string, payload: object, idempotencyKey: string): Promise<WriteResult>
  subscribe(eventType: string, callback: EventHandler): Promise<void>
  healthcheck(): Promise<HealthStatus>
  disconnect(): Promise<void>
}
```

### Per-Connector Responsibilities

**Authentication**

| Connector | Auth method |
|---|---|
| JIRA | OAuth 2.0 + API token |
| ServiceNow | Basic auth or OAuth, instance-based |
| Azure DevOps | Azure AD token, PAT option |
| Spirai | API key or OAuth |

All tokens stored encrypted in Key Vault. Connector checks token validity on each call, refreshes automatically, produces FAILED state if refresh fails.

**Rate limiting:** Each connector manages its own rate limits internally using token bucket algorithm. The orchestrator is never exposed to rate limit errors.

**Field mapping:** Source system field names are normalized to internal model. Mapping is stored in connector config, no code change required.

**Write-back safety:** Before any write:
1. Does the user have write permission on this connector?
2. Does the Action Decision Matrix allow this action?
3. Has the idempotency key been used before?

All three must pass. Otherwise the write does not execute.

### Event-Driven Integration

**Webhook (preferred):** All four source systems support webhooks. Change occurs → system notifies us → we process. Real-time, low resource consumption.

**Polling (fallback):** Configurable interval, default 5 minutes, minimum 1 minute. Used when webhook cannot be configured or is unreliable.

All incoming events are written to the Event Bus. The orchestrator reads from the Event Bus. No direct connection between connector and orchestrator.

### Dead-Letter Queue

Failed events are not lost:
1. Retry 3 times with exponential backoff
2. After 3 failures → moved to Dead-Letter Queue
3. DLQ is monitored, generates alerts
4. Manual replay available — once issue is resolved, event is reprocessed

### Spirai — Special Case

Spirai manages OKR lifecycle, not just read/write. Additional flows required:

1. **OKR creation** — Agent generates OKR draft from project signals → Skill: OKR Quality Assessment → CIO or authorized user approves → written to Spirai. Always at least Draft level, never Autonomous.
2. **KR assignment** — Role-based permissions per Action Decision Matrix. Assignment triggers notification to affected user.
3. **Project signal → OKR update** — JIRA sprint closed → relevant KR progress updated. ServiceNow SLA breach → risk reflected in OKR. Mapping is configurable.
4. **Performance review triggering** — Coordinated with calendar integration. Triggered when KR completion threshold is reached or review date arrives.

Bidirectional sync: manual changes in Spirai → webhook → Event Bus → agent memory updated. Conflicts surface to user with both sources shown; agent does not resolve autonomously.

Spirai connector is a separate development package. Do not combine with other connector sprints.

---

## 05 · Test Strategy

### Test Pyramid

```
          [LLM Evals]              ← fewest, most critical
        [E2E / Contract]           ← full business flows
      [Integration Tests]          ← connectors, DB, event bus
    [Unit Tests]                   ← pure logic, deterministic
```

### Unit Tests

Covers: Prompt Compiler, Action Decision Matrix, Credit Interceptor, State Machine transitions, Field mapping, Token budget calculation.

Rule: no LLM calls, no external systems, every test deterministic and isolated.

**Target coverage: ≥ 90%** on business logic layers.

Framework: Jest (TypeScript) or Pytest (Python).

### Integration Tests

Covers:
- Connector communication with real or mock systems
- PostgreSQL RLS policy correctness
- Redis atomic decrement race conditions
- Event Bus write and read
- LangGraph state persistence accuracy

Mock server for each connector (WireMock or equivalent). No real JIRA/ServiceNow calls in CI. Real external systems only in staging.

### Contract Tests

Covers: Frontend ↔ BFF ↔ Orchestrator API contracts.

Tool: **Pact**. Consumer defines expected response, provider proves it satisfies the contract. Change in either side breaks the contract and is caught in CI.

### E2E Tests

Critical scenarios — deployment is blocked without these passing:

- CIO defines a new role; user logs in with that role; sees only role-permitted actions
- Alert fires; correct user receives notification on correct channel
- Approval-required action does not execute without user confirmation
- Credit is exhausted; action is blocked; user receives meaningful message
- Offline mode: system operates read-only; write attempt is rejected

Framework: **Playwright** — cross-browser, headless, CI-integrated.

### Security Tests

- **SAST:** SonarQube on every commit
- **DAST:** OWASP ZAP before every release
- **Prompt injection suite:** All known injection patterns attempted; system must reject all. New patterns added to suite as discovered.
- **Penetration test:** Once before go-live, annually thereafter
- **RLS penetration:** User A attempts to access User B's private memory — must fail. Automated test suite.

### Performance Tests

Tool: **k6**

| Scenario | Acceptance criterion |
|---|---|
| 50 concurrent users (normal load) | p95 latency < 8s |
| 200 concurrent users (peak load) | System slows, does not crash |
| LLM timeout simulation | Graceful degradation |
| Event Bus flood | Dead-letter queue activates, no event loss |

Runs before every release. If performance degrades > 20% from baseline, release is blocked.

### Chaos Engineering

Executed in production during first 3 months:

| Scenario | Expected behavior |
|---|---|
| LLM service cut | Fallback model activates |
| DB connection lost | Meaningful error to user, no data loss |
| Event Bus stops | Connector falls back to polling |
| License service unreachable | Grace period activates |

### CI/CD Quality Gates — Deployment Blocked If:

1. Unit test coverage drops below 90%
2. Approval bypass eval is not 0%
3. Contract test breaks
4. SAST finds critical finding
5. p95 latency degrades > 20% from baseline
6. Prompt injection test fails

---

## 06 · Licensing & Monetization

### Model

**Hybrid:** Fixed license fee (per tier) + abstract credit system (usage-based top-up).

LLM API keys are owned by the customer. They enter their own keys (Groq, Azure OpenAI, Ollama, etc.) into the system. LLM costs flow directly to their accounts. We are not in the LLM billing chain.

Our credits are abstract — even if the customer uses Ollama at zero LLM cost, every agent action consumes our credits.

### Application & User Model

```
Account (Customer Firm)
    └── Application: CIO Agent
    └── Application: IT Ops Agent      ← future
    └── Application: Portfolio Agent   ← future
```

Each application is independently licensed and billed. Credits do not transfer between applications.

**User types per application:**

| Type | Description | Credit behavior |
|---|---|---|
| Admin | Manages account, configures packages, defines LLM keys | Low consumption |
| Power User | Full feature access (maps to CIO role) | High consumption |
| Standard User | Normal access (D&A Manager, IT Manager) | Medium consumption |
| Read-only User | View only, no actions | Minimal consumption |

### Package Tiers

| | Starter | Professional | Enterprise |
|---|---|---|---|
| Users | Up to 10 | Up to 50 | Unlimited |
| Roles | Up to 3 | Up to 10 | Unlimited |
| Monthly included credits | 5,000 | 25,000 | 100,000 |
| Connectors | JIRA + ServiceNow | All | All + custom |
| Notification channels | Email | All | All |
| Skill module | — | ✓ | ✓ |
| Role-based quotas | — | ✓ | ✓ |
| SLA guarantee | — | ✓ | ✓ |
| Fine-tuned model | — | — | ✓ |

**Pay-as-you-go:** Credits are purchased in blocks of 1,000 when the included amount is exhausted. Can be configured as automatic or manual purchase.

**Credit rollover:** Unused credits carry over up to 3 months. Credits do not expire within a billing period.

### Credit Weight Table

| Action | Credits |
|---|---|
| ChatBot query (simple) | 1 |
| ChatBot query (deep analysis, RAG) | 5 |
| Create / update alert | 2 |
| Write to source system (JIRA / SNow / Azure) | 5 |
| Create OKR / assign KR (Spirai) | 5 |
| Execute skill (sprint summary, health score) | 10 |
| Trigger escalation | 3 |
| Send notification | 1 |
| Generate report / digest | 8 |

Weights are configurable from the Agentmetric vendor back-office (platform.agentmetric.com). Not visible to customers.

### Package Management

Every package parameter is dynamic — stored in DB, configurable from the Agentmetric vendor back-office on `platform.agentmetric.com`, no deployment required to change.

**Parameter types:**
- Numeric: user limit, credit amount, timeout, retry count
- Boolean: feature on/off, connector active/passive, SLA guarantee
- Enum: notification channel selection, billing currency, rollover period
- JSON: credit weight table, connector field mapping, custom rules

**Package lifecycle:** Draft → Active → Archived. Packages in use cannot be deleted, only archived. Existing accounts on an archived package are not affected.

**Account override:** Any parameter can be overridden at the account level without changing the package. Example: "This account is on Professional but Azure connector is also enabled."

### Package Change — Conflict Resolution

When an account's package is downgraded and conflicts are detected, the system presents options to the vendor back-office operator on `platform.agentmetric.com`. No automatic decisions are made.

Example: Professional → Starter

```
Conflicting parameters detected:

User count
  Current: 34 active users
  Starter limit: 10
  → Options: Deactivate excess users / Postpone transition / Set custom limit

Role count
  Current: 7 active roles
  Starter limit: 3
  → Options: Freeze excess roles / Postpone transition / Set custom limit

Azure connector
  Current: Active, 3 projects connected
  Starter: Disabled
  → Options: Disable connector (connected projects go offline) /
             Postpone transition / Keep open for this account (override)
```

Each parameter is resolved independently. Changes are previewed before applying. All decisions are written to the audit log.

**Transition timing options:** Immediate / End of billing period / Specific date / Manual trigger

### Offline License (On-Prem)

- RSA-256 signed JWT issued by License Service
- JWT payload: tenant ID, package limits, feature flags, issued_at, exp
- On-prem stores only the RSA public key — private key never leaves our infrastructure
- Token is verified locally without internet connection
- If internet is unavailable and token cannot be renewed after **72 hours**, system enters read-only mode
- Any tampering with the token breaks the RSA signature, system locks, alert sent to us

### License Service Architecture

```
platform.agentmetric.com
    └── Vendor back-office  ← manages all tenants, packages, credit weights
    └── Customer console    ← customer manages billing, keys, organization
          ↓
    License Service API
          ↓
    Token Generator (RSA-256 JWT)
    Credit Engine (Redis atomic decrement)
    Usage Analytics (per-action event stream)
          ↓
    On-Prem Agent + AgentMetric Studio
    └── License Cache (local JWT validation)
    └── Credit Interceptor (checks before every action)
    └── LLM Key Vault (AES-256 encrypted customer keys)
    └── Studio — License & Usage screen (local Redis balance, apply new token)
```

**Token refresh flow (offline credit top-up):**
When credits are exhausted on-premise, the customer purchases additional credits on `platform.agentmetric.com`. The platform issues a new RSA-256 signed JWT with the updated credit limit encoded in the payload. The customer downloads this token and applies it in AgentMetric Studio → License & Usage → Apply New Token. Studio validates the token locally using the RSA public key installed at deployment, updates the Redis credit balance, and records the token's `jti` (JWT ID) to prevent replay attacks. The same token cannot be applied twice. No internet connection is required at the moment of applying the token.

---

## 07 · Deployment & DevOps

### Environment Structure

```
development → staging → production
```

Every environment is fully isolated: separate DB, separate LLM keys, separate connector endpoints.

- **Development:** Docker Compose, all services local. Ollama for LLM, mock connectors.
- **Staging:** Production-identical infrastructure, no customer data. All releases go here first. E2E and performance tests run here. Customer demos use staging.
- **Production:** Runs on customer infrastructure. Each customer has their own on-prem instance.

### Kubernetes Architecture

Each service is an independent pod:

| Pod | Notes |
|---|---|
| orchestrator | LangGraph + custom layers, horizontal scale |
| prompt-compiler | Stateless, fast scale |
| connector-service | Each connector separate deployment |
| license-service | Critical, minimum 2 replicas, never down |
| api-gateway | Ingress, rate limiting |
| worker | Async jobs, event processing |
| notification-service | Outbound notification delivery |

Every pod has: resource limits (CPU/memory), liveness and readiness probes, graceful shutdown, HorizontalPodAutoscaler.

### On-Prem Installation

Single-command installation via Helm:

```bash
helm install cio-agent ./charts/cio-agent \
  --values customer-values.yaml
```

`customer-values.yaml` contains: LLM API keys, connector connection details, license token, DB connection, notification channel config.

Updates are also single-command. Helm chart is versioned.

### CI/CD Pipeline

**Every commit:**
- Unit tests
- SAST (SonarQube)
- Docker image build
- Contract tests

**Every PR:**
- Integration tests
- LLM eval suite
- Security scan (OWASP)
- Coverage check

**Deploy to staging:**
- E2E tests (Playwright)
- Performance tests (k6)
- Smoke tests
- Quality gates must pass before production promotion

**Deploy to production:**
- Blue-green deployment
- Canary release — 10% traffic first, 100% if no issues
- Automatic rollback — if error rate exceeds 1%, revert to previous version
- Post-deploy smoke tests

### Monitoring Stack

| Layer | Tool | What it monitors |
|---|---|---|
| Metrics | Prometheus + Grafana | Service health, LLM latency, credit anomalies, connector health, DB pool |
| Logs | ELK Stack | Structured logs with trace ID, audit log (2-year retention), app log (90-day retention) |
| Tracing | Jaeger / Tempo | Distributed trace per user action across all services |
| LLM tracing | Langfuse | LLM call trace, eval results, experiment tracking |
| Alerting | Alertmanager → PagerDuty / OpsGenie | License service down, LLM error rate > 5%, credit anomaly, DB disk > 80% |

### Secret Management

HashiCorp Vault for all secrets: LLM API keys, DB passwords, connector tokens, JWT private key. Injected into Kubernetes pods via Vault agent. Code never sees raw secrets. Automatic secret rotation, no service restart required.

### Update Strategy for On-Prem Customers

- Customer receives notification in admin panel when new version is released
- Customer chooses update timing
- Migration guide auto-generated for breaking changes
- Rollback to previous version always available
- LTS versions supported for 12 months

---

## 08 · Database Schema

### Technology Decisions

| Purpose | Technology |
|---|---|
| Primary database | PostgreSQL with Row Level Security |
| Vector embeddings | pgvector (PostgreSQL extension) |
| Cache + credits | Redis |
| Audit store | Separate PostgreSQL instance, append-only |

### Tenant Isolation

Every table has a mandatory `tenant_id` column. PostgreSQL RLS enforces isolation at the database level — every query automatically sees only its own tenant's data.

```sql
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Core Tables

**Account & Licensing**

```sql
accounts
  id, name, status, created_at

account_applications
  id, account_id, application_id, package_id,
  status, activated_at

packages
  id, name, code, status, application_id,
  config JSONB  -- all dynamic parameters stored here

account_overrides
  id, account_id, application_id,
  param_key, param_value  -- per-account parameter overrides

credit_ledger
  id, tenant_id, account_application_id,
  amount, type (credit/debit), action_type,
  reference_id, created_at
  -- append-only, no updates, balance = SUM()
```

**Users & Roles**

```sql
users
  id, tenant_id, account_id, email,
  user_type (admin/power/standard/readonly),
  status, created_at

roles
  id, tenant_id, name, description,
  permissions JSONB, escalation_config JSONB,
  alert_thresholds JSONB

user_roles
  user_id, role_id, assigned_at, assigned_by
```

**Memory Layers**

```sql
memory_private_user
  id, tenant_id, user_id, key, value (AES-256 encrypted),
  created_at, updated_at

memory_private_role
  id, tenant_id, role_id, key, value (AES-256 encrypted),
  created_at, updated_at

memory_shared
  id, tenant_id, key, value,
  created_at, updated_at, created_by
```

**Prompt & Skill**

```sql
prompt_layers
  id, tenant_id, layer_type (system/general/role/project/user),
  scope_id, content (encrypted), version,
  is_active, created_by, created_at

prompt_versions
  id, prompt_layer_id, content, version,
  created_by, created_at, revert_of

skills
  id, tenant_id, layer_type, scope_id,
  name, definition JSONB, version,
  is_active, created_by, created_at
```

**Agent Session & State**

```sql
agent_sessions
  id, tenant_id, user_id, role_id,
  state (received/context_loaded/prompt_compiled/
         llm_called/action_decided/awaiting_approval/
         executing/completed/failed),
  context JSONB, created_at, updated_at, expires_at

pending_approvals
  id, tenant_id, session_id, action_type,
  payload JSONB, status (pending/approved/rejected),
  requested_at, resolved_at, resolved_by
```

**Alerts & Escalation**

```sql
alerts
  id, tenant_id, name, source_system,
  trigger_config JSONB, action_config JSONB,
  owner_role_id, priority, is_active,
  created_by, created_at

escalation_rules
  id, tenant_id, role_id, trigger_config JSONB,
  target_role_id, target_user_id,
  action_on_escalation, time_window_seconds
```

**Connectors**

```sql
connectors
  id, tenant_id, type (jira/servicenow/azure/spirai),
  name, auth_config (encrypted), field_mapping JSONB,
  webhook_config JSONB, is_active, created_at

connector_events
  id, tenant_id, connector_id, event_type,
  payload JSONB, status (pending/processed/dlq),
  received_at, processed_at, retry_count
```

**Knowledge Base**

```sql
documents
  id, tenant_id, name, type, access_level (private/role/shared),
  scope_id, version, is_active,
  uploaded_by, uploaded_at

document_chunks
  id, document_id, tenant_id,
  content TEXT, embedding vector(1536),
  chunk_index, created_at
```

**License Tokens**

```sql
license_tokens
  id, tenant_id, account_application_id,
  token TEXT (RSA-signed JWT), issued_at, expires_at,
  last_synced_at, status
```

### Audit Database (Separate Instance)

```sql
audit_events
  id, tenant_id, user_id, session_id,
  event_type, action, entity_type, entity_id,
  before_state JSONB, after_state JSONB,
  ip_address, user_agent, created_at
  -- INSERT only. No UPDATE or DELETE permission for application user.
  -- Deletion only via automated retention policy archival.
```

### Redis Key Structure

```
session:{session_id}               → agent session state, TTL 24h
credit:{tenant_id}:{scope}         → current credit balance
credit_quota:{tenant_id}:{role_id} → role quota
license:{tenant_id}                → license cache, TTL 1h
lock:{idempotency_key}             → action mutex, TTL 5min
```

### Key Design Decisions

- `credit_ledger` is append-only — balance is always computed as `SUM()`, no mutable balance column. Full history preserved for audit.
- All `config`, `permissions`, and `definition` columns are JSONB — no migration required to add new parameters.
- Memory and prompt content fields are AES-256 encrypted at application level — DB access alone is insufficient to read content.
- `document_chunks` uses pgvector — no separate vector database required.
- Every table has `tenant_id` + RLS — even if application layer has a bug, data leakage is prevented at DB level.

---

## 09 · API Design

### Protocol Decisions

| Use case | Protocol |
|---|---|
| ChatBot & real-time | WebSocket + SSE (LLM response streamed) |
| CRUD operations | REST |
| Complex dashboard queries | GraphQL |
| Service-to-service | gRPC |

All public endpoints versioned under `/v1/`. Breaking changes introduce `/v2/`.

### Authentication

Every request carries:

```
Authorization: Bearer {JWT}
X-Tenant-ID: {tenant_id}
X-Application-ID: {application_id}
```

JWT payload: user_id, tenant_id, role_id, user_type, exp. Validated at API Gateway. Services receive pre-authenticated user context.

### REST Endpoints

**Auth**
```
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
```

**Account & Package — Agentmetric Vendor API**
```
GET    /v1/admin/accounts
POST   /v1/admin/accounts
GET    /v1/admin/accounts/{id}
PATCH  /v1/admin/accounts/{id}

GET    /v1/admin/packages
POST   /v1/admin/packages
PATCH  /v1/admin/packages/{id}
DELETE /v1/admin/packages/{id}

POST   /v1/admin/accounts/{id}/package
GET    /v1/admin/accounts/{id}/credits
POST   /v1/admin/accounts/{id}/credits/load
```

**Users & Roles**
```
GET    /v1/users
POST   /v1/users
PATCH  /v1/users/{id}
DELETE /v1/users/{id}

GET    /v1/roles
POST   /v1/roles
PATCH  /v1/roles/{id}
DELETE /v1/roles/{id}

POST   /v1/users/{id}/roles
DELETE /v1/users/{id}/roles/{role_id}
```

**Prompts & Skills**
```
GET    /v1/prompts/{layer_type}/{scope_id}
PUT    /v1/prompts/{layer_type}/{scope_id}
GET    /v1/prompts/{layer_type}/{scope_id}/versions
POST   /v1/prompts/{layer_type}/{scope_id}/revert/{version}

GET    /v1/skills
POST   /v1/skills
PATCH  /v1/skills/{id}
POST   /v1/skills/{id}/revert/{version}
```

**Alerts & Escalation**
```
GET    /v1/alerts
POST   /v1/alerts
PATCH  /v1/alerts/{id}
DELETE /v1/alerts/{id}
POST   /v1/alerts/{id}/test

GET    /v1/escalation-rules
POST   /v1/escalation-rules
PATCH  /v1/escalation-rules/{id}
```

**Connectors**
```
GET    /v1/connectors
POST   /v1/connectors
PATCH  /v1/connectors/{id}
DELETE /v1/connectors/{id}
POST   /v1/connectors/{id}/test
POST   /v1/connectors/{id}/webhook
```

**Approvals**
```
GET    /v1/approvals/pending
POST   /v1/approvals/{id}/approve
POST   /v1/approvals/{id}/reject
```

**Studio — License & Usage**
```
GET    /v1/studio/license/status         — token status, last sync, read-only countdown
POST   /v1/studio/license/apply          — apply new RSA-256 JWT token (offline credit top-up)
GET    /v1/studio/usage/balance          — current credit balance from local Redis
GET    /v1/studio/usage/summary          — monthly usage by action type and by role
PATCH  /v1/studio/usage/alert-threshold  — configure low-credit warning threshold
```

**Knowledge Base**
```
GET    /v1/documents
POST   /v1/documents        (multipart/form-data)
DELETE /v1/documents/{id}
GET    /v1/documents/{id}/versions
```

### WebSocket — ChatBot

```
WS /v1/chat/connect
```

Connection is authenticated on establishment. Message formats:

```json
// Client → Server
{
  "type": "message",
  "session_id": "uuid",
  "content": "What is the sprint status?",
  "context": { "project_id": "optional" }
}

// Server → Client (stream chunk)
{
  "type": "stream_chunk",
  "session_id": "uuid",
  "content": "Q1 sprint...",
  "is_final": false
}

// Server → Client (action draft)
{
  "type": "action_draft",
  "session_id": "uuid",
  "action_type": "create_jira_task",
  "payload": { ... },
  "preview": "The following task will be created in JIRA..."
}

// Server → Client (approval required)
{
  "type": "approval_required",
  "approval_id": "uuid",
  "action_type": "update_okr",
  "preview": "..."
}
```

### GraphQL — Dashboard & Reporting

```graphql
query DashboardSummary($tenantId: ID!, $period: DateRange!) {
  creditSummary(tenantId: $tenantId, period: $period) {
    totalConsumed
    remaining
    byRole { roleId consumed }
    byActionType { type consumed }
  }
  agentActivity(tenantId: $tenantId, period: $period) {
    totalSessions
    completedActions
    pendingApprovals
    failedActions
  }
  connectorHealth {
    connectorId
    type
    status
    lastEventAt
  }
}
```

### gRPC — Service-to-Service

**Orchestrator ↔ Connector Service**

```protobuf
service ConnectorService {
  rpc Read (ReadRequest) returns (ReadResponse);
  rpc Write (WriteRequest) returns (WriteResponse);
  rpc Subscribe (SubscribeRequest) returns (stream Event);
  rpc HealthCheck (Empty) returns (HealthResponse);
}
```

**Orchestrator ↔ Prompt Compiler**

```protobuf
service PromptCompiler {
  rpc Compile (CompileRequest) returns (CompileResponse);
  rpc Validate (ValidateRequest) returns (ValidationResult);
}
```

gRPC rationale: binary protocol, lowest latency, strongly typed contracts, native streaming. 3–5× faster than REST for service-to-service calls.

### API Standards

**Error response — uniform format across all endpoints:**
```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Insufficient credits",
    "detail": "Available: 2, required: 5",
    "trace_id": "uuid"
  }
}
```

**Pagination — cursor-based:**
```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJ...",
    "has_more": true,
    "total": 142
  }
}
```

**Rate limiting headers — present on every response:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1714999200
```

**Idempotency — mandatory on all write operations:**
```
Idempotency-Key: {uuid}
```

Same key on second request returns cached response. Operation does not re-execute.

### API Documentation

- REST → OpenAPI 3.0, interactive Swagger UI
- GraphQL → GraphiQL + schema documentation
- gRPC → versioned protobuf files in internal repository
- Every endpoint documented with example request/response and error scenarios
- Postman collection auto-generated and provided to customers

---

## Open Topics — To Be Detailed

The following topics have been scoped and decisions are pending detailed design sessions:

| Topic | Status |
|---|---|
| Licensing & monetization — package tier pricing | Scoped, pricing TBD |
| Spirai integration — detailed OKR flow | Scoped, API spec TBD |
| ChatBot capabilities & boundaries | To be discussed |
| Reporting & summarization | To be discussed |
| Offline / async behavior | To be discussed |
| IT Portfolio Management | To be discussed |
| Agent onboarding flow | To be discussed |

---

*Document version: 1.0 — Architecture baseline*
*Last updated: May 2026*
