# Flowline — private beta runbook

## Current supervised execution (2026-09-30)

Follow [BETA_EXECUTION_BRIEF.md](BETA_EXECUTION_BRIEF.md), [BETA_EXECUTION_STATUS.md](BETA_EXECUTION_STATUS.md) and [OWNER_ACTIONS.md](OWNER_ACTIONS.md). The historical VPS/direct-ingress examples below are reference procedures, not authority to deploy or expose anything. Preferred host is the existing owner Raspberry Pi; verify it read-only after approval, preserving other projects. Plan a named persistent Cloudflare Tunnel on the approved beta subdomain, with exact DNS/exposure/deployment approval before changes. No domain, host, architecture-specific digest or actual beta URL is verified yet.

Use cloud AI only, configured through each workspace's Settings → AI Providers. Platform service credentials use protected /admin. Infrastructure bootstrap keys use approved protected operator storage. Never put setup codes, beta codes, secrets, OTPs or keys in command arguments, chat, logs, traces or screenshots; examples below that put a code in a command must not be executed unchanged. The real owner enrolls MFA privately. Resolve the actual migration journal and fresh-install/upgrade path; the historical migration range is not an instruction to hard-code it.

Deployment approval must identify host/domain, exact SHA/digest/architecture, services/DNS/tunnel, data/backup/rollback, cost, invite-only mode and sandbox billing. Test an off-device backup and clean restore, rollback and dependency compatibility on the actual architecture. Laptop checks and old `flowline:e42667d` results do not certify the new artifact or Pi. Keep one web instance and conservative workers; no public DB/Docker/debug/internal ops endpoints, no automatic provider actions and no real invitations.

For new browser gates: build once, establish readiness, then Chromium → Firefox → WebKit with one runner/worker at a time. No heavy suite/build/exploration overlap. Record owner/PID/build/ports/log/stop command; stop on unsafe available/committed memory. During login/MFA/CAPTCHA/secret entry/sensitive consent stop affected-browser automation and recording, display the binding handoff block, and resume only after the owner replies.

Current laptop staging: http://localhost:3000, fresh flowline_beta_local20260930/schema20, cp21 build F6m0LaSa_-jaq5hCKtlY3, local DB outbox, invite-only, sandbox billing unconfigured, worker1. Supervised exec session66698 owns web/worker; stop with write_stdin stop plus newline. Root keys/config and named setup code are ACL-protected and Git-ignored. Owner signup verification consumed the real /api/email endpoint without changing the DB directly or exposing tokens. Owner MFA remains private. This installation predates cp22 fixes and does not certify external mail delivery or Pi deployment. Owner permits direct named secret transfer only into intended masked fields; password/MFA and consequential approval handoffs remain.

The remainder is preserved operational reference; deployments, invitations and secret-printing examples require the binding brief's boundaries and separate approvals.

The operator's guide for the **invitation-only private beta** (2–5 invited users). This is **not production**: no
public sign-up, no live payments, one host. Every command below uses files in this repository.

## 1. What runs where

