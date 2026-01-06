# Patchwork Frontend - Design Choices

This document contains key design decisions for implementing the Patchwork frontend. Read `../FRONTEND.md` for the full design spec.

## Stack

- **Framework**: Tauri 2.0 (Rust) + SvelteKit (TypeScript)
- **UI Components**: Bits UI (headless, accessible)
- **Styling**: Tailwind CSS with custom theme
- **State**: Svelte stores + Supabase Realtime
- **Platform**: macOS only (uses Apple Vision for OCR)

## Project Structure

```
patchwork-app/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── ui/          # Generic: Button, Card, Dialog (Bits UI based)
│   │   │   ├── patch/       # PatchCard, PatchViewer, ConfidenceHighlighter
│   │   │   ├── document/    # DocumentTree, SpanRenderer
│   │   │   ├── scanner/     # ScannerSelector, ScanProgress
│   │   │   └── layout/      # Sidebar, TopBar
│   │   ├── stores/          # Svelte stores (patches, documents, scanner)
│   │   ├── services/        # supabase.ts, tauri.ts
│   │   └── types/           # TypeScript interfaces
│   ├── routes/
│   │   ├── inbox/           # Review patches, accept suggestions
│   │   ├── assemble/        # Position patches in documents
│   │   └── editor/          # View/edit documents, export
│   └── tests/               # Test setup
├── src-tauri/               # Rust backend (scanner, OCR)
├── tailwind.config.js       # Custom "Analog Digital" theme
└── vite.config.ts           # Vitest config included
```

## Design Language: "Analog Digital"

Paper-like aesthetic. Key tokens in `tailwind.config.js`:

- **Colors**: `paper` (#FAFAF8), `ink` (#1A1A1A), `accent` (#8B7355), `highlight` (#FFF9C4)
- **Fonts**: `font-document` (Libre Baskerville), `font-ui` (Inter)
- **Shadows**: `shadow-card`, `shadow-stack`

## Commands

```bash
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Build for production
npm test             # Run Vitest tests
npm run check        # TypeScript + Svelte check
npm run tauri dev    # Run full Tauri app (requires Rust)
npm run tauri build  # Build Tauri app for distribution
```

## Tauri Commands

Scanner and OCR are native Rust/Swift. Call via:

```typescript
import { invoke } from '@tauri-apps/api/core';

const scanners = await invoke<Scanner[]>('discover_scanners');
const result = await invoke<ScanResult[]>('scan_batch', { url, settings });
const ocr = await invoke<OcrResult>('perform_ocr', { imagePath });
```

## Path Aliases

Configured in `svelte.config.js`:

- `$components` → `src/lib/components`
- `$stores` → `src/lib/stores`
- `$services` → `src/lib/services`
- `$types` → `src/lib/types`

## Testing

- Tests co-located with source: `*.test.ts`
- Run with `npm test` (Vitest)
- Setup file: `src/tests/setup.ts`

## Container Runtime

This project uses **Podman** (not Docker) for local Supabase development.

```bash
# Check Supabase status
supabase status

# If containers are stopped, restart them
supabase start

# View container logs
podman logs supabase_db_writer
```

## Environment Variables

Copy `.env.example` to `.env` and configure for local or remote backend:

```bash
# Backend Mode: "local" or "remote"
PUBLIC_BACKEND_MODE=local

# Local Development (default)
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PUBLIC_FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1

# Remote Production
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
PUBLIC_FUNCTIONS_URL=https://your-project.supabase.co/functions/v1
```

## Supabase Services

The `$services/supabase.ts` module provides type-safe API wrappers:

```typescript
import { folders, documents, patches, spans, annotations, storage } from '$services/supabase';
import { generateSuggestion, applyPatch } from '$services/functions';

// CRUD operations
const allPatches = await patches.list('inbox');
const doc = await documents.get(id);
await folders.create({ user_id, name, position: 'a' });

// Edge functions
const suggestion = await generateSuggestion(patchId);
await applyPatch({ patch_id, document_id, operation: 'append' });
```

## Stores with Backend Integration

Stores in `$stores/` wrap Supabase API with reactive state:

```typescript
import { loadInboxPatches, patches, selectedPatch } from '$stores/patches';
import { loadDocuments, selectDocument } from '$stores/documents';

// Load data
await loadInboxPatches();
await loadDocuments(folderId);

// Subscribe to realtime changes
subscribeToPatches();
subscribeToDocuments();
```
