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
| AI | Groq (`openai/gpt-oss-120b` by default, overridable via `GROQ_MODEL`) |
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

> **Use `db push` for local development, `migrate deploy` for production.**
> `prisma/migrations/20260924000000_init/migration.sql` is a squashed migration
> generated straight from the current `schema.prisma`, so `prisma migrate deploy`
> against an *empty* database produces the complete current schema. Prefer it
> anywhere you control the database — see [Deployment](#deployment).
>
> It is not safe against an already-populated database, for two reasons: a
> database built by the 13 separate migrations from before the Next.js migration
> replays every statement with "table already exists", and a database created by
> `db push` has no applied-migration history at all — `migrate status` reports
> every migration as pending, and `migrate deploy` tries to create all ten
> tables from scratch. That is the case for the local development database. Use
> `db push` there, or drop and recreate the database.
>
> Regenerate the squashed migration after a schema change with:
>
> ```bash
> npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
>   -o prisma/migrations/20260924000000_init/migration.sql
> ```
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

To also run the scheduled jobs (daily digest cron, data cleanup, and snooze
unsnoozing) in a second terminal:

```bash
npm run worker
```

The worker is optional for browsing. Without it, "Refresh now" enqueues digest
jobs but nothing processes them until the worker is up, and emails snoozed with
an earlier `snoozedUntil` stay SNOOZED past their time (the unsnooze consumer
lives in the worker).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build (`output: "standalone"`) |
| `npm start` | `node .next/standalone/server.js` — the standalone production server. There is no `next start` here; see the smoke-test note below |
| `npm run worker` | BullMQ worker — repeatable job scheduler and job processors |
| `npm test` | Vitest, single run |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:deploy` | `prisma migrate deploy` — applies `prisma/migrations` to `DATABASE_URL` |

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
| `GROQ_MODEL` | Groq model to use (default `openai/gpt-oss-120b`; models retire without notice, so prefer the env override over hardcoding) |
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

- `/schedule` does not exist. Early notes in this README claimed
  `schedule.server.ts` and `meeting-reminder.server.ts` were "present but
  unwired" — those files were never written. (`minutes.server.ts` has since been
  written; `/minutes` is live.)
- Two BullMQ queues are declared with **no consumer**: `meeting-reminder` and
  `schedule-block`. Snoozing does work end to end today: `snoozeAction` enqueues
  an `email-reminder` job and `src/worker.ts` consumes it, unsnoozing the email
  when `snoozedUntil` passes. That is the only in-app behavior; no outbound mail
  is sent on unsnooze.
- `src/lib/diff.server.ts` is ported and tested but currently unused.

## Deployment

Two processes make up a running deployment, and both are needed. `web` serves
the UI and enqueues jobs; `worker` is the only thing that runs the digest cron,
the weekly digest, the nightly cleanup, and the snooze unsnoozing. A deployment
with only `web` looks healthy — sign-in works, the dashboard renders — but
nothing is ever summarized and snoozes never expire, because "Refresh now"
enqueues into a queue nobody drains.

The build itself is hermetic: fonts are vendored in `src/app/fonts`, and the
session-secret and Groq clients are constructed lazily, so `next build` in a
fresh image never needs `.env` or network egress to build.

### Pre-deploy checklist

- [ ] `SESSION_SECRET` — `openssl rand -base64 48`. The app throws at boot in
      production if it is missing, too short, or set to a known placeholder
      (`change-me`, `secret`, …). It is dual-purpose: it signs session JWTs *and*
      derives the AES key that stored OAuth tokens are encrypted with. **Never
      rotate it casually** — doing so invalidates every stored token and forces
      all users to re-authenticate.
- [ ] `APP_BASE_URL` — this app's public origin, no trailing slash, e.g.
      `https://<your-domain>`. Both OAuth callbacks are **derived** from it as
      `<APP_BASE_URL>/auth/google/callback` and
      `<APP_BASE_URL>/auth/microsoft/callback`, and each must be registered with
      its provider exactly that way (a mismatch surfaces as
      `redirect_uri_mismatch`). Required in production; validated at startup, so
      a missing or malformed value fails immediately with the variable's name
      rather than at the provider. Set it on `web` only — the worker never builds
      a callback URL. The former `GOOGLE_REDIRECT_URI` and
      `MICROSOFT_REDIRECT_URI` variables are no longer read.
- [ ] OAuth redirect URIs registered with the providers, matching the derived
      values above exactly:
      - `https://<your-domain>/auth/google/callback`
      - `https://<your-domain>/auth/microsoft/callback`
- [ ] `TZ=Europe/Budapest` on **both** services. Node defaults to UTC in the
      image, which silently shifts the 07:00 digest and every meeting time by
      hours — the worker pins `Intl…resolvedOptions().timeZone` into each cron
      schedule (`src/worker.ts`), so the container has to match the app's home
      timezone.
- [ ] Schema applied to the production database: `npm run db:deploy`. See
      "Applying the schema" below for why this is a manual step.
- [ ] `GROQ_API_KEY` set, and `GROQ_MODEL` overridden if your key cannot reach
      the default — Groq retires models without notice.

### Railway

`railway.json` points Railway at the Dockerfile and deliberately sets **no**
`startCommand`, so the image's `CMD ["npm", "start"]` runs. An earlier version
set `node server.js`, which does not exist at the image root — the standalone
server is at `.next/standalone/server.js` — so the service would crash-loop on
boot.

Create four services:

| Service | Source | Start command | Notes |
|---|---|---|---|
| `web` | this repo | *(none — Dockerfile `CMD`)* | The only service that should be publicly exposed |
| `worker` | this repo | `npm run worker` | Set in the Railway dashboard, not in `railway.json`, because both services build the same Dockerfile and one repo-root config cannot give them different commands |
| MySQL | Railway plugin | — | Wire `DATABASE_URL` by reference variable |
| Redis | Railway plugin | — | Wire `REDIS_URL` by reference variable |

The worker needs the same secrets as `web`: it decrypts stored OAuth tokens
(`SESSION_SECRET`) and calls Groq. Set them at the project level, or on both
services, rather than only on `web`. `APP_BASE_URL` is the one exception — the
worker never builds a callback URL, so it does not need it.

#### OAuth callbacks

`APP_BASE_URL` is the single source for both callback URLs, set on `web`:

```text
<APP_BASE_URL>/auth/google/callback
<APP_BASE_URL>/auth/microsoft/callback
```

It replaces the previous pair of `GOOGLE_REDIRECT_URI` and
`MICROSOFT_REDIRECT_URI` variables, which are now ignored. Two independently
configured URLs could drift apart, and a *missing* one failed silently at the
provider rather than here — `URLSearchParams` stringifies `undefined` into the
literal text `"undefined"`, which Google forwards as a value and Microsoft
rejects as not an absolute URI (`AADSTS90102`). Neither error mentions the
variable that was actually missing.

It is validated at startup (`src/lib/env.server.ts`): it must be an absolute
`https://` URL, `http://` is accepted only for localhost, and a trailing slash
is rejected. Anything else throws naming `APP_BASE_URL` before the first sign-in
attempt.

#### Redirects and the proxy

`APP_BASE_URL` also supplies the origin for **every** redirect this app issues:
the middleware guard to `/login`, and both OAuth callbacks to `/dashboard` or
`/login?error=...`. They are built with `appUrl()` and must never be built from
`request.url`.

Behind Railway, `request.url` is the *container's* address, not the public one.
Next's standalone server seeds its own origin from the bind address it was
started with, so with `ENV HOSTNAME=0.0.0.0` (required — see `Dockerfile`) and
Railway's `PORT=8080`, it believes it is `http://0.0.0.0:8080`. Every
request-derived redirect therefore produced a well-formed URL to an unroutable
address: login succeeded and the browser failed with `ERR_ADDRESS_INVALID` on a
blank page. The token exchange was never at fault.

Relative redirects from `redirect()` — the logout handler, `requireUser()`, the
dashboard and minutes server actions — are unaffected. Next returns those to the
client router as an app-relative `x-action-redirect`, so the browser resolves
them against the address bar and the proxy never enters into it. Only the
absolute `Location` headers were ever at risk, which is why the fix is confined
to the six call sites listed above.

Because middleware now reads this variable, a missing or malformed
`APP_BASE_URL` fails `/dashboard`, `/minutes`, `/admin`, `/insights` and
`/weekly-summary` loudly rather than silently redirecting somewhere unroutable.
That is deliberate, and it is why the pre-deploy checklist above is not optional.

`healthcheckPath` is `/`, which is the landing page. It touches the database
only when a session cookie is present, so it stays healthy without a working
`DATABASE_URL` and reports unhealthy if the app itself fails to boot.

#### Applying the schema

```bash
DATABASE_URL="mysql://user:pass@host:3306/mr_mailer" npm run db:deploy
```

Run this from a machine with dev dependencies, not from the deployed image: the
runtime stage is `npm ci --omit=dev`, so the image has no `prisma` CLI at all.
It is idempotent, so re-running it on every deploy is safe.

The inline `DATABASE_URL` takes precedence over `.env` — Prisma's dotenv load
does not overwrite variables already in the environment — so the command above
targets the database you named even when a local `.env` points somewhere else.

On PowerShell the `VAR=value cmd` prefix is bash and does not work: PowerShell
parses it as a single literal argument and hands it to npm, so the migration runs
happily against whatever `.env` points at instead. Set the variable first, as a
separate statement:

```powershell
$env:DATABASE_URL = "mysql://user:pass@host:3306/mr_mailer"
npm run db:deploy
```

Percent-encode the password if it contains any URL-reserved character
(`@ : / ? # [ ] %`), which managed providers generate without warning. An
unescaped `@` truncates the password mid-URL and surfaces as `P1000
Authentication failed`, which reads like wrong credentials and is not:

```powershell
[uri]::EscapeDataString('p@$$w0rd')   # p%40%24%24w0rd
```

`prisma migrate deploy` also needs `CREATE, DROP, REFERENCES, ALTER` on the
target database, which is more than `db push` requires — a read-only or
`SELECT`-only user fails partway rather than up front. Check the applied state
with `npx prisma migrate status` before and after; it is read-only and reports
whether the database is in sync without writing anything.

MySQL DDL is not transactional, so a migration that fails partway leaves tables
behind and a re-run then fails differently because those tables already exist.
On a disposable database the clean recovery is to drop and recreate it and re-run
`db:deploy`; `npx prisma migrate resolve --rolled-back 20260924000000_init` is
the surgical alternative when the database has data you want to keep.

### Self-hosted (Docker Compose)

```bash
docker compose up -d        # mysql, redis, web, worker
```

The `web` and `worker` compose services build the same image and read `env_file:
.env` at run time (secrets are never baked into the image). `npm start` runs the
Next standalone server at `.next/standalone/server.js`, and the worker entrypoint
runs `npm run worker` (`tsx src/worker.ts`). Compose sets these two settings for
you, which a non-compose deploy has to set itself:

- `HOSTNAME=0.0.0.0` — without it the standalone server binds loopback *inside*
  the container and the published port maps to nothing, so the app appears to
  hang with no error in the logs.
- `TZ=Europe/Budapest` — as above.

> **Existing databases:** the squashed `20260924000000_init` migration will fail
> against a database created by the pre-migration migrations, or one created by
> `db push` from an older `schema.prisma`. See step 4.
