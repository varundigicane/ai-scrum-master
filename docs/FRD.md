# AI Scrum Master — Functional Requirements Document (FRD)

**Document type:** Functional Requirements Document  
**Product:** AI Scrum Master  
**Version:** 0.1.0 (MVP)  
**Status:** Approved for MVP implementation  
**Date:** 2026-07-17

---

## 1. Introduction

### 1.1 Purpose

This FRD defines the functional requirements for a standalone multi-account delivery platform that replaces the Scrum Master’s manual daily status collection (historically Excel-based) with an AI-assisted agent, structured data capture, SDLC tracking, and management dashboards.

### 1.2 Business problem

- Status is collected resource-wise daily across multiple projects under one client/account.  
- Formats and chasing are inconsistent; Excel formats are not fixed.  
- Leadership needs account/project/resource matrices without manual consolidation.  
- Need visibility into productive vs non-productive time, deadline adherence, leaves, defects/RCA, and test progress.

### 1.3 Product goal

Provide a system where an **AI Scrum Agent**:

1. Collects daily status from every resource via **email + time-bound link** (expires **2 hours** from daily window start).  
2. Manages **multiple accounts** across the company.  
3. Tracks SDLC artifacts and quality (requirements, tests, defects, RCA, leaves).  
4. Notifies stakeholders on status changes and deadline risk.  
5. Produces **weekly** resource-wise and project-wise status for PMs and higher management.  
6. Exposes high-level dashboards at company / account / project / resource levels.

### 1.4 Out of scope (MVP)

| ID | Item |
|----|------|
| OOS-1 | Excel / CSV upload and AI spreadsheet parsing |
| OOS-2 | Jira / Azure DevOps / ALM bi-directional sync |
| OOS-3 | Free-form email reply parsing as primary intake |
| OOS-4 | Slack / Teams / SMS channels |
| OOS-5 | Native iOS/Android apps |
| OOS-6 | Payroll, billing, invoicing |
| OOS-7 | Multi-tenant SaaS billing / self-serve company signup |

### 1.5 Definitions

| Term | Definition |
|------|------------|
| Account | Client / customer under the company |
| Resource | Individual contributor who submits daily status |
| Status window | Daily collection period with fixed start and expiry |
| Magic link | Single-purpose URL for one resource for one window |
| RAG | Red / Amber / Green health indicator |
| RCA | Root Cause Analysis for a defect |
| Defect density | Defects ÷ closed requirements (MVP formula) |

### 1.6 Actors

| Actor | Description |
|-------|-------------|
| CompanyAdmin | Configures company and master data |
| DeliveryHead | Cross-account leadership consumer |
| AccountManager | Account-level stakeholder |
| ProjectLead (PM) | Project owner / primary alert recipient |
| Resource | Status submitter |
| Scheduler | Cron invoking agent jobs |
| System (Agent) | Automated chase, notify, report behaviors |

---

## 2. Functional requirements

### 2.1 Authentication and authorization

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-01 | System shall allow staff users to sign in with email and password. | Must |
| FR-AUTH-02 | System shall store passwords as one-way hashes. | Must |
| FR-AUTH-03 | System shall assign each user a role: CompanyAdmin, DeliveryHead, AccountManager, ProjectLead, Resource, Viewer. | Must |
| FR-AUTH-04 | System shall restrict dashboard routes to authenticated staff sessions. | Must |
| FR-AUTH-05 | System shall scope staff data access to the user’s `companyId`. | Must |
| FR-AUTH-06 | Resources shall submit daily status via magic link without requiring a full dashboard session. | Must |

### 2.2 Organization hierarchy

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ORG-01 | System shall support a Company with configurable timezone and status window settings. | Must |
| FR-ORG-02 | System shall allow CRUD of Accounts (clients) under a company. | Must |
| FR-ORG-03 | System shall allow multiple Projects under one Account. | Must |
| FR-ORG-04 | System shall track Project SDLC phase: Requirements, Design, Dev, Test, UAT, Closed. | Must |
| FR-ORG-05 | System shall maintain Resources with name and email. | Must |
| FR-ORG-06 | System shall assign Resources to Projects with capacity percentage. | Must |

### 2.3 Daily status collection

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ST-01 | System shall open one status window per company per calendar day at configured start time. | Must |
| FR-ST-02 | Status link validity shall expire exactly **N hours** after window start (default **N = 2**). | Must |
| FR-ST-03 | System shall create a unique status request token for every active resource when the window opens. | Must |
| FR-ST-04 | System shall email each eligible resource a unique link to the status form. | Must |
| FR-ST-05 | Resources on approved leave covering the window date shall be marked skipped and not chased. | Must |
| FR-ST-06 | Status form shall capture productive hours, non-productive hours, narrative, blockers, progress, and optional task-level progress. | Must |
| FR-ST-07 | System shall allow update of submitted status until window expiry, then lock. | Must |
| FR-ST-08 | System shall reject submissions after expiry with a clear error. | Must |
| FR-ST-09 | System shall mark non-submitted pending requests as expired when the window is closed. | Must |
| FR-ST-10 | System shall provide a staff UI to view submission states per window (submitted / pending / expired / leave). | Must |
| FR-ST-11 | Opening an already-open window for the same day shall not duplicate status requests. | Must |

