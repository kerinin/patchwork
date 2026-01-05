# Patchwork

A visual document assembly tool for writers who draft on paper.

Patchwork bridges the gap between analog writing and digital organization. Scan your typewritten pages or handwritten notebooks, and Patchwork helps you assemble them into structured documents—with intelligent suggestions but no magic you can't override.

## Philosophy

**Paper-first, not paper-only.** Many writers prefer the focus of a typewriter or the freedom of a notebook. But organizing, revising, and sharing that work requires digital tools. Patchwork doesn't try to replace your writing process—it helps you bring your pages into a format you can search, reorganize, and export.

**Transparent intelligence.** The app uses local AI to read your pages and suggest actions, but every suggestion is visible and optional. You always see what the system thinks and why. No content leaves your machine.

**Reading over writing.** This is a review and assembly tool, not an editor. The interface prioritizes legibility, comparison, and navigation over text input.

---

## Core Concepts

### Patches

A **patch** is a scanned page converted to markdown. Patches live in your **inbox** until you decide what to do with them. Each patch shows:

- The original scan (zoomable, rotatable)
- The converted markdown (editable for corrections)
- A confidence indicator for the conversion
- Suggested actions based on your existing documents

### Documents

A **document** is the assembled output—a markdown file built from patches. Documents can be:

- **Manuscripts**: Long-form works assembled from many patches
- **Notes**: Standalone pieces, often single patches
- **Collections**: Grouped documents (chapters of a book, entries in a journal)

### Operations

When you apply a patch to a document, you choose an **operation**:

| Operation | Use Case |
|-----------|----------|
| **Append** | Adding new content to the end |
| **Prepend** | Adding content to the beginning |
| **Insert** | Placing content at a specific location |
| **Replace** | Revising an existing section |

The system suggests operations based on content analysis, but you make the final call.

---

## History & Undo

Patchwork keeps a complete history of your document so you can always go back.

### Automatic Snapshots

Every time you apply a patch, Patchwork saves a snapshot. You don't have to think about it—it just happens. If you make a mistake, you can revert to any previous state.

```
┌─────────────────────────────────────────────────────────────┐
│  Novel.md                                    History ◷      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Today                                                      │
│  ├── 2:34 PM   Applied "page_047.jpg" → Chapter 12         │
│  ├── 2:30 PM   Applied "page_046.jpg" → Chapter 12         │
│  └── 11:15 AM  Applied "page_045.jpg" → Chapter 11         │
│                                                             │
│  Yesterday                                                  │
│  ├── 4:45 PM   Applied "revision_ch3.jpg" → Chapter 3      │
│  └── 4:40 PM   Applied "page_044.jpg" → Chapter 11         │
│                                                             │
│  Dec 28                                                     │
│  └── ...                                                    │
│                                                             │
│  [Revert to selected]              [Compare with current]   │
└─────────────────────────────────────────────────────────────┘
```

Click any snapshot to preview. If you want to go back, hit "Revert" and you're there.

### Source Tracing

Every section of your document remembers where it came from. Click any paragraph to see:

- The original scanned page
- When it was added
- What operation was used

This is especially useful when reviewing—if something looks wrong, you can instantly pull up the source scan to check the original.

