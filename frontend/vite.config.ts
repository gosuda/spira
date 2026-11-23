import { fileURLToPath } from "node:url";
import solidPlugin from "@solidjs/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	resolve: {
		dedupe: ["@solidjs/web", "react", "react-dom", "solid-js", "svelte"],
	},
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
