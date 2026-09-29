ALTER TABLE "connection" DROP CONSTRAINT "connection_oauth_app_ck";--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "oauth_platform_secret_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD COLUMN "platform_secret_id" uuid;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_oauth_app_ck" CHECK ((oauth_app_source is null and oauth_app_id is null and oauth_platform_secret_id is null) or (oauth_app_source = 'platform' and oauth_app_id is null and oauth_client_id is not null) or (oauth_app_source = 'workspace' and oauth_app_id is not null and oauth_client_id is not null and oauth_platform_secret_id is null));--> statement-breakpoint
-- CXH-01 (round 2): bind existing platform-app connections to the platform_secret row that PROVABLY issued them.
-- Provable = the purpose was never cleared (no "platform_secret.cleared" in the platform audit, which is never pruned
-- and is written in the clear's own transaction), so the current row is the ONLY row that ever existed for it; it is
-- live, has the same client id, and (when recorded) the same epoch. Everything else stays NULL: usable until its next
-- refresh, which then requires a reconnect (the legacy rule). Nothing is guessed.
UPDATE "connection" c SET "oauth_platform_secret_id" = ps."id"
FROM "platform_secret" ps
WHERE c."oauth_app_source" = 'platform'
  AND c."oauth_platform_secret_id" IS NULL
  AND ps."purpose" = CASE WHEN c."provider" IN ('google_sheets', 'gmail') THEN 'integration.google' WHEN c."provider" = 'slack' THEN 'integration.slack' WHEN c."provider" = 'github' THEN 'integration.github' END
  AND ps."public_id" = c."oauth_client_id"
  AND ps."status" <> 'revoked'
  AND ps."secret_enc" IS NOT NULL
  AND (c."oauth_app_epoch" IS NULL OR c."oauth_app_epoch" = ps."epoch")
  AND NOT EXISTS (SELECT 1 FROM "platform_audit_event" e WHERE e."purpose" = ps."purpose" AND e."action" = 'platform_secret.cleared');--> statement-breakpoint
-- Pending platform-app authorizations (10-minute lifetime) carry no app row id: they must start again.
DELETE FROM "oauth_state" WHERE "app_source" = 'platform';
