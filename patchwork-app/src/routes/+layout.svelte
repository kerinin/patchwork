<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getSupabase } from '$lib/services/supabase';

  let { children } = $props();
  let ready = $state(false);

  onMount(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data: { session } }) => {
      const onLoginPage = $page.url.pathname === '/login';

      if (!session && !onLoginPage) {
        goto('/login');
      } else if (session && onLoginPage) {
        goto('/import');
      }

      ready = true;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        goto('/login');
      } else if (event === 'SIGNED_IN') {
        if ($page.url.pathname === '/login') {
          goto('/import');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  });
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

{#if ready}
  {@render children()}
{:else}
  <div class="flex h-screen items-center justify-center bg-paper">
    <p class="text-ink-light">Loading...</p>
  </div>
{/if}
