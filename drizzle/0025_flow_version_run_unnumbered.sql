-- A run snapshot pins its graph without a publication number (version NULL), so runs never move the next publication's
-- number. Run snapshots written before this keep their numbers until the backfill in #205.
ALTER TABLE "flow_version" ALTER COLUMN "version" DROP NOT NULL;--> statement-breakpoint
-- History order: created_at is the transaction start time, so it can tie or run backwards across transactions.
-- New rows take seq in insertion order. Existing rows are numbered in table scan order, which is insertion order unless
-- a later insert reused space freed by deleted rows.
ALTER TABLE "flow_version" ADD COLUMN "seq" bigserial NOT NULL;
