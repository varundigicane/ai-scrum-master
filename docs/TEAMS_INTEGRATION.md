# MS Teams AI agent

The Teams agent collects daily status inside Teams and relays blockers, missed
submissions, deadlines and weekly packs to your channels.

It is an **additive layer**. `src/lib/agent.ts`, `src/lib/email.ts`, `POST /api/cron` and
`POST /api/status/submit` are untouched, so the email chase and the web magic-link form
behave exactly as they did before. If Teams is misconfigured or the Bot Framework is down,
nothing else is affected — the bot simply stays quiet.

## How it fits together

```
POST /api/cron            (existing)  -> agent.ts -> StatusRequest rows + email
POST /api/teams/cron      (new)       -> relay.ts -> reads those rows -> Teams cards
POST /api/teams/messages  (new)       -> handler/commands -> status-write.ts -> DailyStatus
```

The relay only ever **reads** what the existing agent writes, which is why the two cron
routes need no coordination. Every send is deduped in `TeamsMessageLog`, so re-running any
job is safe.

## 1. Get a tenant first

**A personal Microsoft account cannot host this bot.** Outlook/Hotmail/Live accounts cannot
upload custom Teams apps at all — there is no admin centre, no app catalog and no
sideloading switch to turn on. It is an account-type limit, not a setting you can hunt down.
You need an organizational Microsoft 365 tenant. In increasing order of friction:

1. **An existing work tenant.** If your employer or client already runs M365, ask an admin
   to enable custom app upload for you. Cheapest path by far.
2. **Microsoft 365 E5 developer sandbox.** Still the nicest sandbox (25 seats, pre-seeded
   users), but **no longer freely granted**. It now requires a qualifying subscription — a
   Visual Studio Professional/Enterprise standard subscription, ISV Success, the AI Cloud
   Partner Program, or Premier/Unified Support. If you do not already hold one of those,
   skip to option 3 rather than spending an afternoon on the signup flow.
3. **A paid Business Basic seat.** Roughly a few dollars per user per month, buyable with a
   card in minutes, and it is a real tenant with a real admin centre. This is the guaranteed
   fallback and what to choose if options 1 and 2 do not apply.

Whichever you land on, custom app upload (sideloading) must be enabled — Teams admin centre
→ **Teams apps** → **Setup policies** → **Upload custom apps**. Verify from the CLI in
section 2 rather than guessing:

```bash
teams login
teams status     # must report: Sideloading: enabled
```

If it reports disabled, a tenant admin has to flip it; policy changes can take a few hours
to propagate.

## 2. Register the bot

The bot needs an identity (an Entra app) and a bot registration that relays Teams activities
to `POST /api/teams/messages`. **No Azure subscription is required** for this — the Teams
Developer CLI provisions a *Teams-managed* bot, which is the recommended path here because
nothing in this integration uses SSO.

### 2a. Teams-managed bot via the Teams CLI (recommended)

```bash
npm install -g @microsoft/teams.cli    # add @preview if the release tag lags
teams login

teams app create \
  --name "AI Scrum Master" \
  --endpoint https://<your-domain>/api/teams/messages \
  --json
```

Two things to know before you run it:

- The endpoint must be **public HTTPS** and must end in `/api/teams/messages` — that is our
  route, not the `/api/messages` the Microsoft samples use. Use your Railway domain for a
  real deployment, or a tunnel host for local work (section 10).
- Prefer `--json` over `--env .env` here. `--env` writes `CLIENT_ID`/`CLIENT_SECRET`/
  `TENANT_ID` into the file, which are not the names this app reads, so you would end up
  editing it anyway. `--json` prints them and leaves your `.env` alone.

The output carries a `teamsAppId`, a `botId`, an `installLink` and the credentials. Map them
onto our variables — the names do **not** line up one-to-one:

