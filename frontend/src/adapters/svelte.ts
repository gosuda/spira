import type { Component } from "svelte";
import { mount as svelteMount, unmount as svelteUnmount } from "svelte";

export function mount(
	target: HTMLElement,
	component: unknown,
	props: Record<string, unknown>,
): () => void {
	const app = svelteMount(component as Component<Record<string, unknown>>, {
		target,
		props,
	});
	return () => {
		void svelteUnmount(app);
	};
}
