// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import { Window } from "happy-dom";
import { loader, mount } from "../src/adapters/wasm";

const wasmExecPath = process.env.SPIRA_WASM_EXEC;
const wasmPath = resolve(__dirname, "fixtures/wasm-hello/hello.wasm");

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(globalThis, "__spiraIsland");
	Reflect.deleteProperty(globalThis, "document");
});

if (wasmExecPath === undefined) {
	test.skip("real wasm runtime instantiates the built module (SKIPPED: SPIRA_WASM_EXEC is not set)", () => {
		expect(process.env.SPIRA_WASM_EXEC).toBeUndefined();
	});
} else {
	test("real wasm runtime instantiates the built module and the running module updates its host", async () => {
		if (!existsSync(wasmExecPath)) {
			throw new Error(
				`wasm_exec.js not found at ${wasmExecPath}; set SPIRA_WASM_EXEC to the toolchain file`,
			);
		}
		if (!existsSync(wasmPath)) {
			throw new Error(
				`wasm module not built at ${wasmPath}; build it with GOOS=js GOARCH=wasm logos build -o frontend/test/fixtures/wasm-hello/hello.wasm ./frontend/test/fixtures/wasm-hello`,
			);
		}
		const window = new Window();
		Reflect.set(globalThis, "document", window.document);

		runInThisContext(readFileSync(wasmExecPath, "utf8"), {
			filename: wasmExecPath,
		});
		expect(typeof Reflect.get(globalThis, "Go")).toBe("function");

		const bytes = new Uint8Array(readFileSync(wasmPath));
		let seenUrl: string | null = null;
		vi.stubGlobal("fetch", (url: string) => {
			seenUrl = url;
			return Promise.resolve(
				new Response(bytes, {
					headers: { "Content-Type": "application/wasm" },
				}),
			);
		});

		const entry = "frontend/test/fixtures/wasm-hello/hello.wasm";
		const module = await loader(entry)();
		expect(seenUrl).toBe("/islands/hello.wasm");

		const host = document.createElement("div");
		host.id = "wasm-hello-host";
		host.innerHTML = "<span>fallback</span>";
		document.body.append(host);

		mount(host, module.default, { text: "wasm says hi" });

		await vi.waitFor(
			() => {
				expect(host.textContent).toBe("wasm says hi");
			},
			{ timeout: 15000 },
		);
		expect(host.querySelector("span")).toBeNull();
		await window.happyDOM.close();
	}, 30000);
}
