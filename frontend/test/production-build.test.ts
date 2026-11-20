import { resolve } from "node:path";
import { build } from "vite";
import { tableFromGlob } from "../src/island";

const BUILD_TIMEOUT_MS = 120000;

const ISLANDS = [
	{
		entry: "test/fixtures/build-entry.react.ts",
		component: "test/fixtures/Counter.react.tsx",
		key: "frontend/test/fixtures/Counter.react.tsx",
		marker: "react-fixture",
	},
	{
		entry: "test/fixtures/build-entry.solid.ts",
		component: "test/fixtures/Counter.solid.tsx",
		key: "frontend/test/fixtures/Counter.solid.tsx",
		marker: "solid-fixture",
	},
	{
		entry: "test/fixtures/build-entry.svelte.ts",
		component: "test/fixtures/Counter.svelte",
		key: "frontend/test/fixtures/Counter.svelte",
		marker: "svelte-fixture",
	},
];

const APP_ENTRY = "src/entry.ts";

type BundleChunk = {
	fileName: string;
	facadeModuleId: string | null;
	moduleIds: Array<string>;
	code: string;
	imports: Array<string>;
	dynamicImports: Array<string>;
};

async function buildChunks(
	root: string,
	input: Record<string, string>,
): Promise<Array<BundleChunk>> {
	const result = await build({
		configFile: resolve(root, "vite.config.ts"),
		root,
		logLevel: "silent",
		build: {
			write: false,
			manifest: false,
			minify: false,
			rolldownOptions: { input },
		},
	});
	const outputs = (Array.isArray(result) ? result : [result]).flatMap(
		(output) => ("output" in output ? [output] : []),
	);
	const chunks: Array<BundleChunk> = [];
	for (const output of outputs) {
		for (const chunk of output.output) {
			if (chunk.type === "chunk") {
				chunks.push({
					fileName: chunk.fileName,
					facadeModuleId: chunk.facadeModuleId,
					moduleIds: [...chunk.moduleIds],
					code: chunk.code,
					imports: [...chunk.imports],
					dynamicImports: [...chunk.dynamicImports],
				});
			}
		}
	}
	return chunks;
}

function closureChunks(
	chunks: Array<BundleChunk>,
	entryFile: string,
): Array<BundleChunk> {
	const entry = chunks.find((chunk) =>
		chunk.facadeModuleId?.endsWith(entryFile),
	);
	if (entry === undefined) {
		throw new Error(`production build: no chunk for ${entryFile}`);
	}
	const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
	const seen = new Set<string>();
	const closure: Array<BundleChunk> = [];
	const queue: Array<BundleChunk> = [entry];
	let next = queue.pop();
	while (next !== undefined) {
		if (!seen.has(next.fileName)) {
			seen.add(next.fileName);
			closure.push(next);
			for (const name of [...next.imports, ...next.dynamicImports]) {
				const dep = byFile.get(name);
				if (dep !== undefined) {
					queue.push(dep);
				}
			}
		}
		next = queue.pop();
	}
	return closure;
}

function codesOf(chunks: Array<BundleChunk>): string {
	let codes = "";
	for (const chunk of chunks) {
		codes += chunk.code;
	}
	return codes;
}

function idsOf(chunks: Array<BundleChunk>): Array<string> {
	const ids: Array<string> = [];
	for (const chunk of chunks) {
		for (const id of chunk.moduleIds) {
			ids.push(id);
		}
	}
	return ids;
}

function hasId(ids: Array<string>, part: string): boolean {
	return ids.some((id) => id.includes(part));
}

function hasIdEnding(ids: Array<string>, part: string): boolean {
	return ids.some((id) => id.endsWith(part));
}

let islandChunks: Array<BundleChunk> = [];
let appChunks: Array<BundleChunk> = [];

function islandClosure(entryFile: string): Array<BundleChunk> {
	return closureChunks(islandChunks, entryFile);
}

function sharedIslandFiles(): Set<string> {
	const counts = new Map<string, number>();
	for (const island of ISLANDS) {
		for (const chunk of islandClosure(island.entry)) {
			counts.set(chunk.fileName, (counts.get(chunk.fileName) ?? 0) + 1);
		}
	}
	const shared = new Set<string>();
	for (const [file, count] of counts) {
		if (count > 1) {
			shared.add(file);
		}
	}
	return shared;
}

function islandPrivate(entryFile: string): Array<BundleChunk> {
	const shared = sharedIslandFiles();
	return islandClosure(entryFile).filter(
		(chunk) => !shared.has(chunk.fileName),
	);
}

