import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
	server: {
		cors: {
			origin: process.env.SPIRA_ORIGIN ?? "http://localhost:8080",
		},
	},
	plugins: [
		svelte({ include: "**/*.svelte" }),
		react({ include: "**/*.react.tsx" }),
		solidPlugin({ include: "**/*.solid.tsx" }),
	],
	build: {
		manifest: true,
		outDir: "dist",
		rolldownOptions: {
			input: fileURLToPath(new URL("./src/entry.ts", import.meta.url)),
		},
	},
});
