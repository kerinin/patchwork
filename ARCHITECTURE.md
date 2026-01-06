# Patchwork Architecture

Technical architecture and data model.

## Overview

Patchwork is a cloud-synced application with on-device OCR:

- **Clients** (iOS, Android, Web) handle image capture and text extraction locally
- **Backend** (Supabase) stores all data and syncs across devices
- **No server-side inference** — OCR runs on-device using platform APIs

---

## Data Model

### Core Entities

```
┌──────────┐
│ Profile  │
└────┬─────┘
     │ owns
     ▼
┌──────────┐       ┌────────────┐       ┌──────────┐
│  Folder  │◄─────►│  Document  │◄─────►│   Span   │
└──────────┘       └────────────┘       └──────────┘
     ▲                                       │
     │ nested                                │ references
     ▼                                       ▼
┌──────────┐                      ┌──────────┬──────────┐
│  Folder  │                      │  Patch   │  Typed   │
└──────────┘                      └──────────┴──────────┘
                                       │
                                       │ detected on
                                       ▼
                                 ┌──────────────┐
                                 │  Annotation  │
                                 └──────────────┘

Profile also owns: Corrections (for OCR error learning)
```

### Design Principles

**Patches are the source of truth.** Scanned content lives in patches (immutable). Spans reference slices of patches rather than copying text.

**Spans are version-bounded.** Each span knows which versions it exists in (`version_added`, `version_removed`). Querying any historical version is O(1).

**Positions use fractional indexing.** Span positions are strings that can always accommodate insertions without rebalancing.

**Granularity is flexible.** The data model supports character-level spans, but the UX defaults to paragraph-level operations for simplicity.

### Profiles

Handled by Supabase Auth. A `profiles` table extends the auth system with app-specific settings.

| Field | Description |
|-------|-------------|
| id | User ID (from Supabase Auth) |
| display_name | User's display name |
| preferences | JSON object with user settings |
| created_at | |
| updated_at | |

**Preferences object:**
- `import_folder`: Path to watch for new images (desktop only)
- `default_folder_id`: Where new documents go by default
- `theme`: `light`, `dark`, or `system`
- `keyboard_shortcuts`: Custom keybindings

### Folders

Hierarchical containers for organizing documents. A folder can contain other folders or documents. Root folders have no parent.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| parent_id | Parent folder (null for root) |
| name | Display name |
| position | Sort order within parent |

### Documents

A document is a text file assembled from spans. The document record is metadata; content is derived from spans.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| folder_id | Parent folder |
| name | Display name |
| current_version | Integer, increments on each edit |
| created_at | |
| updated_at | Tracks recent activity for suggestion heuristics |

### Patches

A patch is a scanned page. The extracted text is immutable once saved—it's the source of truth that spans reference.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| status | `inbox`, `review`, `ready`, `applied`, `discarded` |
| image_path | Reference to stored image |
| original_filename | Filename when imported (for sequence detection) |
| import_batch_id | Groups patches imported together |
| extracted_text | OCR result (immutable) |
| embedding | Vector embedding of extracted_text (1536 dimensions) |
| confidence_data | Word-level confidence scores, uncertain regions |
| suggested_action | JSON: where Patchwork thinks this should go (see below) |
| imported_at | When uploaded |
| reviewed_at | When user marked as reviewed |
| applied_at | When applied to a document |

**Import batch:** Patches imported together share an `import_batch_id`. Combined with `original_filename` and `imported_at` ordering, this enables sequential page detection for batch operations.

**Suggested action object:**
```json
{
  "type": "append" | "replace" | "insert" | "none",
  "document_id": "uuid",
  "position": "after paragraph 5" | "end" | "beginning",
  "reasoning": "First line continues from last paragraph of Chapter 6",
  "confidence": 0.85,
  "replace_spans": ["span_id_1", "span_id_2"]  // for replace type
}
```

When `type` is `none`, Patchwork couldn't determine a good suggestion.

### Typed Content

Text entered directly in the editor (not from a scan). Like patches, these are immutable once created.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| content | The text (immutable) |
| embedding | Vector embedding of content (1536 dimensions) |
| created_at | When created |

### Corrections

