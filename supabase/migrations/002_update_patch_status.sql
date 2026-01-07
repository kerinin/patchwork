-- Update patch status values for import flow
-- Old values: inbox, review, ready, applied, discarded
-- New values: processing, needs_review, ocr_complete, ready, applied, discarded

-- Drop the old constraint
ALTER TABLE patches DROP CONSTRAINT IF EXISTS patches_status_check;

-- Add the new constraint with updated status values
ALTER TABLE patches ADD CONSTRAINT patches_status_check
  CHECK (status IN ('processing', 'needs_review', 'ocr_complete', 'ready', 'applied', 'discarded'));

-- Migrate any existing data (if any)
UPDATE patches SET status = 'ready' WHERE status = 'inbox';
UPDATE patches SET status = 'needs_review' WHERE status = 'review';