### 2.4 Time, progress, and deadlines

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DL-01 | Tasks shall support client-committed deadline and resource-committed deadline. | Must |
| FR-DL-02 | Tasks shall track progress percentage and status (todo, in_progress, blocked, done). | Must |
| FR-DL-03 | Daily status task progress updates shall update the underlying task progress; 100% shall mark done. | Must |
| FR-DL-04 | System shall detect approaching deadlines at configured day offsets (default 3 and 1). | Must |
| FR-DL-05 | System shall detect overdue tasks that are not done. | Must |
| FR-DL-06 | Dashboard shall surface overdue task counts in the company matrix. | Must |

### 2.5 Notifications

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-NT-01 | On status submit, system shall email ProjectLead and AccountManager users. | Must |
| FR-NT-02 | On status update within window, system shall email ProjectLead and AccountManager users. | Must |
| FR-NT-03 | When blockers are present, system shall send a blocker alert email. | Must |
| FR-NT-04 | On window close, system shall email missing-resource list to ProjectLead and AccountManager. | Must |
| FR-NT-05 | On deadline approaching, system shall email resource owner and ProjectLead. | Must |
| FR-NT-06 | On deadline overdue, system shall email resource, ProjectLead, and AccountManager. | Must |
| FR-NT-07 | System shall deduplicate deadline notifications using durable keys. | Must |
| FR-NT-08 | System shall persist a notification log (recipients, subject, type, time). | Must |
| FR-NT-09 | If SMTP is not configured, system shall log emails to the application console including links. | Should |

### 2.6 Weekly reporting

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-WK-01 | System shall generate weekly **resource-wise** status packs with submission, hours, and overdue metrics. | Must |
| FR-WK-02 | System shall generate weekly **project-wise** status packs with RAG, defects, tests, hours, overdue. | Must |
| FR-WK-03 | System shall generate a **company** management digest aggregating project RAG counts. | Must |
| FR-WK-04 | Weekly packs shall be emailed to role-appropriate recipients (resource/PM/AM/Delivery/Admin). | Must |
| FR-WK-05 | Weekly packs shall be stored and viewable in the staff UI. | Must |
| FR-WK-06 | Weekly narrative may be template-based in MVP; AI narrative is optional enhancement. | Should |

### 2.7 Leaves

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-LV-01 | System shall capture leaves with type `internal` or `client_informed`. | Must |
| FR-LV-02 | System shall store leave date range, optional project, and reason. | Must |
| FR-LV-03 | Approved leaves covering the status date shall suppress daily chase. | Must |
| FR-LV-04 | Staff UI shall list leaves for the company. | Must |

### 2.8 Requirements and SDLC

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RQ-01 | System shall capture hierarchical requirements (parent/child, level). | Must |
| FR-RQ-02 | Requirements shall be linkable to tasks and test cases. | Must |
| FR-RQ-03 | Requirements shall support a closed flag for density calculation. | Must |
| FR-RQ-04 | Project phase shall be visible and editable for PM tracking. | Must |

### 2.9 Testing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-QA-01 | System shall store test cases with status not_run / pass / fail / blocked. | Must |
| FR-QA-02 | Test cases may link to a requirement. | Must |
| FR-QA-03 | Dashboards shall show test pass rate per project when cases exist. | Must |

### 2.10 Defects, RCA, review

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DF-01 | System shall log defects with source `internal` or `client_informed`. | Must |
| FR-DF-02 | Defects shall have severity (low/medium/high/critical) and status workflow. | Must |
| FR-DF-03 | Defects may link to task, requirement, and test case. | Must |
| FR-DF-04 | System shall capture RCA: root cause, corrective action, review notes. | Must |
| FR-DF-05 | Staff UI shall allow creating RCA/review against a defect. | Must |
| FR-DF-06 | System shall compute defect density as defects / closed requirements. | Must |

### 2.11 Dashboards and matrix

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DB-01 | Company overview shall show KPI cards (accounts, projects, resources, overdue, defects, pending status). | Must |
| FR-DB-02 | Company overview shall show a project RAG matrix including account, phase, resources, overdue, defects, test pass, density, RAG. | Must |
| FR-DB-03 | RAG shall be derived from overdue and critical defect heuristics (MVP rules). | Must |
| FR-DB-04 | Project detail page shall act as SDLC workspace for that project. | Must |
| FR-DB-05 | Weekly reports page shall list generated packs and metrics. | Must |

### 2.12 Agent operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AG-01 | System shall expose secured jobs: open-status-window, close-status-window, deadline-sweep, weekly-reports. | Must |
| FR-AG-02 | System shall allow authorized staff to trigger jobs manually from UI (demo/ops). | Must |
| FR-AG-03 | System shall allow external scheduler to invoke jobs via HTTP with shared secret. | Must |
| FR-AG-04 | System shall support a composite daily job for ops convenience. | Should |