Tracks OCR corrections made by the user. Used to offer "fix all" for repeated errors.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| original | The OCR output (e.g., "tbe") |
| corrected | What the user changed it to (e.g., "the") |
| count | Number of times this correction was made |
| auto_apply | If true, apply this correction automatically |
| created_at | |
| updated_at | |

When a user corrects a word during patch review, the system checks if this correction pattern exists. After N occurrences (configurable, default 3), Patchwork offers to fix all instances in the inbox.

### Spans

A span is a reference to a slice of text from a patch or typed content. Spans are the building blocks of documents.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| document_id | Parent document |
| source_type | `patch` or `typed` |
| source_id | Reference to patch or typed_content |
| source_start | Character offset into source |
| source_end | Character offset into source |
| position | Fractional index string for ordering |
| version_added | Version when this span was created |
| version_removed | Version when this span was removed (null = active) |

**Key properties:**

- **Immutable references**: Spans point to immutable sources (patches/typed content). The source text never changes.
- **Version-bounded**: Each span exists in a range of versions. Query any version in O(1).
- **Fractional positions**: Position strings (e.g., "a", "aN", "aNG") can always accommodate insertions without rebalancing.

### How Documents Work

**Querying current version:**
```sql
SELECT * FROM spans
WHERE document_id = :id
  AND version_removed IS NULL
ORDER BY position
```

**Querying historical version V:**
```sql
SELECT * FROM spans
WHERE document_id = :id
  AND version_added <= :v
  AND (version_removed IS NULL OR version_removed > :v)
ORDER BY position
```

**Rendering:** Fetch spans, then for each span fetch the slice `source[source_start:source_end]` from the referenced patch or typed content. Concatenate in position order.

### Example: Applying and Editing

```
1. Patch A applied (3 paragraphs) at version 1
   Creates spans referencing A[0:100], A[101:200], A[201:300]
   Positions: "a", "b", "c"

2. Patch B appended at version 2
   Creates spans referencing B[0:80], B[81:150]
   Positions: "d", "e"

   Document at v2: A[0:100], A[101:200], A[201:300], B[0:80], B[81:150]

3. User replaces paragraph 2 with Patch C at version 3
   Span for A[101:200] marked version_removed=3
   New span referencing C[0:90], position "b" (reuses position)

   Document at v3: A[0:100], C[0:90], A[201:300], B[0:80], B[81:150]
   Document at v2: (still queryable) A[0:100], A[101:200], A[201:300], B[0:80], B[81:150]

4. User edits text in editor at version 4
   Creates typed_content record with new text
   Old span marked version_removed=4
   New span references typed_content
```

### Fractional Indexing

Positions are strings that allow infinite insertion:

```
Initial:     "a"      "b"      "c"
Insert between a and b: "aN" (midpoint)
Insert between a and aN: "aG"
Insert between aG and aN: "aJ"
```

Lexicographic ordering always works. No rebalancing needed.

Common implementation: Base62 strings with midpoint calculation.

### Undo

To undo: decrement `current_version`. The query automatically returns the previous state.

To redo: increment `current_version` (if not at max).

Spans are never deleted—just filtered by version bounds. Full history is preserved.

### UX Granularity

The data model supports character-level spans, but the default UX is paragraph-level:

- **Applying a patch**: Creates one span per paragraph
- **Replacing content**: Swaps paragraph-level spans
- **Editing in editor**: Replaces entire paragraph span with typed content

This keeps the UX simple while preserving the option for finer granularity later (e.g., partial paragraph selection).

### Annotations

Annotations are notes attached to documents. They can come from two sources:

**1. Detected on a patch (during scan)**
- Created when OCR detects margin marks ("expand", "cut", circled text, etc.)
- Initially attached to the patch only
- Links to document/span when patch is applied

**2. Created in the editor**
- User selects text and adds a note
- Directly attached to a document and optionally a character range
- No associated patch

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| source | `detected` or `manual` |
| patch_id | Source patch (null for manual annotations) |
| document_id | Associated document (null until patch applied) |
| anchor_start | Character position in rendered document (for manual annotations) |
| anchor_end | Character position in rendered document (for manual annotations) |
| content | The annotation text |
| interpretation | Semantic type: `expand`, `cut`, `move`, `question`, `note`, `unknown` |
| image_region | Bounding box in source image (for detected annotations) |
| status | `pending`, `accepted`, `dismissed`, `resolved` |
| created_at | |
| resolved_at | |

