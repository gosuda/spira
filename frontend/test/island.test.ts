import { defineIslands, type IslandTable } from "../src/island";
import { installSlotMover } from "../src/slots";
import reactFixture from "./fixtures/Counter.react";
import solidFixture from "./fixtures/Counter.solid";
import svelteFixture from "./fixtures/Counter.svelte";

const table: IslandTable = {
	"example/shop/react.react.tsx": () =>
		Promise.resolve({ default: reactFixture }),
	"example/shop/solid.solid.tsx": () =>
		Promise.resolve({ default: solidFixture }),
	"example/shop/svelte.svelte": () =>
		Promise.resolve({ default: svelteFixture }),
};

defineIslands(table);

function island(entry: string, props = "{}"): HTMLElement {
	const el = document.createElement("spira-island");
	el.setAttribute("entry", entry);
	el.setAttribute("props", props);
	el.setAttribute("when", "load");
	document.body.append(el);
	return el;
}

describe("spira-island", () => {
	test("mounts a react fixture and a click changes it", async () => {
		const el = island("example/shop/react.react.tsx", '{"label":"hi"}');
		await vi.waitFor(() => {
			expect(el.querySelector("button")).not.toBeNull();
		});
		const button = el.querySelector("button");
		expect(button?.textContent).toBe("react 0");
		expect(button?.getAttribute("data-label")).toBe("hi");
		button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await vi.waitFor(() => {
			expect(button?.textContent).toBe("react 1");
		});
	});

	test("mounts a svelte fixture and a click changes it", async () => {
		const el = island("example/shop/svelte.svelte", '{"label":"sv"}');
		await vi.waitFor(() => {
			expect(el.querySelector("button")).not.toBeNull();
		});
		const button = el.querySelector("button");
		expect(button?.textContent).toBe("svelte 0");
		expect(button?.getAttribute("data-label")).toBe("sv");
		button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await vi.waitFor(() => {
			expect(button?.textContent).toBe("svelte 1");
		});
	});

	test("mounts a solid fixture and a click changes it", async () => {
		const el = island("example/shop/solid.solid.tsx", '{"label":"so"}');
		await vi.waitFor(() => {
			expect(el.querySelector("button")).not.toBeNull();
		});
		const button = el.querySelector("button");
		expect(button?.textContent).toBe("solid 0");
		expect(button?.getAttribute("data-label")).toBe("so");
		button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await vi.waitFor(() => {
			expect(button?.textContent).toBe("solid 1");
		});
	});

	test("a missing entry logs one console error and keeps the fallback", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const el = document.createElement("spira-island");
		el.setAttribute("entry", "example/shop/absent.react.tsx");
		el.setAttribute("when", "load");
		el.innerHTML = "<span>fallback</span>";
		document.body.append(el);
		await vi.waitFor(() => {
			expect(spy).toHaveBeenCalledTimes(1);
		});
		expect(spy.mock.calls[0]?.[0]).toContain("example/shop/absent.react.tsx");
		expect(el.querySelector("span")?.textContent).toBe("fallback");
		spy.mockRestore();
	});

	test.each(["WHEN", "", "eager"])(
		"rejects when=%j without calling the loader",
		async (when) => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const el = document.createElement("spira-island");
			el.setAttribute("entry", "example/shop/react.react.tsx");
			el.setAttribute("when", when);
			el.setAttribute("props", "{}");
			el.innerHTML = "<span>fallback</span>";
			document.body.append(el);
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(spy).toHaveBeenCalledTimes(1);
			const message = String(spy.mock.calls[0]?.[0]);
			expect(message).toContain("example/shop/react.react.tsx");
			expect(message).toContain(when);
			expect(el.querySelector("span")?.textContent).toBe("fallback");
			expect(el.querySelector("button")).toBeNull();
			spy.mockRestore();
		},
	);

	test.each(["[1]", '"x"', "3", "null"])(
		"rejects non-object props %s without calling the loader",
		async (props) => {
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});
			const el = document.createElement("spira-island");
			el.setAttribute("entry", "example/shop/react.react.tsx");
			el.setAttribute("when", "load");
			el.setAttribute("props", props);
			el.innerHTML = "<span>fallback</span>";
			document.body.append(el);
			await vi.waitFor(() => {
				expect(spy).toHaveBeenCalled();
			});
			expect(spy).toHaveBeenCalledTimes(1);
			const message = String(spy.mock.calls[0]?.[0]);
			expect(message).toContain("example/shop/react.react.tsx");
			expect(el.querySelector("span")?.textContent).toBe("fallback");
			expect(el.querySelector("button")).toBeNull();
			spy.mockRestore();
		},
	);

	test("rejects malformed props JSON with a named error", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const el = document.createElement("spira-island");
		el.setAttribute("entry", "example/shop/react.react.tsx");
		el.setAttribute("when", "load");
		el.setAttribute("props", "{,");
		el.innerHTML = "<span>fallback</span>";
		document.body.append(el);
		await vi.waitFor(() => {
			expect(spy).toHaveBeenCalled();
		});
		expect(spy).toHaveBeenCalledTimes(1);
		const message = String(spy.mock.calls[0]?.[0]);
		expect(message).toContain("example/shop/react.react.tsx");
		expect(message).not.toContain("SyntaxError");
		expect(el.querySelector("span")?.textContent).toBe("fallback");
		expect(el.querySelector("button")).toBeNull();
		spy.mockRestore();
	});
});

