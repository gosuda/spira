import { loader as wasmLoader } from "../src/adapters/wasm";
import { defineIslands, type IslandTable } from "../src/island";

const createdGo: FakeGo[] = [];
const runCalls: unknown[] = [];
let lastUrl: string | null = null;
let lastImports: unknown = null;
let lastInstance: unknown = null;

class FakeGo {
	importObject = { spira: true };

	constructor() {
		createdGo.push(this);
	}

	run(instance: unknown): Promise<void> {
		runCalls.push(instance);
		return Promise.resolve();
	}
}

function installStubs(
	fetchImpl: (url: string) => Promise<{ ok: boolean }>,
): void {
	lastUrl = null;
	lastImports = null;
	lastInstance = null;
	vi.stubGlobal("Go", FakeGo);
	vi.stubGlobal("fetch", async (url: string) => {
		lastUrl = url;
		return fetchImpl(url);
	});
	vi.stubGlobal("WebAssembly", {
		instantiateStreaming: async (source: unknown, imports: unknown) => {
			lastImports = imports;
			lastInstance = { source, imports };
			await source;
			return { instance: lastInstance };
		},
	});
}

function island(entry: string, props: string): HTMLElement {
	const el = document.createElement("spira-island");
	el.setAttribute("entry", entry);
	el.setAttribute("props", props);
	el.setAttribute("when", "load");
	el.innerHTML = "<span>fallback</span>";
	document.body.append(el);
	return el;
}

beforeEach(() => {
	createdGo.length = 0;
	runCalls.length = 0;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	Reflect.deleteProperty(globalThis, "__spiraIsland");
	document.body.innerHTML = "";
});

describe("wasm island", () => {
	test("sets the host contract with the element id and the props string and clears the fallback", async () => {
		installStubs(() => Promise.resolve({ ok: true }));
		const entry = "example/shop/stock/islands/ticker/ticker.wasm";
		const table: IslandTable = { [entry]: wasmLoader(entry) };
		defineIslands(table);
		const el = island(entry, '{"initial":7}');
		el.id = "ticker-host";

		await vi.waitFor(() => {
			expect(runCalls.length).toBe(1);
		});
		expect(Reflect.get(globalThis, "__spiraIsland")).toEqual({
			hostId: "ticker-host",
			props: '{"initial":7}',
		});
		expect(el.querySelector("span")).toBeNull();
		expect(el.childElementCount).toBe(0);
		expect(lastUrl).toBe("/islands/ticker.wasm");
		expect(lastImports).toBe(createdGo[0]?.importObject);
		expect(runCalls[0]).toBe(lastInstance);
	});

	test("assigns a host id when the island element has none", async () => {
		installStubs(() => Promise.resolve({ ok: true }));
		const entry = "example/shop/stock/islands/ticker/ticker.wasm";
		defineIslands({ [entry]: wasmLoader(entry) });
		const el = island(entry, "{}");
		expect(el.id).toBe("");

		await vi.waitFor(() => {
			expect(runCalls.length).toBe(1);
		});
		const contract: unknown = Reflect.get(globalThis, "__spiraIsland");
		expect(contract).toEqual({ hostId: el.id, props: "{}" });
		expect(el.id).not.toBe("");
	});

	test("a failed fetch keeps the fallback and logs one error naming the entry", async () => {
		installStubs(() => Promise.reject(new Error("network down")));
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const entry = "example/shop/stock/islands/ticker/broken.wasm";
		defineIslands({ [entry]: wasmLoader(entry) });
		const el = island(entry, "{}");

		await vi.waitFor(() => {
			expect(spy).toHaveBeenCalledTimes(1);
		});
		expect(String(spy.mock.calls[0]?.[0])).toContain(entry);
		expect(el.querySelector("span")?.textContent).toBe("fallback");
		expect(runCalls.length).toBe(0);
		expect(Reflect.get(globalThis, "__spiraIsland")).toBeUndefined();
	});
});
