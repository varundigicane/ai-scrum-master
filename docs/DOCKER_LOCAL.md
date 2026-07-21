# Local Docker Desktop (Railway-parity)

Runs the same **Postgres + production Next.js** stack as Railway on Docker Desktop.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (Linux containers)

## Start

```bash
cd ai-scrum-master
npm run docker:up
# or: docker compose up --build -d
```

Wait until healthy, then:

```bash
npm run docker:seed
```

Open [http://localhost:3001](http://localhost:3001)

**Demo login:** `admin@acme.local` / `password123`

## Useful commands

| Command | Purpose |
|---------|---------|
| `npm run docker:up` | Build and start `db` + `web` |
| `npm run docker:down` | Stop containers |
| `npm run docker:logs` | Follow web logs |
| `npm run docker:seed` | Seed demo data inside `web` |
| `curl http://localhost:3001/api/health` | Expect `{"ok":true,"db":"up"}` |

## How it maps to Railway

| Local Compose | Railway |
|---------------|---------|
| `db` (Postgres 16, host port **5433**) | Railway Postgres plugin |
| `web` (Dockerfile, host port **3001**) | Web service from same Dockerfile |
| `command`: migrate + start | `railway.toml` preDeploy migrate + `npm start` |
| Env in `docker-compose.yml` | Railway service variables |

Local migrate-on-start is a **compose `command` override** only — the image `CMD` remains `npm run start` for Railway.

Compose sets `PGSSLMODE=disable` because local Postgres has no SSL. Railway should omit that (or use `require`) so managed Postgres SSL still works.

## Dev without full stack image

Postgres only + Next on the host:

```bash
npm run db:up
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```