describe("slot mover hardening", () => {
	test("treats the slot id as a value, not a selector", async () => {
		document.body.innerHTML = `
			<spira-slot id="s1"><p>text A</p></spira-slot>
			<spira-slot id="s2"><p>text B</p></spira-slot>
		`;
		installSlotMover(document.body);
		const bad = document.createElement("template");
		bad.dataset.spiraSlot = 'x"],spira-slot[id="s1';
		bad.innerHTML = "<em>injected</em>";
		document.body.append(bad);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(document.querySelector("spira-slot#s1 p")?.textContent).toBe(
			"text A",
		);
		expect(document.querySelector("spira-slot#s1 em")).toBeNull();

		const good = document.createElement("template");
		good.dataset.spiraSlot = "s2";
		good.innerHTML = "<em>resolved</em>";
		document.body.append(good);
		await vi.waitFor(() => {
			expect(document.querySelector("spira-slot#s2 em")?.textContent).toBe(
				"resolved",
			);
		});
		expect(document.querySelector("template[data-spira-slot]")).toBe(bad);
	});

	test("leaves a template with no matching slot in place", async () => {
		document.body.innerHTML = `<spira-slot id="s1"><p>text A</p></spira-slot>`;
		installSlotMover(document.body);
		const orphan = document.createElement("template");
		orphan.dataset.spiraSlot = "nope";
		orphan.innerHTML = "<em>orphan</em>";
		document.body.append(orphan);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(document.querySelector("template[data-spira-slot]")).toBe(orphan);
		expect(document.querySelector("spira-slot#s1 p")?.textContent).toBe(
			"text A",
		);
	});
});

describe("slot mover", () => {
	test("moves template content into the matching spira-slot", async () => {
		document.body.innerHTML = `
			<spira-slot id="s1"><p>fallback one</p></spira-slot>
			<spira-slot id="s2"><p>fallback two</p></spira-slot>
		`;
		installSlotMover(document.body);
		expect(document.querySelector("spira-slot#s1 p")?.textContent).toBe(
			"fallback one",
		);

		const template = document.createElement("template");
		template.dataset.spiraSlot = "s2";
		template.innerHTML = "<em>resolved</em>";
		document.body.append(template);

		await vi.waitFor(() => {
			expect(document.querySelector("spira-slot#s2 em")?.textContent).toBe(
				"resolved",
			);
		});
		expect(document.querySelector("spira-slot#s2 p")).toBeNull();
		expect(document.querySelector("template[data-spira-slot]")).toBeNull();
		expect(document.querySelector("spira-slot#s1 p")?.textContent).toBe(
			"fallback one",
		);
	});
});
