-- Preserve first-row object key order across the durable run queue (CSV build).
-- Existing jsonb rows retain their stored order; their original insertion order is unrecoverable.
ALTER TABLE "run" ALTER COLUMN "input" SET DATA TYPE json;