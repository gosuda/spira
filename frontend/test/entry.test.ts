import { stubDomGlobals } from "./dom-stubs";

stubDomGlobals();

type HtmxWithSse = {
	createEventSource?: unknown;
};

let htmx: HtmxWithSse;

const importBoundMs = 120_000;

// The two dynamic imports compile htmx and the entry on first use,
// which can exceed both the 5 s test timeout and the 10 s hook
// timeout on a cold cache under host load. They run once in
// beforeAll under their own bound, so the test below holds only
// synchronous assertions. The XPath globals stay stubbed first:
// htmx builds one XPathEvaluator at module top level.
beforeAll(async () => {
	htmx = (await import("htmx.org")).default as HtmxWithSse;
	await import("../src/entry");
}, importBoundMs);

test("entry defines spira-island and registers the htmx sse extension", () => {
	expect(customElements.get("spira-island")).toBeDefined();
	expect(typeof htmx.createEventSource).toBe("function");
});
