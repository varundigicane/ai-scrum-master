# AI Scrum Master — Functional Usage Guide

**Product:** AI Scrum Master  
**Audience:** Delivery leadership, Project Managers, Account Managers, Resources, Admins  
**Version:** 0.1.0 (MVP)

---

## 1. Purpose

This guide explains how to use the platform day-to-day: set up accounts and projects, collect daily status via time-bound email links, track SDLC artifacts, and consume management dashboards and weekly packs.

The AI Scrum Agent replaces manual Scrum Master chasing: it opens a daily collection window, emails every resource a unique link (expires **2 hours** after window start), notifies on status changes and deadline risk, and prepares weekly status packs.

---

## 2. Roles and what each person does

| Role | Typical user | Primary actions |
|------|----------------|-----------------|
| **CompanyAdmin** | Platform / ops admin | Configure company settings, manage hierarchy, trigger agent jobs |
| **DeliveryHead** | Delivery leadership | View company matrix, weekly digests, cross-account RAG |
| **AccountManager** | Client account owner | View account/project health, receive miss & weekly emails |
| **ProjectLead** | Project Manager | Manage project SDLC, receive status/deadline alerts, review misses |
| **Resource** | Developer / QA / BA | Submit daily status via email link (no staff login required for submit) |
| **Viewer** | Stakeholder | Read-only dashboards (as permitted) |

**Demo logins** (password for all: `password123`):

- `admin@acme.local` — CompanyAdmin  
- `pm@acme.local` — ProjectLead  
- `delivery@acme.local` — DeliveryHead  
- `alex@acme.local` / `sam@acme.local` — Resource users (staff login optional)

---

## 3. First-time setup (Admin / PM)

### 3.1 Sign in

1. Open the application URL (local default: `http://localhost:3000`).
2. Sign in with your company credentials.
3. You land on **Overview** (company matrix).

### 3.2 Configure collection window

Go to **Settings**:

| Setting | Meaning | Default |
|---------|---------|---------|
| Timezone | Company local timezone label | `Asia/Kolkata` |
| Daily status start | When the agent opens the window (`HH:mm`) | `17:00` |
| Window length (hours) | Link validity from start | `2` |
| Weekly report time | Preferred weekly pack time | `09:00` |
| Deadline warn days | Days before deadline to alert | `3,1` |

Save settings before relying on scheduled cron jobs.

### 3.3 Create hierarchy

1. **Accounts** — Add each client/account (e.g. Contoso Bank).  
2. **Projects** — Create projects under an account; set SDLC **phase** (Requirements → Design → Dev → Test → UAT → Closed).  
3. **Resources** — Add people with name + email (email receives daily links).  
4. On **Projects**, use **Assign** to map resources to projects with capacity %.

### 3.4 Project detail setup

Open a project from **Projects**:

1. Add **tasks** with owner, **client deadline**, and **resource (self) deadline**.  
2. Add **requirements** (high → low via parent).  
3. Add **test cases** linked to requirements; set pass/fail/blocked.  
4. Log **defects** (internal or client-informed) and capture **RCA / review**.  
5. Use **Leaves** to log internal or client-informed leave (resource is skipped in that day’s chase).

---

## 4. Daily status collection (core loop)

### 4.1 Open the window (Agent or Cron)

**Manual (demo):** Dashboard → **AI Agent** → **Open daily status window**.

**Automated:** Schedule `POST /api/cron` with job `open-status-window` at the configured start time (see Deployment doc).

What happens:

1. A `StatusWindow` is created for today (`startsAt` → `expiresAt` = start + 2h).  
2. One `StatusRequest` + unique token is created per **active** resource.  
3. Resources on **approved leave** are marked `skipped_leave` (no email).  
4. Everyone else receives an email with a personal link: `/status/{token}`.

Without SMTP, the link is printed in the **server console** under `Links:`.

### 4.2 Resource submits status

1. Open the link on phone or laptop.  
2. Enter:
   - Productive hours  
   - Non-productive hours  
   - Primary project  
   - Overall / task progress %  
   - Narrative  
   - Blockers (optional)  
3. Submit before the expiry time shown on the form.  
4. Edits are allowed **until the window expires**; after that the link is locked.

### 4.3 After submit

- Request state becomes `submitted`.  
- **ProjectLead / AccountManager** receive a **status submitted/updated** email.  
- If blockers are filled, a **blocker** alert is also sent.  
- Task progress values update linked tasks (100% → `done`).

### 4.4 Close / escalate

