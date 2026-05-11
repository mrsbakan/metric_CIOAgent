# CIO Agent — Project Plan

> Context: Customers purchase CIOAgent through agentmetric.com and manage billing/packages via platform.agentmetric.com. CIOAgent validates the RSA-256 JWT issued by that platform locally — it does not connect to external systems for licensing at runtime.

---

## Phase 1 — System Up, Agent Running

**Goal:** User logs in, sees JIRA data, talks to the agent, approval flow works end-to-end.

### Infrastructure
- Docker + Kubernetes + Helm (base chart)
- PostgreSQL + pgvector + RLS policies (all tables with `tenant_id`)
- Redis (session, credits, mutex, event bus), HashiCorp Vault (secret injection via sidecar)
- GitHub Actions CI/CD — unit tests → SAST → build → deploy
- Prometheus + Grafana + ELK (baseline), Langfuse (LLM tracing — active from day one)

### Backend
- `auth/` — Email/password login + JWT (RSA-256), refresh, logout
- `users/` `roles/` — CRUD, RLS policies
- `credits/` — Credit Interceptor + append-only `credit_ledger` ← mandatory
- `audit/` — INSERT-only `audit_events` ← mandatory
- `shared/` — error format, idempotency key, base types
- `notifications/` — in-app channel
- `connectors/framework/` + `connectors/jira/` — read + write, webhook + polling fallback
- `connectors/dead-letter-queue/` — 3 retries → DLQ → alert ← mandatory

### Backend — Agent Core
- `agent/orchestrator/` — full state machine (`RECEIVED → COMPLETED / FAILED`)
- `agent/prompt-compiler/` — Layer 1 + Layer 2, token budget enforcement
- `agent/action-decision-matrix/` — `AUTONOMOUS / DRAFT / APPROVAL_REQUIRED` (code-level enforcement)
- `agent/approval-flow/` — mutex lock, 48h timeout
- `agent/session-isolation/` — sessions stored in DB, never in memory
- `agent/memory/private-user/` `private-role/` — AES-256 encrypted

### API
- REST `/v1/` — auth, users, roles, approvals, connectors
- WebSocket `/v1/chat/connect` — stream, action_draft, approval_required

### Frontend
- Login screen (email/password)
- **ChatBot / Agent Interface** — WebSocket streaming, action draft cards, approve/reject flow
- **Approvals & Pending Actions** — pending list, draft preview, 48h timeout indicator
- **Admin Screen** (basic) — user/role management, JIRA connector config, Action Decision Matrix
- **Dashboard** (minimal) — connector health, recent agent actions, pending approvals count

### Testing
- Unit tests ≥ 90% (State Machine, Prompt Compiler, Action Decision Matrix, Credit Interceptor)
- Integration tests — PostgreSQL RLS, Redis atomic decrement, Event Bus
- SAST — SonarQube active in CI on every commit
- LLM eval baseline — approval bypass rate = 0%, prompt injection resistance = 100%

### Phase 1 Outcome
> User logs in → sees JIRA data → talks to the agent → agent proposes an action → user approves → JIRA is updated → audit log records the transition. System is ready for demo and first real use.

---

## Phase 2 — Configurable: LDAP, Full Admin, All Connectors, Knowledge Base, Skills

**Goal:** Enterprise SSO enabled. CIO can configure everything from the admin screen. All source systems connected. Skills and knowledge base active.

### Backend — Auth
- `auth/` — LDAP / Active Directory integration, SSO flow

### Backend — Prompt Architecture & Skills
- `agent/prompt-compiler/` — Layer 3 + Layer 4 assembly; conflict detection (lower layer contradiction → logged + CIO notified); trimming order: history → L4 → L3
- `agent/memory/shared/` — populated only via explicit user action
- `agent/skills/` — skill registry, execution, versioning, revert

### Backend — New Connectors
- `connectors/servicenow/` — OAuth / Basic auth, read + write
- `connectors/azure-devops/` — Azure AD token / PAT, read + write
- `connectors/spirai/` — **separate package**; OKR draft → approval → write, bidirectional sync, conflict detection

