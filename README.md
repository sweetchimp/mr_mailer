# Mr Mailer

Turns your inbox into a clear plan — surfacing what needs a reply, what's worth
a glance, and what's just FYI.

Connects to Google or Microsoft, pulls your recent mail, has Groq summarize and
triage each message, and gives you a six-bucket dashboard to work through.

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router, standalone output), React 19, Tailwind 4 |
| Database | MySQL 8 via Prisma 6 |
| Queue | BullMQ on Redis 7 |
| AI | Groq (`llama-3.3-70b-versatile`) |
| Auth | OAuth 2.0 + PKCE, sessions signed as JWTs with `jose` |
| Tests | Vitest |

## Getting started

### 1. Prerequisites

- Node 20+
- Docker Desktop (for MySQL and Redis)

### 2. Start MySQL and Redis

```bash
docker compose up -d mysql redis
```

This publishes MySQL on `localhost:3306` and Redis on `localhost:6379`, which
matches the defaults in `.env.example`. You do not need the `web` or `worker`
compose services for local development — run the dev server directly instead.

### 3. Configure the environment

```bash
cp .env.example .env
```

Then fill in real values for every credential. See
[Environment variables](#environment-variables) below.

### 4. Create the database schema

```bash
npx prisma db push
```

> **Use `db push`, not `migrate deploy`.**
> `prisma/migrations/20260924000000_init/migration.sql` is a squashed migration
> containing `CREATE TABLE` for all nine models. It is correct for a *fresh*
> database. If you are pointing at a database that was built by the 13 separate
> migrations from before the Next.js migration, every statement will fail with
> "table already exists" — use `db push` there, or recreate the database.
>
> There is currently no local development seed data. The dashboard only ever
> renders real mail.

### 5. Register your OAuth redirect URIs

Both providers need a loopback redirect URI registered, or the callback will
fail after you consent:

- `http://localhost:3000/auth/google/callback`
- `http://localhost:3000/auth/microsoft/callback`

Google requests `gmail.readonly`, `gmail.send`, and `calendar.readonly`.
Microsoft requests `Mail.Read`, `Mail.Send`, and `offline_access`.

### 6. Run it

```bash
npm run dev
```

Open <http://localhost:3000>, sign in, and the post-login digest runs inline —
it fetches your recent mail, calls Groq, and writes the summaries the dashboard
reads. Give it a few seconds to populate.

To also run the scheduled jobs (daily digest cron, and eventually snooze
reminders) in a second terminal:

```bash
npm run worker
```

The worker is optional for browsing. Without it, "Refresh now" and snoozing
still work as long as Redis is up — those enqueue jobs, but nothing consumes
the reminder queue yet.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build (`output: "standalone"`) |
| `npm start` | `next start`. Note this app is configured for `output: "standalone"`, which is what the Dockerfile and Railway use — see below |
| `npm run worker` | BullMQ worker — repeatable job scheduler and job processors |
| `npm test` | Vitest, single run |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

Because `next.config.ts` sets `output: "standalone"`, the deployable server
bundle is built as a self-contained app. To smoke-test a production build
locally, run the standalone server rather than relying on `next start`:

```bash
npm run build
node .next/standalone/server.js
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string |
| `REDIS_URL` | Redis connection string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `GOOGLE_REDIRECT_URI` | Must match the URI registered in the Cloud Console |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft app credentials |
| `MICROSOFT_TENANT_ID` | `consumers`, `common`, `organizations`, or a tenant GUID |
| `MICROSOFT_REDIRECT_URI` | Must match the URI registered in Entra |
| `GROQ_API_KEY` | Groq API key used for summarization |
| `SESSION_SECRET` | Signs session JWTs **and** encrypts stored OAuth tokens. Generate a random 32+ character value. The app refuses to start in production if it is missing or too short. |
| `RETENTION_DAYS` | How long to keep email history (default 90) |

> `SESSION_SECRET` is deliberately dual-purpose. Changing it invalidates every
> stored OAuth token, so users will have to reconnect their mailbox. Do not
> rotate it casually.

## Architecture notes

### Server actions, not API routes

Mutations are Next.js server actions in `src/app/dashboard/actions.ts`
(`sendReplyAction`, `dismissAction`, `snoozeAction`, `refreshDigestAction`).
There are no `/api/emails/:id/*` routes.

Every mutating action resolves the target `EmailSummary` through
`findOwnedSummary`, which scopes the lookup to the authenticated user's id. This
is a security boundary, not a convenience — an unscoped lookup would let any
logged-in user act on another user's mail.

### The `status = SENT` transition lives in the action

Email providers deliberately do *not* mark a summary as sent. They only perform
the provider call. The action does the status change, so Microsoft Graph replies
are marked as sent the same way Gmail replies are.

### `gmailMessageId` holds a provider id

`EmailSummary.gmailMessageId` stores the provider's own message identifier
(Gmail API id, or Graph id for Microsoft) — **not** the RFC 5322 `Message-ID`
header. Provider APIs expect the former. `EmailMessage.id` is the provider id;
`EmailMessage.messageId` is the header. Mixing them up yields 404s that degrade
silently.

### Queues are constructed lazily

`src/services/queue.server.ts` exposes `getMorningDigestQueue()` and friends
rather than module-level `Queue` instances, because that module is imported by
the dashboard server actions and the OAuth callback. Eager construction meant
every web process — and every `next build`, which imports route modules to
collect page data — opened a Redis connection whether or not a job was ever
enqueued.

### Theming

`src/app/layout.tsx` renders a small blocking script that applies the persisted
theme before first paint, so there is no flash of the wrong theme. Because it
mutates `<html>` before React hydrates, that element carries
`suppressHydrationWarning`. The storage key is `mr-mailer-theme` and must stay
in sync with `src/components/theme-switcher.tsx`.

## Not implemented yet

These are known gaps, not bugs:

- `/schedule`, `/minutes`, and `/admin/job-failures` routes do not exist. The
  matching services (`schedule.server.ts`, `minutes.server.ts`,
  `meeting-reminder.server.ts`) are present but unwired.
- Three BullMQ queues are declared with **no consumer**: `email-reminder`,
  `meeting-reminder`, and `schedule-block`. Snoozing an email enqueues an
  `email-reminder` job, but nothing currently sends the notification. Only
  `morning-digest` is processed, by `src/worker.ts`.
- `src/lib/diff.server.ts` is ported and tested but currently unused.

## Deployment

Railway builds the `Dockerfile` and runs `node server.js` from the Next
standalone output. The image also carries `src/` and `tsconfig.json` so the
same container can run the worker via `docker run mr-mailer npm run worker`.

```bash
docker compose up -d        # mysql, redis, web, worker
```

> **Existing databases:** the squashed `20260924000000_init` migration will fail
> against a database created by the pre-migration migrations. See step 4.
