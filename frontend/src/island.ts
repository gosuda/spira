import * as reactAdapter from "./adapters/react";
import * as solidAdapter from "./adapters/solid";
import * as svelteAdapter from "./adapters/svelte";
import * as wasmAdapter from "./adapters/wasm";

export type IslandModule = { default: unknown };
export type IslandLoader = () => Promise<IslandModule>;
export type IslandTable = Record<string, IslandLoader>;
export type IslandCleanup = () => void;
export type IslandMount = (
	target: HTMLElement,
	component: unknown,
	props: Record<string, unknown>,
) => IslandCleanup | undefined;

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
	{
		ext: ".wasm",
		mount: (target, component, props) =>
			wasmAdapter.mount(target, component, props),
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

function parseProps(raw: string): Record<string, unknown> | null {
	if (raw === "") {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
		return parsed as Record<string, unknown>;
	}
	return null;
}

export class SpiraIslandElement extends HTMLElement {
	private observer: IntersectionObserver | null = null;
	private idleId: number | null = null;
	private activated = false;
	private cleanup: IslandCleanup | null = null;
	private disposeQueued = false;
	private loadToken = 0;

	connectedCallback(): void {
		this.cancelPendingDispose();
		const when = this.getAttribute("when") ?? "visible";
		if (!WHEN_VALUES.has(when)) {
			this.reject(
				`spira-island: unknown when "${when}" for entry "${this.getAttribute("entry") ?? ""}"`,
			);
			return;
		}
		if (when === "load") {
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
		this.scheduleDispose();
	}

	private scheduleDispose(): void {
		this.loadToken += 1;
		this.activated = false;
		if (this.cleanup === null || this.disposeQueued) {
			return;
		}
		this.disposeQueued = true;
		queueMicrotask(() => {
			if (!this.disposeQueued) {
				return;
			}
			this.disposeQueued = false;
			this.cleanup?.();
			this.cleanup = null;
		});
	}

	private disconnect(): void {
		this.observer?.disconnect();
		this.observer = null;
		if (this.idleId !== null) {
			cancelIdleCallback(this.idleId);
			this.idleId = null;
		}
	}

	private cancelPendingDispose(): void {
		this.disposeQueued = false;
	}

	private activate(): void {
		if (this.activated) {
			return;
		}
		this.activated = true;
		if (this.cleanup !== null) {
			return;
		}
		const entry = this.getAttribute("entry") ?? "";
		const props = parseProps(this.getAttribute("props") ?? "");
		if (props === null) {
			console.error(`spira-island: invalid props for entry "${entry}"`);
			return;
		}
		void this.load(entry, props, this.loadToken);
	}

	private reject(message: string): void {
		this.activated = true;
		console.error(message);
	}

	private async load(
		entry: string,
		props: Record<string, unknown>,
		token: number,
	): Promise<void> {
		const loader = islandTable.get(entry);
		if (loader === undefined) {
			console.error(`spira-island: no island registered for entry "${entry}"`);
			return;
		}
		try {
			const module = await loader();
			if (token !== this.loadToken || !this.isConnected) {
				return;
			}
			const adapter = adapterFor(entry);
			for (const child of Array.from(this.childNodes)) {
				child.remove();
			}
			const cleanup = adapter.mount(this, module.default, props);
			if (typeof cleanup === "function") {
				this.cleanup = cleanup;
			}
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
