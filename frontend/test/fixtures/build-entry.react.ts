import { defineIslands, type IslandTable } from "../../src/island";
import Counter from "./Counter.react";

const islands: IslandTable = {
	"frontend/test/fixtures/Counter.react.tsx": () =>
		Promise.resolve({ default: Counter }),
};

defineIslands(islands);
