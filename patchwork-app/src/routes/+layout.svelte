<script lang="ts">
	import '../app.css';
	import Sidebar from '$components/layout/Sidebar.svelte';
	import TopBar from '$components/layout/TopBar.svelte';
	import ImportStatus from '$lib/components/import/ImportStatus.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<title>Patchwork</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="flex h-screen bg-paper">
	<Sidebar />
	<div class="flex flex-1 flex-col">
		<TopBar />
		<main class="flex-1 overflow-auto p-6">
			{@render children()}
		</main>
	</div>
</div>

<ImportStatus />
