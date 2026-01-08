-- Add ocr_corrections column to patches table
ALTER TABLE patches
ADD COLUMN IF NOT EXISTS ocr_corrections JSONB DEFAULT '{}';

-- Add comment
COMMENT ON COLUMN patches.ocr_corrections IS 'User corrections to OCR markup, stored separately from extracted_text';
