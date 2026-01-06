# Patchwork Supabase Backend

This directory contains the Supabase backend configuration for Patchwork.

## Structure

```
supabase/
├── config.toml           # Supabase CLI configuration
├── migrations/
│   └── 001_initial_schema.sql  # Database schema
└── functions/
    ├── _shared/          # Shared utilities
    │   ├── embeddings.ts # OpenAI embedding client
    │   └── supabase.ts   # Supabase client helpers
    ├── generate-suggestion/  # Suggest where a patch belongs
    ├── apply-patch/          # Apply a patch to a document
    └── embed-content/        # Embed typed content
```

## Setup

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A Supabase project (create at [supabase.com](https://supabase.com))
- An OpenAI API key for embeddings

### Local Development

1. Install the Supabase CLI:
   ```bash
   brew install supabase/tap/supabase
   ```

2. Link to your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Copy the environment template:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. Run migrations:
   ```bash
   supabase db push
   ```

5. Deploy Edge Functions:
   ```bash
   supabase functions deploy generate-suggestion
   supabase functions deploy apply-patch
   supabase functions deploy embed-content
   ```

6. Set Edge Function secrets:
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-your-key
   ```

### Running Locally

Start the local Supabase stack:
```bash
supabase start
```

Serve functions locally:
```bash
supabase functions serve
```

## Database Schema

See `migrations/001_initial_schema.sql` for the complete schema including:

- **profiles** - User settings and preferences
- **folders** - Hierarchical document organization
- **documents** - Document metadata (content via spans)
- **patches** - Scanned pages with OCR text and embeddings
- **typed_content** - Editor-typed text with embeddings
- **corrections** - OCR correction learning
- **spans** - Version-bounded references to content
- **annotations** - Detected and manual notes

All tables have Row Level Security (RLS) policies ensuring users can only access their own data.

## Edge Functions

### generate-suggestion

Analyzes a patch and suggests where it should be applied.

```bash
POST /functions/v1/generate-suggestion
Authorization: Bearer <user-jwt>

{
  "patch_id": "uuid"
}
```

Returns:
```json
{
  "suggestion": {
    "type": "append",
    "document_id": "uuid",
    "document_name": "Chapter 6",
    "reasoning": "Content continues from the end of Chapter 6.",
    "confidence": 0.85
  }
}
```

### apply-patch

Applies a patch to a document, creating spans and updating version.

```bash
POST /functions/v1/apply-patch
Authorization: Bearer <user-jwt>

{
  "patch_id": "uuid",
  "document_id": "uuid",
  "operation": "append",  // append | prepend | insert | replace
  "position": "optional",
  "replace_spans": ["span-id-1"]  // for replace operation
}
```

### embed-content

Creates embeddings for typed content (editor edits).

```bash
POST /functions/v1/embed-content
Authorization: Bearer <user-jwt>

{
  "typed_content_id": "uuid"
}
```

## Storage

Patch images are stored in the `patches` bucket, organized by user:

```
patches/
  {user_id}/
    {patch_id}.jpg
```

Upload images via the Supabase Storage API. Files are private and accessible only to the owning user.

## Vector Search

The schema uses pgvector for semantic similarity search. Key functions:

- `find_similar_patches(embedding, user_id, ...)` - Find patches with similar content
- `find_candidate_documents(embedding, user_id, ...)` - Find documents containing similar content

These are used by the suggestion algorithm to match new patches to existing documents.