**Manual:** AI Agent → **Close expired windows**.  
**Automated:** Cron job `close-status-window` after expiry.

- Remaining `pending` requests become `expired`.  
- PM / Account Manager get a **missing status** email with the list of non-submitters.

### 4.5 Monitor in UI

**Daily status** page shows:

- Per-day window times  
- Counts: submitted / pending / expired / leave  
- Per-resource state and hours  
- Recent submission feed  

---

## 5. Deadline alerts

**Manual:** AI Agent → **Deadline sweep**.  
**Automated:** Cron `deadline-sweep` (recommended daily morning).

| Condition | Recipients |
|-----------|------------|
| Due in **3** or **1** day(s) (client or resource deadline) | Resource owner + ProjectLead |
| **Overdue** (not done) | Resource + ProjectLead + AccountManager |

Alerts are deduplicated so the same threshold is not emailed repeatedly.

---

## 6. Weekly status packs

**Manual:** AI Agent → **Generate weekly packs**.  
**Automated:** Cron `weekly-reports` (recommended Monday 09:00).

Generated and emailed:

1. **Per resource** — submission rate, hours, overdue tasks; emailed to resource + ProjectLeads.  
2. **Per project** — hours, overdue, defects, test pass rate, defect density, RAG; emailed to PM / AM / Delivery / Admin.  
3. **Company digest** — Green/Amber/Red rollup for higher management.

View history under **Weekly reports**.

**Defect density (MVP):** defects ÷ closed requirements (if no closed requirements, raw defect count is shown).

---

## 7. SDLC day-to-day (Project Manager)

| Activity | Where | Notes |
|----------|--------|------|
| Track phase | Project header / create form | Requirements → Closed |
| Requirements tree | Project detail | Parent = lower detail under higher |
| Tasks & dual deadlines | Project detail | Client vs self-committed |
| Test cases | Project detail | Status: not_run / pass / fail / blocked |
| Defects | Project detail | Source: internal / client_informed |
| RCA & review sheet | On each defect | Root cause, corrective action, review notes |
| Leaves | Leaves page | Skips daily chase for those dates |

---

## 8. Management dashboards

### Overview (Company matrix)

- Counts: accounts, projects, resources, overdue tasks, open defects, pending status  
- **Project RAG matrix:** account, phase, team size, overdue, defects, test pass %, density, RAG  
- Recent weekly report narratives  

### Drill-down

| Page | Use |
|------|-----|
| Accounts | Client list and project counts |
| Projects | List + assign resources |
| Project detail | Full SDLC workspace |
| Resources | People and allocations |
| Daily status | Submission compliance |
| Leaves | Availability |
| Weekly reports | Historical packs |
| AI Agent | Run chase / sweep / weekly jobs |
| Settings | Window and alert configuration |

**RAG (simplified MVP):**

- **Red** — any overdue open task (client deadline)  
- **Amber** — open critical defect  
- **Green** — otherwise  

---

## 9. Recommended weekly operating rhythm

| When | Action | Owner |
|------|--------|--------|
| Daily (configured hour) | Open status window | Cron / Agent |
| Daily (start + 2h) | Close window / escalate misses | Cron / Agent |
| Daily morning | Deadline sweep | Cron / Agent |
| Continuous | Update tasks, defects, RCA, leaves | PM / leads |
| Monday morning | Weekly packs | Cron / Agent |
| Weekly review | Walk company matrix + Red projects | DeliveryHead / AM |

---

## 10. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| No status emails | SMTP env vars; otherwise check **server console** for `Links:` |
| Link says expired | Window closed; resource must wait for next day or admin re-open (MVP: one window per day) |
| Resource not chased | Inactive resource, or approved leave covering today |
| PM not notified | User role must be ProjectLead/AccountManager; email console/SMTP |
| Duplicate deadline mail blocked | Expected — `NotificationLog` dedupe keys |
| Cannot sign in | Seed users / password; `AUTH_SECRET` set |

---

## 11. Out of scope in this MVP (usage expectations)

- Excel / CSV status upload  
- Jira / Azure DevOps sync  
- Free-form email reply parsing (email delivers the link only)  
- Slack / SMS notifications  
- Native mobile apps  

---

## 12. Quick reference — Agent jobs

| Job | Effect |
|-----|--------|
| `open-status-window` | Create window + email links |
| `close-status-window` | Expire pending + escalate |
| `deadline-sweep` | Approaching / overdue emails |
| `weekly-reports` | Resource + project + company packs |
| `run-all-daily` | Open + close + deadline in one call |
