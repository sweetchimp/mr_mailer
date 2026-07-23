# Mr Mailer

Your morning intelligence, simplified. An AI-powered email assistant that fetches your Gmail, summarizes emails with AI, and helps you reply faster.

## Features

- Google OAuth authentication (Gmail)
- Scheduled daily email digest
- AI-powered email summarization (Groq)
- AI-generated reply suggestions
- Priority classification (HIGH / MEDIUM / LOW)
- Reply feedback tracking (diff between AI suggestion and user edits)
- Automatic data retention cleanup
- Token revocation detection with re-auth UI
- Job failure logging and admin dashboard

## Tech Stack

- React Router v8 (SSR)
- Prisma ORM + MySQL/MariaDB
- BullMQ + Redis (job queue)
- Groq SDK (AI)
- Vitest (testing)
- Tailwind CSS v4
- Vite 8

## Local Development

### Prerequisites

- Node.js 20+
- Docker (for MySQL)

### Setup

```bash
# Install dependencies
npm install

# Start MySQL
docker compose up -d

# Set up environment
cp .env.example .env
# Edit .env with your Google OAuth credentials, Groq API key, etc.

# Run database migrations
npx prisma db push

# Start development server
npm run dev
```

The app runs at `http://localhost:3000`.

### Running the Worker

The background worker processes daily email digests and cleanup jobs:

```bash
npm run worker
```

## Hosted Database Setup

Mr Mailer works with any MySQL-compatible hosted database. Update `DATABASE_URL` in your `.env`:

### Railway MySQL

```
DATABASE_URL=mysql://user:password@host:3306/mr_mailer?allowPublicKeyRetrieval=true
```

### PlanetScale

```
DATABASE_URL=mysql://user:password@aws.connect.psdb.cloud/mr_mailer?sslaccept=strict
```

### Neon (MySQL mode)

```
DATABASE_URL=mysql://user:password@ep-xxx.us-east-2.aws.neon.tech/mr_mailer?sslaccept=strict
```

After updating `DATABASE_URL`:

```bash
npx prisma db push
npx prisma generate
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MySQL/MariaDB connection string |
| `REDIS_URL` | Yes | Redis connection string (for job queue) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback URL (e.g., `http://localhost:3000/auth/google/callback`) |
| `GROQ_API_KEY` | Yes | Groq API key for AI summarization |
| `SESSION_SECRET` | Yes | Random 32+ char string for session encryption |
| `RETENTION_DAYS` | No | Days to keep records (default: 90) |
| `STRIPE_SECRET_KEY` | No | Stripe key (Phase 9) |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook secret (Phase 9) |

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

Tests cover:
- Token refresh (expired, valid, success, failure, revocation)
- AI summary parsing (valid, malformed, empty, missing fields)
- Reply sending (success, API failure, missing summary)
- Diff computation (insertions, deletions, modifications)

## Data Retention

Old records are automatically cleaned up by the worker's daily `data-cleanup` job (runs at 03:00 UTC). Configurable via `RETENTION_DAYS` env var (default: 90 days).

Deleted records:
- `EmailSummary` older than retention period
- `JobFailure` older than retention period

## Token Revocation

If a user revokes Gmail access:
1. `invalid_grant` error is detected during token refresh
2. User's `tokenRevokedAt` timestamp is set
3. Dashboard shows a re-auth banner with a "Reconnect Gmail" link
4. Worker skips retries for revoked tokens

## Worker Deployment

The worker runs as an independent process. Deploy it alongside or separately from the web server.

### Railway / Render / Fly.io

Create a separate service running:

```bash
npm run build
npm run worker
```

### Docker

```bash
docker build -t mr-mailer-worker .
docker run -e DATABASE_URL="..." -e REDIS_URL="..." mr-mailer-worker npm run worker
```

### Health Logging

The worker logs health status every 5 minutes:
```
[2026-07-23T10:00:00.000Z] [Worker] Health: uptime=300s, processed=12, failed=0
```

### Graceful Shutdown

The worker handles `SIGTERM` and `SIGINT` signals, closing all connections before exiting.

## Dependency Maintenance

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Check for outdated packages
npm outdated
```

Recommended: run quarterly as part of maintenance.

## Project Structure

```
app/
  components/       # React components
  lib/              # Shared utilities
    auth.server.ts      # Session + OAuth authenticator
    crypto.server.ts    # Encryption/decryption
    diff.server.ts      # Text diff computation
    google-auth.server.ts # Token management
    prisma.server.ts    # Database client
    redis.server.ts     # Redis connection
    session.server.ts   # Session helpers
    utils.server.ts     # Shared utilities
  middleware/        # React Router middleware
    auth.server.ts      # Auth middleware
  routes/           # Page routes
  services/         # Business logic
    ai.server.ts        # Groq AI summarization
    cleanup.server.ts   # Data retention cleanup
    digest.server.ts    # Email digest pipeline
    email-provider.server.ts # Email provider interface
    gmail.server.ts     # Gmail API integration
    queue.server.ts     # BullMQ queue setup
    reply-feedback.server.ts # Reply feedback storage
  worker.ts         # Background worker entry point
prisma/
  schema.prisma     # Database schema
  migrations/       # SQL migrations
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run worker` | Start background worker |
| `npm test` | Run test suite |
| `npm run typecheck` | Type-check the codebase |
| `npm audit` | Check for vulnerabilities |
| `npm audit fix` | Fix vulnerabilities |
| `npm outdated` | Check for outdated packages |
