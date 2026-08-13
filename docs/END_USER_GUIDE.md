# AI Scrum Master — End User Guide

**Product:** AI Scrum Master  
**Audience:** Company admins, delivery leadership, project managers, and team members  
**Version:** 0.1.0  
**Format:** This document is also available as Microsoft Word: `AI_Scrum_Master_End_User_Guide.docx`

---

## 1. What AI Scrum Master is

AI Scrum Master is a multi-tenant delivery platform that replaces manual Scrum Master status chasing with an AI agent. It helps your company:

- Organize work by **Accounts → Projects → Resources**
- Collect **daily status** through time-bound email (or Microsoft Teams) links
- Track **SDLC** items: epics, features, stories, tasks, tests, defects, and RCA
- Alert leads on **status changes, blockers, misses, and deadlines**
- Produce **weekly packs**, **billing**, **GTS reports**, and **management dashboards**

Staff sign in to the web dashboard. Delivery resources can submit daily status without a staff login by opening their personal magic link.

---

## 2. Sign in

1. Open the application URL (local default: `http://localhost:3000`, Docker Compose often `http://localhost:3001`).
2. On **Sign in**, enter **Email** and **Password**.
3. Select **Continue**.
4. You land on **Overview** (Company matrix).

There is no public self-registration. Company admins create users under **Users & roles**. Password reset and SSO are not offered in this version.

### Demo accounts (seed data)

Password for all: `password123`

| Email | Role |
|-------|------|
| `admin@acme.local` | Company Admin |
| `ceo@acme.local` | CEO |
| `svp@acme.local` | SVP |
| `vp@acme.local` | VP |
| `avp@acme.local` | AVP |
| `pm@acme.local` | Project Manager |
| `alex@acme.local` / `sam@acme.local` | Employee |

---

## 3. Roles and feature access

### 3.1 Roles

| Role (UI label) | Typical user | Primary use |
|-----------------|--------------|-------------|
| **Company Admin** | Platform / ops admin | Full access: settings, users, permissions, agent, Teams, all delivery data |
| **CEO** | Executive | Dashboards, delivery data, users, permissions, agent, Teams, settings |
| **SVP** | Senior delivery leadership | Like CEO minus editing Settings (by default) |
| **VP** | Account / delivery leadership | Delivery menus and edit delivery data |
| **AVP** | Delivery lead | Same default menus as VP |
| **Project Manager** | Project owner | Delivery menus plus AI Agent jobs |
| **Employee** | Team member (staff login) | Overview, Projects, Epic/Story/Task, Work breakdown, Daily status |

Day-to-day project alert emails go to **Project Manager**, **AVP**, and **VP**.

Resources who only submit status often never sign in; they use the email or Teams link instead.

### 3.2 Feature access

Menus and write actions are controlled per role.

- Open **Feature access** to see a checkbox matrix of **Menus** and **Actions** × roles.
- Select **Save feature access** after changes.
- Users should refresh or sign in again to see updated menus.
- **Company Admin** always has full access; those checkboxes stay enabled and locked.

**Actions** (not sidebar items):

| Action | What it allows |
|--------|----------------|
| Edit delivery data | Create/update accounts, projects, resources, leaves, SDLC |
| Manage users | Create users and change roles |
| Run agent jobs | Open/close status window, deadline sweep, weekly packs |
| Edit settings | Change company collection settings |
| Manage MS Teams | Enable bot, link people, connect channels |

Default menus by role are listed in the Quick reference at the end of this guide. Your company can customize them.

---

## 4. First-time setup

Complete this once per company (or when onboarding a new account).

1. Sign in as **Company Admin** (or CEO).
2. **Settings** — set timezone, daily status start time, window length, weekly report time, deadline warn days. Select **Save settings**.
3. **Accounts** — add each client/account (name, GTS code, technology, domain, PMs). Select **Add account**.
4. **Projects** — create projects under an account; set phase, dates, billable. Select **Add project**.
5. **Resources** — add people (Employee ID, Name, Email). Email is used for daily status links.
6. On **Projects**, use **Assign / update** to map resources (capacity %, billable, hourly rate).
7. Open a project → add backlog items and tasks (or use **Epic / Story / Task** → backlog manager).
8. Optionally configure **MS Teams** and schedule cron for automatic agent jobs (see Deployment / Teams docs).

---

## 5. Navigation map

Sidebar items appear only if your role (and Feature access) allows them. Brand label: **AI Scrum Master** / **Delivery HQ**. Use **Sign out** at the bottom of the sidebar.

