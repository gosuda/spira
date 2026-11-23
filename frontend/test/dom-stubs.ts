// Test-environment shims for htmx under happy-dom.
//
// htmx builds one XPathEvaluator at module top level, and its swap path
// checks nodes with instanceof. The happy-dom test environment splits
// DOM constructors across realms, so the checks miss. Align the globals
// with the live objects' own constructor chains before htmx loads.

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

function realmBase(node: object, base: string): object {
	let current: unknown = (node as { constructor: unknown }).constructor;
	while (
		typeof current === "function" &&
		(current as { name?: string }).name !== base
	) {
		current = Object.getPrototypeOf(current);
	}
	if (typeof current !== "function") {
		throw new Error(`no ${base} constructor above the node`);
	}
	return current;
}

export function stubDomGlobals(): void {
	vi.stubGlobal("XPathEvaluator", FakeXPathEvaluator);
	vi.stubGlobal("XPathResult", {});
	vi.stubGlobal("Document", realmBase(document, "Document"));
	vi.stubGlobal(
		"Element",
		realmBase(document.createElement("span"), "Element"),
	);

	vi.stubGlobal(
		"DocumentFragment",
		realmBase(document.createDocumentFragment(), "DocumentFragment"),
	);
}
