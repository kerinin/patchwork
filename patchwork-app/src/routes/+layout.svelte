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
