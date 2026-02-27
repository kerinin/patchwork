# Patchwork

A visual document assembly tool for writers who draft on paper.

Patchwork bridges the gap between analog writing and digital organization. Scan your typewritten pages or handwritten notebooks, and Patchwork helps you assemble them into structured documents—with intelligent suggestions but no magic you can't override.

## Philosophy

**Paper-first, not paper-only.** Many writers prefer the focus of a typewriter or the freedom of a notebook. But organizing, revising, and sharing that work requires digital tools. Patchwork doesn't try to replace your writing process—it helps you bring your pages into a format you can search, reorganize, and export.

**Transparent intelligence.** Patchwork uses on-device OCR to read your pages and cloud-based AI for suggestions, but every suggestion is visible and optional. You always see what it thinks and why.

**AI proposes, you approve.** Patchwork is optimized for the case where the AI is correct. Your job is to review and approve, with easy overrides when it's wrong.

---

## Core Concepts

**Inbox**: A single global queue where all patches arrive after scanning. Review and correct them here before assembly.

**Folders**: Containers for organizing your work. Folders can contain documents or other folders.

**Documents**: Text files assembled from patches. Each document tracks which patches contributed to it.

**Patches**: Pages you've scanned, converted to text. A patch starts in the inbox, gets reviewed, then gets applied to a document.

**Annotations**: Margin notes and editing marks detected on your pages—captured as metadata you can work through like a task list.

---

## Workflow

Patchwork has three modes, each for a different stage of the workflow:

```
┌─────────┐      ┌──────────┐      ┌──────────┐
│  INBOX  │  →   │ ASSEMBLE │  →   │  EDITOR  │
│         │      │          │      │          │
│  Review │      │  Build   │      │  Read &  │
│ patches │      │  docs    │      │  refine  │
└─────────┘      └──────────┘      └──────────┘
```

---

## Inbox Mode

This is where patches arrive and get cleaned up. You're not thinking about organization yet—just making sure the text is correct and capturing any margin notes.

### Importing

Patchwork watches a configurable **import folder**. Drop images there (from your scanner, phone, or camera), and they appear in the inbox as patches.

For each image, Patchwork:
1. Converts the page to text
2. Identifies margin annotations and editing marks
3. Flags uncertain regions for review

### The Inbox

All patches arrive in one place. Items that need review are flagged:

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ Patchwork                                 Inbox   [■ □]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  INBOX (47)                          [Select all] [Review]  │
│  ──────────────────────────────────────────────────────────│
│                                                             │
│  Today                                                      │
│  ├── page_047.jpg          ✓                               │
│  ├── page_048.jpg          ✓                               │
│  ├── page_049.jpg          ⚠ needs review                  │
│  ├── page_050.jpg          ✓                               │
│  └── ... (12 more)                                         │
│                                                             │
│  Yesterday                                                  │
│  ├── chapter3_rev.jpg      ✓                               │
│  └── ... (18 more)                                         │
│                                                             │
│  ──────────────────────────────────────────────────────────│
│  47 patches · 3 need review · 44 ready                     │
│                                                             │
│  [→ Assemble]                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Reviewing a Patch

Click any patch to review it. Patchwork shows the original image and extracted text side by side, with uncertain words highlighted:

```
┌─────────────────────────────────────────────────────────────┐
│  Reviewing: page_049.jpg                      ⚠ needs review│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │                     │    │                             │ │
│  │  [original image]   │    │ The letter had been         │ │
│  │   ~~~~~~~~~~~~      │    │ [written] in haste—she      │ │
│  │  showing "written"  │    │ could tell by the way the   │ │
│  │                     │    │ [t's] crossed themselves    │ │
│  │                     │    │ like tiny [swords].         │ │
│  │                     │    │                             │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│                                                             │
│  3 uncertain words (click to edit, image zooms to match)   │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│  Annotations detected:                                      │
│  ├─ ☑ "expand" (margin, para 2)                            │
│  ├─ ☑ "?" (circled word: "swords")                         │
│  └─ ☐ [dismiss]                                            │
│                                                             │
│  [← Prev]  [Mark reviewed ✓]  [Next →]                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Click highlighted words** to edit them; the image pane zooms to that region
- **Accept or dismiss annotations** detected in the margins
- **Mark reviewed** when you're done with this patch

Both panes scroll together, making comparison easy.

### Learning from Corrections

When you fix the same error multiple times, Patchwork offers to fix all instances:

```
┌─────────────────────────────────────────────────────────────┐
│  You've corrected "tbe" → "the" 3 times.                   │
│                                                             │
│  [Fix all in inbox]                              [Dismiss]  │
└─────────────────────────────────────────────────────────────┘
```

---

## Assemble Mode

This is where reviewed patches become part of your documents. Patchwork suggests where each patch should go—most of the time you'll just approve and move on.

### The Happy Path

For each patch, Patchwork suggests where it belongs. When the suggestion is right, just approve it:

```
┌─────────────────────────────────────────────────────────────┐
│  ◉ Patchwork                              Assemble   [■ □]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PATCH 1 of 12                                              │
│  ──────────────────────────────────────────────────────────│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  The morning arrived slowly, like a reluctant guest.    ││
│  │                                                         ││
│  │  Margaret hadn't slept in days. The letters kept        ││
│  │  coming—one every morning, slipped under the door       ││
│  │  before dawn. She'd stopped opening them after the      ││
│  │  third one...                                           ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  Suggested:                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  📄 Add to end of Novel → Chapter 6                     ││
│  │                                                         ││
│  │  "First line continues from last paragraph of Ch 6"     ││
│  │                                                         ││
│  │  [Preview]                          [Apply ✓]  [Skip]   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Not right? [Choose where this goes...]                     │
│                                                             │
│  ──────────────────────────────────────────────────────────│
│  Progress: ████░░░░░░░░░░░░░░░░  3 of 12                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The workflow:
1. See the patch content
2. See the suggested placement with reasoning
3. **Apply** if it's right, **Skip** to decide later, or choose a different location

### Choosing Where a Patch Goes

If the suggestion isn't right, click "Choose where this goes..." to pick the destination:

```
┌─────────────────────────────────────────────────────────────┐
│  Where does this patch go?                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 Novel in Progress                                       │
│     📁 Part One                                             │
│        Chapter 1                                            │
│        Chapter 2                                            │
│        Chapter 3                                            │
│     📁 Part Two                                             │
│        Chapter 4                                            │
│        Chapter 5                                            │
│        Chapter 6  ← suggested                               │
│  📁 Short Stories                                           │
│  📁 Journal                                                 │
│                                                             │
│  + New document    + New folder                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

After selecting a document, Patchwork asks how to add the content:

```
┌─────────────────────────────────────────────────────────────┐
│  How should this be added to Chapter 6?                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ● Add to end                                              │
│  ○ Add to beginning                                        │
│  ○ Insert after paragraph...                               │
│  ○ Replace existing section...                             │
│                                                             │
│  [Cancel]                                          [Apply]  │
└─────────────────────────────────────────────────────────────┘
```

Most of the time you'll pick "Add to end"—the other options are there when you need them.

### Revisions

When Patchwork detects that a patch is a revision of existing content, it suggests replacing:

```
┌─────────────────────────────────────────────────────────────┐
│  Suggested:                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  📄 Replace in Novel → Chapter 3, paragraphs 4-6        ││
│  │                                                         ││
│  │  "This appears to be a revised version of existing text"││
│  │                                                         ││
│  │  [Preview diff]                     [Apply ✓]  [Skip]   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

Click "Preview diff" to see what will change before applying.

### Batch Suggestions

When Patchwork detects sequential pages, it suggests applying them as a group:

