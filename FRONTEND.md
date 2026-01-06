# Patchwork Frontend

A **Tauri 2.0 + SvelteKit** desktop app for macOS with direct scanner integration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        macOS Desktop App                         │
├─────────────────────────────────────────────────────────────────┤
│  SvelteKit Frontend                                              │
│  ├── Inbox Mode (review patches, accept suggestions)             │
│  ├── Assemble Mode (position patches in documents)               │
│  └── Editor Mode (view/edit documents, export)                   │
├─────────────────────────────────────────────────────────────────┤
│  Tauri Rust Backend                                              │
│  ├── Scanner (eSCL/AirScan protocol)                            │
│  └── OCR (Apple Vision via Swift FFI)                           │
├─────────────────────────────────────────────────────────────────┤
│  Native Layer                                                    │
│  ├── mDNS/Bonjour (scanner discovery)                           │
│  └── Vision.framework (text recognition)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Backend                            │
│  ├── Database (Postgres + pgvector)                             │
│  ├── Edge Functions (suggestions, patch application)            │
│  ├── Storage (patch images)                                     │
│  └── Realtime (live updates)                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Scanner: eSCL (AirScan) Protocol

Brother MFCs expose eSCL (AirScan) over HTTP on the local network. This is better than SANE because:
- No driver installation required
- Auto-discovery via mDNS/Bonjour
- ADF batch scanning built-in
- Standard HTTP + XML

**Protocol flow:**
1. **Discover**: mDNS query for `_uscan._tcp.local.`
2. **Capabilities**: `GET /eSCL/ScannerCapabilities`
3. **Status**: `GET /eSCL/ScannerStatus` (check ADF pages)
4. **Scan**: `POST /eSCL/ScanJobs` → `GET /eSCL/ScanJobs/{id}/NextDocument`

**Rust crates**: `mdns`, `reqwest`, `quick-xml`, `image`

### OCR: Apple Vision via Swift FFI

Create a Swift package wrapping `VNRecognizeTextRequest`, exposed via C FFI to Rust:

```
Swift (VisionOCR.swift) → C interface → Rust FFI → Tauri command
```

Returns JSON with full text, word-level confidence scores, and bounding boxes.

This provides better accuracy than Tesseract, especially for handwriting, and runs entirely on-device.

### UI: "Analog Digital" Design Language

Paper-like aesthetic bridging physical documents and digital organization:

- **Colors**: Paper whites (#FAFAF8), ink blacks (#1A1A1A), muted accents
- **Typography**: Serif for documents (Libre Baskerville), sans for UI (Inter)
- **Shadows**: Subtle paper-stack effects
- **Spacing**: Generous whitespace, editorial feel

Custom Tailwind theme with design tokens.

### State Management

- Svelte stores with Supabase Realtime subscriptions
- Optimistic updates with rollback on failure
- Local-first for scanner operations

---

## Project Structure

```
patchwork-app/
├── src/                          # SvelteKit frontend
│   ├── lib/
│   │   ├── components/
│   │   │   ├── ui/               # Base components (Bits UI based)
│   │   │   ├── patch/            # PatchCard, PatchViewer, ConfidenceHighlighter
│   │   │   ├── document/         # DocumentTree, SpanRenderer
│   │   │   ├── scanner/          # ScannerSelector, ScanProgress
│   │   │   └── layout/           # Sidebar, ModeSelector
│   │   ├── stores/               # patches.ts, documents.ts, scanner.ts
│   │   ├── services/             # supabase.ts, tauri.ts
│   │   └── types/
│   ├── routes/
│   │   ├── inbox/                # Inbox mode
│   │   ├── assemble/             # Assemble mode
│   │   └── editor/               # Editor mode
│   └── app.css
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # scanner.rs, ocr.rs, files.rs
│   │   ├── scanner/              # discovery.rs, escl.rs
│   │   └── ocr/                  # vision.rs (Swift FFI)
│   ├── swift/                    # VisionOCR Swift package
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tailwind.config.js
└── package.json
```

---

## Tauri Commands

```rust
// Scanner
discover_scanners() -> Vec<Scanner>
get_scanner_status(url) -> ScannerStatus
scan_batch(url, settings) -> Vec<ScanResult>  // emits progress events

// OCR
perform_ocr(image_path) -> OcrResult
detect_annotations(image_path, ocr_result) -> Vec<Annotation>
```

---

## Application Modes

### Inbox Mode
- Grid/list view of unprocessed patches
- OCR text preview with confidence highlighting
- Auto-generated suggestions with reasoning
- Accept/reject/modify suggestions
- Manual document assignment

### Assemble Mode
- Split view: document structure + applicable patches
- Drag-and-drop patch positioning
- Visual diff for replacement operations
- Undo/redo via version system

### Editor Mode
- Rendered document from spans
- Inline paragraph editing (creates typed_content)
- Annotation viewing and creation
- Version history browser
- Export to text/PDF

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Init Tauri 2.0 + SvelteKit with `adapter-static`
- [ ] Configure Tailwind + custom theme
- [ ] Set up Supabase client with auth
- [ ] Build app shell (layout, mode switching, folder tree)
- [ ] Supabase Realtime subscriptions

### Phase 2: Scanner Integration
- [ ] mDNS scanner discovery
- [ ] eSCL protocol client (capabilities, status, scan)
- [ ] ADF batch scanning with progress events
- [ ] Scanner selection UI + settings panel

### Phase 3: OCR Pipeline
- [ ] Swift Vision package with C FFI
- [ ] Rust FFI bridge + Tauri command
- [ ] Annotation detection rules
- [ ] Patch record creation + image upload to Storage

### Phase 4: Inbox Mode
- [ ] Patch grid/list with filtering
- [ ] OCR correction UI with confidence highlighting
- [ ] Annotation review panel
- [ ] Suggestion display + manual override
- [ ] Connect to `generate-suggestion` Edge Function

### Phase 5: Assemble Mode
- [ ] Split view: document + applicable patches
- [ ] Drag-and-drop positioning
- [ ] Visual diff for replacements
- [ ] Connect to `apply-patch` Edge Function
- [ ] Undo/redo using version system

### Phase 6: Editor Mode
- [ ] Document renderer from spans
- [ ] Inline paragraph editing (creates typed_content)
- [ ] Connect to `embed-content` Edge Function
- [ ] Annotation creation/viewing
- [ ] Version history browser
- [ ] Export (text, PDF)

### Phase 7: Polish
- [ ] Offline caching
- [ ] Keyboard shortcuts + command palette
- [ ] Performance optimization
- [ ] macOS code signing + notarization
- [ ] DMG installer

---

## Backend Integration

The frontend connects to these existing Supabase Edge Functions:

| Function | Purpose |
|----------|---------|
| `generate-suggestion` | Analyzes patch, suggests target document |
| `apply-patch` | Applies patch to document, creates spans |
| `embed-content` | Generates embeddings for typed content |

See `supabase/README.md` for API documentation.

---

## Getting Started

```bash
cd patchwork-app

# Install dependencies
npm install

# Start development (runs both Vite and Tauri)
npm run tauri dev

# Build for production
npm run tauri build
```

Environment variables needed in `.env`:
```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
