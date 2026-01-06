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

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
