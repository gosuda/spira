import { defineIslands, type IslandTable } from "../src/island";
import reactDisposableDefault, {
	reactDisposable,
	resetReactDisposable,
} from "./fixtures/Disposable.react";
import solidDisposableDefault, {
	resetSolidDisposable,
	solidDisposable,
} from "./fixtures/Disposable.solid";
import svelteDisposableDefault from "./fixtures/Disposable.svelte";
import {
	resetSvelteDisposable,
	svelteDisposable,
} from "./fixtures/disposable-svelte";

const table: IslandTable = {
	"example/shop/disposable.react.tsx": () =>
		Promise.resolve({ default: reactDisposableDefault }),
	"example/shop/disposable.solid.tsx": () =>
		Promise.resolve({ default: solidDisposableDefault }),
	"example/shop/disposable.svelte": () =>
		Promise.resolve({ default: svelteDisposableDefault }),
};

defineIslands(table);

function island(entry: string): HTMLElement {
	const el = document.createElement("spira-island");
	el.setAttribute("entry", entry);
	el.setAttribute("props", "{}");
	el.setAttribute("when", "load");
	document.body.append(el);
	return el;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("island disposal", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	test("removing a Solid island disposes its reactive root", async () => {
		resetSolidDisposable();
		const el = island("example/shop/disposable.solid.tsx");
		await vi.waitFor(() => {
			expect(el.querySelector("span")).not.toBeNull();
		});
		await vi.waitFor(() => {
			expect(solidDisposable.effectRuns).toBeGreaterThan(0);
		});
		const span = el.querySelector("span");
		expect(span?.textContent).toBe("solid go 0");
		const runs = solidDisposable.effectRuns;
		el.remove();
		await vi.waitFor(() => {
			expect(solidDisposable.cleaned).toBe(true);
		});
		solidDisposable.setGo?.(1);
		await sleep(20);
		expect(span?.textContent).toBe("solid go 0");
		expect(solidDisposable.effectRuns).toBe(runs);
		expect(solidDisposable.cleanups).toBe(1);
	});

	test("removing a React island unmounts its root", async () => {
		resetReactDisposable();
		const el = island("example/shop/disposable.react.tsx");
		await vi.waitFor(() => {
			expect(el.querySelector("span")).not.toBeNull();
		});
		await vi.waitFor(() => {
			expect(reactDisposable.effectRuns).toBeGreaterThan(0);
		});
		const span = el.querySelector("span");
		expect(span?.textContent).toBe("react go 0");
		expect(reactDisposable.lastGo).toBe(0);
		const runs = reactDisposable.effectRuns;
		el.remove();
		await vi.waitFor(() => {
			expect(reactDisposable.cleaned).toBe(true);
		});
		reactDisposable.setGo?.(1);
		await sleep(20);
		expect(span?.textContent).toBe("react go 0");
		expect(reactDisposable.effectRuns).toBe(runs);
		expect(reactDisposable.lastGo).toBe(0);
		expect(reactDisposable.cleanups).toBe(1);
	});

	test("removing a Svelte island unmounts its component", async () => {
		resetSvelteDisposable();
		const el = island("example/shop/disposable.svelte");
		await vi.waitFor(() => {
			expect(el.querySelector("span")).not.toBeNull();
		});
		await vi.waitFor(() => {
			expect(svelteDisposable.effectRuns).toBeGreaterThan(0);
		});
		const span = el.querySelector("span");
		expect(span?.textContent).toBe("svelte go 0");
		const runs = svelteDisposable.effectRuns;
		el.remove();
		await vi.waitFor(() => {
			expect(svelteDisposable.cleaned).toBe(true);
		});
		svelteDisposable.setGo?.(1);
		await sleep(20);
		expect(span?.textContent).toBe("svelte go 0");
		expect(svelteDisposable.effectRuns).toBe(runs);
		expect(svelteDisposable.cleanups).toBe(1);
	});
});
