import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, normalizePath } from "vite";
import { defineConfig, mergeConfig } from "vitest/config";

export default defineConfig(async (env) => {
	const root = fileURLToPath(new URL(".", import.meta.url));
	const configFile = resolve(root, "vite.config.ts");
	const viteConfig = await loadConfigFromFile(env, configFile, root);
	if (!viteConfig) {
		throw new Error(`Vite config not found: ${configFile}`);
	}
	const testConfig = defineConfig({
		plugins: [
			{
				name: "spira:watch-vite-config",
				configResolved(config) {
					config.configFileDependencies.push(
						...viteConfig.dependencies.map(normalizePath),
					);
				},
			},
		],
		test: {
			environment: "happy-dom",
			include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
			globals: true,
		},
	});
	return mergeConfig(viteConfig.config, testConfig);
});
