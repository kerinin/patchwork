# Patchwork Backend Tests

Comprehensive test suite for the Patchwork Supabase backend.

## Test Structure

```
tests/
├── README.md                 # This file
├── database/                 # SQL-based database tests
│   ├── 001_schema_test.sql   # Schema validation
│   ├── 002_functions_test.sql # Database function tests
│   └── 003_vector_search_test.sql # pgvector similarity tests
└── (Edge Function tests in functions/_tests/)
```

```
functions/_tests/
├── test_helpers.ts           # Shared test utilities
├── mocks.ts                  # Mock implementations
├── generate_suggestion_test.ts
├── apply_patch_test.ts
└── embed_content_test.ts
```

## Running Tests

### Prerequisites

1. Local Supabase instance running:
   ```bash
   supabase start
   ```

2. Edge Functions served locally:
   ```bash
   supabase functions serve
   ```

3. Environment variables set:
   ```bash
   export SUPABASE_URL=http://localhost:54321
   export SUPABASE_ANON_KEY=<your-local-anon-key>
   export SUPABASE_SERVICE_ROLE_KEY=<your-local-service-key>
   export FUNCTIONS_URL=http://localhost:54321/functions/v1
   export OPENAI_API_KEY=sk-test  # Mocked in tests
   ```

### Database Tests

Run SQL tests against the local database:

```bash
# Run all database tests
psql $DATABASE_URL -f tests/database/001_schema_test.sql
psql $DATABASE_URL -f tests/database/002_functions_test.sql
psql $DATABASE_URL -f tests/database/003_vector_search_test.sql

# Or use the Supabase CLI
supabase db test
```

### Edge Function Tests

Run Deno tests:

```bash
# Run all Edge Function tests
deno test --allow-net --allow-env functions/_tests/

# Run specific test file
deno test --allow-net --allow-env functions/_tests/generate_suggestion_test.ts

# Run with coverage
deno test --allow-net --allow-env --coverage=coverage functions/_tests/
deno coverage coverage
```

### CI/CD

For GitHub Actions, use this workflow:

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase
        run: supabase start

      - name: Run Database Tests
        run: |
          psql $DATABASE_URL -f supabase/tests/database/001_schema_test.sql
          psql $DATABASE_URL -f supabase/tests/database/002_functions_test.sql
          psql $DATABASE_URL -f supabase/tests/database/003_vector_search_test.sql
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:54322/postgres

      - name: Serve Functions
        run: supabase functions serve &

      - name: Run Edge Function Tests
        run: deno test --allow-net --allow-env supabase/functions/_tests/
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          FUNCTIONS_URL: http://localhost:54321/functions/v1
```

## Test Coverage

### Database Tests

| File | Coverage |
|------|----------|
| `001_schema_test.sql` | Tables, columns, indexes, constraints, RLS, extensions |
| `002_functions_test.sql` | `get_document_content`, `record_correction`, `fractional_index_between` |
| `003_vector_search_test.sql` | `find_similar_patches`, `find_candidate_documents`, cosine similarity |

### Edge Function Tests

| Function | Test Areas |
|----------|------------|
| `generate-suggestion` | Auth, validation, cold start, filename heuristics, sequential detection, vector similarity, response structure |
| `apply-patch` | Auth, validation, append/prepend/replace operations, version history, paragraph splitting, annotation linking |
| `embed-content` | Auth, validation, embedding creation, idempotency, access control |

## Writing New Tests

### Database Tests

Use the assertion helpers:

```sql
DO $$
BEGIN
    -- Your test logic
    PERFORM assert_true(condition, 'Error message');

    RAISE NOTICE 'Test passed ✓';
END $$;
```

### Edge Function Tests

Use the test helpers:

```typescript
import {
  createServiceClient,
  createTestUser,
  cleanupTestUser,
  callFunction,
} from "./test_helpers.ts";

describe("my-function", () => {
  let serviceClient: ReturnType<typeof createServiceClient>;
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

## Mocking

The test suite mocks external dependencies:

- **OpenAI Embeddings**: `mockOpenAIEmbeddings()` intercepts fetch requests to OpenAI and returns deterministic embeddings based on input text hash.

To use mocks:

```typescript
import { mockOpenAIEmbeddings } from "./mocks.ts";

beforeAll(() => {
  mockOpenAIEmbeddings();
});
```

## Debugging Tests

### Verbose Output

```bash
deno test --allow-net --allow-env functions/_tests/ -- --verbose
```

### Single Test

```bash
deno test --allow-net --allow-env --filter "should create spans" functions/_tests/
```

### Database Test Debugging

Add `RAISE NOTICE` statements to SQL tests:

```sql
RAISE NOTICE 'Variable value: %', my_variable;
```