| CLI output | Our variable | Notes |
| --- | --- | --- |
| `credentials.CLIENT_ID` | `MICROSOFT_APP_ID` | Same value as `botId` |
| `credentials.CLIENT_SECRET` | `MICROSOFT_APP_PASSWORD` | Shown once |
| `credentials.TENANT_ID` | `MICROSOFT_APP_TENANT_ID` | Your directory id |
| — | `MICROSOFT_APP_TYPE` | Set to `SingleTenant` (see the check below) |
| `teamsAppId` | `TEAMS_APP_EXTERNAL_ID` | The Teams **app** id, distinct from the bot id |
| — | `GRAPH_TENANT_ID` | Optional; defaults to `MICROSOFT_APP_TENANT_ID` |

`teamsAppId` is also what belongs in the manifest's `id` field, and it is a *different* GUID
from `botId`. Keep the two straight or Graph install and the manifest will disagree.

Lost the install link? `teams app get <teamsAppId> --install-link`.

**Verify the credentials actually work**, because a wrong `MICROSOFT_APP_TYPE` fails silently
until the first real message:

```bash
curl https://<your-domain>/api/teams/messages
# {"ok":true,"configured":true,...}
```

`configured: false` means `MICROSOFT_APP_ID` or `MICROSOFT_APP_PASSWORD` is missing — that
check does not validate them, only that they are present. So now send the bot a real message
from Teams and watch the logs. If you see 401s from the Bot Framework, switch
`MICROSOFT_APP_TYPE` to `MultiTenant`, redeploy and try again; single-tenant auth is
stricter about the tenant claim and is the usual culprit.

### 2b. Azure Bot resource (alternative)

Take this route only if you need SSO or OAuth token services later, which a Teams-managed
bot cannot do. You can also start Teams-managed and move with `teams app bot migrate`.

1. Azure portal → **App registrations** → New registration. Single tenant is recommended.
2. **Certificates & secrets** → New client secret. Copy the value now; it is shown once.
3. Azure portal → **Azure Bot** → Create. Use the existing app registration as the identity.
4. On the bot resource, set **Messaging endpoint** to
   `https://<your-domain>/api/teams/messages`.
5. On the bot resource, **Channels** → add **Microsoft Teams**.

The variable mapping is the plain one: Application (client) ID → `MICROSOFT_APP_ID`, secret
value → `MICROSOFT_APP_PASSWORD`, Directory (tenant) ID → `MICROSOFT_APP_TENANT_ID`.

### 2c. Graph proactive install is optional

`TEAMS_APP_EXTERNAL_ID` and `GRAPH_TENANT_ID` only power the **Install for &lt;name&gt;**
button (section 5). Without tenant admin consent, leave them unset: users install the app
themselves from the CLI's install link and every other feature works unchanged.

## 3. Teams app package

The CLI authors its own minimal manifest, which has no `commandLists` and is personal-scope
only. So after section 2a, import ours to get the command menus and channel support back.

`teams/manifest.json` has two placeholders:

- `REPLACE_WITH_MICROSOFT_APP_ID` → your app id, in `id` and `bots[0].botId`. If you used
  the CLI, `botId` is `CLIENT_ID` and `id` is `teamsAppId`; they differ.
- `REPLACE_WITH_APP_DOMAIN` → your host, e.g. `your-app.up.railway.app`

Icons are generated (a plain teal mark — swap in real artwork when you have it):

```bash
npm run teams:icons
```

Zip the three files **at the root of the archive**, not inside a folder:

```bash
cd teams
zip ../ai-scrum-master-teams.zip manifest.json color.png outline.png
```

Then either import it in **Teams Developer Portal** → your app → **Import app package**
(the way to keep a CLI-created app and gain our `commandLists` and `team`/`groupChat`
scopes), sideload it (Teams → Apps → **Manage your apps** → **Upload a custom app**) for
quick testing, or upload it to **Teams admin center → Manage apps** to publish it to the org
catalog. The org catalog is required for proactive installation via Graph.

Whatever you do, `TEAMS_APP_EXTERNAL_ID` must equal the manifest's `id`.

## 4. Turn it on in the app

Sign in as CompanyAdmin, CEO or SVP and open **Dashboard → MS Teams**:

1. Tick **Enable the Teams agent for this company**.
2. Leave **Azure AD tenant id** blank to adopt the first tenant that messages the bot, or
   paste your directory id to pin it.
3. Set how many minutes before the window closes the reminder should go out.

Then message the bot in Teams. Say `hello` and it replies with the command list. That first
message is also what registers you, so you appear under **Linked people**.

## 5. Linking people

Every bot write is authorized by the Teams identity, never by the message text. A Teams
user must be linked to a `Resource` before they can submit anything.

- **Self-service:** if the user's Teams email matches an active `Resource.email`, the bot
  offers a confirmation card. The confirmation is re-verified server side against the Teams
  roster email, so a tampered card payload cannot link someone to an arbitrary person.
- **Admin:** pick the resource from the dropdown on **Dashboard → MS Teams**.

For people who have never opened the bot, use **Install for &lt;name&gt;**. That calls Graph
to install the app for them; Teams then sends an install event and the link appears by
itself. This needs the app in your org catalog and tenant admin consent for one of:

- `TeamsAppInstallation.ReadWriteSelfForUser.All`
- `TeamsAppInstallation.ReadWriteForUser.All`

Without that consent, users install the app themselves and everything else still works.

## 6. Channels

Add the app to a team or channel and mention it once. The conversation is captured and
appears under **Connected channels**, where you choose which notifications it receives and
optionally scope it to a single project. Notification types map one-to-one to the existing
email types: `status_submitted`, `status_blocker`, `status_missed`, `deadline_overdue`,
`deadline_approaching`, `weekly_project`, `weekly_company`.

## 7. Scheduling the relay

Nothing sends itself. `POST /api/teams/cron` has to be called on a schedule, separately from
your existing `/api/cron` schedule:

```bash
curl -X POST https://<your-domain>/api/teams/cron \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"job":"teams-all"}'
```

Every 5–10 minutes is right: the chase card then lands shortly after the email, reminders
fire near the window close, and blockers reach leads quickly. Individual jobs are also
available for debugging:

`teams-chase`, `teams-reminder`, `teams-relay`, `teams-missed`, `teams-deadlines`,
`teams-weekly`, `teams-all`.

**Dashboard → MS Teams → Run relay** does the same thing for your company only.

### On Railway

Railway cron does not fire an HTTP request — it **runs a service's start command on a
schedule and expects the process to exit**. So you cannot attach a schedule to the
long-running Next.js service; you add a *second* service that runs a one-shot script:

1. New service in the same project, same repo, same branch as the web service.
2. Start command: `npm run cron:trigger`
3. Cron schedule: `*/10 * * * *`
4. Variables on that service: `APP_URL` (the web service's public URL) and `CRON_SECRET`
   (identical to the web service's, or every call 401s). It needs no `DATABASE_URL` — it
   only makes an HTTP call.

`scripts/trigger-cron.mjs` POSTs the job with the bearer header, prints the response and
exits — non-zero on any non-2xx, so failed runs are visible in the Railway logs rather than
silently doing nothing. Defaults are `teams-all` against `/api/teams/cron`; both are
overridable, so the same service pattern schedules the original agent too:

```bash
npm run cron:trigger                              # teams-all -> /api/teams/cron
npm run cron:trigger teams-reminder               # one Teams job
npm run cron:trigger run-all-daily /api/cron      # the existing email agent
```

Three Railway behaviours worth knowing before you pick a schedule:

- **Five minutes is the floor.** Anything finer is rejected.
- **Schedules are UTC**, regardless of your company timezone.
- **A run is skipped if the previous one is still executing.** That is why the script always
  exits and self-aborts after `CRON_TIMEOUT_MS` (default 120s) instead of hanging.

Also: **leave Railway Serverless (app sleeping) off on the web service.** See
[RAILWAY.md](RAILWAY.md#teams-bot-notes).

An external scheduler (GitHub Actions `schedule`, cron-job.org, Upstash QStash, or a plain
crontab anywhere) works just as well — it is one authenticated POST. Use one if you would
rather not pay for a second Railway service.

You do **not** need to look up your tenant GUID to get started. `resolveCompanyId()` in
[`src/lib/teams/link.ts`](../src/lib/teams/link.ts) adopts the first tenant that messages the
bot when exactly one company has Teams enabled, so a fresh single-tenant setup can leave
**Azure AD tenant id** blank and let the first message pin it.

## 8. Free-text understanding (optional)

Set both to let people just describe their day:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AI_PARSE_ENABLED=true
```

"6h on ACME-12, 2h in meetings, blocked on VPN access" becomes a preview card that the
person confirms before anything is written. The model is only allowed to reference task ids
we hand it, and any hallucinated id is dropped. If the key is missing, the request fails, or
the output does not validate, the bot falls back to the Adaptive Card form. Every parse is
recorded under **Recent bot activity**.

## 9. Commands

Personal chat:

- `status` — open today's form (or edit an existing submission)
- plain language — parsed into a preview card when AI is on
- `my tasks` — open tasks with progress inputs
- `update ACME-3 70%` — set progress on one task
- `blocker <text>` — raise a blocker immediately
- `leave 2026-08-03 to 2026-08-05 <reason>` — request leave; leads get an approve/reject card
- `mute` / `unmute` — stop or resume DMs
- `help`

Project managers and above, anywhere:

- `standup` — today's submissions, hours, blockers
- `missing` — who has not submitted, with a nudge button
- `report project <name>` — metrics and RAG

## 10. Local development

Teams calls your bot from the internet, so `localhost` is unreachable — you need a tunnel.
With the Docker Compose stack (app on host port 3001):

```bash
npm run docker:up
devtunnel host -p 3001 --allow-anonymous    # or: ngrok http 3001
```

Point the messaging endpoint at `https://<tunnel-host>/api/teams/messages` — via `--endpoint`
on `teams app create`, or by editing it later in Teams Developer Portal (or on the Azure Bot
resource, if you took that route). Set `APP_URL` to the tunnel host so card links resolve, and
remember to point the endpoint back at Railway afterwards.

Relay jobs do not fire on their own locally either; trigger one by hand:

```bash
npm run cron:trigger              # APP_URL and CRON_SECRET from your .env
```

Verify the data paths without Teams at all:

```bash
npm run teams:smoke          # needs the database
npm run teams:smoke:adapter  # no database, no network
```

`teams:smoke` creates a throwaway status window, writes a status through the Teams path,
asserts the rows match what the web route produces (including the task rollup and item
replacement on edit), runs every relay job, and cleans up after itself.

`teams:smoke:adapter` checks the App Router shim around `CloudAdapter`: an unsigned
activity must come back as 401 and malformed payloads as 400, with the bot logic never
running. The stack traces it prints are the expected rejections, not failures.

## 11. Troubleshooting

| Symptom | Cause |
| --- | --- |
| `configured: false` from `GET /api/teams/messages` | `MICROSOFT_APP_ID` / `MICROSOFT_APP_PASSWORD` missing |
| Bot replies in Teams but 401s in logs | App type/tenant mismatch, or the secret expired |
| "This Teams tenant isn't connected…" | Teams not enabled for the company, or the pinned tenant id differs |
| "Your Teams account isn't linked…" | No `Resource` matches the Teams email; link it in the admin page |
| Nothing is sent, no errors | Nobody has a stored conversation yet (**DM ready** column is `no`), or everyone is muted |
| Nothing is sent and no relay ever ran | Nothing is calling `/api/teams/cron` — set up the schedule in section 7 |
| Bot ignores the first message, then works | Railway Serverless (app sleeping) is on; turn it off |
| Cron service runs once then never again | Its process did not exit, so Railway skips later runs — use `npm run cron:trigger`, not a server command |
| Cards arrive twice | Two schedules hitting `teams-all`; dedupe is per event, and an edited status intentionally re-notifies |

Known limitation inherited from the existing agent: `windowBounds()` in
`src/lib/agent.ts` computes the window in server-local time and ignores
`Company.timezone`, so Teams reminders share that offset. Fixing it means changing
`agent.ts`, which this integration deliberately leaves alone.
