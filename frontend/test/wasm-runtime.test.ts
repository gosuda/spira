// @vitest-environment node

// This suite runs in the node environment with a real happy-dom Window
// providing the DOM, instead of the happy-dom test environment. V8's
// WebAssembly.instantiateStreaming brand-checks its Response argument against
// Node's own (undici) Response class, and the happy-dom environment replaces
// the global Response with happy-dom's own class, which instantiateStreaming
// rejects with "must be an instance of Response". Every DOM object below is
// happy-dom's real implementation; only transport-adjacent globals (fetch,
// Response, WebAssembly) stay Node's, and the only substituted transport is
// the stubbed fetch plus the wasm_exec.js script bytes. The adapter itself
// is untouched and nothing but transport is mocked.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import { Window } from "happy-dom";
import type { IslandTable } from "../src/island";

const wasmPath = resolve(__dirname, "fixtures/wasm/ticker.wasm");
const wasmExecPath = resolve(__dirname, "fixtures/wasm/wasm_exec.js");

const BUILD_WASM =
	"GOOS=js GOARCH=wasm logos build -o ../ticker.wasm ./ (run inside frontend/test/fixtures/wasm/ticker)";
const COPY_EXEC =
	'cp "$GOROOT/lib/wasm/wasm_exec.js" frontend/test/fixtures/wasm/wasm_exec.js';

function readOrFail(path: string, how: string): Buffer {
	if (!existsSync(path)) {
		throw new Error(
			`wasm runtime fixture not found at ${path}; create it with: ${how}`,
		);
	}
	return readFileSync(path);
}

const window = new Window();
vi.stubGlobal("document", window.document);
vi.stubGlobal("customElements", window.customElements);
vi.stubGlobal("HTMLElement", window.HTMLElement);
vi.stubGlobal("Event", window.Event);
vi.stubGlobal("HTMLScriptElement", window.HTMLScriptElement);

const { loader: wasmLoader } = await import("../src/adapters/wasm");
const { defineIslands } = await import("../src/island");

function serveWasmExec(source: string, seenScripts: string[]): void {
	// Serve the real wasm_exec.js bytes through the adapter's own seam: the
	// adapter appends one script for /islands/wasm_exec.js and continues on
	// its load event. Execute the real source so globalThis.Go is the real
	// toolchain runtime, then fire the load the adapter waits for.
	vi.spyOn(document.head, "append").mockImplementation(
		(...nodes: (Node | string)[]) => {
			for (const node of nodes) {
				if (!(node instanceof HTMLScriptElement)) {
					continue;
				}
				const src = node.getAttribute("src") ?? "";
				seenScripts.push(src);
				if (src.endsWith("wasm_exec.js")) {
					runInThisContext(source, { filename: wasmExecPath });
					node.dispatchEvent(new Event("load"));
				}
			}
		},
	);
}

afterEach(async () => {
	document.body.innerHTML = "";
	await window.happyDOM.close();
	vi.unstubAllGlobals();
	// Node has no global fs, path, or Go; wasm_exec.js polyfills the first
	// two and defines Go, so remove what it added. globalThis.process is
	// Node's own and is left alone.
	for (const key of ["Go", "fs", "path"]) {
		Reflect.deleteProperty(globalThis, key);
	}
	Reflect.deleteProperty(globalThis, "__spiraIsland");
});

describe("wasm runtime", () => {
	test("the real toolchain runtime mounts the built module and the module writes the props value into its host", async () => {
		const wasmBytes = readOrFail(wasmPath, BUILD_WASM);
		const wasmExecSource = readOrFail(wasmExecPath, COPY_EXEC).toString("utf8");
		// Node provides crypto.getRandomValues, performance.now,
		// TextEncoder, and TextDecoder natively, which is all wasm_exec.js
		// demands; it polyfills fs, process, and path itself.
		const seenScripts: string[] = [];
		serveWasmExec(wasmExecSource, seenScripts);

		let seenUrl: string | null = null;
		vi.stubGlobal("fetch", (url: string) => {
			seenUrl = url;
			// Node's own Response: V8's instantiateStreaming rejects any
			// other implementation, including happy-dom's.
			return Promise.resolve(
				new Response(new Uint8Array(wasmBytes), {
					headers: { "Content-Type": "application/wasm" },
				}),
			);
		});

		const entry = "frontend/test/fixtures/wasm/ticker.wasm";
		const table: IslandTable = { [entry]: wasmLoader(entry) };
		defineIslands(table);

		const el = document.createElement("spira-island");
		el.setAttribute("entry", entry);
		el.setAttribute("props", '{"initial":7}');
		el.setAttribute("when", "load");
		el.id = "ticker-host";
		el.innerHTML = "<span>fallback</span>";
		document.body.append(el);

		await vi.waitFor(
			() => {
				expect(el.textContent).toBe("ticker:7");
			},
			{ timeout: 15000 },
		);

		expect(seenUrl).toBe("/islands/ticker.wasm");
		expect(seenScripts.some((src) => src === "/islands/wasm_exec.js")).toBe(
			true,
		);
		expect(el.querySelector("span")).toBeNull();
		expect(typeof Reflect.get(globalThis, "Go")).toBe("function");
	}, 30000);
});
