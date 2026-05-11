# CIO Agent — Feature Roadmap

## Architectural Decisions (Confirmed)

### 1. Core Agent Architecture
- Single orchestrator agent with multi-session support
- Role-based identity and authorization layer
- Scalable to any number of roles and users without architectural change
- Shared reasoning engine across all roles — consistent decision logic

### 2. Memory & Context Model
Three isolated memory layers:
- **Private (User)** — Visible only to the individual user. Never shared automatically.
- **Private (Role)** — Shared among users of the same role.
- **Shared** — System actions, objective project data, approved OKR/KR assignments. Visible to all.

Sharing requires explicit user action. Unconfirmed analyses and personal interpretations never flow into the shared layer automatically.

### 3. User & Role Management
- CIO can define new roles and users from an admin screen
- Each role configuration includes: scope of responsibility, action permissions, alert thresholds, escalation targets
- When a new role is created, the agent proposes suitable responsibilities and permissions — CIO approves or edits
- Role transitions: configurable policy for handling private context when a user changes roles

### 4. Action Decision Matrix
Configurable per role from the admin screen. Default behavior:

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
- **Draft** — Agent prepares, user reviews and approves with one click or edits before sending
- **Approval required** — Agent proposes, nothing happens without explicit user confirmation

All matrix values are configurable from the admin screen by CIO or authorized users.

### 5. Event-Driven Monitoring & Alert System
- Agent continuously monitors source systems (JIRA, ServiceNow, Azure DevOps, Spirai) via event-driven integration — real-time change detection, not scheduled polling
- Alerts can be created from two entry points:
  - **Admin screen** — structured configuration form
  - **ChatBot** — natural language input, agent structures the alert and asks for confirmation before activating

Alert anatomy:
- Source system (JIRA, SNow, Azure, Spirai)
- Trigger criteria (threshold, duration, delta)
- Action (notify, draft OKR, open task)
- Owner (who receives it)
- Priority level (informational vs action-required)

### 6. Escalation Model
- Default behavior: escalate to the next role up in the hierarchy
- Configurable override: any role can be routed to any target (e.g., direct to CIO, or broadcast to multiple roles)
- Escalation rules are defined at role level in the admin screen
- Each user can escalate only to their configured escalation target(s) by default
- CIO can override routing for any role

Escalation anatomy:
- Trigger (alert fired N times, unresolved for Y duration, risk score exceeded)
- Escalation target (role-based or person-based)
- Action on escalation (notify only, or trigger autonomous action)
- Time window before escalation activates

### 7. Document Knowledge Base
- Users can upload documents (PDF, DOCX, XLSX, PPT, etc.) as knowledge sources for the agent
- Agent uses uploaded documents as reference when answering questions and proposing actions
- Supported document types include: project blueprints, methodologies, IT process documentation, company policies, project presentations

Access control model (mirrors memory layer logic):
- **Private** — Only the uploader can access
- **Role-based** — Accessible to specified roles
- **Shared** — Accessible to all users

Version management:
- When a new version is uploaded, the previous version is archived
- Agent always references the latest active version
- Version history is preserved and accessible

Conflict detection:
- Agent actively detects inconsistencies between uploaded documents and live source system data
- Conflicting signals are surfaced to the relevant user with both sources shown — agent does not resolve conflicts autonomously
- Conflict detection behavior is configurable via agent rules

### 8. Agent Behavior & Prompt Architecture
Two distinct layers — developer-controlled and user-controlled:

**Hard-coded (Developer) — Never modifiable by users**
- Privacy and data isolation rules (private context never leaks across sessions)
- Security guardrails (no unauthorized actions, no prompt injection)
- Core conflict and inconsistency detection behavior
- Approval enforcement for approval-required actions
- Source system write validation
- Escalation chain integrity

**User-configurable Prompt Layers**

| Layer | Who Can Edit | Scope |
|---|---|---|
| General agent rules | CIO only | Applies to all roles and users |
| Role-based rules | CIO + authorized users | Applies to a specific role |
| Project-based rules | CIO + project owner | Applies to a specific project |
| User-based rules | Each user (for themselves) | Applies only to that user |

Hierarchy: each layer extends the one above — it cannot override or contradict it. More specific layers (project, user) take precedence when rules conflict within the configurable space.

Prompt change history is maintained. Changes can be reverted.

### 9. Skill Module
Skills define **how** the agent performs a specific task — not when or to whom, but the logic, format, and criteria behind the output. Skills are distinct from prompts (which govern general behavior) and alerts (which govern triggers and timing).

Skill layers — same hierarchy as prompt architecture:

