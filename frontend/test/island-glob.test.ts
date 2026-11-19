import { tableFromGlob } from "../src/island";

test("derives island table rows from glob paths", () => {
	const table = tableFromGlob({
		"../../example/shop/catalog/islands/gallery.react.tsx": () =>
			Promise.resolve({ default: {} }),
		"../../example/shop/catalog/islands/filter.solid.tsx": () =>
			Promise.resolve({ default: {} }),
		"../../example/shop/cart/islands/badge.svelte": () =>
			Promise.resolve({ default: {} }),
	});
	expect(Object.keys(table).sort()).toEqual([
		"example/shop/cart/islands/badge.svelte",
		"example/shop/catalog/islands/filter.solid.tsx",
		"example/shop/catalog/islands/gallery.react.tsx",
	]);
	for (const key of Object.keys(table)) {
		expect(typeof table[key]).toBe("function");
	}
});
