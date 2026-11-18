// @vitest-environment node
import { resolve } from "node:path";
import { build } from "vite";

const BUILD_TIMEOUT_MS = 120000;

const ENTRIES = [
	"test/fixtures/Counter.react.tsx",
	"test/fixtures/Counter.solid.tsx",
	"test/fixtures/Counter.svelte",
];

type BundleChunk = {
	facadeModuleId: string | null;
	moduleIds: Array<string>;
	code: string;
};

let chunks: Array<BundleChunk> = [];

function chunkFor(entryFile: string): BundleChunk {
	const found = chunks.find((chunk) =>
		chunk.facadeModuleId?.endsWith(entryFile),
	);
	if (found === undefined) {
		throw new Error(`production build: no chunk for ${entryFile}`);
	}
	return found;
}

beforeAll(async () => {
	const root = resolve(__dirname, "..");
	const result = await build({
		configFile: resolve(root, "vite.config.ts"),
		root,
		logLevel: "silent",
		build: {
			write: false,
			manifest: false,
			minify: false,
			rolldownOptions: {
				input: {
					react: resolve(root, ENTRIES[0] ?? ""),
					solid: resolve(root, ENTRIES[1] ?? ""),
					svelte: resolve(root, ENTRIES[2] ?? ""),
				},
			},
		},
	});
	const outputs = (Array.isArray(result) ? result : [result]).flatMap(
		(output) => ("output" in output ? [output] : []),
	);
	chunks = outputs
		.flatMap((output) => output.output)
		.filter((item) => item.type === "chunk")
		.map((chunk) => ({
			facadeModuleId: chunk.facadeModuleId,
			moduleIds: [...chunk.moduleIds],
			code: chunk.code,
		}));
}, BUILD_TIMEOUT_MS);

describe("production build", () => {
	test("bundles one entry chunk per island", () => {
		for (const entry of ENTRIES) {
			const chunk = chunkFor(entry);
			expect(chunk.moduleIds.some((id) => id.endsWith(entry))).toBe(true);
		}
	});

	test("emits no raw JSX or Svelte markup", () => {
		expect(chunkFor(ENTRIES[1] ?? "").code).not.toContain("onClick={");
		expect(chunkFor(ENTRIES[0] ?? "").code).not.toContain("onClick={");
		const svelte = chunkFor(ENTRIES[2] ?? "").code;
		expect(svelte).not.toContain("onclick={");
		expect(svelte).not.toContain("<script");
	});

	test("compiles the Solid entry with the Solid compiler", () => {
		const solid = chunkFor(ENTRIES[1] ?? "");
		const ids = solid.moduleIds;
		expect(ids.some((id) => id.includes("@solidjs/web"))).toBe(true);
		expect(ids.some((id) => id.includes("jsx-runtime"))).toBe(false);
	});
});
