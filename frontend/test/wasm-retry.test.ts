import { loader as wasmLoader } from "../src/adapters/wasm";
import { defineIslands, type IslandTable } from "../src/island";

class FakeGo {
	importObject = { spira: true };

	run(instance: unknown): Promise<void> {
		runCalls.push(instance);
		return Promise.resolve();
	}
}

const scripts: HTMLScriptElement[] = [];
const runCalls: unknown[] = [];

function island(entry: string): HTMLElement {
	const el = document.createElement("spira-island");
	el.setAttribute("entry", entry);
	el.setAttribute("props", "{}");
	el.setAttribute("when", "load");
	el.innerHTML = "<span>fallback</span>";
	document.body.append(el);
	return el;
}

beforeEach(() => {
	scripts.length = 0;
	runCalls.length = 0;
	vi.stubGlobal("fetch", async () => ({ ok: true }));
	vi.stubGlobal("WebAssembly", {
		instantiateStreaming: async (source: unknown, imports: unknown) => {
			await source;
			return { instance: { source, imports } };
		},
	});
	vi.spyOn(document.head, "append").mockImplementation(
		(...nodes: (Node | string)[]) => {
			for (const node of nodes) {
				if (node instanceof HTMLScriptElement) {
					scripts.push(node);
				}
			}
		},
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	Reflect.deleteProperty(globalThis, "__spiraIsland");
	document.body.innerHTML = "";
});

test("a second island requests wasm_exec.js again after the first load fails", async () => {
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	const first = "example/shop/stock/islands/ticker/first.wasm";
	const second = "example/shop/stock/islands/ticker/second.wasm";
	const table: IslandTable = {
		[first]: wasmLoader(first),
		[second]: wasmLoader(second),
	};
	defineIslands(table);

	const elA = island(first);
	await vi.waitFor(() => {
		expect(scripts.length).toBe(1);
	});
	scripts[0]?.dispatchEvent(new Event("error"));
	await vi.waitFor(() => {
		expect(spy).toHaveBeenCalled();
	});
	expect(elA.querySelector("span")?.textContent).toBe("fallback");

	const elB = island(second);
	await vi.waitFor(() => {
		expect(scripts.length).toBe(2);
	});
	vi.stubGlobal("Go", FakeGo);
	scripts[1]?.dispatchEvent(new Event("load"));
	await vi.waitFor(() => {
		expect(Reflect.get(globalThis, "__spiraIsland")).toBeDefined();
	});
	const contract = Reflect.get(globalThis, "__spiraIsland") as {
		hostId: string;
	};
	expect(contract.hostId).toBe(elB.id);
	expect(runCalls.length).toBe(1);
});
