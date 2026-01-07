# Top-Level UI Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strip UI to essentials with minimal chrome, paper aesthetic, and typewriter-friendly typography.

**Architecture:** Remove sidebar, consolidate all chrome into a single TopBar. Activity status moves inline. Settings menu replaces user icon.

**Tech Stack:** SvelteKit 2, Svelte 5 ($state/$derived/$props), Tailwind CSS, Google Fonts

---

## Task 1: Add Typewriter Font

**Files:**
- Modify: `patchwork-app/src/routes/+layout.svelte`
- Modify: `patchwork-app/tailwind.config.js`

**Step 1: Add Courier Prime font to layout**

In `+layout.svelte`, update the Google Fonts link to include Courier Prime:

```svelte
<link
  href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Inter:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap"
  rel="stylesheet"
/>
```

**Step 2: Add typewriter font family to Tailwind config**

In `tailwind.config.js`, add to `fontFamily`:

```javascript
fontFamily: {
  document: ['Libre Baskerville', 'serif'],
  ui: ['Inter', 'sans-serif'],
  typewriter: ['Courier Prime', 'Courier', 'monospace'],
},
```

**Step 3: Verify fonts load**

Run: `cd patchwork-app && npm run dev`

Open browser, inspect element, verify `font-typewriter` class applies Courier Prime.

**Step 4: Commit**

```bash
git add patchwork-app/src/routes/+layout.svelte patchwork-app/tailwind.config.js
git commit -m "feat: add Courier Prime typewriter font"
```

---

## Task 2: Update Mode Button Styles

**Files:**
- Modify: `patchwork-app/src/app.css`

**Step 1: Replace mode button styles with minimal pressed effect**

In `app.css`, replace the `.mode-button` styles:

```css
@layer components {
  .mode-tab {
    @apply px-3 py-1.5 text-sm font-medium transition-all;
  }

  .mode-tab-active {
    @apply text-ink;
    text-shadow: 0 1px 0 rgba(255,255,255,0.8);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
  }

  .mode-tab-inactive {
    @apply text-ink-light hover:text-ink;
  }

  .card {
    @apply bg-white rounded-lg shadow-card p-4;
  }

  .patch-card {
    @apply card hover:shadow-stack transition-shadow cursor-pointer;
  }
}
```

**Step 2: Verify styles compile**

Run: `npm run dev`

No errors in terminal.

**Step 3: Commit**

```bash
git add patchwork-app/src/app.css
git commit -m "feat: update mode tab styles with pressed effect"
```

---

## Task 3: Create ActivityStatus Component

**Files:**
- Create: `patchwork-app/src/lib/components/layout/ActivityStatus.svelte`
- Create: `patchwork-app/src/lib/components/layout/ActivityStatus.test.ts`

**Step 1: Write the test file**

Create `patchwork-app/src/lib/components/layout/ActivityStatus.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ActivityStatus from './ActivityStatus.svelte';
import { importState } from '$lib/stores/import';
import { get } from 'svelte/store';

// Mock the import store
vi.mock('$lib/stores/import', () => {
  const { writable, derived } = require('svelte/store');

  const createMockStore = () => {
    const { subscribe, set, update } = writable({
      queue: [],
      isProcessing: false,
      completedCount: 0,
      totalCount: 0
    });
    return { subscribe, set, update, reset: () => set({ queue: [], isProcessing: false, completedCount: 0, totalCount: 0 }) };
  };

  const mockImportState = createMockStore();

  return {
    importState: mockImportState,
    hasErrors: derived(mockImportState, ($state) => $state.queue.some((i: any) => i.status === 'error'))
  };
});

describe('ActivityStatus', () => {
  beforeEach(() => {
    importState.reset();
  });

  it('should be hidden when idle', () => {
    render(ActivityStatus);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('should show importing status when processing', async () => {
    importState.set({
      queue: [],
      isProcessing: true,
      completedCount: 2,
      totalCount: 5
    });

    render(ActivityStatus);
    expect(screen.getByText(/Importing 2 of 5/)).toBeTruthy();
  });

  it('should show completed status briefly', async () => {
    importState.set({
      queue: [],
      isProcessing: false,
      completedCount: 5,
      totalCount: 5
    });

    render(ActivityStatus);
    expect(screen.getByText(/5 imported/)).toBeTruthy();
  });

  it('should show error status when there are failures', async () => {
    importState.set({
      queue: [{ id: '1', file: new File([], 'test.png'), status: 'error', progress: 0, error: 'Failed' }],
      isProcessing: false,
      completedCount: 3,
      totalCount: 5
    });

    render(ActivityStatus);
    expect(screen.getByText(/failed/i)).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd patchwork-app && npm test -- src/lib/components/layout/ActivityStatus.test.ts`