**Annotation lifecycle:**

For detected annotations:
1. Created with status `pending` when patch is processed
2. User accepts → status `accepted`
3. Patch applied → annotation links to document
4. User addresses it → status `resolved`

For manual annotations:
1. Created with status `accepted`, linked to document with character range
2. User addresses it → status `resolved`

**Note:** Manual annotation positions are character offsets in the rendered document at a specific version. If the document changes, positions may need adjustment (or annotations anchor to spans instead).

---

## Storage

**Images** are stored in Supabase Storage, organized by user:

```
patches/
  {user_id}/
    {patch_id}.jpg
```

**Database** is Supabase Postgres with row-level security ensuring users can only access their own data.

---

## Key Operations

### Importing a Patch

1. Client uploads image to Storage
2. Client runs OCR locally (platform API)
3. Client creates patch record with extracted text and confidence data
4. Client runs annotation detection (rules-based)
5. Server generates suggestion (via Edge Function):
   - Check heuristics (filename, sequence, recency)
   - If uncertain, embed text and query similar patches
   - Store embedding and suggested_action on patch
6. Patch appears in inbox with status `inbox` or `review` (if low confidence)

### Reviewing a Patch

1. User views patch with uncertain words highlighted
2. User corrects any OCR errors (updates `extracted_text`)
3. User accepts/dismisses detected annotations
4. User marks as reviewed → status becomes `ready`

### Applying a Patch

1. User approves suggestion (or picks destination manually)
2. System increments document's `current_version`
3. System creates spans referencing the patch (one per paragraph by default)
4. Each span gets: `source_type=patch`, `source_id`, `source_start`, `source_end`, `version_added=new_version`
5. Spans get fractional positions (after existing spans for append, between for insert)
6. Patch status becomes `applied`
7. Accepted annotations link to document

### Replacing Content

1. User selects content to replace (paragraph-level by default)
2. System increments document's `current_version`
3. Affected spans marked `version_removed=new_version`
4. New spans created referencing the replacement patch
5. New spans reuse positions of replaced spans (or get new positions if needed)

### Editing in Editor

1. User modifies text (paragraph-level)
2. System creates typed_content record with new text
3. System increments document's `current_version`
4. Old span marked `version_removed=new_version`
5. New span created referencing typed_content

### Undo

1. Decrement document's `current_version`
2. Query automatically returns previous state (spans filtered by version bounds)
3. No data modified—just the version pointer

### Adding Manual Annotation

1. User selects text in editor
2. User enters annotation content
3. System creates annotation with `source=manual`, linked to document with character range
4. Annotation appears in annotations panel

---

## Sync

Patchwork uses Supabase Realtime to sync changes across devices.

**Strategy:**
- Optimistic UI: changes apply locally immediately
- Background sync: changes push to server when online
- Conflict resolution: last-write-wins for simple fields; for document states, most recent state wins (history is append-only)

**Offline support:**
- Clients maintain local cache
- Changes queue locally when offline
- Sync when connectivity returns

---

## OCR

Text extraction runs on-device using platform APIs:

| Platform | Technology |
|----------|------------|
| iOS | Apple Vision framework |
| Android | ML Kit |
| Web | Tesseract.js (WASM) |

All provide:
- Full text extraction
- Word-level bounding boxes
- Confidence scores

Annotation detection is rules-based:
- Look for text in page margins
- Match against known patterns ("expand", "cut", "?", etc.)
- Unknown margin text marked as `unknown` type with image region preserved

---

## Suggestion Generation

Patchwork suggests where each patch belongs using a hybrid approach: fast heuristics first, then vector similarity for ambiguous cases.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Edge Function                   │
│                    "generate-suggestion"                    │
│                                                             │
│  1. Check heuristics (filename, sequence, recency)          │
│  2. If uncertain: embed patch via OpenAI API                │
│  3. Query similar patches via pgvector                      │
│  4. Determine destination + operation                       │
│  5. Return suggested_action                                 │
└─────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
   ┌─────────────┐                ┌─────────────┐
   │  pgvector   │                │   OpenAI    │
   │  (patches   │                │  text-      │
   │  embeddings)│                │  embedding  │
   └─────────────┘                └─────────────┘
