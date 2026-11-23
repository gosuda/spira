import { stubDomGlobals } from "./dom-stubs";

stubDomGlobals();

type HtmxWithSse = {
	createEventSource?: unknown;
};

let htmx: HtmxWithSse;

// The two dynamic imports compile htmx and the entry on first use,
// which can exceed the 5 s test timeout on a cold cache under host
// load. They run once in beforeAll, so the test below holds only
// synchronous assertions. The XPath globals stay stubbed first:
// htmx builds one XPathEvaluator at module top level.
beforeAll(async () => {
	htmx = (await import("htmx.org")).default as HtmxWithSse;
	await import("../src/entry");
});

test("entry defines spira-island and registers the htmx sse extension", () => {
	expect(customElements.get("spira-island")).toBeDefined();
	expect(typeof htmx.createEventSource).toBe("function");
});