| Menu | Path | Purpose |
|------|------|---------|
| Overview | `/dashboard` | Company matrix, RAG, KPIs |
| Accounts | `/dashboard/accounts` | Client accounts |
| Projects | `/dashboard/projects` | Projects and assignments |
| Epic / Story / Task | `/dashboard/backlog` | Pick a project for backlog management |
| Resources | `/dashboard/resources` | People master |
| Users & roles | `/dashboard/users` | Staff users and roles |
| Feature access | `/dashboard/permissions` | Menus/actions per role |
| Billing | `/dashboard/billing` | Monthly billing matrix |
| Work breakdown | `/dashboard/workboard` | Planned vs actual by hierarchy |
| Quality / RCA | `/dashboard/quality` | Defect RCA and review sheets |
| Daily status | `/dashboard/status` | Submission compliance |
| Leaves | `/dashboard/leaves` | Leaves and extra working days |
| Weekly reports | `/dashboard/reports` | Generated weekly packs |
| GTS Report | `/dashboard/gts-report` | Month-wise GTS sheet |
| AI agent | `/dashboard/agent` | Run status chase and jobs |
| MS Teams | `/dashboard/teams` | Bot people, channels, activity |
| Settings | `/dashboard/settings` | Company window configuration |

Public (no login): daily status form at `/status/{token}`.

---

## 6. Screen guides

### 6.1 Overview (Company matrix)

- KPI cards (often click-through): Accounts, Projects, Resources, Overdue tasks, Open defects, Pending status.
- **Project RAG matrix:** Account, Project, Phase, Resources, Overdue, Defects, Test pass, Density, RAG.
- Recent weekly reports with **View all**.

**RAG (simplified):**

- **Red** — any overdue open task (client deadline)
- **Amber** — open critical defect
- **Green** — otherwise

### 6.2 Accounts

- **Add account:** Account name, Code (GTS project name), Technology, Domain, Project managers → **Add account**.
- Per row: edit fields → **Save**, or **Deactivate** (soft inactive).
- Requires **Edit delivery data** (or Company Admin).

### 6.3 Projects

- **Add project:** Account, Project name, Phase (Requirements → Design → Dev → Test → UAT → Closed), Start/End, Billable → **Add project**.
- **Assign / update:** Project, Resource, Capacity %, Billable (this project), Billing rate (per hour) → **Assign / update**.
- Table: open project, **Manage Epic / Story / Task**, remove assignment, **Save** / **Deactivate**.
- Hourly rate is used for billing when the assignment is billable.

### 6.4 Project detail

Open a project from **Projects**.

- Links: **Manage Epic / Story / Task**, **All projects backlog**, **Open backlog manager**.
- **Save billing dates** (start, end, billable).
- **Add task / subtask** → **Save task** (kind, parent, phase, owner, story link, estimate days, dates, client deadline, resource deadline, progress/status).
- **Add epic / feature / story** → **Save backlog item**.
- **Add test case** (status: not_run / pass / fail / blocked).
- **Add defect** (source: internal / client_informed; severity low → critical).
- On defects without RCA: **Capture RCA / review**.
- Shows defect density and lists of tasks, backlog, tests, and defects.

### 6.5 Epic / Story / Task (backlog hub and manager)

**Hub** (`/dashboard/backlog`): project cards with **Manage Epic / Story / Task** and **Project details**.

**Backlog manager** (`/dashboard/projects/{id}/backlog`):

- Add/edit/delete epics, features, stories and tasks/subtasks.
- Assign resources, estimates, deadlines, status, progress %.
- Buttons include **Update**, **Delete**, **Add backlog item**, **Add Task / Subtask**, link to **Work breakdown board**.
- Project Managers / delivery editors: full edit. Employees: update **their own** assigned tasks. Others may be view-only.

### 6.6 Resources

- **Add resource:** Employee ID, Name, Email → **Add resource**.
- Row: **Save** / **Deactivate**.
- Shows multi-project assignments. Billing rates are set on project assignment, not on the resource master.

### 6.7 Users & roles

- Explains roles briefly on the page.
- **Add user:** Name, Email, Password (minimum 6 characters), Role → **Add user**.
- Per user: change role → **Save**.
- Requires **Manage users**.

### 6.8 Feature access

- Checkbox matrix of menus and actions by role.
- **Save feature access**.
- Company Admin column cannot remove full access.

### 6.9 Billing

- Choose **Year** / **Month** → **View month**.
- Optional **Total working days** override + note → **Save override**.
- Sections: Grand total, Account totals, Project-wise, Resource-wise, Detail (resource × project).

**Formula:**

- `billable_days = working_days − leaves + extra working days`
- `billing = hourly_rate × 8 × billable_days` (hours/day = 8)

### 6.10 Work breakdown

- Filters: View (Project-wise / Resource-wise), Period (Day / Week / Month / Quarter / Year), Project, Resource → **Apply**.
- Totals: estimate, planned, actual status hours, variance.
- Hierarchy: Epic → Feature → Story → Task / Subtask (1 estimate day = 8 hours). Actual hours come from daily status submissions.

