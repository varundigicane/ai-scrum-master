# Deploy AI Scrum Master on Railway

## What changed for Railway

- Database provider is **PostgreSQL** (required on Railway; SQLite is archived under `prisma/migrations_sqlite_archive`)
- Prisma client uses `@prisma/adapter-pg` + `pg`
- [`railway.toml`](../railway.toml) — build, pre-deploy migrate, health check
- [`/api/health`](../src/app/api/health/route.ts) — DB readiness probe
- Auth.js `trustHost: true` for Railway HTTPS proxy

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

Schedule an external cron (or Railway cron plugin) to POST:

```http
POST https://YOUR_APP.up.railway.app/api/cron
Authorization: Bearer CRON_SECRET
Content-Type: application/json

{"job":"open-status-window"}
```

Other jobs: `close-status-window`, `deadline-sweep`, `weekly-reports` (see app Agent page / docs).

## 6. Checklist

- [ ] Postgres service linked; `DATABASE_URL` set  
- [ ] `AUTH_SECRET`, `CRON_SECRET` set  
- [ ] Public HTTPS URL in `NEXTAUTH_URL` + `APP_URL`  
- [ ] Migrate deploy succeeds in deploy logs  
- [ ] `/api/health` returns `{"ok":true}`  
- [ ] Login works  
- [ ] SMTP configured if you need real email  

## Notes

- Local SQLite (`dev.db`) is **no longer** used by the app schema. Old SQLite migrations are kept only under `prisma/migrations_sqlite_archive`.
- Do not commit production secrets.
