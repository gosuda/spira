<script lang="ts">
	import { svelteDisposable } from "./disposable-svelte";

	let go = $state(0);
	svelteDisposable.setGo = (value: number) => {
		go = value;
	};
	$effect(() => {
		go;
		svelteDisposable.effectRuns += 1;
		return () => {
			svelteDisposable.cleaned = true;
			svelteDisposable.cleanups += 1;
		};
	});
</script>

<span>{`svelte go ${go}`}</span>