```

### Heuristics (checked first)

These are fast and don't require ML:

**1. Filename parsing**
- `chapter6_page3.jpg` → look for document named "Chapter 6"
- `notes_2024-01-15.jpg` → look for document with similar date

**2. Sequential page detection**
- If previous patch in same `import_batch_id` was applied to Doc X, suggest Doc X
- Uses `original_filename` ordering (page_001, page_002, etc.)

**3. Recency**
- If user has been working on Doc X recently, weight it higher
- Track via `documents.updated_at` or separate activity log

If heuristics return a high-confidence match (e.g., filename explicitly says "chapter6"), skip vector search.

### Vector Similarity (for ambiguous cases)

When heuristics are uncertain, use embeddings:

**1. Embed the patch**
```
POST /v1/embeddings (OpenAI)
model: "text-embedding-3-small"
input: patch.extracted_text
→ returns 1536-dimension vector
```

**2. Find similar content**
```sql
SELECT p.id, p.extracted_text,
       1 - (p.embedding <=> :query_embedding) AS similarity
FROM patches p
WHERE p.user_id = :user_id
  AND p.embedding IS NOT NULL
  AND p.id != :current_patch_id
ORDER BY p.embedding <=> :query_embedding
LIMIT 10
```

**3. Map patches to documents**
```sql
SELECT DISTINCT s.document_id, d.name, MAX(similarity) as score
FROM similar_patches sp
JOIN spans s ON s.source_type = 'patch' AND s.source_id = sp.id
JOIN documents d ON d.id = s.document_id
WHERE s.version_removed IS NULL  -- only active spans
GROUP BY s.document_id, d.name
ORDER BY score DESC
```

### Determining the Operation

| Similarity | Interpretation | Suggested Action |
|------------|----------------|------------------|
| > 0.85 | Likely revision of existing content | `replace` matching spans |
| 0.6 - 0.85 | Related content, same document | `append` to document |
| < 0.6 | Weak match | Check continuation, else `none` |

**Continuation check** (for append candidates):
- Compare last paragraph of candidate document + first paragraph of patch
- If semantically coherent, boost confidence for append

### Thresholds

These values need tuning with real data:

| Parameter | Default | Notes |
|-----------|---------|-------|
| `REVISION_THRESHOLD` | 0.85 | Above this = suggest replace |
| `MATCH_THRESHOLD` | 0.60 | Below this = no strong match |
| `MIN_RESULTS` | 3 | Require N similar patches before suggesting |
| `HEURISTIC_CONFIDENCE` | 0.90 | Skip ML if heuristics this confident |

### Cost

Using OpenAI `text-embedding-3-small`:
- $0.02 per 1M tokens
- Typical page ≈ 700 tokens
- **~70,000 patches per dollar**

Vector search via pgvector is free (runs in Postgres).

---

## Security

All tables use Supabase Row-Level Security:
- Users can only read/write their own data
- Storage policies restrict image access to owner
- API calls authenticated via Supabase Auth (JWT)

---

## Clients

### Web (SvelteKit)
- Runs in browser
- Tesseract.js for OCR
- Supabase JS client for data

### iOS (Swift)
- Native app
- Apple Vision for OCR
- Camera integration for scanning
- Supabase Swift client

### Android (Kotlin)
- Native app
- ML Kit for OCR
- Camera integration
- Supabase Kotlin client

---

## Open Questions

- **Conflict resolution**: Last-write-wins is simple but lossy. Do we need operational transforms for collaborative editing later?
- **Annotation detection ML**: When/if to add a small model for better detection?
- **Search**: Full-text search across documents. Options: Postgres full-text search, or leverage existing embeddings for semantic search.
- **Cross-paragraph replace**: What if a scanned revision spans what was previously two paragraphs? Likely answer: replace both, create single new block. But edge cases need thought.
- **Embedding model tuning**: text-embedding-3-small vs text-embedding-3-large — need real data to evaluate accuracy/cost tradeoff.
- **Suggestion threshold tuning**: The 0.85/0.60 thresholds are initial guesses. Need user testing to calibrate.
