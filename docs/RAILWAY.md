# Deploy AI Scrum Master on Railway

## What changed for Railway

- Database provider is **PostgreSQL** (required on Railway; SQLite is archived under `prisma/migrations_sqlite_archive`)
- Prisma client uses `@prisma/adapter-pg` + `pg`
- [`railway.toml`](../railway.toml) — build, pre-deploy migrate, health check
- [`/api/health`](../src/app/api/health/route.ts) — DB readiness probe
- Auth.js `trustHost: true` for Railway HTTPS proxy
- [`scripts/trigger-cron.mjs`](../scripts/trigger-cron.mjs) — one-shot job trigger for Railway cron services (section 5)

## 1. Local Postgres (optional, for pre-deploy testing)

```bash
docker compose up -d db
# set DATABASE_URL in .env (see .env.example)
npx prisma migrate deploy
npm run db:seed
npm run dev
```

## 2. Create Railway project

1. Push this repo to GitHub.
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. **+ New** → **Database** → **PostgreSQL**.
4. Open your **web service** → **Variables**:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the Postgres service) |
| `AUTH_SECRET` | long random string (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | `https://YOUR_SERVICE.up.railway.app` (update after first public domain) |
| `APP_URL` | same as `NEXTAUTH_URL` |
| `AUTH_TRUST_HOST` | `true` |
| `CRON_SECRET` | long random string |
| `EMAIL_FROM` | e.g. `AI Scrum Master <noreply@yourdomain.com>` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | optional; leave blank for console email |

All of the following are optional — omit them and the Teams layer simply stays dormant. See
[TEAMS_INTEGRATION.md](TEAMS_INTEGRATION.md) for where the values come from:

| Variable | Value |
|----------|--------|
| `MICROSOFT_APP_ID` | Bot / Entra app (client) id |
| `MICROSOFT_APP_PASSWORD` | Client secret |
| `MICROSOFT_APP_TYPE` | `SingleTenant` or `MultiTenant` |
| `MICROSOFT_APP_TENANT_ID` | Directory (tenant) id, required for `SingleTenant` |
| `TEAMS_APP_EXTERNAL_ID` | Teams app id — the `id` in `teams/manifest.json`; only needed for Graph proactive install |
| `GRAPH_TENANT_ID` | Defaults to `MICROSOFT_APP_TENANT_ID` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `AI_PARSE_ENABLED` | Free-text status parsing; falls back to the Adaptive Card form when unset |

5. Generate a public domain: **Settings → Networking → Generate Domain**.  
   Then set `NEXTAUTH_URL` and `APP_URL` to that HTTPS URL and redeploy.

## 3. Deploy settings (already in `railway.toml`)

- **Build:** `npm run build` (`prisma generate` + `next build`)
- **Pre-deploy:** `npx prisma migrate deploy`
- **Start:** `npm run start` (`next start`)
- **Healthcheck:** `GET /api/health`

If pre-deploy fails because `prisma` is missing, ensure `prisma` is in **dependencies** (already done) or set `NPM_CONFIG_PRODUCTION=false`.

## 4. Seed demo data (optional, one-time)

From Railway CLI or a one-off run:

```bash
railway run npm run db:seed
```

Demo login: `admin@acme.local` / `password123` — **change passwords in production**.

## 5. Cron / AI agent jobs

Both agent endpoints need to be POSTed on a schedule:

```http
POST https://YOUR_APP.up.railway.app/api/cron
Authorization: Bearer CRON_SECRET
Content-Type: application/json

{"job":"open-status-window"}
```

Agent jobs: `open-status-window`, `close-status-window`, `deadline-sweep`, `weekly-reports`
(see the app's Agent page). Teams relay jobs live at `/api/teams/cron`: `teams-chase`,
`teams-reminder`, `teams-relay`, `teams-missed`, `teams-deadlines`, `teams-weekly`,
`teams-all`.

### Railway cron services

Railway cron **runs a service's start command on a schedule and expects the process to
exit** — it does not make an HTTP request. It therefore cannot be attached to the web
service, which never exits. Add a separate service per schedule, from the same repo, running
the one-shot trigger script:

| Setting | Value |
|----------|--------|
| Start command | `npm run cron:trigger` (Teams) or `npm run cron:trigger <job> /api/cron` |
| Cron schedule | e.g. `*/10 * * * *` |
| Variables | `APP_URL` (the web service's public URL) and `CRON_SECRET` (must match the web service) |

`scripts/trigger-cron.mjs` exits non-zero on any non-2xx, so a misconfigured secret or a
failing job shows up in that service's logs instead of failing silently. Constraints to plan
around: **5 minutes is the minimum interval**, **schedules are UTC**, and **a run is skipped
if the previous one is still executing**.

An external scheduler (GitHub Actions, cron-job.org, Upstash QStash, a crontab) is a fine
substitute — these are just authenticated POSTs.

## 6. Teams bot notes

If you are running the Teams agent, one Railway setting matters more than the rest:

> **Do not enable Serverless (app sleeping) on the web service.** It sleeps the app after
> ~10 minutes without traffic and the first request afterwards can cold-start slowly or 502.
> Teams expects a bot to acknowledge an activity within roughly 15 seconds, so a sleeping app
> shows up to users as a bot that ignores them.

The bot needs no extra hosting: it is `POST /api/teams/messages` inside this same service,
and the Dockerfile already ships `botbuilder` into the runner image. Point the bot
registration's messaging endpoint at `https://YOUR_APP.up.railway.app/api/teams/messages`,
and remember the endpoint changes if you move to a custom domain.

## 7. Checklist

- [ ] Postgres service linked; `DATABASE_URL` set  
- [ ] `AUTH_SECRET`, `CRON_SECRET` set  
- [ ] Public HTTPS URL in `NEXTAUTH_URL` + `APP_URL`  
- [ ] Migrate deploy succeeds in deploy logs  
- [ ] `/api/health` returns `{"ok":true}`  
- [ ] Login works  
- [ ] SMTP configured if you need real email  
- [ ] Cron service(s) created with `APP_URL` + matching `CRON_SECRET`, and a run has exited 0  

If you are using Teams as well:

- [ ] Serverless / app sleeping is **off** on the web service  
- [ ] `MICROSOFT_APP_*` set; `GET /api/teams/messages` returns `configured: true`  
- [ ] Bot messaging endpoint points at `/api/teams/messages` on the public domain  
- [ ] A real message to the bot gets a reply (no 401s in the logs)  
- [ ] Teams enabled for the company under **Dashboard → MS Teams**  
- [ ] A cron service is scheduled against `/api/teams/cron`  

## Notes

- Local SQLite (`dev.db`) is **no longer** used by the app schema. Old SQLite migrations are kept only under `prisma/migrations_sqlite_archive`.
- Do not commit production secrets.
