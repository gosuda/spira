type GoInstance = {
	importObject: WebAssembly.Imports;
	run: (instance: WebAssembly.Instance) => Promise<void>;
};
type GoConstructor = new () => GoInstance;
type WasmHandle = { go: GoInstance; instance: WebAssembly.Instance };

let wasmExec: Promise<GoConstructor> | null = null;

function asGoConstructor(value: unknown): GoConstructor | null {
	return typeof value === "function" ? (value as GoConstructor) : null;
}

function loadWasmExec(): Promise<GoConstructor> {
	if (wasmExec === null) {
		wasmExec = new Promise((resolve, reject) => {
			const present = asGoConstructor(Reflect.get(globalThis, "Go"));
			if (present !== null) {
				resolve(present);
				return;
			}
			const script = document.createElement("script");
			script.src = "/islands/wasm_exec.js";
			script.addEventListener("load", () => {
				const loaded = asGoConstructor(Reflect.get(globalThis, "Go"));
				if (loaded === null) {
					wasmExec = null;
					script.remove();
					reject(
						new Error(
							"spira-island: /islands/wasm_exec.js loaded without the Go class",
						),
					);
					return;
				}
				resolve(loaded);
			});
			script.addEventListener("error", () => {
				wasmExec = null;
				script.remove();
				reject(new Error("spira-island: failed to load /islands/wasm_exec.js"));
			});
			document.head.append(script);
		});
	}
	return wasmExec;
}

function basename(entry: string): string {
	const parts = entry.split("/");
	return parts[parts.length - 1] ?? entry;
}

export function loader(entry: string): () => Promise<{ default: unknown }> {
	return async () => {
		const Go = await loadWasmExec();
		const go = new Go();
		const source = fetch(`/islands/${basename(entry)}`);
		const result = await WebAssembly.instantiateStreaming(
			source,
			go.importObject,
		);
		return {
			default: { go, instance: result.instance } satisfies WasmHandle,
		};
	};
}

function isWasmHandle(value: unknown): value is WasmHandle {
	return (
		typeof value === "object" &&
		value !== null &&
		"go" in value &&
		"instance" in value
	);
}

let hostSeq = 0;

export function mount(
	target: HTMLElement,
	component: unknown,
	props: Record<string, unknown>,
): void {
	if (!isWasmHandle(component)) {
		throw new Error(
			"spira-island: wasm island module is not a loaded instance",
		);
	}
	if (target.id === "") {
		hostSeq += 1;
		target.id = `spira-wasm-${hostSeq}`;
	}
	Reflect.set(globalThis, "__spiraIsland", {
		hostId: target.id,
		props: JSON.stringify(props),
	});
	for (const child of Array.from(target.childNodes)) {
		child.remove();
	}
	void component.go.run(component.instance);
}
