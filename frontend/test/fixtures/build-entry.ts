import reactCounter from "./Counter.react";
import solidCounter from "./Counter.solid";
import svelteCounter from "./Counter.svelte";

export const islandFixtures = {
	react: reactCounter,
	solid: solidCounter,
	svelte: svelteCounter,
};
