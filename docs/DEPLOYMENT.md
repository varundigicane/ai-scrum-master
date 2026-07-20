# AI Scrum Master — Deployment Document & NFRs

**Product:** AI Scrum Master  
**Version:** 0.1.0 (MVP)  
**Date:** 2026-07-17

---

## 1. Scope

This document covers how to deploy the application, configure environment, schedule agent jobs, and the **Non-Functional Requirements (NFRs)** the system should meet in production.

---

## 2. Prerequisites

| Requirement | Minimum |
|-------------|---------|
| Node.js | 22.x LTS recommended |
| npm | 10.x |
| OS | Linux / Windows Server / container host |
| Outbound email | SMTP relay (or console-only for non-prod) |
| Scheduler | OS cron, Kubernetes CronJob, or cloud scheduler |
| TLS | HTTPS terminator (reverse proxy / platform) |

For production data durability, use **PostgreSQL 15+** (required). Local demo uses Docker Compose Postgres. SQLite is archived and no longer the active datasource.

---

## Railway (recommended cloud)

Step-by-step: **[RAILWAY.md](./RAILWAY.md)** — GitHub deploy, Postgres plugin, env vars, migrate, health check, cron.
## 3. Environment variables

Copy `.env.example` to `.env` (or set in the platform secret store):

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite: `file:./dev.db` · Postgres: `postgresql://user:pass@host:5432/aiscrum` |
| `AUTH_SECRET` | Yes | Long random secret for JWT signing |
| `NEXTAUTH_URL` / `APP_URL` | Yes | Public base URL, e.g. `https://scrum.example.com` |
| `CRON_SECRET` | Yes | Bearer token for `/api/cron` |
| `EMAIL_FROM` | Yes | From header |
| `SMTP_HOST` | Prod Yes | SMTP hostname |
| `SMTP_PORT` | Prod Yes | Usually `587` |
| `SMTP_USER` / `SMTP_PASS` | If required | SMTP auth |
| `OPENAI_API_KEY` | No | Reserved for AI narratives (templates used if empty) |

**Never commit** production `.env` values.

---

## 4. Local / demo deployment

```bash
cd ai-scrum-master
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

- App: `http://localhost:3000`  
- Demo admin: `admin@acme.local` / `password123`

Build & run production mode locally:

```bash
npm run build
npm run start
```

---

## 5. Production deployment (reference)

### 5.1 Recommended target architecture

```text
Internet → HTTPS Load Balancer / Reverse Proxy
        → Node process (Next.js `npm start`)  × N (horizontally if sticky sessions not required; JWT is stateless)
        → PostgreSQL (managed)
        → SMTP gateway
Scheduler → HTTPS POST /api/cron (with CRON_SECRET)
```

### 5.2 Build pipeline steps

1. Install dependencies: `npm ci`  
2. Generate Prisma client: `npx prisma generate`  
3. Apply migrations: `npx prisma migrate deploy`  
4. Build: `npm run build`  
5. Start: `npm run start` (or process manager: systemd, PM2, Docker)  

### 5.3 Switching to PostgreSQL

1. Provision managed Postgres.  
2. Update `prisma/schema.prisma` datasource `provider = "postgresql"`.  
3. Install appropriate Prisma driver adapter for Postgres.  
4. Set `DATABASE_URL` to the Postgres connection string.  
5. Run `prisma migrate deploy`.  
6. Update `src/lib/prisma.ts` adapter accordingly.  

Until that change is applied, treat SQLite as **single-instance only** (file DB is not safe across multiple app nodes).

### 5.4 Example Dockerfile (outline)

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Mount secrets via environment; persist DB externally (not in container FS) for Postgres.

### 5.5 Reverse proxy

- Terminate TLS at nginx / ALB / Cloudflare.  
- Forward to `http://127.0.0.1:3000`.  
- Set `APP_URL` / `NEXTAUTH_URL` to the public HTTPS origin (required for correct magic links).

---

## 6. Scheduling agent jobs

Secure endpoint:

```http
POST /api/cron
Authorization: Bearer <CRON_SECRET>
Content-Type: application/json

{"job":"open-status-window"}
```

| Job | Suggested schedule | Purpose |
|-----|--------------------|---------|
| `open-status-window` | Daily at company `statusWindowStart` | Email status links |
| `close-status-window` | Daily at start + window hours (+1–2 min) | Expire + escalate misses |
| `deadline-sweep` | Daily ~09:00 | Approaching / overdue alerts |
| `weekly-reports` | Weekly Monday 09:00 | Resource + project + company packs |
| `run-all-daily` | Optional composite | open + close + deadline |

### Example crontab

```cron
# Adjust times to company timezone on the host
0 17 * * 1-5  curl -s -X POST "$APP_URL/api/cron" -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"job":"open-status-window"}'
5 19 * * 1-5  curl -s -X POST "$APP_URL/api/cron" -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"job":"close-status-window"}'
0 9 * * 1-5   curl -s -X POST "$APP_URL/api/cron" -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"job":"deadline-sweep"}'
0 9 * * 1     curl -s -X POST "$APP_URL/api/cron" -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"job":"weekly-reports"}'
```

Restrict cron source IPs where possible; rotate `CRON_SECRET` periodically.

---

## 7. Seed and first admin (non-demo)

For a clean production company:

1. Run migrations.  
2. Either adapt `prisma/seed.ts` for your org or insert Company + CompanyAdmin user via a one-off script (`bcrypt` hash for password).  
3. Configure Settings in UI (window start, timezone, warn days).  
4. Import accounts, projects, resources.  
5. Verify one `open-status-window` end-to-end with a test mailbox.

---