```
┌─────────────────────────────────────────────────────────────┐
│  PATCHES 4-8 of 12 (grouped)                                │
│  ──────────────────────────────────────────────────────────│
│                                                             │
│  These 5 patches appear to be sequential pages:             │
│                                                             │
│  1. page_052.jpg  ─┐                                       │
│  2. page_053.jpg   │                                       │
│  3. page_054.jpg   ├─→  Add to end of Novel → Chapter 7    │
│  4. page_055.jpg   │                                       │
│  5. page_056.jpg  ─┘                                       │
│                                                             │
│  [Preview all]  [Reorder...]        [Apply all ✓]  [Skip]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### No Suggestion

When Patchwork can't determine where a patch belongs:

```
┌─────────────────────────────────────────────────────────────┐
│  PATCH 11 of 12                                             │
│  ──────────────────────────────────────────────────────────│
│                                                             │
│  [patch preview...]                                         │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│                                                             │
│  No strong match found.                                     │
│                                                             │
│  [Choose where this goes...]        [Create new document]   │
│                                                             │
│                                                     [Skip]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Editor Mode

This is where you read, annotate, and refine your assembled documents. Patchwork shows your writing in a clean, focused view with support for light editing and annotation.

### The Editor

```
┌─────────────────────────────────────────────────────────────┐
│  Chapter 6                     Novel in Progress   [Export] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     The morning arrived slowly, like a reluctant guest.     │
│                                                             │
│     Margaret hadn't slept in days. The letters kept         │
│  ●  coming—one every morning, slipped under the door        │
│     before dawn. She'd stopped opening them after the       │
│     third one.                                              │
│                                                             │
│     "You can't ignore them forever," David said. He         │
│     was standing in the kitchen doorway, coffee in          │
│  ▲  hand, wearing the expression she'd come to dread:       │
│     concern mixed with something harder underneath.         │
│                                                             │
│     "Watch me."                                             │
│                                                             │
│     She turned back to the window. Outside, the street      │
│     was empty except for a cat picking its way along        │
│     the fence. Normal. Everything looked so painfully       │
│     normal.                                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ● "expand this scene"  ▲ "too on the nose?"   [+ Add note] │
└─────────────────────────────────────────────────────────────┘
```

Features:
- **Clean reading view**: Your writing fills the screen
- **Inline editing**: Click to edit any text directly
- **Annotation markers**: Small symbols in the margin, click for details
- **Add annotations**: Create new notes as you read
- **Export**: Always accessible in the header

### Adding Annotations

Click "+ Add note" or select text and annotate:

```
┌─────────────────────────────────────────────────────────────┐
│  Add annotation                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Selected: "concern mixed with something harder underneath" │
│                                                             │
│  Note: [what is the "something harder"? need to set up    ] │
│        [earlier                                           ] │
│                                                             │
│  [Cancel]                                            [Add]  │
└─────────────────────────────────────────────────────────────┘
```

### The Annotations Panel

Press `n` to see all annotations across the document (or folder):

```
┌─────────────────────────────────────────────────────────────┐
│  Annotations                              Novel in Progress │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Filter: [All ▾]  [Unresolved ▾]                           │
│                                                             │
│  Chapter 3                                                  │
│  ├─ ● "expand this scene"              [View] [Resolve]    │
│  │   Para 4 · from page_019.jpg · Dec 28                   │
│  └─ ● "too much backstory?"            [View] [Resolve]    │
│      Para 12 · from page_020.jpg · Dec 28                  │
│                                                             │
│  Chapter 6                                                  │
│  ├─ ● "expand this scene"              [View] [Resolve]    │
│  │   Para 2 · from page_032.jpg · Yesterday                │
│  ├─ ▲ "too on the nose?"               [View] [Resolve]    │
│  │   Para 5 · from page_032.jpg · Yesterday                │
│  └─ ✎ "what is the something harder?"  [View] [Resolve]    │
│      Para 5 · added in Editor · Today                      │
│                                                             │
│  12 annotations · 8 unresolved                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Source Tracing

Click any paragraph to see where it came from:

```
┌─────────────────────────────────────────────────────────────┐
│  Source                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  "The morning arrived slowly, like a reluctant guest."      │
│                                                             │
│  ───────────────────────────────────────────────────────── │
│  From: page_032.jpg                                         │
│  Added: Yesterday, 4:45 PM                                  │
│  Replaced: "The morning came slowly..."                     │
│                                                             │
│  [View original image]                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Export

