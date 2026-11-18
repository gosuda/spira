class FakeXPathExpression {
	evaluate(): { iterateNext: () => null } {
		return { iterateNext: () => null };
	}
}

class FakeXPathEvaluator {
	createExpression(): FakeXPathExpression {
		return new FakeXPathExpression();
	}
	createNSResolver(): () => null {
		return () => null;
	}
}

vi.stubGlobal("XPathEvaluator", FakeXPathEvaluator);
vi.stubGlobal("XPathResult", {});

test("entry defines spira-island and registers the htmx sse extension", async () => {
	const htmx = (await import("htmx.org")).default as {
		createEventSource?: unknown;
	};
	await import("../src/entry");

	expect(customElements.get("spira-island")).toBeDefined();
	expect(typeof htmx.createEventSource).toBe("function");
});
