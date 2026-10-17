# FlowLine private beta runbook — Raspberry Pi + named Cloudflare Tunnel

**Status: plan only.** No approved domain or Pi target is recorded, no Pi inspection or DNS change has been authorized,
no named tunnel has been created, and no deployment has occurred. This runbook is not approval to expose a service.
Current local recovery and ARM64 build evidence is recorded in `../../artifacts/phase-4/takeover-20261003/beta/CURRENT_RESULT.md`
and `OWNER_ACTIONS.md`. Main is `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; draft PR #9 remains unmerged with full CI failed. A beta worktree is never assumed to be merged.

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

The owned ingress applies route-specific body caps (16 KiB public email/beta, 64 KiB auth, 1 MiB default, with explicit webhook/credential/upload budgets), a 10-second absolute body-read deadline (90 seconds, absolute, only on the exact files and knowledge upload routes, sized for a 5 MiB body at 512 kbit/s) and a 5-second header deadline. It enables HTTP/1.1 and HTTP/2; HTTP/3 is disabled because Caddy 2.10 does not carry these read deadlines into its HTTP/3 server. Exact paths, application safeguards and hosting requirements are in [REQUEST_BODY_LIMITS.md](../security/REQUEST_BODY_LIMITS.md). The PR #16 follow-up is source/unit-checked only; these new ingress controls have not been runtime-validated with Caddy or deployed.

Before deployment, validate/adapt this file with the selected Caddy 2.10 image and test byte boundaries, chunked overflow, stalled/slow-drip uploads (about 10 s cut-off on ordinary routes, about 90 s on the upload routes, which proves the per-request `read_timeout` replaces the global one), a slow 5 MiB upload paced at about 64,000 B/s, and valid multipart bodies on both enabled protocols. Verify direct web access is blocked. An approved tunnel/CDN must preserve this ingress path and enforce client-side upload/header deadlines before forwarding; targeting `web:3000` bypasses these controls. Its trusted-peer/client-IP configuration must also be verified separately before relying on per-IP admission.

Port 80 has an explicit 308 HTTPS redirect site so it receives the global read deadlines too; verify redirect behavior and incomplete-header timeouts on both public TCP listeners when accepting the deployment.

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

Enrolled users must complete Flowline's local authenticator after any federated sign-in, including ZITADEL. Old sessions without exact-session/current-factor proof require reauthentication. This sign-in challenge is separate from the platform-admin write elevation; see [federated MFA](../security/FEDERATED_MFA.md).

The exact Cloudflare zone/account, tunnel UUID, credential-file path, hostname and DNS values are unknown. Fill
`cloudflared.yml.example` only after the matching approvals, then store the named tunnel credentials outside Git with
owner-only filesystem access and mount them read-only. Never put credentials in command arguments or this runbook.

## Local preparation and proof

1. Freeze and record the exact source commit. Read `docs/ai/MIGRATION.md`, inspect the actual migration journal, and
   classify the installation as fresh or upgrade; do not assume a migration range.
2. The final candidate `7a315f7146784a4ac23b48e1ba06f46a762a21a7` already has a recorded local `linux/arm64` build
   pass. See `../../artifacts/phase-4/takeover-20261003/beta/ARM64_BUILD_7A315F7.json` and
   `../../artifacts/phase-4/takeover-20261003/beta/ARM64_APPROVED_IMAGE.json` for exact source, source tree, local
   image ID and platform manifest digest. Registry push is false. Do not treat this as runtime, Pi, migration or
   deployment certification. The earlier `719056c` Docker-EOF build is retained as historical failed evidence.
3. Keep Docker context free of `.env*`, `.takeover-beta-*`, encrypted `.bundle` files and SQL `.dump` files. Verify
   ignore behavior before building. Never copy a scratch backup or database dump into the context.
4. Run only the disposable recovery proof against a uniquely labelled, network-isolated PostgreSQL pair and synthetic
   data. It must check container identity/labels, no published ports, expected database/user/version, an empty restore
   target, encrypted backup, wrong-key refusal, successful restore, byte-preserved ciphertext/key IDs, successful
   decrypt with the fixture key and refusal with a wrong data key. Stop on any unowned resource or cleanup uncertainty.
   This DB-only exercise is not application, migration, ARM64-image, off-device-backup or Pi restore certification.
5. Record the local proof under the unique takeover evidence directory, with the tested SHA and sanitized result.
   Keep keys, plaintext, ciphertext, database dumps and environment values out of evidence.

### Current final local evidence

For exact tested code `7a315f7146784a4ac23b48e1ba06f46a762a21a7` (source tree
`6418ad710a312ae45732a288b7efaebf1a4d07f8`), the sanitized ARM64 metadata records a local `linux/arm64` build pass;
the sanitized DB-only recovery proof records 18/18 checks passed and cleanup of its two owned containers and private
   files. See `../../artifacts/phase-4/takeover-20261003/beta/CURRENT_RESULT.md`. Draft PR #9 is unmerged and its full CI failed. G4 remains PARTIAL; no registry push, runtime, Pi, migration, provider, deployment or readiness proof exists.

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
