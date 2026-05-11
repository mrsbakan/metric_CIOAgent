# PROJECT_STRUCTURE.md

## Frontend Structure
```
app/                              # Next.js 14 App Router
  (auth)/                         # Auth group — login, SSO
  (app)/
    chat/                         # ChatBot / Agent Interface
    admin/                        # Admin Screen (CIO only)
    dashboard/                    # Dashboard
    approvals/                    # Approvals & Pending Actions
    knowledge-base/               # Knowledge Base
    audit-log/                    # Audit Log
    settings/                     # User Settings
    studio/                           # AgentMetric Studio (on-premise agent control panel)

features/
  chat/                           # ChatBot / Agent Interface
  admin/                          # Role, user, alert, connector, prompt config
  dashboard/                      # Agent activity, credit usage, connector health
  approvals/                      # Pending approvals, draft previews, history
  knowledge-base/                 # Document upload, versioning, conflict detection
  audit-log/                      # Action history, approval log, prompt change log
  settings/                       # Notification channels, language/tone, calendar
  studio/                           # User & role mgmt, connectors, prompts, skills, alerts, knowledge base, audit log, license & usage

shared/
  components/                     # Reusable UI components (Shadcn/ui based)
  hooks/                          # Shared React hooks
  lib/                            # Utilities, helpers
  types/                          # Shared TypeScript type definitions
  constants/                      # App constants, config
  websocket/                      # WebSocket client, SSE handling
```

Rules:
- Feature-first structure
- Screens stay thin — logic in hooks/services
- Shared UI in `shared/components`
- All UI follows mobile-first design (390px baseline)
- WebSocket connection managed in `shared/websocket`
- Every screen is PWA-compatible (offline fallback, push notifications)

---

## Backend Structure
```
modules/
  auth/                           # LDAP/AD + JWT authentication
  users/                          # User management
  roles/                          # Role definition, permissions, escalation config
  chat/                           # ChatBot session management, WebSocket gateway
  admin/                          # Admin screen APIs
  dashboard/                      # Dashboard aggregation queries (GraphQL)
  approvals/                      # Pending approval state, resolve/reject flows
  knowledge-base/                 # Document upload, chunking, versioning
  audit/                          # Audit log — append-only event store
  alerts/                         # Alert configuration, trigger evaluation
  escalation/                     # Escalation rules, routing, firing
  notifications/                  # Channel routing, delivery (WhatsApp, Teams, Slack, Email)
  connectors/                     # Connector framework + per-system modules
  credits/                        # Credit ledger, interceptor, quota enforcement
  licensing/                      # RSA-256 JWT license validation, read-only mode
  studio/                         # AgentMetric Studio APIs — user/role mgmt, connectors, prompts, skills, alerts, license & usage
  shared/                         # Cross-module utilities, base types, error formats
```

Each module owns: controller, service, schema/validation, types, repository, tests

---

## Agent & Orchestration Submodules
```
modules/agent/
  orchestrator/                   # LangGraph skeleton + state machine
  prompt-compiler/                # 4-layer prompt assembly, token budget enforcement
  action-decision-matrix/         # Autonomous / Draft / Approval Required enforcement
  approval-flow/                  # AWAITING_APPROVAL state machine, mutex locks, 48h timeout
  session-isolation/              # Session stored in DB, never shared across users
  memory/
    private-user/                 # User-scoped memory (AES-256 encrypted)
    private-role/                 # Role-scoped memory (AES-256 encrypted)
    shared/                       # System-wide shared memory
  skills/                         # Skill registry, execution, version management
  evals/                          # RAGAS eval harness, shadow eval runner
```

---

## Connector Submodules
```
modules/connectors/
  framework/                      # Standard Connector interface, event bus integration
  jira/                           # JIRA — OAuth 2.0, webhook + polling fallback
  servicenow/                     # ServiceNow — OAuth/Basic, instance-based
  azure-devops/                   # Azure DevOps — Azure AD token / PAT
  spirai/                         # Spirai — OKR lifecycle, bidirectional sync (separate package)
  dead-letter-queue/              # DLQ management, retry logic, manual replay
```

---

## Database Structure
```
database/
  migrations/
  seeds/
  schemas/
    accounts.sql
    users-roles.sql
    memory.sql
    prompt-skill.sql
    agent-session.sql
    alerts-escalation.sql
    connectors.sql
    knowledge-base.sql
    credits-licensing.sql
  policies/                       # PostgreSQL RLS policies (tenant_id isolation)
  audit/                          # Separate audit DB schema (append-only)
```

---

## Naming Conventions

