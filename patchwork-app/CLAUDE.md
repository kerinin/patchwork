# Patchwork Frontend - Design Choices

This document contains key design decisions for implementing the Patchwork frontend. Read `../FRONTEND.md` for the full design spec.

## Stack

- **Framework**: Tauri 2.0 (Rust) + SvelteKit (TypeScript)
- **UI Components**: Bits UI (headless, accessible)
- **Styling**: Tailwind CSS with custom theme
- **State**: Svelte stores + Supabase Realtime
- **Platform**: macOS only (uses Apple Vision for OCR)

## Design Language: "Analog Digital"

Paper-like aesthetic. Use these tokens consistently:

```css
/* Colors */
--paper: #FAFAF8;
--paper-dark: #F5F5F3;
--ink: #1A1A1A;
--ink-light: #4A4A4A;
--accent: #8B7355;  /* warm brown, like aged paper */
--highlight: #FFF9C4;  /* pale yellow for low-confidence text */

/* Typography */
--font-document: 'Libre Baskerville', serif;  /* document content */
--font-ui: 'Inter', sans-serif;  /* interface elements */

/* Shadows */
--shadow-card: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
--shadow-stack: 0 4px 6px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
```

## Three Modes

The app has exactly three modes, accessed via top navigation:

1. **Inbox** (`/inbox`) - Review scanned patches, accept/reject suggestions
2. **Assemble** (`/assemble`) - Position patches within documents
3. **Editor** (`/editor`) - View and edit assembled documents

## File Organization

```
src/lib/
├── components/
│   ├── ui/          # Generic: Button, Card, Dialog (based on Bits UI)
│   ├── patch/       # PatchCard, PatchViewer, ConfidenceHighlighter
│   ├── document/    # DocumentTree, SpanRenderer
│   ├── scanner/     # ScannerSelector, ScanProgress, ScanButton
│   └── layout/      # Sidebar, ModeSelector, TopBar
├── stores/          # Svelte stores with Supabase subscriptions
├── services/        # supabase.ts, tauri.ts (wrappers)
└── types/           # TypeScript interfaces matching backend
```

## Tauri Commands

Scanner and OCR are native Rust/Swift. Call via:

```typescript
import { invoke } from '@tauri-apps/api/core';

const scanners = await invoke<Scanner[]>('discover_scanners');
const result = await invoke<ScanResult[]>('scan_batch', { url, settings });
const ocr = await invoke<OcrResult>('perform_ocr', { imagePath });
```

## Supabase Integration

Use the client from `$lib/services/supabase.ts`. Key patterns:

```typescript
// Auth - stored in Supabase, session persisted
const { data: { user } } = await supabase.auth.getUser();

// Realtime subscriptions for live updates
supabase.channel('patches')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'patches',
    filter: `user_id=eq.${user.id}`
  }, handleChange)
  .subscribe();

// Call Edge Functions
const { data } = await supabase.functions.invoke('generate-suggestion', {
  body: { patch_id }
});
```

## Important Conventions

1. **No drivers** - Scanner uses eSCL over HTTP, discovered via mDNS
2. **OCR on-device** - Apple Vision, not cloud API
3. **Spans are immutable** - Edits create new `typed_content`, old spans archived
4. **Optimistic updates** - Update UI immediately, rollback on failure
5. **User owns data** - All queries filtered by `user_id` via RLS

## Backend Reference

- See `../supabase/README.md` for Edge Function API docs
- See `../ARCHITECTURE.md` for data model (spans, versions, etc.)
