-- AI hub retest (cceeb5d) data step. Idempotent: safe to run again.
-- CXH-09: listing-sourced prices with a zero side were written by the pre-fix listing parser, which read blank /
-- malformed price strings as 0. They can't be told apart from a real zero, so they become UNKNOWN (never "verified
-- free"); the next discovery refresh restores any genuine, well-formed listing price. Curated verified-free prices
-- (source "curated:…", from the official pricing page) are not touched.
UPDATE "ai_model"
SET "pricing" = NULL, "price_source" = NULL, "price_verified_at" = NULL, "free_tier_note" = NULL, "observed_at" = NULL, "updated_at" = now()
WHERE "source" LIKE 'listing:%'
  AND "pricing" IS NOT NULL
  AND (("pricing" -> 'inputPerMTokMicros') = '0'::jsonb OR ("pricing" -> 'outputPerMTokMicros') = '0'::jsonb);
--> statement-breakpoint
-- CXH-11: verification provenance. A pre-fix CONNECTED row with a test timestamp was verified by a model listing.
-- Only providers whose listing is documented to REQUIRE the key (registry listingAuth "key-required") keep it, as a
-- "listing" check of the current credential version.
UPDATE "ai_connection"
SET "key_check_method" = 'listing', "key_checked_cred_version" = "cred_version"
WHERE "key_check_method" IS NULL
  AND "last_tested_at" IS NOT NULL
  AND "status" = 'CONNECTED'
  AND "provider" IN ('openai', 'anthropic', 'gemini', 'xai', 'groq', 'mistral', 'cohere', 'deepseek', 'moonshot', 'minimax', 'cerebras', 'together', 'fireworks', 'huggingface', 'cloudflare');
--> statement-breakpoint
-- Every other pre-fix "verification" (public listings — DeepInfra, Vercel, OpenRouter's public list —, static
-- catalogues, unverified listing auth) proved nothing about the key: invalidated. A disclosed inference test (or
-- OpenRouter's authenticated key endpoint) verifies it again.
UPDATE "ai_connection"
SET "last_tested_at" = NULL
WHERE "key_check_method" IS NULL
  AND "last_tested_at" IS NOT NULL
  AND "provider" NOT IN ('openai', 'anthropic', 'gemini', 'xai', 'groq', 'mistral', 'cohere', 'deepseek', 'moonshot', 'minimax', 'cerebras', 'together', 'fireworks', 'huggingface', 'cloudflare');