### 6.11 Quality / RCA

- Filter defects by source (All / Internal / Client informed) → **Filter**.
- Per defect: **Save RCA** (problem, root cause, contributing factors, impact, containment, corrective/preventive actions, owner, dates, status, review).
- **Save review sheet** (reviewer, type, scope, checklist items, findings, actions, residual risk, sign-off).
- Link **Open project →** to the owning project. Defects are created on the project page.

### 6.12 Daily status (dashboard)

- Last 7 windows with counts: Submitted / Pending / Expired / Leave.
- Per-resource table and recent submissions feed.
- Windows are opened from **AI agent** (or cron), not from this page.

### 6.13 Leaves & extra working days

- **Log leave:** Resource, optional Project (blank = all), Type (internal / client-informed), Start, End, Reason → **Log leave**.
- **Add extra day:** Resource, Project, Date, Note → **Add extra day**.
- Leave skips daily status chase for covered dates and reduces billable days. Extra days increase billable days.

### 6.14 Weekly reports

- Cards for resource-wise, project-wise, and company digests: period, narrative, metrics, emailed-to.
- Generate packs from **AI agent** → **Generate weekly packs**.

### 6.15 GTS Report

- Select Account, Year, Month → **Open month** (month tabs available).
- **Generate GTS month** or **Refresh from system data**.
- **Save header:** Project Name, PMs, Technology, Domain, Utilization %, Availability %, remarks.
- Edit or **Delete** lines; add rows (Sub Project, linked project, Feature, UAT Defects, Effort hrs, Remarks).
- DDD-style density uses defects / effort hours where applicable. Refresh replaces generated lines from system data.

### 6.16 AI agent

Four panels, each with **Run now**:

| Job | Effect |
|-----|--------|
| Open daily status window | Create today’s window and send/chase links |
| Close expired windows | Expire pending requests and escalate misses |
| Deadline sweep | Approaching / overdue deadline alerts |
| Generate weekly packs | Resource, project, and company digests |

Automation: schedule `POST /api/cron` with the company cron secret (see Deployment docs). Without SMTP configured, emails and magic links appear in the **server console** (look for `Links:`).

### 6.17 MS Teams

Optional. Email status links still work if Teams is off.

- Environment status shows whether bot credentials / AI parse are configured.
- Company settings: Enable agent, Chase on window open, Azure AD tenant id, Reminder minutes before close → **Save**.
- **Run relay** to process pending Teams notifications.
- Linked people: map Teams identity to resource → **Save**, **Test**, **Mute/Unmute**, **Remove**, **Install for {name}**.
- Channels: project scope, Active, notify types (status submitted, blockers, missed, deadlines, weekly packs) → **Save**, **Send test**, **Remove**.
- Recent bot activity and sends appear on the page.

**Common bot commands (after linking):**

| Command | Who | Effect |
|---------|-----|--------|
| `help` / `hi` | Everyone | Help card |
| `status` / `my status` | Everyone | Open status form |
| Free-text day summary | Everyone | Confirm card (AI parse if enabled) |
| `my tasks` | Everyone | List tasks |
| `update <task> <n>%` | Everyone | Update progress |
| `blocker <text>` | Everyone | Report blocker |
| `leave YYYY-MM-DD …` | Everyone | Request leave |
| `mute` / `unmute` | Everyone | Pause/resume bot DMs |
| `standup` | Leads | Standup summary |
| `missing` | Leads | Who has not submitted |
| `report project <name>` | Leads | Project report |

Leads for Teams DMs align with project alert roles (PM, AVP, VP) when linked and not muted. Bot setup details: `docs/TEAMS_INTEGRATION.md`.

### 6.18 Settings

| Setting | Meaning | Typical default |
|---------|---------|-----------------|
| Timezone | Company local timezone label | `Asia/Kolkata` |
| Daily status start | When the window opens (`HH:mm`) | `17:00` |
| Window length (hours) | Link validity from start | `2` |
| Weekly report time | Preferred weekly pack time | `09:00` |
| Deadline warn days | Days before deadline to alert (comma-separated) | `3,1` |

Select **Save settings**. Requires **Edit settings**.

### 6.19 Magic-link daily status form

URL: `/status/{token}` (from email or Teams). No staff login required.

**Fields:**

- Productive hours
- Non-productive hours
- Primary project today
- Overall progress %
- Per-task progress %
- What did you work on?
- Blockers (optional)

**Buttons:** **Submit status** or **Update status**.

**States:** Invalid link · On leave · Link expired · Form open · Window closed (read-only last submission).

You may update while the window is open. After expiry the form locks. Task progress of 100% marks the task done when submissions apply progress.

