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

// happy-dom drops table rows while DOMParser reads template contents.
// Use its fragment parser for htmx's own template wrapper, as browsers do.
class TemplateDOMParser extends DOMParser {
	override parseFromString(
		input: string,
		type: DOMParserSupportedType,
	): Document {
		const parsed = super.parseFromString(input, type);
		const prefix = '<body><template class="internal-htmx-wrapper">';
		const suffix = "</template></body>";
		if (
			type === "text/html" &&
			input.startsWith(prefix) &&
			input.endsWith(suffix)
		) {
			const template = parsed.querySelector("template");
			if (!template) {
				throw new Error("htmx fragment wrapper is missing");
			}
			template.innerHTML = input.slice(prefix.length, -suffix.length);
		}
		return parsed;
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
	vi.stubGlobal("DOMParser", TemplateDOMParser);
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