### Backend — New Modules
- `knowledge-base/` — document upload (PDF / DOCX / XLSX / PPT), chunking + pgvector embeddings, versioning, access levels (Private / Role / Shared), conflict detection vs. live source data
- `alerts/` — alert CRUD, trigger evaluation, source system mapping
- `escalation/` — escalation rules, time window, target routing, firing
- `notifications/` — WhatsApp Business, Microsoft Teams, Slack, Email channels added
- `dashboard/` — GraphQL resolvers, full metrics aggregation

### Frontend
- **Admin Screen** (full) — alert configuration, escalation rules, prompt layer editing (L2 / L3 / L4), skill definition + revert, all connector configuration, notification channel preferences per role, full Action Decision Matrix configuration
- **Dashboard** (full) — agent activity summary, credit usage by role and action type, connector health, active alerts, OKR signals
- **Knowledge Base** — document upload, access level assignment, version history, conflict notifications
- **Audit Log** — action history, approval decisions, prompt/skill change log, filtering by user / role / action type / date range

### Testing
- Contract tests — Pact (frontend ↔ BFF ↔ orchestrator)
- E2E tests (Playwright) — approval bypass, credit exhaustion, connector write-back, cross-tenant RLS penetration
- Full LLM eval suite — hallucination rate ≤ 2%, task completion rate ≥ 95%

### Phase 2 Outcome
> Enterprise SSO active. All 4 connectors connected. CIO manages everything from the admin screen. Agent answers questions using knowledge base documents. Spirai OKR flow operates at minimum Draft level. All notification channels active.

---

## Phase 3 — Licensing, AgentMetric Studio, Production Hardening

**Goal:** Offline licensing system, embedded Studio screen, single-command on-prem install, all quality gates passing, security audit complete.

### Backend — Licensing
- `licensing/` — RSA-256 JWT local validation; credit limit enforcement (package limits read from JWT payload → written to Redis); read-only mode activation after 72h without token renewal; tamper detection + system lock; `jti` replay attack prevention
- Credit Interceptor extended with package limit layer — limits sourced from the JWT, not from any external call at runtime

> Package configuration (tiers, credit weights, feature flags) is managed on `platform.agentmetric.com`. CIOAgent only validates the received JWT locally and enforces what is encoded in the payload.

### Frontend — AgentMetric Studio
Embedded admin screen within CIOAgent (not visible to end users — accessible to the designated admin):
- License token status, last sync time, read-only countdown
- Apply new token — offline credit top-up flow (validates RSA signature locally, records `jti` to prevent replay)
- Current credit balance (local Redis)
- Monthly usage summary by action type and by role
- Low-credit warning threshold configuration

### Frontend — User Settings (full)
- Notification channel preferences per alert priority level
- Language and tone preferences (Turkish / English, formal / concise / narrative)
- Outlook / Google Calendar integration
- Personal prompt rules (user-scoped layer)
- Personal skill definitions

### Infrastructure — Production Hardening
- Helm chart finalized — `helm install cio-agent ./charts/cio-agent --values customer-values.yaml`
- Blue-green deployment + canary release (10% traffic → 100%), automatic rollback if error rate > 1%
- Grafana Tempo — distributed tracing per user action across all services
- Alertmanager → PagerDuty / OpsGenie — license service down, LLM error rate, credit anomaly, DB disk usage
- Audit log retention policy — 2-year WORM
- Shadow evals — 10% of production traffic through a parallel model; results not shown to users

### Testing — Full Suite
- Performance tests (k6) — 50 concurrent users (p95 < 8s), 200 concurrent users (slow, not crash), LLM timeout graceful degradation, Event Bus flood → DLQ activates
- DAST — OWASP ZAP before every release
- Chaos engineering — LLM service cut (fallback model), DB connection lost (no data loss), Event Bus stop (connector falls back to polling), License service unreachable (grace period activates)
- Penetration test — once before go-live
- All deployment quality gates enforced: approval bypass 0%, injection resistance 100%, p95 < 8s, unit coverage ≥ 90%, SAST critical findings = 0, contract tests passing

### Phase 3 Outcome
> `helm install` deploys the full system to customer infrastructure in a single command. Customer applies the JWT token issued by platform.agentmetric.com via the Studio screen — system activates with the correct package limits. When credits run out, customer purchases a new token on platform.agentmetric.com, applies it in Studio — system continues. Penetration test complete. System is production-ready.

---

*Document version: 1.0*
*Last updated: May 2026*