---

## 7. Core workflows

### 7.1 Daily status collection

1. **Open window** — AI Agent → **Open daily status window** (or cron `open-status-window`).
2. System creates a status window (`startsAt` → `expiresAt` = start + window length).
3. Each **active** resource gets a unique token/link. Resources on approved leave are `skipped_leave` (no chase).
4. Resource opens the link and submits before expiry.
5. Request becomes `submitted`. **Project Manager / AVP / VP** receive status-change email; blockers trigger a blocker alert.
6. **Close expired windows** (or cron) marks remaining `pending` as `expired` and emails miss escalation to PM / AVP / VP.
7. Monitor compliance on **Daily status**.

### 7.2 Deadline alerts

Run **Deadline sweep** (or cron `deadline-sweep`).

| Condition | Recipients |
|-----------|------------|
| Due in configured warn days (e.g. 3 or 1) — client or resource deadline | Task owner (if assigned) + PM, AVP, VP |
| Overdue (not done) | Task owner + PM, AVP, VP |

Alerts are deduplicated so the same threshold is not emailed repeatedly.

### 7.3 Weekly packs

Run **Generate weekly packs** (or cron `weekly-reports`).

| Pack | Typical recipients |
|------|--------------------|
| Per resource | That resource + Project Managers |
| Per project | PM, AVP, VP, SVP, CEO, Company Admin |
| Company digest | CEO, SVP, VP, Company Admin |

View history under **Weekly reports**. Defect density (MVP): defects ÷ closed requirements (or raw defect count if none closed).

---

## 8. Operating rhythm

| When | Action | Owner |
|------|--------|--------|
| Daily (configured hour) | Open status window | Cron / AI Agent |
| Daily (start + window length) | Close window / escalate misses | Cron / AI Agent |
| Daily morning | Deadline sweep | Cron / AI Agent |
| Continuous | Update tasks, defects, RCA, leaves | PM / AVP / VP |
| Weekly (e.g. Monday) | Generate weekly packs | Cron / AI Agent |
| Weekly review | Walk Overview RAG + Red projects | CEO / SVP / VP |
| Monthly | Review Billing and GTS Report | Finance / PMs / leadership |

---

## 9. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| No status emails | SMTP configuration; otherwise check **server console** for `Links:` |
| Link says expired | Window closed; wait for next day’s open (typically one window per day) |
| Resource not chased | Inactive resource, or leave covering today |
| PM not notified | User must be Project Manager, AVP, or VP with a valid email; check SMTP/console |
| Menu missing | Feature access for your role; sign out and back in |
| Cannot edit projects | Need **Edit delivery data** |
| Cannot run agent | Need **Run agent jobs** |
| Duplicate deadline mail blocked | Expected — notifications are deduplicated |
| Cannot sign in | Correct seed/user password; admin-created account exists |
| Teams not responding | Bot credentials, linking, mute state; see Teams integration doc |
| Billing looks wrong | Assignment rates, leaves, extras, working-days override |

---

## 10. Out of scope in this version

Treat these as not available unless later released:

- Excel / CSV status upload
- Jira / Azure DevOps sync
- Free-form email reply parsing (email delivers the link only)
- Slack / SMS notifications
- Native mobile apps
- Public self-signup or password reset UI

---

## 11. Quick reference

### 11.1 Agent jobs

| Job name | UI label | Effect |
|----------|----------|--------|
| `open-status-window` | Open daily status window | Create window + chase links |
| `close-status-window` | Close expired windows | Expire pending + escalate |
| `deadline-sweep` | Deadline sweep | Approaching / overdue emails |
| `weekly-reports` | Generate weekly packs | Resource + project + company packs |
| `run-all-daily` | (cron only) | Open + close + deadline in one call |

### 11.2 Default menus by role

| Role | Default access (high level) |
|------|-----------------------------|
| Company Admin | Everything |
| CEO | Almost all menus + users, permissions, agent, teams, settings + manage actions |
| SVP | Like CEO without edit settings (has users, permissions, agent, teams) |
| VP / AVP | Delivery menus + edit delivery (no agent/users/settings by default) |
| Project Manager | Delivery menus + agent + run agent |
| Employee | Overview, Projects, Epic/Story/Task, Work breakdown, Daily status |

### 11.3 Related documentation

| Document | Use |
|----------|-----|
| `docs/TEAMS_INTEGRATION.md` | Teams bot installation and configuration |
| `docs/DEPLOYMENT.md` | Cron, env vars, production deploy |
| `docs/DOCKER_LOCAL.md` | Local Docker Desktop stack |
| `docs/FRD.md` | Formal functional requirements |
| `docs/ARCHITECTURE.md` | System design (technical) |

---

*End of End User Guide*
