<script lang="ts">
	import { onMount } from 'svelte';
	import { checkConnection, config, type ConnectionStatus } from '$services/supabase';

	let status: ConnectionStatus | null = null;
	let checking = true;

	onMount(async () => {
		status = await checkConnection();
		checking = false;
	});

	async function recheck() {
		checking = true;
		status = await checkConnection();
		checking = false;
	}
</script>

<div class="connection-status" class:connected={status?.connected} class:disconnected={status && !status.connected}>
	<span class="indicator"></span>
	<span class="label">
		{#if checking}
			Checking...
		{:else if status?.connected}
			{config.isLocal ? 'Local' : 'Remote'}
		{:else}
			Disconnected
		{/if}
	</span>
	{#if status?.error}
		<button class="retry" onclick={recheck} title={status.error}>Retry</button>
	{/if}
</div>

<style>
	.connection-status {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-family: var(--font-ui, 'Inter', sans-serif);
		background: var(--color-paper-dark, #f5f5f3);
		color: var(--color-ink-light, #4a4a4a);
	}

	.indicator {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #9ca3af;
	}

	.connected .indicator {
		background: #22c55e;
	}

	.disconnected .indicator {
		background: #ef4444;
	}

	.label {
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.retry {
		padding: 0.125rem 0.5rem;
		border: 1px solid currentColor;
		border-radius: 0.25rem;
		background: transparent;
		font-size: 0.625rem;
		cursor: pointer;
		opacity: 0.7;
	}

	.retry:hover {
		opacity: 1;
	}
</style>
