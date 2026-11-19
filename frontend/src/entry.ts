import htmx from "htmx.org";
import "htmx-ext-sse";
import { defineIslands, tableFromGlob } from "./island";
import { installSlotMover } from "./slots";

htmx.config.allowEval = false;

const islandModules = import.meta.glob(
	"../../example/**/islands/*.{svelte,react.tsx,solid.tsx}",
);

defineIslands(tableFromGlob(islandModules));
installSlotMover();
