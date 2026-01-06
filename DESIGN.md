# Patchwork - Engineering Guidelines

This document establishes engineering standards for the Patchwork project. Follow these practices for all code changes.

## Core Principles

1. **Test-Driven Development** - Write tests alongside implementation. Every feature, bug fix, or refactor must include corresponding tests.
2. **Verify Before Committing** - Run the full test suite and linting before every commit.
3. **CI is the Source of Truth** - If CI fails, the code is not ready to merge.
4. **Readable Tests are Documentation** - Tests should clearly describe expected behavior. Someone reviewing only the test suite should understand what the system does.

## Testing Requirements

### Coverage Expectations

- **All public APIs must have tests** - Edge Functions, Tauri commands, exported functions
- **All user-facing flows must have integration tests** - Auth, scanning, patch application, etc.
- **Edge cases must be tested** - Invalid input, missing data, permission denied, network failures
- **Regression tests for bugs** - Every bug fix includes a test that would have caught it

### Test Organization

```
# Backend (Supabase Edge Functions)
supabase/functions/_tests/
├── test_helpers.ts           # Shared utilities, fixtures
├── generate_suggestion_test.ts
├── apply_patch_test.ts
└── embed_content_test.ts

# Frontend (Tauri + SvelteKit)
patchwork-app/
├── src/**/*.test.ts          # Unit tests co-located with source
├── tests/                    # Integration/E2E tests
└── src-tauri/src/**/*_test.rs  # Rust unit tests
```

### Running Tests

```bash
# Backend - run from project root
cd supabase && ./scripts/test.sh

# Or manually:
supabase start
supabase db reset
supabase functions serve --no-verify-jwt --env-file functions/.env.local &
cd functions && deno test --no-check --no-lock --allow-net --allow-env _tests/

# Frontend - run from patchwork-app/
npm test           # Vitest for SvelteKit
cargo test         # Rust tests in src-tauri/
npm run test:e2e   # Playwright E2E (when implemented)
```

### Test Quality Checklist

Before submitting code, verify:
- [ ] New functionality has corresponding tests
- [ ] Tests cover both success and failure cases
- [ ] Tests are deterministic (no flaky tests)
- [ ] Test names clearly describe what is being tested
- [ ] Tests clean up after themselves (no leaked state)
- [ ] All tests pass locally

## CI/CD Pipeline

### GitHub Actions Workflows

The project uses GitHub Actions for automated testing:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `test-backend.yml` | Push/PR | Run Supabase Edge Function tests |
| `test-frontend.yml` | Push/PR | Run SvelteKit + Rust tests (when implemented) |
| `lint.yml` | Push/PR | ESLint, Prettier, Clippy |

### CI Must Pass

- All tests must pass before merging
- Linting must pass (no warnings treated as errors)
- Type checking must pass (`tsc --noEmit`, `cargo check`)

## Code Quality

### Linting & Formatting

```bash
# Frontend
npm run lint       # ESLint
npm run format     # Prettier
npm run check      # Svelte check + TypeScript

# Rust
cargo fmt          # Format
cargo clippy       # Lint
```

### Type Safety

- **TypeScript**: Strict mode enabled, no `any` types without justification
- **Rust**: No `unwrap()` in production code, use proper error handling
- **Database**: All queries should use typed clients (Supabase generates types)

### Error Handling

- Return meaningful error messages to users
- Log detailed errors server-side for debugging
- Never expose internal errors or stack traces to clients
- Use Result types in Rust, try/catch with typed errors in TypeScript

## Git Workflow

### Commit Practices

- Run tests before committing
- Write clear commit messages explaining *why*, not just *what*
- Keep commits focused - one logical change per commit
- Reference issues in commits when applicable

### Branch Strategy

- `main` - Production-ready code, always passing CI
- Feature branches - Named descriptively (`feature/scanner-discovery`, `fix/ocr-confidence`)
- PR required for merging to main

## Project Structure

```
writer/
├── CLAUDE.md              # This file - engineering guidelines
├── ARCHITECTURE.md        # Data model and system design
├── FRONTEND.md            # Frontend design spec
├── README.md              # Project overview
├── supabase/              # Backend
│   ├── functions/         # Edge Functions
│   ├── migrations/        # Database schema
│   └── scripts/           # Tooling (test.sh)
└── patchwork-app/         # Frontend
    ├── CLAUDE.md          # Frontend-specific guidance
    ├── src/               # SvelteKit app
    └── src-tauri/         # Rust backend
```

## When Making Changes

1. **Understand the context** - Read relevant docs (ARCHITECTURE.md, FRONTEND.md)
2. **Write tests first** (or alongside) - Define expected behavior before implementation
3. **Implement the change** - Keep it minimal and focused
4. **Run tests** - `./scripts/test.sh` for backend, `npm test` for frontend
5. **Run linting** - Fix all warnings
6. **Verify locally** - Manual smoke test if applicable
7. **Commit with clear message** - Reference what and why

## Documentation

- Update docs when behavior changes
- README should always reflect current setup steps
- API changes require updating relevant function docs
- Keep ARCHITECTURE.md in sync with schema changes
