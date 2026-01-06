# Import Flow Design

Design for the first user flow: importing scanned content into Patchwork.

## Summary

Users drop image files onto the Import page. Files upload to storage, OCR runs client-side via Tesseract.js, and patches are created. If OCR succeeds cleanly, patches move directly to "ready" for assembly. If OCR has issues (low confidence, failures), patches appear in Import for user review.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Image input | File drop | Simplest path; scanner integration later |
| OCR | Tesseract.js (client-side) | Cross-platform, avoids backend complexity |
| Annotation detection | Skipped for now | Add later |
| Processing model | Client-driven | Backend is dumb data store |
| Embedding | Thin Edge Function proxy | Hides OpenAI API key |
| Suggestion generation | Client-side | Heuristics + similarity run locally |
| Auth | Dev-mode auto-login | Env var credentials, proper user_id |
| Import feedback | Non-blocking status bar | User can navigate during processing |

## Navigation Rename

| Old Name | New Name | Purpose |
|----------|----------|---------|
| Inbox | **Import** | Bring content in, fix OCR issues |
| Assemble | **Assemble** | Place patches into documents |
| Editor | **Edit** | Refine assembled documents |

## Architecture

### Data Flow (per file)

```
User drops files
       │
       ▼
DropZone emits files ──▶ import.ts.importFiles(files[])
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              (file 1)                (file 2)  ...
                    │
         1. Upload to Storage
                    │
         2. Create patch (status: processing)
                    │
         3. Run Tesseract.js OCR
                    │
         4. Call embed_text Edge Function
                    │
         5. Run suggestion heuristics locally
                    │
         6. Update patch (ready or needs_review)
                    │
                    ▼
              Patch complete
```

- Sequential within each file
- Parallel across files

### Patch States

| Status | Meaning |
|--------|---------|
| `processing` | Upload/OCR in progress |
| `needs_review` | OCR issues need user attention |
| `ocr_complete` | OCR done, awaiting suggestion generation |
| `ready` | Fully processed, ready for Assemble |
| `applied` | Used in a document |
| `discarded` | User deleted it |

### When Patches Need Review

A patch appears in the Import view only if:
1. OCR confidence below threshold (uncertain words)
2. OCR failed entirely

Suggestion/placement is handled in the Assemble workflow.

## Components

### Frontend (new/updated)

| File | Purpose |
|------|---------|
| `src/lib/components/import/DropZone.svelte` | Drag-and-drop wrapper with visual feedback |
| `src/lib/components/import/ImportStatus.svelte` | Non-blocking status bar for processing |
| `src/lib/services/ocr.ts` | Tesseract.js wrapper |
| `src/lib/services/import.ts` | Orchestrates: upload → create → OCR → embed → suggest |
| `src/lib/services/suggestions.ts` | Heuristics + similarity logic (client-side) |
| `src/routes/import/+page.svelte` | Renamed from inbox, integrate DropZone |

### Backend

| File | Purpose |
|------|---------|
| `supabase/functions/embed_text/index.ts` | OpenAI embedding proxy (~10 lines) |

## UI/UX

### Import Feedback

Non-blocking status bar (persists during navigation):
```
┌────────────────────────────────────────────────────────────┐
│  Processing 3 of 5 patches...  ████████░░░░  [View]        │
└────────────────────────────────────────────────────────────┘
```

### Import Page

- **Primary view**: Patches needing review (`needs_review`)
- **Toggle/tab**: "All Patches" list view for finding specific patches
- **Empty state**: "No patches need review. [Go to Assemble]"
- **With patches**: Cards showing image + highlighted uncertain words

### Drop Zone

- Entire Import page is a drop target
- Drag over: subtle border highlight, "Drop to import" message
- Accepts: `.jpg`, `.jpeg`, `.png`, `.webp`, `.tiff`, `.pdf`
- Rejects other types with error toast

## Error Handling

### Upload Failures
- Network error → retry automatically (3 attempts)
- After retries → file shows "Upload failed - Retry" option
- User can retry or dismiss

### OCR Failures
- Tesseract can't process → patch status `needs_review` with error
- User can: retry OCR, manually enter text, or discard

### Embedding Failures
- Edge Function unavailable → patch stays at `ocr_complete`
- Not blocking; suggestions unavailable until embed succeeds
- Background retry on next app load

### Recovery on Page Load
- Check for patches in `processing` state (stale from crash)
- Resume processing automatically

## Schema Changes

### Patch Status Migration

Update status enum:
```sql
ALTER TYPE patch_status ADD VALUE 'processing';
ALTER TYPE patch_status ADD VALUE 'needs_review';
ALTER TYPE patch_status ADD VALUE 'ocr_complete';
-- Map: old 'inbox' → 'ready', old 'review' → 'needs_review'
```

## Auth Setup

### Dev-Mode Auto-Login

New env variables in `.env`:
```bash
DEV_AUTO_LOGIN=true
DEV_USER_EMAIL=dev@patchwork.local
DEV_USER_PASSWORD=devpassword123
```

On app startup, if `DEV_AUTO_LOGIN=true`:
1. Check if session exists
2. If not, sign in with credentials
3. Requires pre-created user in Supabase Auth

## Testing

### Unit Tests
- `ocr.ts` - Mock Tesseract, verify text extraction and confidence parsing
- `import.ts` - Mock storage/supabase, verify orchestration flow
- `suggestions.ts` - Test heuristics (filename patterns, sequences, recency)

### Integration Tests
- Drop files → verify patches created with correct status progression
- OCR failure → verify `needs_review` state and retry works
- Resume on page load → verify stale `processing` patches picked up

### Test Fixtures
- Sample images with known OCR output
- Images that trigger low confidence
- Corrupt/unreadable images for error cases

## Open Questions

None at this time.
