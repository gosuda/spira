<script lang="ts">
	import { onMount, onDestroy } from "svelte";

	let { count = 0 }: { count?: number } = $props();
	let current = $state(count);
	let pending = $state(false);

	async function refresh(): Promise<void> {
		pending = true;
		try {
			const res = await fetch("/api/cart/count", { headers: { accept: "application/json" } });
			if (res.ok) {
				const body = (await res.json()) as { count?: number };
				if (typeof body.count === "number") {
					current = body.count;
				}
			}
		} finally {
			pending = false;
		}
	}

	function onUpdated(): void {
		void refresh();
	}

	onMount(() => {
		document.body.addEventListener("cart-updated", onUpdated);
		void refresh();
	});
	onDestroy(() => {
		document.body.removeEventListener("cart-updated", onUpdated);
	});
</script>

<button type="button" data-badge="cart" aria-live="polite" onclick={() => void refresh()}>
	{`cart ${current}`}
</button>
{#if pending}<span aria-hidden="true">…</span>{/if}
