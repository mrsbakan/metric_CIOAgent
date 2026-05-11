# CIO Agent — Technical Stack

> All decisions finalized. Last updated: May 2026

---

## Language & Runtime

| Technology | Decision |
|---|---|
| **TypeScript** | Single language across all services — backend, frontend, eval scripts |
| **Node.js** | Runtime for all backend services |

No Python. LangGraph TypeScript SDK is available. RAGAS runs in TypeScript. Mixing languages increases onboarding cost and CI complexity — single language wins.

---

## Frontend

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 14** (App Router) | SSR + SSG + API routes in one package |
| Styling | **Tailwind CSS** | Mobile-first utility classes |
| Component library | **Shadcn/ui** | Tailwind-based, accessible, open source, free |
| State management | **Zustand** | Lightweight, works well alongside React Query |
| Server state & cache | **React Query (TanStack)** | REST API cache and async state |
| GraphQL client | **urql** | Lighter than Apollo, used for dashboard queries |
| Real-time | **Native WebSocket + SSE** | No external library needed |
| Mobile compatibility | **PWA** | Manifest + service worker + offline fallback |
| Animations & gestures | **Framer Motion** | Swipe gestures, transition animations |
| Form management | **React Hook Form + Zod** | TypeScript-native validation |

### Mobile UX Principles

Design is **mobile-first**. Every screen is designed for 390px (iPhone) first, then expanded. ChatBot is expected to be heavily used on mobile.

Key mobile requirements:
- Input field stays visible when keyboard opens — no layout jump
- Streaming responses render as smooth message bubbles
- Action draft cards support swipe-to-approve / swipe-to-reject
- Approval screens are operable with one thumb — action buttons pinned to bottom
- File upload (Knowledge Base) supports camera and gallery
- WebSocket connection managed gracefully when app goes to background; reconnects on notification tap

### PWA Features Enabled

- Add to Home Screen
- Push notifications — on approval requests and alert triggers
- Offline fallback screen — meaningful UI when connection is lost
- App icon and splash screen
- Full compatibility with iOS Safari and Android Chrome

---

## Agent & Orchestration

| Technology | Role |
|---|---|
| **LangGraph (TypeScript SDK)** | Graph management, state persistence, tool routing |
| **Custom Prompt Compiler** | Assembles final prompt from 4 layers in strict order |
| **Custom Action Decision Matrix** | Enforces Autonomous / Draft / Approval Required per role |
| **Custom Approval Flow State Machine** | Manages AWAITING_APPROVAL state, mutex locks, 48h timeout |
| **Custom Session Isolation Layer** | Sessions stored in DB, never in memory, never share state |

LangGraph provides the skeleton. All business-critical logic is custom — never delegated to the framework.

---

## LLM

| Provider | Role |
|---|---|
| **Ollama** | Default, on-premise, zero LLM cost |
| **Groq** | Default cloud alternative, fast inference |
| **Azure OpenAI** | Enterprise option |

Customer owns and enters their own API keys. LLM costs flow directly to the customer's account. We are not in the LLM billing chain. Our credits are abstract and consumed regardless of which LLM provider is used.

---

## Database

| Technology | Role |
|---|---|
| **PostgreSQL** | Primary database — Row Level Security enforces tenant isolation |
| **pgvector** | Vector embeddings as a PostgreSQL extension — no separate vector DB required |
| **Redis** | Cache, credit balance, session state, mutex locks |
| **Redis Streams** | Event bus — replaces Kafka, no separate cluster needed |
| **Audit DB** | Separate PostgreSQL instance, append-only, WORM, 2-year retention |

### Key Database Decisions

- Every table has `tenant_id` + RLS policy — data leakage prevented at DB level even if application layer has a bug
- `credit_ledger` is append-only — balance computed as `SUM()`, full history preserved
- Memory and prompt content fields are AES-256 encrypted at application level — DB access alone is insufficient to read content
- Redis Streams chosen over Kafka — Redis already in stack, no separate cluster ops burden

---

## Security

| Technology | Role |
|---|---|
| **HashiCorp Vault** | All secrets — LLM API keys, DB passwords, connector tokens, JWT private key |
| **LDAP / Active Directory** | Enterprise identity provider |
| **JWT (RSA-256)** | Session tokens and offline license tokens |
| **AES-256** | Encryption of memory, prompt content, connector auth configs |
| **PostgreSQL RLS** | Row-level tenant isolation |

Secrets are injected into Kubernetes pods via Vault agent. Code never sees raw secrets. Automatic secret rotation with no service restart required.

---

## Infrastructure & DevOps

| Technology | Role |
|---|---|
| **Docker** | Containerization |
| **Kubernetes** | Orchestration, horizontal scaling, health probes |
| **Helm** | Single-command on-prem installation and updates |
| **GitHub Actions** | CI/CD pipeline |

### Deployment Strategy

