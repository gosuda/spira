import type { ComponentType } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

export function mount(
	target: HTMLElement,
	component: unknown,
	props: Record<string, unknown>,
): () => void {
	const root = createRoot(target);
	root.render(createElement(component as ComponentType<unknown>, props));
	return () => {
		root.unmount();
	};
}