function privateCodes(entryFile: string): string {
	return codesOf(islandPrivate(entryFile));
}

function privateIds(entryFile: string): Array<string> {
	return idsOf(islandPrivate(entryFile));
}

beforeAll(async () => {
	vi.stubEnv("NODE_ENV", "production");
	try {
		const root = resolve(__dirname, "..");
		islandChunks = await buildChunks(root, {
			react: resolve(root, ISLANDS[0]?.entry ?? ""),
			solid: resolve(root, ISLANDS[1]?.entry ?? ""),
			svelte: resolve(root, ISLANDS[2]?.entry ?? ""),
		});
		appChunks = await buildChunks(root, {
			app: resolve(root, APP_ENTRY),
		});
	} finally {
		vi.unstubAllEnvs();
	}
}, BUILD_TIMEOUT_MS);

describe("production build", () => {
	test("bundles each island table with its component", () => {
		for (const island of ISLANDS) {
			const ids = idsOf(islandClosure(island.entry));
			expect(hasIdEnding(ids, island.entry)).toBe(true);
			expect(hasIdEnding(ids, island.component)).toBe(true);
		}
	});

	test("ships the registration key of each island table", () => {
		for (const island of ISLANDS) {
			const codes = privateCodes(island.entry);
			expect(codes).toContain(island.key);
		}
	});

	test("emits no raw JSX or Svelte markup", () => {
		for (const island of [ISLANDS[0], ISLANDS[1]]) {
			const codes = privateCodes(island?.entry ?? "");
			expect(codes).not.toContain("onClick={");
		}
		const svelte = privateCodes(ISLANDS[2]?.entry ?? "");
		expect(svelte).not.toContain("onclick={");
		expect(svelte).not.toContain("<script");
	});

	test("builds the production bundle", () => {
		const ids = idsOf(islandClosure(ISLANDS[0]?.entry ?? ""));
		expect(hasId(ids, "react-dom-client.production.js")).toBe(true);
		expect(hasId(ids, "react-dom-client.development.js")).toBe(false);
	});

	test("bundles the compiled React body with the automatic runtime", () => {
		const entry = ISLANDS[0]?.entry ?? "";
		const codes = privateCodes(entry);
		const ids = idsOf(islandClosure(entry));
		expect(codes).toContain("react-fixture");
		expect(hasId(ids, "react/jsx-runtime")).toBe(true);
	});

	test("compiles the Solid entry with the Solid compiler", () => {
		const entry = ISLANDS[1]?.entry ?? "";
		const codes = privateCodes(entry);
		const ids = idsOf(islandClosure(entry));
		expect(codes).toContain("solid-fixture");
		expect(hasId(ids, "@solidjs/web")).toBe(true);
		expect(hasId(privateIds(entry), "jsx-runtime")).toBe(false);
	});

	test("bundles the compiled Svelte body with the Svelte runtime", () => {
		const entry = ISLANDS[2]?.entry ?? "";
		const codes = privateCodes(entry);
		const ids = idsOf(islandClosure(entry));
		expect(codes).toContain("svelte-fixture");
		expect(hasId(ids, "internal/client")).toBe(true);
	});

	test("keeps each compiled body out of the other entries", () => {
		for (const island of ISLANDS) {
			const others = ISLANDS.filter((candidate) => candidate !== island);
			for (const other of others) {
				const codes = privateCodes(other.entry);
				expect(codes).not.toContain(island.marker);
			}
		}
	});

	test("builds the application entry that owns the island glob", () => {
		const codes = codesOf(closureChunks(appChunks, APP_ENTRY));
		expect(codes).toContain("spira-island");
		expect(codes).toContain("defineIslands");
	});

	test("derives island table rows from glob paths", () => {
		const table = tableFromGlob({
			"../../example/shop/catalog/islands/gallery.react.tsx": () =>
				Promise.resolve({ default: {} }),
			"../../example/shop/catalog/islands/filter.solid.tsx": () =>
				Promise.resolve({ default: {} }),
			"../../example/shop/catalog/islands/badge.svelte": () =>
				Promise.resolve({ default: {} }),
		});
		expect(Object.keys(table).sort()).toEqual([
			"example/shop/catalog/islands/badge.svelte",
			"example/shop/catalog/islands/filter.solid.tsx",
			"example/shop/catalog/islands/gallery.react.tsx",
		]);
		for (const key of Object.keys(table)) {
			expect(typeof table[key]).toBe("function");
		}
	});
});
