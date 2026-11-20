import { defineIslands, type IslandTable } from "../../src/island";
import Counter from "./Counter.solid";

const islands: IslandTable = {
	"frontend/test/fixtures/Counter.solid.tsx": () =>
		Promise.resolve({ default: Counter }),
};

defineIslands(islands);
