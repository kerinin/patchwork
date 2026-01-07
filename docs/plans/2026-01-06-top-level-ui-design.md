# Top-Level UI Cleanup Design

## Goal

Strip the UI to essentials: minimal chrome, paper aesthetic, typewriter-friendly typography.

## Layout

Remove sidebar. Single-column layout with TopBar as the only persistent chrome:

```
┌─────────────────────────────────────────────────────┐
│ TopBar                                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│                   Main Content                      │
│                   (full width)                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Content fills the viewport with generous padding—like a document with margins. No borders on main content area.

## TopBar

```
┌─────────────────────────────────────────────────────┐
│ Patchwork   Import  Assemble  Edit    [activity]  ⚙ │
└─────────────────────────────────────────────────────┘
```

### Elements

**Left side:**
- "Patchwork" as text—distinctive typewriter-style or serif font with subtle emboss/letterpress shadow
- Mode tabs (Import, Assemble, Edit)—same or complementary font, active state uses inset shadow ("pressed")

**Right side:**
- Activity status (when processing)—appears inline, hidden when idle
- Settings icon (gear)—dropdown contains user info + sign out

### Styling
- Light bottom border only
- White or very light background
- No box shadows on the bar itself

## Activity Status

Appears inline in TopBar only when background work is running.

**Copy patterns:**
- During: "Importing 3 of 5"
- Complete: "✓ 5 imported" (fades after 2-3 seconds)
- Error: "⚠ 2 failed" (persists until clicked)

**Behavior:**
- Hidden when idle (no placeholder)
- Clicking navigates to relevant view
- Muted color, doesn't demand attention
- Small spinner icon during activity

## Settings Menu

Click gear icon reveals dropdown:
- Signed in as email (display only)
- Sign out
- (Future: preferences, about)

Simple, minimal dropdown styling.

## Typography & Visual Character

For typewriter users—fonts with soul, not sterile tech defaults.

**Choices:**
- App title: Typewriter-style font (Courier Prime, American Typewriter) or distinctive serif
- Mode tabs: Same or complementary—readable but warm
- Body/UI: Libre Baskerville, Charter, Literata, or slab-serif

**Dimensionality:**
- Title has subtle text-shadow (embossed/letterpress feel)
- Active mode tab has inset shadow (pressed)
- Cards/panels have very soft shadows (paper on paper)

**Not doing:**
- Skeuomorphic textures or heavy decoration
- Effect should be felt, not noticed

## What Gets Removed

- Sidebar component (folders/documents placeholders)
- Scan button (scanning is part of Import if added)
- Connection status dot (errors become modals instead)
- Floating ImportStatus toast (replaced by inline activity)

## What Changes

- "Patchwork" moves from sidebar to TopBar
- ImportStatus becomes inline TopBar element
- Full-width content area
- Warmer, more characterful typography throughout