Click "Export" in the header, or hover on a folder in the sidebar:

- **Plain text**: Simple `.txt` files
- **PDF**: Formatted for print or sharing
- **HTML**: For web publishing
- **DOCX**: For editors who need Word format
- **Archive**: ZIP containing text + original images

---

## Annotations

Annotations bridge your paper editing and digital organization. When you scribble "CUT" in the margin or circle a word with a question mark, Patchwork captures that as metadata.

### Detection

Patchwork looks for common editing marks:

| Mark | Interpretation |
|------|----------------|
| "cut", "delete", ✗ | Remove this section |
| "expand", "more" | Develop this further |
| "move", → | Relocate this passage |
| "?" or circled text | Review/reconsider |
| "stet" | Keep as-is |
| Margin notes | General comments |
| Unrecognized marks | Shown as "[see image]" with thumbnail |

When Patchwork can't interpret a mark, it captures the region and shows it as a thumbnail you can click to view the original.

### Lifecycle

1. **Detected** in Inbox mode during patch review
2. **Accepted/dismissed** by you before leaving inbox
3. **Attached** to document sections when patch is applied
4. **Visible** in Editor mode as margin markers
5. **Added** manually in Editor mode
6. **Resolved** when you've addressed them

---

## History & Undo

Every time you apply a patch, Patchwork saves a snapshot. Revert to any previous state if needed. History is per-document.

---

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `1` | Switch to Inbox mode |
| `2` | Switch to Assemble mode |
| `3` | Switch to Editor mode |
| `j/k` | Next/previous item |
| `Space` | Toggle image/text focus (Inbox) |
| `Enter` | Apply suggested action (Assemble) |
| `n` | Open annotations panel |
| `e` | Export current document |
| `u` | Undo last action |
| `/` | Search |
| `?` | Show all shortcuts |

---

## Local Development Setup

### Prerequisites

- **Node.js 22** (Node 25 has compatibility issues with SvelteKit's virtual modules)
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop/))
- **Supabase CLI** (`brew install supabase/tap/supabase`)
- **OpenAI API key** (for OCR via GPT-4o Vision)

### 1. Install dependencies

```bash
cd patchwork-app
npm install
```

### 2. Configure environment

Copy the example env file:

```bash
cp patchwork-app/.env.example patchwork-app/.env
```

The defaults are already configured for local Supabase. No changes needed.

### 3. Set up OpenAI key for OCR

Create `supabase/.env` (gitignored) with your OpenAI key:

```
OPENAI_API_KEY=sk-your-key-here
```

### 4. Start local Supabase

Make sure Docker Desktop is running, then:

```bash
supabase start
```

This pulls Docker images on first run (may take a few minutes), runs database migrations, creates the dev user (`dev@patchwork.local` / `devpassword123`), and sets up the storage bucket.

### 5. Start Edge Functions

In a separate terminal:

```bash
supabase functions serve --env-file supabase/.env --no-verify-jwt
```

This serves the OCR, embedding, and suggestion functions locally.

### 6. Start the dev server

```bash
cd patchwork-app
npm run dev -- --open
```

The app opens at `http://localhost:5173` and auto-logs in with the dev user.

### Local Supabase Dashboard

The Supabase Studio dashboard is available at `http://127.0.0.1:54323` for inspecting the database, auth users, and storage.

### Stopping

```bash
supabase stop        # Stop Supabase containers
# Ctrl+C to stop the dev server and edge functions
```

---

## Technical Architecture

