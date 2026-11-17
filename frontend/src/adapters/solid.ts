import type { Component } from "solid-js";
import { render } from "solid-js/web";

export function mount(
	target: HTMLElement,
	component: unknown,
	props: Record<string, unknown>,
): () => void {
	return render(
		() => (component as Component<Record<string, unknown>>)(props),
		target,
	);
}
