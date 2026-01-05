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
│   User   │
└────┬─────┘
     │ owns
     ▼
┌──────────┐      ┌────────────┐      ┌──────────────┐
│  Folder  │◄────►│  Document  │◄────►│ DocumentState│
└──────────┘      └────────────┘      └──────────────┘
     ▲                                       │
     │ nested                                │ references
     ▼                                       ▼
┌──────────┐                           ┌──────────┐
│  Folder  │                           │  Block   │
└──────────┘                           └──────────┘
                                            ▲
┌──────────┐                                │ provenance
│  Patch   │────────────────────────────────┘
└──────────┘
     │
     │ detected on
     ▼
┌──────────────┐
│  Annotation  │
└──────────────┘
```

### Users

Handled by Supabase Auth. A `profiles` table extends the auth system with app-specific settings (preferences, defaults, etc.).

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

A document is a text file assembled from patches. The actual content lives in blocks; the document record is metadata.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| folder_id | Parent folder |
| name | Display name |
| current_state_id | Points to current DocumentState |

### Blocks

A block is an immutable chunk of text, typically one paragraph. Blocks are created when patches are applied or when users type in the editor. Once created, a block's content never changes—edits create new blocks.

| Field | Description |
|-------|-------------|
| id | Unique identifier (content-addressable hash) |
| content | The actual text (typically one paragraph) |
| patch_id | Source patch, if this block came from a scan (null for typed/edited content) |
| created_at | When this block was created |

**Why paragraph-level?** This enables meaningful replace operations. When a user scans a revised paragraph, Patchwork can replace just that paragraph while preserving the surrounding content and its provenance.

**Why immutable?** This enables efficient history without duplicating text. A document's history is just a series of "which blocks in what order" snapshots, not copies of all the text.

**Example: Applying and replacing**

```
1. Patch A (3 paragraphs) applied → creates blocks [A1, A2, A3]
   Document state: [A1, A2, A3]

2. Patch B (2 paragraphs) appended → creates blocks [B1, B2]
   Document state: [A1, A2, A3, B1, B2]

3. Patch C (revised version of A2) replaces A2 → creates block [C1]
   Document state: [A1, C1, A3, B1, B2]
```

Provenance is preserved: A1 and A3 still trace to Patch A, C1 traces to Patch C.

**What about edits in the editor?**

If a user edits text directly (not via patch), the modified paragraph becomes a new block with `patch_id = null`. We don't track character-level changes—the whole paragraph is the unit of change.

### DocumentState (History)

A document state represents the document at a point in time. It's a lightweight snapshot: just an ordered list of block references.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| document_id | Which document |
| parent_id | Previous state (for undo chain) |
| block_ids | Ordered array of block IDs |
| operation | What caused this state (applied patch, edit, reorder, etc.) |
| created_at | When this state was created |

**How history works:**

1. Document starts empty: `block_ids = []`
2. User applies patch → new state with `block_ids = [block_1]`
3. User applies another patch → new state with `block_ids = [block_1, block_2]`
4. User edits block_1 → creates new block_1a, new state with `block_ids = [block_1a, block_2]`
5. User undoes → document points back to state from step 3

This is inspired by Git:
- Blocks are like Git blobs (content-addressed, immutable)
- States are like Git commits (point to content + parent)
- Undo is just moving the pointer back

**Loading a document:** Fetch current state, then fetch blocks by IDs. Two queries, no duplication.

### Patches

A patch is a scanned page. It lives in the inbox until applied to a document.

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| status | `inbox`, `review`, `ready`, `applied`, `discarded` |
| image_path | Reference to stored image |
| extracted_text | OCR result |
| confidence_data | Word-level confidence scores, uncertain regions |
| suggested_action | Where Patchwork thinks this should go |
| imported_at | When uploaded |
| reviewed_at | When user marked as reviewed |
| applied_at | When applied to a document |

### Annotations

Annotations are notes attached to documents. They can come from two sources:

**1. Detected on a patch (during scan)**
- Created when OCR detects margin marks ("expand", "cut", circled text, etc.)
- Initially attached to the patch
- Moves to the document/block when patch is applied

**2. Created in the editor**
- User selects text and adds a note
- Directly attached to a document and optionally a specific block
- No associated patch

| Field | Description |
|-------|-------------|
| id | Unique identifier |
| user_id | Owner |
| source | `detected` or `manual` |
| patch_id | Source patch (null for manual annotations) |
| document_id | Associated document |
| block_id | Specific block (optional) |
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
3. Patch applied → annotation links to document/block
4. User addresses it → status `resolved`

For manual annotations:
1. Created with status `accepted` (no approval needed)
2. User addresses it → status `resolved`

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
5. Patch appears in inbox with status `inbox` or `review` (if low confidence)

### Reviewing a Patch

1. User views patch with uncertain words highlighted
2. User corrects any OCR errors (updates `extracted_text`)
3. User accepts/dismisses detected annotations
4. User marks as reviewed → status becomes `ready`

### Applying a Patch

1. User approves suggestion (or picks destination manually)
2. System creates new block with patch content
3. System creates new document state with block added
4. Document's `current_state_id` points to new state
5. Patch status becomes `applied`
6. Accepted annotations link to document/block

### Editing in Editor

1. User modifies text in a block
2. System creates new block with updated content
3. System creates new document state replacing old block ID with new
4. Document's `current_state_id` points to new state

### Undo

1. Fetch current state's `parent_id`
2. Set document's `current_state_id` to parent
3. Done (no data deleted, just pointer moved)

### Adding Manual Annotation

1. User selects text in editor
2. User enters annotation content
3. System creates annotation with `source = manual`, linked to document and optionally block
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
- **Search**: Full-text search across documents — Postgres built-in or separate index?
- **Cross-paragraph replace**: What if a scanned revision spans what was previously two paragraphs? Likely answer: replace both, create single new block. But edge cases need thought.
