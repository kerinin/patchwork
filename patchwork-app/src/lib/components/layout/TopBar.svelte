<script lang="ts">
	import { page } from '$app/stores';
	import ConnectionStatus from '$components/ui/ConnectionStatus.svelte';

	const navItems = [
		{ name: 'Import', path: '/import', description: 'Import scanned patches' },
		{ name: 'Assemble', path: '/assemble', description: 'Build documents from patches' },
		{ name: 'Edit', path: '/editor', description: 'Edit and export documents' }
	];

	function isActive(path: string): boolean {
		return $page.url.pathname.startsWith(path);
	}
</script>

<header class="flex items-center justify-between border-b border-paper-dark bg-white px-6 py-3">
	<nav class="flex gap-2">
		{#each navItems as mode}
			<a
				href={mode.path}
				class="mode-button {isActive(mode.path) ? 'mode-button-active' : 'mode-button-inactive'}"
				title={mode.description}
			>
				{mode.name}
			</a>
		{/each}
	</nav>

	<div class="flex items-center gap-4">
		<ConnectionStatus />
		<button class="rounded-lg bg-accent px-4 py-2 text-white transition-colors hover:bg-accent/90">
			Scan
		</button>
	</div>
</header>