### 2.13 Configuration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CF-01 | CompanyAdmin shall configure status window start time and duration hours. | Must |
| FR-CF-02 | CompanyAdmin shall configure deadline warning day offsets. | Must |
| FR-CF-03 | CompanyAdmin shall configure weekly report preferred time (informational for scheduler). | Should |

---

## 3. User stories (representative)

| ID | As a… | I want… | So that… |
|----|-------|---------|----------|
| US-01 | ProjectLead | every resource to get a daily status link | I stop chasing Excel files |
| US-02 | Resource | a simple mobile form with clear expiry | I can submit in under two minutes |
| US-03 | ProjectLead | email when status is submitted or blockers appear | I can intervene quickly |
| US-04 | AccountManager | overdue and miss escalations | client commitments are visible |
| US-05 | DeliveryHead | a weekly digest and RAG matrix | I can manage by exception |
| US-06 | ProjectLead | to log defects with RCA | quality learning is retained |
| US-07 | CompanyAdmin | to set the 2-hour window | collection policy is enforced consistently |

---

## 4. Business rules

| ID | Rule |
|----|------|
| BR-01 | One status window per company per date. |
| BR-02 | Link expiry = window `startsAt` + configured hours (default 2). |
| BR-03 | Leave (approved) on that date ⇒ no chase; state `skipped_leave`. |
| BR-04 | After expiry, submit API returns forbidden; pending → expired on close job. |
| BR-05 | Defect density = count(defects) / count(closed requirements); if denominator 0, show defect count. |
| BR-06 | Deadline alerts fire for both client and resource deadline tracks independently. |
| BR-07 | Approaching alerts at day offsets listed in `deadlineWarnDays` (default 3,1). |
| BR-08 | Weekly packs cover the previous week (Mon–Sun relative to generation logic). |
| BR-09 | Magic tokens stored hashed; raw token only in email link. |
| BR-10 | No Excel-based intake in MVP. |

---

## 5. Data requirements (logical)

Essential entities: Company, User, Account, Project, Resource, ResourceAssignment, Task, Requirement, TestCase, Defect, RCA, Leave, StatusWindow, StatusRequest, DailyStatus, DailyStatusItem, NotificationLog, WeeklyReport.

Field-level detail is maintained in the Prisma schema (`prisma/schema.prisma`) and Architecture document.

---

## 6. Interface requirements

### 6.1 UI

- Staff web application (responsive).  
- Public status form route `/status/[token]`.  

### 6.2 External interfaces

| Interface | Direction | Purpose |
|-----------|-----------|---------|
| SMTP | Outbound | Chase, alerts, weekly packs |
| Cron HTTP API | Inbound | Trigger agent jobs |

### 6.3 Email content (minimum)

Each transactional email shall include: purpose, key entities (resource/task/project), and when applicable a deep link to the app.

---

## 7. Acceptance criteria (MVP release)

| ID | Criterion | Pass condition |
|----|-----------|----------------|
| AC-01 | Hierarchy | Admin can create account, project, resource, assignment |
| AC-02 | Window open | All active non-leave resources receive unique links |
| AC-03 | Expiry | Submit succeeds before expiry and fails after |
| AC-04 | Notify status | PM receives email on submit |
| AC-05 | Escalate | Missing resources listed to PM after close |
| AC-06 | Deadlines | Approaching and overdue emails generated with dedupe |
| AC-07 | Weekly | Resource + project + company reports created and listed in UI |
| AC-08 | SDLC | Requirement, test case, defect, RCA, leave can be recorded |
| AC-09 | Matrix | Overview shows project RAG row with density and overdue |
| AC-10 | Security | Unauthenticated user cannot access `/dashboard` |

---

## 8. Traceability to implementation (MVP)

| FR area | Primary implementation |
|---------|------------------------|
| Auth | `src/lib/auth.ts`, middleware |
| Hierarchy / SDLC UI | `src/app/dashboard/**`, `src/app/actions.ts` |
| Status links | `src/lib/agent.ts`, `src/app/status/[token]`, `src/app/api/status/submit` |
| Notifications / weekly | `src/lib/email.ts`, `src/lib/agent.ts` |
| Jobs | `src/app/api/cron`, `src/app/dashboard/agent` |
| Schema | `prisma/schema.prisma` |

---

## 9. Future enhancements (backlog, not MVP FR)

- AI-generated weekly narratives from LLM using factual metrics JSON  
- ProjectLead override late window / resend link  
- Jira/ADO connectors  
- Slack notifications  
- Richer RAG rules and capacity forecasting  
- Multi-company SaaS tenancy portal  

---

## 10. Document control

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 0.1.0 | 2026-07-17 | Product / Engineering | Initial FRD aligned to implemented MVP |

**Related documents**

- [Functional Usage Guide](./FUNCTIONAL_USAGE_GUIDE.md)  
- [Architecture](./ARCHITECTURE.md)  
- [Deployment & NFRs](./DEPLOYMENT.md)  
