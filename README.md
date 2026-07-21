# AI Scrum Master

Standalone multi-tenant delivery platform that replaces manual Scrum Master status chasing with an AI agent.

## Features

- Multi-account / multi-project hierarchy
- Daily status collection via **time-bound email links** (default **2 hours** from window start)
- Status-change and deadline (approaching / overdue) email alerts
- Weekly resource-wise and project-wise packs for PMs and higher management
- SDLC: requirements, test cases, defects, RCA/review sheets, leaves
- Company / account / project / resource dashboards

## Documentation

| Document | Path |
|----------|------|
| Functional Requirements (FRD) | [docs/FRD.md](docs/FRD.md) |
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Deployment & NFRs | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| **Railway deploy** | [docs/RAILWAY.md](docs/RAILWAY.md) |
| **Local Docker Desktop** | [docs/DOCKER_LOCAL.md](docs/DOCKER_LOCAL.md) |
| Functional Usage Guide | [docs/FUNCTIONAL_USAGE_GUIDE.md](docs/FUNCTIONAL_USAGE_GUIDE.md) |

## Quick start (Docker Desktop — full stack)

Same Postgres + production app image as Railway:

```bash
cd ai-scrum-master
npm run docker:up
npm run docker:seed
```

Open [http://localhost:3001](http://localhost:3001) — details in [docs/DOCKER_LOCAL.md](docs/DOCKER_LOCAL.md).

> Full-stack Compose uses host ports **3001** (app) and **5433** (Postgres) so they do not clash with a local `npm run dev` on 3000 / Postgres on 5432.

## Quick start (host Next.js + Docker Postgres)

```bash
cd ai-scrum-master
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Demo login:** `admin@acme.local` / `password123`  
Also: `ceo@acme.local`, `svp@acme.local`, `vp@acme.local`, `avp@acme.local`, `pm@acme.local` (Project Manager), `alex@acme.local` / `sam@acme.local` (Employee) — same password

### Deploy on Railway

See **[docs/RAILWAY.md](docs/RAILWAY.md)** — add Postgres, set env vars, deploy from GitHub.

### Roles
CEO · SVP · VP · AVP · Project Manager · Employee · Company Admin — assign under **Users & roles**.

## Daily status flow

1. Dashboard → **AI Agent** → **Open daily status window**
2. Check the **server console** for emailed magic links (SMTP optional)
3. Open a resource link and submit status before expiry
4. PM receives status-change notification; missing submitters escalate after close

## Cron API

```bash
curl -X POST http://localhost:3000/api/cron \
  -H "Authorization: Bearer dev-cron-secret" \
  -H "Content-Type: application/json" \
  -d "{\"job\":\"open-status-window\"}"
```

Jobs: `open-status-window`, `close-status-window`, `deadline-sweep`, `weekly-reports`, `run-all-daily`

## Config

See `.env` for `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `APP_URL`, and optional SMTP.
