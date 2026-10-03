# Pi/tunnel deployment template alignment

Base: existing draft PR9 head `85d805d96ee2c1b207017345b4f08dbd1e43b127`. Branch: `codex/paid-pilot-deploy-align-20261003`.

The Pi template now uses the same immutable PostgreSQL/Caddy manifest-index digests as the runtime candidate. The tunnel-origin Caddy template now caps request admission at 6 MiB, preserving the supported 5 MiB upload plus multipart overhead. Direct-ingress request caps are owned by the separate resource candidate.

Focused validation (2026-10-03): cached pinned Caddy image `4c6e91c6ed0e...` executed `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` successfully in a disposable, read-only, network-none, memory/CPU/pid-capped container with only the tracked Caddyfile mounted and synthetic `beta.example.test`. Docker `--rm` removed it. `docker compose --env-file NUL -f deploy/beta/docker-compose.pi.yml config --no-env-resolution --no-interpolate --quiet` passed. No environment file was read or resolved. Whitespace check passed.

Independent source review: product worker (gpt-6.1-sol high) found no blocker in the two executable template edits; final staged evidence review follows. These are parser/source checks, not a deployed proxy, ARM64 application/runtime, target restoration, rollback, image vulnerability scan or CI acceptance. Existing PR9 historical recovery/build evidence remains historical and the unresolved WebKit failure remains OPEN. No host services, DNS, tunnel account, credentials or deployment changed.