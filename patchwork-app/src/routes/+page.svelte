<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect to inbox by default
	onMount(() => {
		goto('/inbox');
	});
</script>

<div class="flex h-full items-center justify-center">
	<p class="text-ink-light">Redirecting...</p>
</div>
