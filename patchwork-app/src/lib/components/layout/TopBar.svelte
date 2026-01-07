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