| Layer | Who Can Define | Scope |
|---|---|---|
| System skills | Developer (hard-coded) | Core agent capabilities, never modifiable |
| General skills | CIO | Available to all roles and users |
| Role-based skills | CIO + authorized users | Available to a specific role |
| Project-based skills | CIO + project owner | Applied within a specific project context |
| Personal skills | Each user (for themselves) | Applies only to that user |

Example skills:
- **Sprint summary** — which fields to include, how to structure the output, how to surface risk signals
- **OKR quality assessment** — criteria for a well-formed OKR, detection of missing or weak Key Results
- **Project health scoring** — which metrics to use, how to weight them, what thresholds indicate risk
- **Incident prioritization** — how to evaluate and rank ServiceNow tickets
- **Portfolio review** — how to assess cross-project signals and investment alignment

Skills can be created and edited from the admin screen or via ChatBot using natural language. Agent proposes a structured skill definition from the natural language input — user reviews and confirms before activation.

Skill change history is maintained. Changes can be reverted.

---

### 10. Notification & Channel Preferences
Users configure how and where the agent reaches them. Configurable at both role level and user level.

- Supported channels: In-app, Email, WhatsApp, Microsoft Teams, Slack
- Channel preference is configurable per user and per alert priority level
- Example routing: critical alerts → WhatsApp, daily digest → Email, task updates → Teams
- Channel configuration available from user settings screen and via ChatBot

---

### 11. Calendar & Scheduling Integration
- Time-based triggers for proactive agent actions (distinct from event-driven alerts)
- Integration with Outlook and Google Calendar
- Agent can schedule summaries, reviews, and digests aligned with the user's calendar
- Scheduling rules are configurable per user and per role

---

### 12. Language & Tone Preferences
- Agent response language configurable per user (e.g., Turkish, English)
- Response format preference: summary, detailed, bullet-point
- Tone preference: formal, concise, narrative
- Configurable from user settings screen

---

### 13. External System Integrations
Connector model — new integrations can be added without architectural change.

Confirmed integrations:
- JIRA
- ServiceNow
- Azure DevOps
- Spirai

Channel integrations:
- WhatsApp Business API
- Microsoft Teams
- Slack
- Email (Outlook, Gmail)

Future connector model:
- Each integration is a configurable connector with its own authentication, field mapping, and write-back permissions
- New connectors can be added by authorized users from the admin screen
- Connector availability and permissions are role-configurable

---

### 14. Platform Context — Agentmetric

CIO Agent is the first agent available on the Agentmetric platform. The platform consists of three components, each with a distinct role:

**agentmetric.com** — Public marketplace for discovery, sandbox trial, plan selection, and purchase. Stripe-based checkout. Post-purchase, the customer is automatically provisioned in the console with no second registration required.

**platform.agentmetric.com** — Customer console for API key lifecycle, organization and member management, billing, plan changes, and credit top-up. When a customer purchases additional credits, the platform issues a new RSA-256 signed JWT token encoding the updated credit limit. The customer applies this token in AgentMetric Studio to restore full operation without requiring a live internet connection at the time of activation.

**AgentMetric Studio** — On-premise administration interface installed alongside the agent via the Helm chart. Handles all agent-specific configuration: users, roles, connectors, prompt layers, skills, alerts, knowledge base, and the full audit log. Studio does not require internet access for day-to-day operation. License validation connects to the Agentmetric license service on a configurable sync interval. See `user_interface.md` → Module 8 for the full Studio module list.

The Admin Screen (Module 2) and AgentMetric Studio are not the same surface. The Admin Screen is the CIO's in-agent configuration UI accessible through the agent interface. Studio is the broader on-premise control panel that wraps agent configuration alongside licensing, usage monitoring, and connector management.

---

## Open Topics (Not Yet Discussed)

- **Spirai Integration** — OKR and Key Result creation flow, assignment mechanism, performance review triggering, how agent maps project signals to OKR updates
- **Source System Integrations** — JIRA, ServiceNow, Azure DevOps connection model, authentication, write-back permissions, field mapping
- **ChatBot Capabilities & Boundaries** — Supported interaction types, what the agent can and cannot do from chat, conversation context window, multi-turn reasoning
- **Reporting & Summarization** — What the agent proactively surfaces, to whom, at what frequency, in what format (daily digest, weekly portfolio summary, on-demand)
- **Offline / Async Behavior** — What the agent does when users are not active, how it queues and presents accumulated signals upon next login
- **IT Portfolio Management** — Second priority after project tracking; portfolio-level health signals, resource allocation visibility, investment vs delivery alignment
- **Audit Log** — Full traceability of agent actions, who approved what, prompt change history, escalation history
- **Agent Onboarding Flow** — How a new user is introduced to the agent, how initial context is established