```
┌─────────────────────────────────────────────────────────────┐
│  Chapter 3, paragraph 2                          Source ⓘ   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  "The morning arrived slowly, like                          │
│  a reluctant guest."                                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Source: revision_ch3.jpg                                   │
│  Added: Yesterday, 4:45 PM                                  │
│  Operation: Replace (was "The morning came...")             │
│                                                             │
│  [View original scan]                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Workflows

### 1. Scanning

```
Camera/Scanner → Image Files → Patchwork Import
```

Patchwork watches a configurable **import folder**. Drop images there (or use the built-in camera capture on mobile), and they appear in your inbox as patches.

The local vision model (Ollama + LLaVA or similar) processes each image:
1. Detects text regions and page structure
2. Converts content to markdown, preserving:
   - Paragraphs and line breaks
   - Headers (if detected)
   - Emphasis (underlines → *italics*, strikethrough preserved)
   - Lists and indentation
3. Flags low-confidence regions for manual review

### 2. Inbox Triage

The inbox is your staging area. For each patch, you can:

- **Preview**: Side-by-side view of scan and markdown
- **Edit**: Correct OCR errors before applying
- **Apply**: Choose a document and operation
- **Defer**: Move to "Later" queue
- **Discard**: Delete (with confirmation)

#### Smart Suggestions

Patchwork analyzes each patch against your documents and suggests likely actions:

- **"Looks like a revision"**: Patch is 80%+ similar to an existing section → suggests Replace operation with diff preview
- **"Continues from..."**: Patch starts where a document ends → suggests Append
- **"New document?"**: No significant matches → suggests creating a new document
- **"Part of a sequence"**: Multiple patches appear to be consecutive pages → suggests batch operation

Suggestions show their reasoning (e.g., "First line matches last line of Chapter 3") so you can evaluate them.

#### Batch Operations

When you scan multiple pages:

1. Patchwork attempts to detect page order (page numbers, continuation markers, content flow)
2. Suggests grouping sequential patches
3. Lets you reorder via drag-and-drop
4. Applies the batch as a single operation (with undo)

### 3. Document Assembly

The document view shows your assembled work with:

- **Section markers**: Visual indicators showing where each patch was applied
- **Source links**: Click to see the original scan for any section
- **Diff view**: For Replace operations, see exactly what changed

#### Navigation

- **Outline panel**: Jump to any section
- **Minimap**: Visual overview of document structure
- **Search**: Full-text search across all documents
- **Filters**: Show only sections from certain date ranges, confidence levels, etc.

### 4. Review & Correction

After applying patches, review mode helps you catch errors:

- **Low-confidence highlighting**: Regions the model was uncertain about
- **Comparison view**: Original scan beside converted text
- **Quick correction**: Click any word to edit, with the scan zoomed to that region
- **Batch find/replace**: Fix systematic OCR errors (e.g., "tbe" → "the")

### 5. Export

Export documents as:

- **Markdown**: Plain `.md` files
- **PDF**: Formatted for print or sharing
- **HTML**: For web publishing
- **DOCX**: For editors who need Word format
- **Archive**: ZIP containing markdown + original scans

---

## Interface

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ Patchwork                              [Search]  [■ □]   │
├─────────────┬───────────────────────────────────────────────┤
│             │                                               │
│  INBOX (12) │   [Scan Preview]         [Markdown Preview]   │
│  ─────────  │                                               │
│  ▸ Today    │   ┌─────────────┐       ┌─────────────────┐   │
│    Page 1   │   │             │       │ # Chapter 7     │   │
│    Page 2   │   │   [scan]    │       │                 │   │
│    Page 3   │   │             │       │ The morning...  │   │
│             │   └─────────────┘       └─────────────────┘   │
│  DOCUMENTS  │                                               │
│  ─────────  │   Confidence: 94%  ┃  Suggested: Append to    │
│  ▸ Novel    │                    ┃  "Chapter 6" (continues) │
│    Ch 1-6   │   ─────────────────────────────────────────   │
│  ▸ Journal  │   [Discard]  [Defer]  [Edit]  [Apply ▾]       │
│             │                                               │
└─────────────┴───────────────────────────────────────────────┘
```

### Visual Principles

- **High contrast**: Dark text on light backgrounds (or inverted in dark mode)
- **Generous whitespace**: Content breathes; nothing feels cramped
- **Large preview panes**: Scans and text are readable without zooming
- **Minimal chrome**: Interface elements recede; your writing is the focus
- **Diff colors**: Additions in green, removals in red, unchanged in gray

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `j/k` | Next/previous patch in inbox |
| `Space` | Toggle scan/markdown focus |
| `e` | Edit current patch |
| `a` | Apply with suggested action |
| `d` | Defer patch |
| `u` | Undo last action |
| `h` | Open history panel |
| `/` | Search |
| `?` | Show all shortcuts |

---

## Technical Architecture

### Local-First

All processing happens on your machine:

- **Vision model**: Ollama running LLaVA, Llama Vision, or compatible model
- **Storage**: SQLite database + image files in a configurable location
- **No cloud**: Your manuscripts never leave your computer

### Stack

```
┌─────────────────────────────────────────┐
│            Patchwork UI                 │
│         (Tauri + SvelteKit)             │
├─────────────────────────────────────────┤
│              Core Engine                │
│               (Rust)                    │
├──────────────┬──────────────────────────┤
│   Storage    │    Vision Pipeline       │
│  (SQLite +   │   (Ollama Client)        │
│   Images)    │                          │
└──────────────┴──────────────────────────┘
```

---

## Roadmap

### Phase 1: Core Loop
- [ ] Image import and preprocessing
- [ ] Ollama integration for OCR
- [ ] Basic inbox with preview
- [ ] Document creation and append operations
- [ ] Markdown export

### Phase 2: Smart Features
- [ ] Content similarity detection
- [ ] Operation suggestions
- [ ] Batch patch handling
- [ ] Page sequence detection
- [ ] Replace operation with diff view

### Phase 3: Polish
- [ ] Automatic snapshots and undo
- [ ] Source tracing UI
- [ ] Full keyboard navigation
- [ ] Dark mode
- [ ] Search across documents
- [ ] Additional export formats

### Phase 4: Extended
- [ ] Mobile companion app (camera capture)
- [ ] Handwriting model fine-tuning
- [ ] Plugin system for custom operations

---

## Why "Patchwork"?

A patchwork quilt is assembled from individual pieces into a coherent whole. Each patch retains its character—you can see the seams, trace where each piece came from. The result is both unified and visibly composed.

That's what this tool does for your writing: assembles pages into documents while keeping the connection to their origins visible.

---

## License

[To be determined]

---

*Built for writers who think better with paper.*
