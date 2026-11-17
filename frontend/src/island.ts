import * as reactAdapter from "./adapters/react";
import * as solidAdapter from "./adapters/solid";
import * as svelteAdapter from "./adapters/svelte";

export type IslandModule = { default: unknown };
export type IslandLoader = () => Promise<IslandModule>;
export type IslandTable = Record<string, IslandLoader>;
export type IslandMount = (
	target: HTMLElement,
	component: unknown,
	props: Record<string, unknown>,
) => void;

type Adapter = { ext: string; mount: IslandMount };

const adapters: Adapter[] = [
	{
		ext: ".react.tsx",
		mount: (target, component, props) =>
			reactAdapter.mount(target, component, props),
	},
	{
		ext: ".solid.tsx",
		mount: (target, component, props) =>
			solidAdapter.mount(target, component, props),
	},
	{
		ext: ".svelte",
		mount: (target, component, props) =>
			svelteAdapter.mount(target, component, props),
	},
];

const WHEN_VALUES = new Set(["load", "visible", "idle"]);

function adapterFor(entry: string): Adapter {
	for (const adapter of adapters) {
		if (entry.endsWith(adapter.ext)) {
			return adapter;
		}
	}
	throw new Error(`spira-island: no adapter for island entry "${entry}"`);
}

function parseProps(raw: string): Record<string, unknown> {
	if (raw === "") {
		return {};
	}
	const parsed: unknown = JSON.parse(raw);
	if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
		return parsed as Record<string, unknown>;
	}
	return {};
}

export class SpiraIslandElement extends HTMLElement {
	private observer: IntersectionObserver | null = null;
	private idleId: number | null = null;
	private activated = false;

	connectedCallback(): void {
		const when = this.getAttribute("when") ?? "visible";
		if (!WHEN_VALUES.has(when) || when === "load") {
			this.activate();
			return;
		}
		if (when === "idle") {
			this.idleId = requestIdleCallback(() => {
				this.idleId = null;
				this.activate();
			});
			return;
		}
		this.observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				this.disconnect();
				this.activate();
			}
		});
		this.observer.observe(this);
	}

	disconnectedCallback(): void {
		this.disconnect();
	}

	private disconnect(): void {
		this.observer?.disconnect();
		this.observer = null;
		if (this.idleId !== null) {
			cancelIdleCallback(this.idleId);
			this.idleId = null;
		}
	}

	private activate(): void {
		if (this.activated) {
			return;
		}
		this.activated = true;
		const entry = this.getAttribute("entry") ?? "";
		const props = parseProps(this.getAttribute("props") ?? "");
		void this.load(entry, props);
	}

	private async load(
		entry: string,
		props: Record<string, unknown>,
	): Promise<void> {
		const loader = islandTable.get(entry);
		if (loader === undefined) {
			console.error(`spira-island: no island registered for entry "${entry}"`);
			return;
		}
		try {
			const module = await loader();
			const adapter = adapterFor(entry);
			for (const child of Array.from(this.childNodes)) {
				child.remove();
			}
			adapter.mount(this, module.default, props);
		} catch (error) {
			console.error(`spira-island: failed to mount island "${entry}"`, error);
		}
	}
}

const islandTable = new Map<string, IslandLoader>();

export function defineIslands(table: IslandTable): void {
	for (const [entry, loader] of Object.entries(table)) {
		islandTable.set(entry, loader);
	}
	if (customElements.get("spira-island") === undefined) {
		customElements.define("spira-island", SpiraIslandElement);
	}
}
