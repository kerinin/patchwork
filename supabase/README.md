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

## Testing

The backend has comprehensive test coverage with 54 automated tests.

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno](https://deno.land/) v1.x or later
- Docker (required by Supabase CLI)

### Running Tests Locally

```bash
# 1. Start local Supabase (from project root or supabase/ directory)
supabase start

# 2. Reset database to apply migrations
supabase db reset

# 3. Start Edge Functions server (in background)
supabase functions serve --no-verify-jwt --env-file functions/.env.local &

# 4. Wait for functions to initialize
sleep 5

# 5. Set environment variables
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
export FUNCTIONS_URL="http://127.0.0.1:54321/functions/v1"

# 6. Run tests
cd functions
deno test --no-check --no-lock --allow-net --allow-env _tests/

# 7. Clean up when done
supabase stop
```

Note: The anon and service role keys above are the default local development keys used by `supabase start`. They are deterministic and safe to commit.

### Running Tests in CI

Tests run automatically on push/PR via GitHub Actions. See `.github/workflows/test-backend.yml`.

The CI workflow:
1. Starts Supabase services (minimal set for testing)
2. Applies database migrations
3. Starts Edge Functions with mock embeddings
4. Runs all Deno tests
5. Reports results

### Mock Mode

Tests use mock embeddings (no OpenAI API required). Create the env file from the example:

```bash
cp functions/.env.local.example functions/.env.local
```

This sets `MOCK_EMBEDDINGS=true` which generates deterministic embeddings based on text content.

Mock embeddings are deterministic based on text content, allowing consistent test behavior.

### Test Coverage

| Component | Tests | Description |
|-----------|-------|-------------|
| generate-suggestion | 18 | Auth, validation, heuristics, vector similarity, response structure |
| apply-patch | 18 | Auth, operations (append/prepend/replace), versioning, paragraph splitting, annotations |
| embed-content | 10 | Auth, validation, embedding creation, idempotency, access control |

**Total: 54 tests**

### Test Structure

```
functions/_tests/
├── test_helpers.ts           # Shared utilities, fixtures, assertions
├── mocks.ts                  # Mock implementations
├── generate_suggestion_test.ts
├── apply_patch_test.ts
└── embed_content_test.ts
```

### Writing New Tests

Tests use Deno's built-in test runner with `describe`/`it` syntax:

```typescript
import { describe, it, beforeAll, afterAll } from "https://deno.land/std@0.177.0/testing/bdd.ts";
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { createServiceClient, createTestUser, callFunction } from "./test_helpers.ts";

describe("my-function", () => {
  let serviceClient: SupabaseClient;
  let testUser: TestUser;

  beforeAll(async () => {
    serviceClient = createServiceClient();
    testUser = await createTestUser(serviceClient);
  });

  afterAll(async () => {
    await cleanupTestUser(serviceClient, testUser.id);
  });

  it("should do something", async () => {
    const { status, data } = await callFunction(
      "my-function",
      { param: "value" },
      testUser.accessToken
    );
    assertEquals(status, 200);
  });
});
```