## 8. Backup and recovery

| Asset | Practice |
|-------|----------|
| Database | Automated daily backups + PITR for Postgres; for SQLite copy `dev.db` only in non-prod |
| Secrets | Store in vault / platform secrets; document rotation |
| Migrations | Keep `prisma/migrations` in VCS; deploy only forward with `migrate deploy` |
| Notification/report history | Included in DB backups |

**RTO / RPO targets:** see NFR section below.

---

## 9. Health and operations checks

| Check | How |
|-------|-----|
| App up | `GET /login` returns 200 |
| Auth | Staff login succeeds |
| DB | Prisma query / migrate status |
| Cron auth | Unauthorized without bearer; 200 with secret |
| Email | Test open-window; confirm inbox or SMTP logs |
| Magic link | `APP_URL` host matches public URL |

Monitor:

- Cron job success/failure  
- Status submission rate  
- Email bounce rate  
- Error rate / Node process restarts  

---

## 10. Non-Functional Requirements (NFRs)

### 10.1 Performance

| ID | Requirement | Target (MVP) |
|----|-------------|--------------|
| NFR-P1 | Staff dashboard page load (server render) | p95 &lt; 3s under 50 concurrent staff |
| NFR-P2 | Status form submit API | p95 &lt; 1s |
| NFR-P3 | Open status window for ≤500 resources | Complete email enqueue/send loop &lt; 5 minutes |
| NFR-P4 | Deadline sweep for ≤5,000 open tasks | &lt; 2 minutes |

### 10.2 Scalability

| ID | Requirement | Target (MVP) |
|----|-------------|--------------|
| NFR-S1 | Resources per company | Support 500 (design headroom 2,000) |
| NFR-S2 | Concurrent status submits at window open | 100 concurrent without data loss |
| NFR-S3 | Horizontal scale | Stateless app nodes with shared Postgres (SQLite = single node only) |

### 10.3 Availability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-A1 | Production availability | 99.5% monthly (business hours critical for status window) |
| NFR-A2 | Planned maintenance | Outside daily status window |
| NFR-A3 | RTO | ≤ 4 hours |
| NFR-A4 | RPO | ≤ 24 hours (≤ 1 hour preferred with Postgres PITR) |

### 10.4 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-SEC1 | Transport | TLS 1.2+ for all external traffic |
| NFR-SEC2 | Password storage | bcrypt (or stronger) one-way hash |
| NFR-SEC3 | Status tokens | High-entropy; stored hashed; TTL enforced |
| NFR-SEC4 | Cron endpoint | Shared secret; no public anonymous invoke |
| NFR-SEC5 | Tenant isolation | No cross-company data in queries |
| NFR-SEC6 | Secrets management | Not in source control |
| NFR-SEC7 | Session | JWT with rotating `AUTH_SECRET` on compromise |

### 10.5 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-R1 | Idempotent window open | Second open same day does not duplicate requests |
| NFR-R2 | Notification dedupe | Same deadline threshold not re-emailed |
| NFR-R3 | Failed SMTP | Logged; does not corrupt status data |
| NFR-R4 | Partial submit validation | Zod rejects invalid payloads with 400 |

### 10.6 Usability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-U1 | Status submit time | &lt; 2 minutes for typical resource |
| NFR-U2 | Mobile usable status form | Usable on modern mobile browsers |
| NFR-U3 | Expiry visibility | Expiry timestamp shown on form |

### 10.7 Maintainability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-M1 | Typed codebase | TypeScript strict enough to pass `next build` |
| NFR-M2 | Schema migrations | Prisma migrations only |
| NFR-M3 | Documentation | FRD, Architecture, Deployment, Usage kept in `/docs` |

### 10.8 Compliance & audit (baseline)

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-C1 | Outbound email audit | `NotificationLog` retained ≥ 90 days |
| NFR-C2 | Weekly pack retention | `WeeklyReport` retained ≥ 1 year (policy-configurable) |
| NFR-C3 | Access control | Role-based staff routes |

### 10.9 Email deliverability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-E1 | SPF/DKIM/DMARC | Configured on sending domain in production |
| NFR-E2 | From address | Stable domain owned by the company |
| NFR-E3 | Link host | Matches `APP_URL` HTTPS host |

---

## 11. Environment matrix

| Concern | Development | Staging | Production |
|---------|-------------|---------|------------|
| DB | SQLite | Postgres | Postgres HA |
| Email | Console / test SMTP | Sandbox SMTP | Production SMTP |
| Cron | Manual / local curl | Scheduler | Scheduler + alerts |
| Auth secret | Dev value | Unique | Unique + rotated |
| Seed data | Yes | Optional | No demo seed |

---

## 12. Rollback

1. Redeploy previous application artifact.  
2. Database: prefer forward-fix migrations; if rollback migration exists, apply only with DBA approval.  
3. Verify login, one status link from a dry-run window, and cron auth.  

---

## 13. Checklist before go-live

- [ ] `AUTH_SECRET`, `CRON_SECRET`, SMTP, `APP_URL` set  
- [ ] HTTPS enabled  
- [ ] Migrations applied  
- [ ] Admin user created (no default `password123` in prod)  
- [ ] Settings: timezone + window start validated  
- [ ] Cron jobs scheduled and monitored  
- [ ] Test: open window → submit → PM email → close → miss escalation  
- [ ] Test: deadline sweep and weekly pack  
- [ ] Backups verified  
- [ ] Runbooks linked for on-call  

---

## 14. Related documents

- [FRD](./FRD.md)  
- [Architecture](./ARCHITECTURE.md)  
- [Functional Usage Guide](./FUNCTIONAL_USAGE_GUIDE.md)  
