import { defineIslands, type IslandTable } from "../../src/island";
import Counter from "./Counter.svelte";

const islands: IslandTable = {
	"frontend/test/fixtures/Counter.svelte": () =>
		Promise.resolve({ default: Counter }),
};

defineIslands(islands);
