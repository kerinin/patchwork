<script lang="ts">
  import TopBar from '$components/layout/TopBar.svelte';

  let { children } = $props();
</script>

<div class="flex h-screen flex-col bg-paper">
  <TopBar />
  <main class="flex-1 overflow-auto p-8">
    {@render children()}
  </main>
</div>