Expected: FAIL (component doesn't exist)

**Step 3: Create the ActivityStatus component**

Create `patchwork-app/src/lib/components/layout/ActivityStatus.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { importState, hasErrors } from '$lib/stores/import';

  let state = $derived($importState);
  let showErrors = $derived($hasErrors);

  // Count errors in queue
  let errorCount = $derived(state.queue.filter((i) => i.status === 'error').length);

  // Should we show anything?
  let shouldShow = $derived(
    state.isProcessing ||
    showErrors ||
    (state.completedCount > 0 && state.totalCount > 0)
  );

  // Auto-hide completed status after delay
  let completedVisible = $state(true);

  $effect(() => {
    if (!state.isProcessing && state.completedCount > 0 && !showErrors) {
      completedVisible = true;
      const timer = setTimeout(() => {
        completedVisible = false;
        importState.clearCompleted();
      }, 3000);
      return () => clearTimeout(timer);
    }
  });

  function handleClick() {
    goto('/import');
  }
</script>

{#if shouldShow && (state.isProcessing || showErrors || completedVisible)}
  <button
    class="flex items-center gap-2 text-sm text-ink-light hover:text-ink transition-colors"
    onclick={handleClick}
    role="status"
    aria-live="polite"
  >
    {#if state.isProcessing}
      <span class="h-3 w-3 animate-spin rounded-full border border-ink-light border-t-transparent"></span>
      <span>Importing {state.completedCount} of {state.totalCount}</span>
    {:else if showErrors}
      <span class="text-red-600">&#9888;</span>
      <span class="text-red-600">{errorCount} failed</span>
    {:else if state.completedCount > 0}
      <span class="text-green-600">&#10003;</span>
      <span>{state.completedCount} imported</span>
    {/if}
  </button>
{/if}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/components/layout/ActivityStatus.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add patchwork-app/src/lib/components/layout/ActivityStatus.svelte patchwork-app/src/lib/components/layout/ActivityStatus.test.ts
git commit -m "feat: add ActivityStatus component for inline TopBar status"
```

---

## Task 4: Create SettingsMenu Component

**Files:**
- Create: `patchwork-app/src/lib/components/layout/SettingsMenu.svelte`
- Create: `patchwork-app/src/lib/components/layout/SettingsMenu.test.ts`

**Step 1: Write the test file**

Create `patchwork-app/src/lib/components/layout/SettingsMenu.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SettingsMenu from './SettingsMenu.svelte';

// Mock auth
vi.mock('$lib/services/auth', () => ({
  ensureAuthenticated: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
}));

// Mock supabase
vi.mock('$lib/services/supabase', () => ({
  getSupabase: vi.fn().mockReturnValue({
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null })
    }
  })
}));

describe('SettingsMenu', () => {
  it('should render settings icon', () => {
    render(SettingsMenu);
    expect(screen.getByRole('button', { name: /settings/i })).toBeTruthy();
  });

  it('should open dropdown on click', async () => {
    render(SettingsMenu);
    const button = screen.getByRole('button', { name: /settings/i });
    await fireEvent.click(button);
    expect(screen.getByText(/sign out/i)).toBeTruthy();
  });

  it('should show user email when loaded', async () => {
    render(SettingsMenu);
    const button = screen.getByRole('button', { name: /settings/i });
    await fireEvent.click(button);
    // Wait for async auth to load
    await vi.waitFor(() => {
      expect(screen.getByText(/test@example.com/)).toBeTruthy();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/components/layout/SettingsMenu.test.ts`

Expected: FAIL (component doesn't exist)

**Step 3: Create the SettingsMenu component**

Create `patchwork-app/src/lib/components/layout/SettingsMenu.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { ensureAuthenticated, type AuthUser } from '$lib/services/auth';
  import { getSupabase } from '$lib/services/supabase';

  let isOpen = $state(false);
  let user = $state<AuthUser | null>(null);

  onMount(async () => {
    try {
      user = await ensureAuthenticated();
    } catch (e) {
      console.error('Failed to get user:', e);
    }
  });

  async function handleSignOut() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    window.location.reload();
  }

  function handleToggle() {
    isOpen = !isOpen;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.settings-menu')) {
      isOpen = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="settings-menu relative">
  <button
    class="p-1.5 text-ink-light hover:text-ink transition-colors rounded"
    onclick={handleToggle}
    aria-label="Settings"
    aria-expanded={isOpen}
  >
    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  </button>

  {#if isOpen}
    <div class="absolute right-0 top-full mt-1 w-56 rounded-lg border border-paper-dark bg-white shadow-lg py-1 z-50">
      {#if user?.email}
        <div class="px-3 py-2 text-xs text-ink-light border-b border-paper-dark">
          {user.email}
        </div>
      {/if}
      <button
        class="w-full px-3 py-2 text-left text-sm text-ink hover:bg-paper-dark transition-colors"
        onclick={handleSignOut}
      >
        Sign out
      </button>
    </div>
  {/if}
</div>
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/components/layout/SettingsMenu.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add patchwork-app/src/lib/components/layout/SettingsMenu.svelte patchwork-app/src/lib/components/layout/SettingsMenu.test.ts
git commit -m "feat: add SettingsMenu component with user info and sign out"
```

---

## Task 5: Rewrite TopBar Component

**Files:**
- Modify: `patchwork-app/src/lib/components/layout/TopBar.svelte`

**Step 1: Rewrite TopBar with new design**

Replace entire contents of `TopBar.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import ActivityStatus from './ActivityStatus.svelte';
  import SettingsMenu from './SettingsMenu.svelte';

  const navItems = [
    { name: 'Import', path: '/import' },
    { name: 'Assemble', path: '/assemble' },
    { name: 'Edit', path: '/editor' }
  ];

  function isActive(path: string): boolean {
    return $page.url.pathname.startsWith(path);
  }
</script>

<header class="flex items-center justify-between border-b border-paper-dark bg-white px-6 py-3">
  <div class="flex items-center gap-6">
    <h1 class="font-typewriter text-lg font-bold text-ink" style="text-shadow: 0 1px 0 rgba(255,255,255,0.8), 0 -1px 1px rgba(0,0,0,0.1);">
      Patchwork
    </h1>
    <nav class="flex gap-1">
      {#each navItems as mode}
        <a
          href={mode.path}
          class="mode-tab {isActive(mode.path) ? 'mode-tab-active' : 'mode-tab-inactive'}"
        >
          {mode.name}
        </a>
      {/each}
    </nav>
  </div>

  <div class="flex items-center gap-4">
    <ActivityStatus />
    <SettingsMenu />
  </div>
</header>
```

**Step 2: Verify TopBar renders correctly**

Run: `npm run dev`

Open browser, verify:
- "Patchwork" appears with typewriter font and subtle emboss
- Mode tabs show with pressed effect on active
- Activity status appears when importing
- Settings gear icon works

**Step 3: Commit**

```bash
git add patchwork-app/src/lib/components/layout/TopBar.svelte
git commit -m "feat: rewrite TopBar with new minimal design"
```

---

## Task 6: Update Layout - Remove Sidebar and Floating ImportStatus

**Files:**
- Modify: `patchwork-app/src/routes/+layout.svelte`

**Step 1: Update layout to remove Sidebar and ImportStatus**

Replace entire contents of `+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css';
  import TopBar from '$components/layout/TopBar.svelte';

  let { children } = $props();
</script>

<svelte:head>
  <title>Patchwork</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Inter:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="flex h-screen flex-col bg-paper">
  <TopBar />
  <main class="flex-1 overflow-auto p-8">
    {@render children()}
  </main>
</div>
```

**Step 2: Verify layout works**

Run: `npm run dev`

Open browser, verify:
- No sidebar
- Full-width content
- TopBar at top
- No floating toast at bottom

**Step 3: Commit**

```bash
git add patchwork-app/src/routes/+layout.svelte
git commit -m "feat: update layout to remove sidebar and floating status"
```

---

## Task 7: Delete Unused Components

**Files:**
- Delete: `patchwork-app/src/lib/components/layout/Sidebar.svelte`
- Delete: `patchwork-app/src/lib/components/ui/ConnectionStatus.svelte`
- Delete: `patchwork-app/src/lib/components/import/ImportStatus.svelte`

**Step 1: Delete the files**

```bash
cd patchwork-app
rm src/lib/components/layout/Sidebar.svelte
rm src/lib/components/ui/ConnectionStatus.svelte
rm src/lib/components/import/ImportStatus.svelte
```

**Step 2: Verify no import errors**

Run: `npm run check`

Expected: No errors about missing imports

**Step 3: Run all tests**

Run: `npm test`

Expected: All tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused Sidebar, ConnectionStatus, ImportStatus components"
```

---

## Task 8: Final Verification

**Step 1: Run full test suite**

Run: `npm test`

Expected: All tests pass

**Step 2: Run type check**

Run: `npm run check`

Expected: No errors

**Step 3: Manual verification**

Run: `npm run dev`

Verify:
- [ ] "Patchwork" title has typewriter font with emboss effect
- [ ] Mode tabs work, active tab has pressed appearance
- [ ] No sidebar visible
- [ ] Full-width content area
- [ ] Settings gear opens dropdown with email and sign out
- [ ] Drag file to Import page shows inline activity status
- [ ] Activity status fades after completion
- [ ] Errors persist in activity status until clicked

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any final UI issues"
```
