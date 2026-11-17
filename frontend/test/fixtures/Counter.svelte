<script lang="ts">
	let { label = "" }: { label?: string } = $props();
	let count = $state(0);
</script>

<button type="button" data-label={label} onclick={() => (count += 1)}>{`svelte ${count}`}</button>
