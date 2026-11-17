import htmx from "htmx.org";
import { defineIslands, type IslandLoader, type IslandTable } from "./island";
import { installSlotMover } from "./slots";

htmx.config.allowEval = false;

const islandModules = import.meta.glob(
	"../../example/**/islands/*.{svelte,react.tsx,solid.tsx}",
);

const table: IslandTable = {};
for (const [path, loader] of Object.entries(islandModules)) {
	const entry = path.replace(/^\.\.\/\.\.\//, "");
	table[entry] = loader as IslandLoader;
}

defineIslands(table);
installSlotMover();