### Files
| Type | Pattern | Example |
|------|---------|---------|
| Folders | kebab-case | `prompt-compiler/` |
| TS files | kebab-case.ts | `prompt.service.ts` |
| React components | PascalCase.tsx | `ApprovalCard.tsx` |
| Hooks | use-feature.ts | `use-approvals.ts` |
| Services | feature.service.ts | `credit.service.ts` |
| Schemas | feature.schema.ts | `role.schema.ts` |
| Types | feature.types.ts | `connector.types.ts` |
| Repositories | feature.repository.ts | `memory.repository.ts` |

### Agent State Machine States (SCREAMING_SNAKE_CASE)
```
RECEIVED
CONTEXT_LOADED
PROMPT_COMPILED
LLM_CALLED
ACTION_DECIDED
AWAITING_APPROVAL
EXECUTING
COMPLETED
FAILED
```

### Action Decision Matrix Values
```
AUTONOMOUS           # Agent acts, then notifies
DRAFT                # Agent prepares, user reviews and approves
APPROVAL_REQUIRED    # Nothing executes without explicit user confirmation
NA                   # Action not available for this role
```

### Credit Action Types (snake_case)
```
chatbot_simple, chatbot_deep,
alert_create_update,
source_system_write,
okr_create_assign,
skill_execute,
escalation_trigger,
notification_send,
report_generate
```

### Audit Event Types (snake_case)
```
agent_action_completed, agent_action_failed,
approval_requested, approval_resolved, approval_rejected,
prompt_layer_changed, prompt_layer_reverted,
skill_created, skill_updated, skill_reverted,
connector_write_executed,
escalation_fired,
document_uploaded, document_version_archived,
credit_consumed, credit_exhausted,
license_token_renewed, license_read_only_activated,
user_created, role_created, role_updated
```

---

## Architecture Style
Modular, functional-first. TypeScript throughout — backend, frontend, eval scripts.

### Use Functions When
- Logic is simple and single-purpose
- No abstraction benefit
- Examples: validation, mapping, CRUD, formatting, token budget calculation, field mapping

### Use Classes When
- Abstraction improves clarity or logic may expand
- Examples: Prompt Compiler, Action Decision Matrix, Credit Interceptor, Connector implementations, Eval harness, Notification router

### Anti-Patterns
- Skipping state machine steps — every action must pass through all states in order
- Autonomous execution of Approval-Required actions — zero tolerance
- Cross-session state sharing — sessions stored in DB, never in memory
- Cross-tenant data access — RLS enforces this at DB level
- Raw secrets in code or environment — all secrets through HashiCorp Vault
- Direct orchestrator ↔ connector calls — all events through Event Bus (Redis Streams)
- Retry on tool execution failure — immediate FAILED to prevent source system inconsistency

---

## Responsibility Separation

| Layer | Responsibility |
|-------|---------------|
| Agent Orchestrator | State machine, prompt compilation, action gating, approval flow |
| Connectors | Auth, rate limiting, field mapping, write-back safety, event emission |
| Prompt Compiler | Layer assembly, conflict detection, token budget enforcement |
| Action Decision Matrix | Role-based action mode enforcement (Autonomous / Draft / Approval Required) |
| Credit Interceptor | Pre-action credit check, deduction, quota enforcement |
| License Service | RSA-256 JWT validation, read-only mode activation |
| Frontend | Presentation, WebSocket streaming, action draft cards, approval UI |

---

## API Protocol Map

| Use Case | Protocol |
|----------|----------|
| ChatBot real-time streaming | WebSocket + SSE |
| CRUD (users, roles, alerts, connectors, documents) | REST `/v1/` |
| Dashboard & reporting queries | GraphQL |
| Orchestrator ↔ Connector Service | gRPC |
| Orchestrator ↔ Prompt Compiler | gRPC |

---

## Module Ownership

| Module | Spec / Reference |
|--------|-----------------|
| ChatBot / Agent Interface | `user_interface.md` → Module 1 |
| Admin Screen | `user_interface.md` → Module 2 |
| Dashboard | `user_interface.md` → Module 3 |
| Approvals & Pending Actions | `user_interface.md` → Module 4 |
| Knowledge Base | `user_interface.md` → Module 5 |
| Audit Log | `user_interface.md` → Module 6 |
| User Settings | `user_interface.md` → Module 7 |
| AgentMetric Studio | `user_interface.md` → Module 8 |
| Agent Architecture | `architecture.md` → Section 01 |
| Connector Framework | `architecture.md` → Section 04 |
| Licensing & Credits | `architecture.md` → Section 06 |
| Database Schema | `architecture.md` → Section 08 |
| API Design | `architecture.md` → Section 09 |
| Feature Roadmap | `feature_roadmap.md` |
| Engineering Checklist | `agent_engineering_checklist.md` |

Deferred (not yet spec'd):
- Reporting & Summarization → `feature_roadmap.md` → Open Topics
- IT Portfolio Management → `feature_roadmap.md` → Open Topics

Do not implement deferred modules without a confirmed spec.
