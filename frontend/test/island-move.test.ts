import { loader as wasmLoader } from "../src/adapters/wasm";
import { defineIslands, type IslandTable } from "../src/island";
import reactDisposableDefault, {
	reactDisposable,
	resetReactDisposable,
} from "./fixtures/Disposable.react";

const runCalls: Array<unknown> = [];
let lastUrl: string | null = null;
let reactLoads = 0;
let wasmLoads = 0;

class FakeGo {
	importObject = { spira: true };

	run(instance: unknown): Promise<void> {
		runCalls.push(instance);
		const contract = Reflect.get(globalThis, "__spiraIsland") as
			| { hostId: string }
			| undefined;
		const host =
			contract === undefined ? null : document.getElementById(contract.hostId);
		const marker = document.createElement("span");
		marker.dataset.go = "program";
		host?.append(marker);
		return Promise.resolve();
	}
}

function installStubs(): void {
	vi.stubGlobal("Go", FakeGo);
	vi.stubGlobal("fetch", async (url: string) => {
		lastUrl = url;
		return { ok: true };
	});
	vi.stubGlobal("WebAssembly", {
		instantiateStreaming: async (source: unknown, imports: unknown) => {
			const instance = { source, imports };
			await source;
			return { instance };
		},
	});
}

const reactEntry = "example/shop/move-disposable.react.tsx";
const wasmEntry = "example/shop/stock/islands/ticker/ticker.wasm";

const table: IslandTable = {
	[reactEntry]: () => {
		reactLoads += 1;
		return Promise.resolve({ default: reactDisposableDefault });
	},
	[wasmEntry]: () => {
		wasmLoads += 1;
		return wasmLoader(wasmEntry)();
	},
};

defineIslands(table);

function island(entry: string): HTMLElement {
	const el = document.createElement("spira-island");
	el.setAttribute("entry", entry);
	el.setAttribute("props", "{}");
	el.setAttribute("when", "load");
	el.innerHTML = "<span>fallback</span>";
	document.body.append(el);
	return el;
}

function flushDispose(): Promise<void> {
	return new Promise<void>((resolve) => {
		queueMicrotask(() => resolve());
	});
}

beforeEach(() => {
	document.body.innerHTML = "";
	runCalls.length = 0;
	lastUrl = null;
	reactLoads = 0;
	wasmLoads = 0;
});

afterEach(async () => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	Reflect.deleteProperty(globalThis, "__spiraIsland");
	document.body.innerHTML = "";
	await flushDispose();
	await flushDispose();
});

describe("island moves", () => {
	test("a moved wasm island keeps its single Go program", async () => {
		installStubs();
		const el = island(wasmEntry);
		el.id = "ticker-host";
		await vi.waitFor(() => {
			expect(runCalls.length).toBe(1);
		});
		expect(wasmLoads).toBe(1);
		expect(lastUrl).toBe("/islands/ticker.wasm");
		const marker = el.querySelector('[data-go="program"]');
		expect(marker).not.toBeNull();
		const box = document.createElement("div");
		document.body.append(box);
		box.append(el);
		await flushDispose();
		await flushDispose();
		expect(wasmLoads).toBe(1);
		expect(runCalls.length).toBe(1);
		expect(el.querySelector('[data-go="program"]')).toBe(marker);
		expect(box.contains(el)).toBe(true);
	});

	test("a move followed by a removal starts no second Go program", async () => {
		installStubs();
		const el = island(wasmEntry);
		el.id = "ticker-host";
		await vi.waitFor(() => {
			expect(runCalls.length).toBe(1);
		});
		const box = document.createElement("div");
		document.body.append(box);
		box.append(el);
		el.remove();
		await flushDispose();
		await flushDispose();
		expect(wasmLoads).toBe(1);
		expect(runCalls.length).toBe(1);
	});

	test("a moved island with cleanup keeps its mount", async () => {
		resetReactDisposable();
		const el = island(reactEntry);
		await vi.waitFor(() => {
			expect(el.querySelector("span")?.textContent).toBe("react go 0");
		});
		expect(reactLoads).toBe(1);
		const text = el.querySelector("span")?.textContent;
		const box = document.createElement("div");
		document.body.append(box);
		box.append(el);
		await flushDispose();
		await flushDispose();
		expect(reactLoads).toBe(1);
		expect(reactDisposable.cleanups).toBe(0);
		expect(el.querySelector("span")?.textContent).toBe(text);
		expect(box.contains(el)).toBe(true);
	});

	test("a removed island disposes its mount once", async () => {
		resetReactDisposable();
		const el = island(reactEntry);
		await vi.waitFor(() => {
			expect(el.querySelector("span")?.textContent).toBe("react go 0");
		});
		el.remove();
		await vi.waitFor(() => {
			expect(reactDisposable.cleanups).toBe(1);
		});
		await flushDispose();
		await flushDispose();
		expect(reactDisposable.cleanups).toBe(1);
		expect(reactLoads).toBe(1);
	});

	test("a move followed by a removal disposes once without remounting", async () => {
		resetReactDisposable();
		const el = island(reactEntry);
		await vi.waitFor(() => {
			expect(el.querySelector("span")?.textContent).toBe("react go 0");
		});
		const box = document.createElement("div");
		document.body.append(box);
		box.append(el);
		el.remove();
		await vi.waitFor(() => {
			expect(reactDisposable.cleanups).toBe(1);
		});
		await flushDispose();
		await flushDispose();
		expect(reactDisposable.cleanups).toBe(1);
		expect(reactLoads).toBe(1);
	});

	test("a re-inserted island mounts again and disposes the new mount once", async () => {
		resetReactDisposable();
		const el = island(reactEntry);
		await vi.waitFor(() => {
			expect(el.querySelector("span")?.textContent).toBe("react go 0");
		});
		el.remove();
		await vi.waitFor(() => {
			expect(reactDisposable.cleanups).toBe(1);
		});
		document.body.append(el);
		await vi.waitFor(() => {
			expect(el.querySelector("span")?.textContent).toBe("react go 0");
		});
		expect(reactLoads).toBe(2);
		el.remove();
		await vi.waitFor(() => {
			expect(reactDisposable.cleanups).toBe(2);
		});
		await flushDispose();
		await flushDispose();
		expect(reactDisposable.cleanups).toBe(2);
		expect(reactLoads).toBe(2);
	});
});
