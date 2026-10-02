# FlowLine private beta runbook — Raspberry Pi + named Cloudflare Tunnel

**Status: plan only.** No approved domain or Pi target is recorded, no Pi inspection or DNS change has been authorized,
no named tunnel has been created, and no deployment has occurred. This runbook is not approval to expose a service.
Current local recovery evidence and its limits are recorded in `BETA_EXECUTION_STATUS.md` and
`OWNER_ACTIONS.md`. `MERGED` and production status must be checked against current Git refs; a beta worktree is never
assumed to be merged.

## Intended topology

```text
Browser -- HTTPS --> Cloudflare edge -- named Tunnel --> cloudflared (Pi)
                                                       | connector network
                                                       v
                                                Caddy HTTP origin
                                                       | origin network
                                                       v
                                               one FlowLine web
                                                | database network
                                               PostgreSQL
                                               one worker
```

The standalone `deploy/beta/docker-compose.pi.yml` template has no published host ports. `cloudflared` has a separate
outbound network; Caddy and the app are reachable through dedicated internal networks. PostgreSQL, worker, migrations,
monitoring and Docker are not internet ingress. Do not combine this template with `docker-compose.beta.yml` or its
direct-ingress Caddy configuration. Keep one web process and worker concurrency 1.

## Required inputs and approvals

Before preparing exact changes, the owner must provide/approve:

1. The existing domain and chosen beta hostname, plus the sending subdomain/provider already in use. Do not buy a
   domain or replace nameservers. Read-only DNS inspection is required before proposing records.
2. The Pi SSH destination and a secure access method for read-only inspection. Never request a private key in chat.
   Confirm OS, `linux/arm64`, RAM, free disk, Docker/Compose versions, firewall, power/network limits, running
   containers, ports, volumes and other projects before selecting a resource budget.
3. After inspection, a separate approval for the exact DNS records, named Cloudflare Tunnel route, host and expected
   internet exposure. Preserve existing A/AAAA/MX/TXT and mail-auth records; no temporary `trycloudflare.com` URL.
4. Before deployment, one approval naming the exact source SHA, immutable `linux/arm64` image digest, migrations,
   services, protected configuration location, backup/restore and rollback, expected cost, invite-only setting and
   sandbox-only billing. Approval for beta staging does not approve public production or invitations.

The exact Cloudflare zone/account, tunnel UUID, credential-file path, hostname and DNS values are unknown. Fill
`cloudflared.yml.example` only after the matching approvals, then store the named tunnel credentials outside Git with
owner-only filesystem access and mount them read-only. Never put credentials in command arguments or this runbook.

## Local preparation and proof

1. Freeze and record the exact source commit. Read `docs/ai/MIGRATION.md`, inspect the actual migration journal, and
   classify the installation as fresh or upgrade; do not assume a migration range.
2. Build once with `docker buildx build --platform linux/arm64 --load --build-arg GIT_SHA=<full-sha> -t
   flowline:<full-sha> .`. This is a local build only; do not push. The current inherited build at `719056c` failed
   during page-data collection after reporting 31 workers and a Docker EOF. It is not an artifact or ARM64 pass.
   `next.config.ts` bounds Next build workers to two; validate this setting on a future owner/root-controlled build.
3. Keep Docker context free of `.env*`, `.takeover-beta-*`, encrypted `.bundle` files and SQL `.dump` files. Verify
   ignore behavior before building. Never copy a scratch backup or database dump into the context.
4. Run only the disposable recovery proof against a uniquely labelled, network-isolated PostgreSQL pair and synthetic
   data. It must check container identity/labels, no published ports, expected database/user/version, an empty restore
   target, encrypted backup, wrong-key refusal, successful restore, byte-preserved ciphertext/key IDs, successful
   decrypt with the fixture key and refusal with a wrong data key. Stop on any unowned resource or cleanup uncertainty.
   This DB-only exercise is not application, migration, ARM64-image, off-device-backup or Pi restore certification.
5. Record the local proof under the unique takeover evidence directory, with the tested SHA and sanitized result.
   Keep keys, plaintext, ciphertext, database dumps and environment values out of evidence.

## After the separate deployment approval

On the Pi, first take an off-device backup of the database and separately protected encryption/authentication keys.
Use the approved image digest and the standalone Pi compose file. Set invitation-only mode, Paddle sandbox, live billing
disabled, one web service and worker concurrency 1. Apply migrations only after confirming the actual journal and
backup. Keep the Cloudflare route disabled until the named DNS/tunnel approval is in force. Do not expose SSH beyond
the owner-approved management path or publish database, app, worker, Docker, debug or operations ports.

After owner approval, verify on the real host: OS/architecture and image digest; migration result; database, web and
worker health; tunnel origin and HTTPS redirect; invitation-only sign-up; live billing disabled; auth/admin
protections; webhook routes; backup copy off-device; and restore into a separate clean environment. Record exact
coverage and host-side evidence without secrets or customer data. Laptop proof cannot certify the Pi.

## Stop and rollback

Stop before action if the domain/host identity, image digest, cost, current DNS, service ownership, backup, migration
state or rollback target is unknown. If an approved rollout fails, disable the named tunnel route first, then stop only
the FlowLine services named in the approval. Preserve logs and database state; do not prune Docker, delete volumes,
reimage/reboot the Pi, or affect unrelated workloads. Restore only into the approved isolated target until the owner
approves any production-data operation.

## Readiness labels

- **LOCAL RECOVERY PROOF:** only if the bounded disposable proof passes; scope remains DB-only.
- **BETA INFRA VERIFIED:** only after the approved exact Pi artifact, tunnel, host health, backup and clean-restore
  checks pass.
- **PRIVATE BETA READY:** only after required external journeys and human acceptance pass on the exact beta artifact.
- **PUBLIC PRODUCTION APPROVED:** owner decision only; currently **NO**.
