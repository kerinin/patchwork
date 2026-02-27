<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect to import by default
	onMount(() => {
		goto('/import');
	});
</script>

<div class="flex h-full items-center justify-center">
	<p class="text-ink-light">Redirecting...</p>
</div>