| Service (`deploy/beta/docker-compose.beta.yml`) | Role | Exposed? |
|---|---|---|
| `caddy` | TLS (Let's Encrypt, automatic) + reverse proxy for `BETA_DOMAIN` | **only** 80/443 |
| `web` | Next.js app (release image) | internal network only |
| `worker` | runs, agents, knowledge indexing, schedules, retention | internal only |
| `migrate` | one-shot, expand-only migrations | internal only |
| `db` | PostgreSQL 17 (volume `beta-pg`) | internal only (never published) |
| `backup` | nightly `pg_dump -Fc`, retention `BACKUP_RETENTION_DAYS` | internal only |
| `monitor` | polls health + `/api/ops/status`, alerts to `FLOWLINE_ALERT_WEBHOOK_URL` | internal only |

The proxy returns 404 for `/api/test/*`, `/api/debug/*`, `/api/ops/*` and dev endpoints. Test-only routes also
refuse to run unless `FLOWLINE_ENV=test`, and the beta runs with `FLOWLINE_ENV=beta`.

The owned ingress applies route-specific body caps (16 KiB public email/beta, 64 KiB auth, 1 MiB default, with explicit webhook/credential/upload budgets), a 10-second absolute body-read deadline (90 seconds, absolute, only on the exact files and knowledge upload routes, sized for a 5 MiB body at 512 kbit/s) and a 5-second header deadline. It enables HTTP/1.1 and HTTP/2; HTTP/3 is disabled because Caddy 2.10 does not carry these read deadlines into its HTTP/3 server. Exact paths, application safeguards and hosting requirements are in [REQUEST_BODY_LIMITS.md](../security/REQUEST_BODY_LIMITS.md). The PR #16 follow-up is source/unit-checked only; these new ingress controls have not been runtime-validated with Caddy or deployed.

Before deployment, validate/adapt this file with the selected Caddy 2.10 image and test byte boundaries, chunked overflow, stalled/slow-drip uploads (about 10 s cut-off on ordinary routes, about 90 s on the upload routes, which proves the per-request `read_timeout` replaces the global one), a slow 5 MiB upload paced at about 64,000 B/s, and valid multipart bodies on both enabled protocols. Verify direct web access is blocked. An approved tunnel/CDN must preserve this ingress path and enforce client-side upload/header deadlines before forwarding; targeting `web:3000` bypasses these controls. Its trusted-peer/client-IP configuration must also be verified separately before relying on per-IP admission.

Port 80 has an explicit 308 HTTPS redirect site so it receives the global read deadlines too; verify redirect behavior and incomplete-header timeouts on both public TCP listeners when accepting the deployment.

**Topology (P4-13):** one web instance and one worker. Rate limits live in PostgreSQL (a sliding window, global), so
adding web instances later wouldn't loosen them, but the beta deliberately runs a single web instance.

## 2. First deployment

Prerequisites from the owner: a VPS (≥2 vCPU / 4 GB RAM / 40 GB disk, Docker + compose plugin, SSH), a DNS A/AAAA
record `beta.<domain>` → the VPS, and the provider accounts listed in `.env.beta.example`.

```bash
# on your machine
docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t flowline:<sha> .
docker save flowline:<sha> | ssh beta 'docker load'            # or push to a private registry
scp -r deploy/beta beta:/opt/flowline/
# on the server
cd /opt/flowline && cp .env.beta.example .env.beta && chmod 600 .env.beta   # fill in; generate secrets fresh
FLOWLINE_IMAGE=flowline:<sha> docker compose -f docker-compose.beta.yml --env-file .env.beta up -d --wait
curl -fsS https://beta.<domain>/api/health          # revision = <sha>, db ok, worker ok
node scripts/release/smoke.mjs --base https://beta.<domain> --invite <beta code>   # from your machine
```

Firewall: allow 22 (your IP only), 80 and 443. Nothing else.

## 2a. Platform admin and service credentials

Service credentials (sign-in apps, integration OAuth apps, email, sandbox billing, the recipient allowlist, billing
plans) are entered in the app at **`/admin`**, not in `.env.beta`. Details: `docs/security/CREDENTIALS_DESIGN.md`,
`docs/integrations/CONNECTING.md`.

**In the app (after the one-time bootstrap below):** sign in → `/admin` → enter an authenticator code under
**Unlock changes** → fill each card (client id / sender / client token + secret) → **Save** → **Test**. Register the
redirect URIs the panel shows. Rotation, revocation and provider changes apply to the next operation — no restart.

**Bootstrap the first admin (operator, once):**

1. Set `FLOWLINE_PLATFORM_ENCRYPTION_KEY` in `.env.beta` (32 random bytes, base64, **different** from
   `FLOWLINE_ENCRYPTION_KEY`; back it up with the other keys, separately from DB backups). Restart once.
2. On the server: `docker compose exec web node_modules/.bin/tsx scripts/admin/bootstrap.mts --email you@example.com`.
   It prints a one-time code (30 minutes, single use, bound to that email; only its hash is stored).
3. Open `https://beta.<domain>/admin/setup`, paste the code. If email isn't configured yet, the setup page lets you
   configure the email provider first — until setup completes it delivers only to that email.
4. Sign up / sign in as that email and verify it; enrol an authenticator app on the setup page; enter a fresh code →
   you are the platform admin. Setup is then closed for good (deleting admins doesn't reopen it).
5. More admins: `… bootstrap.mts --email other@example.com --grant`. Lost access: `… --recover --confirm-recovery`
   (audited). Revoke admins in the panel.

**Upgrading an installation that used env vars:** keep the old variables for now; in `/admin`, choose **Import from
environment** on each card and setting (explicit, audited, once per purpose); then remove the variables the panel
lists under "Remove these variables" and restart. Until `FLOWLINE_EMAIL_ALLOWED_RECIPIENTS` is imported, no email is
sent (the sandbox is never silently widened).

**Crypto v2 migration and key rotation:** after deploying this release, run
`docker compose exec web node_modules/.bin/tsx scripts/admin/rewrap.mts` (add `--dry-run` first). It upgrades rows
written before crypto v2 and encrypts stored social-login tokens. To rotate a key: move the old value to
`*_KEYS_OLD`, set the new one, restart, run `rewrap.mts` until it reports nothing left, then drop the old key. After a
suspected key compromise, also rotate the provider secrets themselves — rewrapping doesn't invalidate stolen copies.
Existing Google/Slack/GitHub OAuth connections from before this release have no recorded issuing app and must
reconnect at their next refresh, unless deployment history proves which client id issued them:
`… rewrap.mts --backfill-oauth-app google --client-id <that id>`.

## 3. Inviting beta users

- **Workspace invitation** (preferred): an owner invites the person in Settings → Members. The invitation email lets
  them sign up with that address.
- **Beta code** (for someone without a workspace yet):
  `docker compose exec web node_modules/.bin/tsx scripts/beta/create-code.mts --label "Name (why)" --uses 1 --days 14`.
  The code is printed once; share it privately.
- **Sign-up allowlist:** `FLOWLINE_BETA_ADMINS` (comma-separated emails) can always sign up. It grants nothing else —
  platform admins are created only by the bootstrap challenge (§2a).
- Email is restricted to the **recipient allowlist** (`/admin` → Platform settings) until the owner approves sending
  to real customers.

## 4. Monitoring

- **External uptime:** point an uptime service at `https://beta.<domain>/api/health` (expect 200 and `"db":"ok"`).
- **Internal checks:** the `monitor` service. Alerts fire after two consecutive failures, with a recovery notice. It
  covers:
  - worker heartbeat
  - queue depth and age
  - failed-run rate
  - AI and integration step failures
  - API 5xx
  - billing webhook failures
  - disk space
  - backup freshness
- **On demand:** `docker compose exec web node -e "fetch('http://localhost:3000/api/ops/status',{headers:{authorization:'Bearer '+process.env.FLOWLINE_OPS_TOKEN}}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))"`.
- **Beta funnel:** `docker compose exec web node_modules/.bin/tsx scripts/beta/report.mts --days 14`.
- **Logs:** `docker compose logs -f web worker`. Every API response has `x-request-id`, which is also in 5xx logs and
  error bodies. Ask users for it when they report a problem.

## 5. Backups and restore

- The nightly dump goes to `deploy/beta/backups/flowline-<utc>.dump`. `LAST_OK` / `LAST_FAILED` markers are watched by
  the monitor.
- **Copy backups off the host** (object storage or another machine). The owner must configure this.
- **Back up `FLOWLINE_ENCRYPTION_KEY` separately** (password manager). Without it, restored credentials and webhook
  secrets are unusable.
- **Restore drill** (monthly, and before calling the beta infra verified):
  `node scripts/release/backup-restore.mjs --image flowline:<sha>`. It restores into a clean PostgreSQL and verifies
  data, sign-in, flows, runs, knowledge, API keys, and decryption of secrets with the key.
- **Real restore:** stop web/worker, `pg_restore --clean --if-exists -d flowline <dump>` into `db`, start web/worker,
  run the smoke suite.

## 6. Releases and rollback

- Every release is an immutable image tagged with the git SHA. Record it in `artifacts/phase-4/release/`: SHA, image
  digest, migration count, and env var names (never values).
- **Deploy:** `FLOWLINE_IMAGE=flowline:<new> docker compose … up -d --wait`, then run the smoke suite.
- **Roll back:** `FLOWLINE_IMAGE=flowline:<previous> docker compose … up -d --wait`. Migrations are expand-only, so the
  previous image runs on the newer schema. No down migrations. This was verified across migrations in Phase 3 and
  Phase 4 (`scripts/release/rollback.mjs`).

## 7. Incidents

Follow `PRIVACY_AND_SAFETY.md` §7: contain, preserve, assess, rotate, notify, fix, write up. Quick stops:
- stop everything: `docker compose stop web worker`
- pause one integration: disconnect it in Integrations (its flows pause)
- block sign-ups: set `FLOWLINE_BETA_MODE=invite_only` (it already is) and revoke codes

## 8. Known operational limits

See `BETA_LIMITATIONS.md`. Specifically for operations:
- one host, so a host outage is a full outage (back up off-host);
- Caddy obtains certificates on first start (DNS must point to the host);
- the local Ollama model isn't available on a VPS unless you run Ollama there, so the beta uses a hosted model.