- **Environments:** development → staging → production (fully isolated)
- **Release:** Blue-green deployment + canary (10% traffic first)
- **Rollback:** Automatic if error rate exceeds 1%
- **On-prem install:** `helm install cio-agent ./charts/cio-agent --values customer-values.yaml`

---

## Monitoring & Observability

| Technology | Role |
|---|---|
| **Prometheus + Grafana** | Metrics — service health, LLM latency, credit anomalies, connector health |
| **ELK Stack** | Log management — audit log (2-year retention), app log (90-day retention) |
| **Grafana Tempo** | Distributed tracing — native Grafana integration, no Elasticsearch/Cassandra needed |
| **Langfuse** | LLM call tracing, eval results, A/B model comparison, on-prem deployable |
| **Alertmanager → PagerDuty / OpsGenie** | Alert routing and on-call management |

Grafana Tempo chosen over Jaeger — native integration with existing Grafana + Prometheus stack, lower operational overhead, modern standard for new projects.

---

## Testing

| Technology | Role |
|---|---|
| **Jest** | Unit tests and integration tests |
| **RAGAS (TypeScript)** | LLM eval framework — task completion, hallucination rate, prompt injection resistance |
| **LabelStudio Community** | Eval dataset management — free, self-hosted, open source |
| **WireMock** | Mock server for connectors in CI — no real JIRA/ServiceNow calls |
| **Pact** | Contract tests — frontend ↔ BFF ↔ orchestrator API contracts |
| **Playwright** | E2E tests — cross-browser, headless, CI-integrated |
| **k6** | Performance and load testing |
| **SonarQube** | SAST — static analysis on every commit |
| **OWASP ZAP** | DAST — dynamic analysis before every release |

### LabelStudio Note

LabelStudio Community edition is free and open source, self-hosted. Enterprise edition is paid — not needed for this project. Used to build and manage labeled question-answer pairs for LLM evals. Recommended approach: start with simple JSON files, introduce LabelStudio as real usage data accumulates (typically after month 3).

### Quality Gates — Deployment Blocked If

| Metric | Threshold |
|---|---|
| Approval bypass rate | 0% — zero tolerance |
| Task completion rate | ≥ 95% |
| Prompt injection resistance | 100% |
| Hallucination rate | ≤ 2% |
| p95 latency | < 8 seconds |
| Unit test coverage | ≥ 90% on business logic |
| SAST critical findings | 0 |
| Performance degradation | ≤ 20% from baseline |

---

## API Protocols

| Protocol | Use Case |
|---|---|
| **REST** | CRUD operations — users, roles, alerts, connectors, documents |
| **WebSocket + SSE** | ChatBot real-time streaming, action drafts, approval notifications |
| **GraphQL** | Dashboard and reporting queries |
| **gRPC** | Service-to-service — orchestrator ↔ connector service, orchestrator ↔ prompt compiler |

---

## External Integrations

### Source Systems (Connectors)

| System | Auth Method |
|---|---|
| **JIRA** | OAuth 2.0 + API token |
| **ServiceNow** | Basic auth or OAuth, instance-based |
| **Azure DevOps** | Azure AD token or PAT |
| **Spirai** | API key or OAuth |

### Notification Channels

| Channel | Use Case |
|---|---|
| **WhatsApp Business API** | Critical alerts — highest priority |
| **Microsoft Teams** | Task updates, team notifications |
| **Slack** | Team notifications |
| **Email (Outlook / Gmail)** | Daily digest, async notifications |
| **In-app** | All notification types |

---

## Full Stack Summary

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| Frontend framework | Next.js 14 |
| Styling | Tailwind CSS + Shadcn/ui |
| Mobile | PWA (mobile-first design) |
| Agent orchestration | LangGraph TS + Custom layers |
| LLM providers | Ollama / Groq / Azure OpenAI |
| Primary database | PostgreSQL + pgvector |
| Cache & credits | Redis |
| Event bus | Redis Streams |
| Audit database | PostgreSQL (separate, append-only) |
| Secret management | HashiCorp Vault |
| Authentication | LDAP / AD + JWT |
| Encryption | AES-256 + RSA-256 |
| Containers | Docker + Kubernetes + Helm |
| CI/CD | GitHub Actions |
| Metrics | Prometheus + Grafana |
| Logs | ELK Stack |
| Distributed tracing | Grafana Tempo |
| LLM tracing & evals | Langfuse |
| Alerting | Alertmanager → PagerDuty / OpsGenie |
| Unit & integration tests | Jest |
| LLM eval framework | RAGAS (TypeScript) |
| Eval data management | LabelStudio Community |
| Contract tests | Pact |
| E2E tests | Playwright |
| Performance tests | k6 |
| SAST | SonarQube |
| DAST | OWASP ZAP |
| Source connectors | JIRA, ServiceNow, Azure DevOps, Spirai |
| Notification channels | WhatsApp Business, Teams, Slack, Email |

---

*Document version: 1.0*
*Status: Finalized*
*Last updated: May 2026*
