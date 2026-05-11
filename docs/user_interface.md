# CIO Agent — User Interface Modules

## Overview

This document defines the frontend modules of the CIO Agent platform. Each module is listed with its primary users and core scope. Two topics — Reporting & Summarization and IT Portfolio Management — are deferred and will be added as separate modules in a future iteration.

---

## Module List

| # | Module | Primary Users |
|---|---|---|
| 1 | ChatBot / Agent Interface | All roles |
| 2 | Admin Screen | CIO |
| 3 | Dashboard | CIO, D&A Manager, IT Manager |
| 4 | Approvals & Pending Actions | All roles |
| 5 | Knowledge Base | All roles |
| 6 | Audit Log | CIO, authorized users |
| 7 | User Settings | All roles |
| 8 | AgentMetric Studio | CIO, authorized admins (on-premise) |

---

## Module Definitions

### 1. ChatBot / Agent Interface

The primary interaction surface where users communicate with the agent, review action drafts, and manage approval requests.

- Real-time conversation with the agent via WebSocket streaming
- Action draft preview cards with one-click approve or edit-before-send
- Approval-required flow: review, confirm, or reject
- Alert creation via natural language input
- Skill creation and editing via natural language input
- Multi-turn reasoning and conversation context

---

### 2. Admin Screen

The central configuration screen for the CIO to define and manage system-wide settings.

- User and role definition
- Action Decision Matrix configuration per role
- Alert creation and management (structured form)
- Escalation rule configuration
- Prompt layer editing (General / Role / Project / User)
- Skill definition and management
- Connector configuration (JIRA, ServiceNow, Azure DevOps, Spirai)
- Notification channel preferences at role level

---

### 3. Dashboard

The summary screen where CIO and managers monitor overall system and project health.

- Agent activity summary (completed actions, pending approvals, failed actions)
- Credit usage summary (by role, by action type)
- Connector health status (JIRA, ServiceNow, Azure DevOps, Spirai)
- Active alerts and triggered escalations
- Project and OKR signals (high-risk projects, SLA breaches)

---

### 4. Approvals & Pending Actions

The screen where users manage drafts and approval-required actions directed to them.

- Pending approval list (action type, source system, priority)
- Draft preview with one-click approval or edit-before-send
- Approval history (who, when, approved or rejected)
- 48-hour timeout tracking per pending item

---

### 5. Knowledge Base

The screen where users upload and manage documents used by the agent as reference sources.

- Document upload (PDF, DOCX, XLSX, PPT)
- Access level assignment (Private / Role / Shared)
- Version history and archive viewing
- Active version management
- Conflict detection notifications (document vs. live source system data)

---

### 6. Audit Log

The screen where all system actions and decisions are tracked with full traceability.

- Agent action history (state transitions, who triggered, outcome)
- Approval decisions (who, when, approved or rejected)
- Prompt and skill change history
- Connector write-back logs
- Filtering by user, role, action type, date range, source system

---

### 7. User Settings

The screen where each user manages their personal preferences and configurations.

- Notification channel preferences (In-app, Email, WhatsApp, Teams, Slack — configurable per alert priority level)
- Language and tone preference (Turkish / English, formal / concise / narrative, summary / detailed / bullet-point)
- Calendar integration (Outlook / Google Calendar)
- Personal prompt rules (user-based layer)
- Personal skill definitions

---

### 8. AgentMetric Studio

The on-premise administration interface installed alongside the purchased agent at the customer site. Accessible at a configurable local URL post-installation. Does not require internet access for day-to-day operation.

Studio is the customer's local control panel for the deployed agent. It is distinct from `platform.agentmetric.com`, which handles billing, key management, and organization-level settings.

**User & Role Management**
- Define users, roles, permissions, and escalation targets within the agent
- Action Decision Matrix configuration per role (Autonomous / Draft / Approval Required)

**Connector Configuration**
- Setup, test, and manage source system integrations (JIRA, ServiceNow, Azure DevOps, Spirai)
- Webhook configuration and polling fallback settings

**Prompt & Skill Management**
- General, role, project, and user-level prompt layer editing
- Skill creation, versioning, and revert

**Alert & Escalation Rules**
- Create and manage event-driven alerts
- Define escalation triggers, targets, and actions

**Knowledge Base**
- Upload and manage reference documents (PDF, DOCX, XLSX, PPT)
- Access level assignment, version history, conflict detection

**Notification Preferences**
- Channel routing per user and per alert priority level
- Calendar integration (Outlook / Google Calendar) for time-based triggers

**Audit Log**
- Full agent action and approval history
- Filtering by user, role, action type, date range, source system

**License & Usage**
- Current credit balance (live from local Redis)
- Monthly usage summary by action type and by role
- Configurable low-credit threshold alert (e.g. warn at 20% remaining)
- License token status and last sync timestamp
- Countdown to read-only mode when internet connection is lost (72-hour grace period)
- Apply New Token flow: when credits are exhausted, the customer purchases additional credits on `platform.agentmetric.com`, downloads the newly issued RSA-256 signed JWT, and applies it in Studio. Studio verifies the token locally, updates the credit limit in Redis, and records the token ID to prevent replay. No internet connection is required at the moment of applying the token.

---

## Deferred Modules

The following modules are scoped but not yet defined. They will be added in a future iteration.

| Module | Notes |
|---|---|
| Reporting & Summarization | Detailed reporting beyond the Dashboard; frequency, format, and audience TBD |
| IT Portfolio Management | Portfolio-level health signals, resource allocation, investment vs. delivery alignment |

---

*Document version: 1.0*
*Last updated: May 2026*