Patchwork uses a cloud-synced architecture with on-device OCR. Text extraction happens locally on your device using platform APIs, while documents sync across devices via Supabase. Suggestions are generated server-side using OpenAI embeddings.

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENTS                             │
│                                                             │
│   iOS App              Android App           Web App        │
│   ┌─────────┐          ┌─────────┐          ┌─────────┐    │
│   │ Camera  │          │ Camera  │          │ Import  │    │
│   │ Apple   │          │ ML Kit  │          │ (drag & │    │
│   │ Vision  │          │ OCR     │          │  drop)  │    │
│   └────┬────┘          └────┬────┘          └────┬────┘    │
│        │                    │                    │          │
│        └────────────────────┼────────────────────┘          │
│                             │                               │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │  Sync Engine    │                      │
│                    │  (offline-first)│                      │
│                    └────────┬────────┘                      │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     SUPABASE BACKEND                        │
│                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │  Postgres   │  │   Storage   │  │  Realtime   │        │
│   │  + pgvector │  │   (images)  │  │   (sync)    │        │
│   └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│   ┌─────────────────────────────────────────────────┐      │
│   │              Edge Functions                      │      │
│   │  • generate-suggestion (OpenAI embeddings)       │      │
│   │  • apply-patch (document assembly)               │      │
│   │  • embed-content (typed content embeddings)      │      │
│   └─────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### On-Device OCR

Text extraction runs locally using platform APIs:

| Platform | Technology | Notes |
|----------|------------|-------|
| iOS | Apple Vision | Built-in, excellent quality, handles handwriting |
| Android | ML Kit | On-device, ~5MB auto-download |
| Web | Tesseract.js | WASM-based, runs in browser |

Annotation detection uses a lightweight rules-based system initially, with option to add a small ML model later.

### Backend (Supabase)

- **Postgres + pgvector**: Stores all data with vector similarity search
- **Storage**: Original images (S3-compatible)
- **Realtime**: Sync changes across devices
- **Auth**: User accounts, row-level security
- **Edge Functions**: Server-side logic for suggestions and document assembly

See [ARCHITECTURE.md](./ARCHITECTURE.md) for data model and [supabase/README.md](./supabase/README.md) for backend implementation details.

### Clients

- **iOS/Android**: Native apps with camera integration
- **Web**: SvelteKit app for desktop use
- **Offline-first**: Changes sync when connectivity returns

---

## Roadmap

### Phase 1: Foundation ✅
- [x] Supabase project setup (database, storage, auth)
- [x] Data model and migrations
- [x] Edge Functions (generate-suggestion, apply-patch, embed-content)
- [x] Automated testing (54 tests)
- [ ] Web app scaffolding (SvelteKit)
- [ ] Basic auth flow

### Phase 2: Inbox
- [ ] Image upload and OCR (Tesseract.js for web)
- [ ] Patch review interface
- [ ] Uncertain region flagging
- [ ] Correction learning

### Phase 3: Assemble
- [ ] Folder and document management
- [ ] Suggestion engine UI (backend complete ✅)
- [ ] Approve/override flow
- [ ] Batch operations

### Phase 4: Editor
- [ ] Clean reading view
- [ ] Inline editing
- [ ] Source tracing
- [ ] Export

### Phase 5: Annotations
- [ ] Rules-based annotation detection
- [ ] Accept/dismiss flow in Inbox
- [ ] Annotation panel in Editor
- [ ] Resolve flow

### Phase 6: Mobile
- [ ] iOS app with Apple Vision OCR
- [ ] Android app with ML Kit OCR
- [ ] Offline-first sync

### Phase 7: Polish
- [ ] Full keyboard navigation
- [ ] Dark mode
- [ ] Search across folders

---

## Why "Patchwork"?

A patchwork quilt is assembled from individual pieces into a coherent whole. Each patch retains its character—you can see the seams, trace where each piece came from. The result is both unified and visibly composed.

That's what this tool does for your writing: assembles pages into documents while keeping the connection to their origins visible.

---

## License

Business Source License (BSL)

---

*Built for writers who think better with paper.*
