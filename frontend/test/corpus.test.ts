import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineIslands, type IslandTable } from "../src/island";
import { installSlotMover } from "../src/slots";
import reactFixture from "./fixtures/Counter.react";

type CorpusRequest =
	| { kind: "slot-id"; id: string }
	| { kind: "island-when"; when: string }
	| { kind: "island-props"; props: string }
	| { kind: "sse-event-name" }
	| { kind: "sse-field" };

type CorpusLine = {
	name: string;
	request: CorpusRequest;
	response: { valid?: boolean; accepted?: boolean };
	reject: boolean;
};

type OwnedLine = CorpusLine & {
	request: Exclude<CorpusRequest, { kind: "sse-event-name" | "sse-field" }>;
};

const CORPUS_PATH = resolve(__dirname, "../../wire/corpus.jsonl");

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCorpusRequest(value: unknown): CorpusRequest {
	if (!isRecord(value)) {
		throw new Error("request is not an object");
	}
	const kind = value.kind;
	if (kind === "slot-id" && typeof value.id === "string") {
		return { kind, id: value.id };
	}
	if (kind === "island-when" && typeof value.when === "string") {
		return { kind, when: value.when };
	}
	if (kind === "island-props" && typeof value.props === "string") {
		return { kind, props: value.props };
	}
	if (kind === "sse-event-name" || kind === "sse-field") {
		return { kind };
	}
	throw new Error(`unknown request kind ${JSON.stringify(value)}`);
}

function parseCorpusLine(value: unknown, index: number): CorpusLine {
	if (!isRecord(value)) {
		throw new Error(`wire corpus line ${index + 1}: not an object`);
	}
	if (typeof value.name !== "string") {
		throw new Error(`wire corpus line ${index + 1}: name is not a string`);
	}
	if (typeof value.reject !== "boolean") {
		throw new Error(`wire corpus line ${index + 1}: reject is not a boolean`);
	}
	if (!isRecord(value.response)) {
		throw new Error(`wire corpus line ${index + 1}: response is not an object`);
	}
	const response: CorpusLine["response"] = {};
	if (value.response.valid !== undefined) {
		if (typeof value.response.valid !== "boolean") {
			throw new Error(
				`wire corpus line ${index + 1}: response.valid is not a boolean`,
			);
		}
		response.valid = value.response.valid;
	}
	if (value.response.accepted !== undefined) {
		if (typeof value.response.accepted !== "boolean") {
			throw new Error(
				`wire corpus line ${index + 1}: response.accepted is not a boolean`,
			);
		}
		response.accepted = value.response.accepted;
	}
	return {
		name: value.name,
		request: parseCorpusRequest(value.request),
		response,
		reject: value.reject,
	};
}

function loadCorpus(): CorpusLine[] {
	const text = readFileSync(CORPUS_PATH, "utf8");
	const lines = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (lines.length === 0) {
		throw new Error(`wire corpus is empty: ${CORPUS_PATH}`);
	}
	return lines.map((line, index) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			throw new Error(
				`wire corpus line ${index + 1} is not JSON: ${String(error)}`,
			);
		}
		try {
			return parseCorpusLine(parsed, index);
		} catch (error) {
			throw new Error(
				`wire corpus line ${index + 1}: ${(error as Error).message}`,
			);
		}
	});
}

function isOwned(line: CorpusLine): line is OwnedLine {
	return (
		line.request.kind === "slot-id" ||
		line.request.kind === "island-when" ||
		line.request.kind === "island-props"
	);
}

const corpus = loadCorpus();

const REQUIRED_CORPUS_CASES = [
	"slot-id-well-formed",
	"slot-id-wrong-prefix",
	"slot-id-fifteen-hex",
	"slot-id-uppercase-hex",
	"slot-id-missing-index",
	"slot-id-quote-bracket",
	"island-when-valid",
	"island-when-load",
	"island-when-idle",
	"island-when-unknown",
	"island-props-object",
	"island-props-nested-object",
	"island-props-malformed",
	"island-props-array",
	"island-props-string",
] as const;

const loader = vi.fn(() => Promise.resolve({ default: reactFixture }));
const table: IslandTable = {
	"example/shop/react.react.tsx": loader,
};
defineIslands(table);

function island(props: string | null, when: string): HTMLElement {
	const el = document.createElement("spira-island");
	el.setAttribute("entry", "example/shop/react.react.tsx");
	el.setAttribute("when", when);
	if (props !== null) {
		el.setAttribute("props", props);
	}
	el.innerHTML = "<span>fallback</span>";
	document.body.append(el);
	return el;
}

async function settle(ms = 20): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(() => {
	if (globalThis.requestIdleCallback === undefined) {
		globalThis.requestIdleCallback = (callback: IdleRequestCallback) =>
			setTimeout(
				() => callback({ didTimeout: false, timeRemaining: () => 50 }),
				0,
			) as unknown as number;
		globalThis.cancelIdleCallback = (id: number) => clearTimeout(id);
	}
	class AlwaysIntersecting {
		constructor(private readonly callback: IntersectionObserverCallback) {}
		observe(target: Element): void {
			this.callback(
				[
					{
						target,
						isIntersecting: true,
					} as IntersectionObserverEntry,
				],
				this as unknown as IntersectionObserver,
			);
		}
		disconnect(): void {}
		unobserve(): void {}
		takeRecords(): IntersectionObserverEntry[] {
			return [];
		}
	}
	globalThis.IntersectionObserver =
		AlwaysIntersecting as unknown as typeof IntersectionObserver;
});

describe("wire corpus", () => {
	test.each(corpus.filter(isOwned).map((line) => [line.name, line] as const))(
		"%s",
		async (_name, line) => {
			switch (line.request.kind) {
				case "slot-id":
					await checkSlotId(line.request.id, line.response.valid ?? false);
					return;
				case "island-when":
					await checkWhen(line.request.when, line.response.accepted ?? false);
					return;
				case "island-props":
					await checkProps(line.request.props, line.response.accepted ?? false);
					return;
			}
		},
	);
});

describe("wire corpus coverage", () => {
	test("required cases are present", () => {
		const byName = new Map(corpus.map((line) => [line.name, line] as const));
		for (const name of REQUIRED_CORPUS_CASES) {
			if (!byName.has(name)) {
				throw new Error(`wire/corpus.jsonl lacks required case "${name}"`);
			}
		}
	});

	test("no unknown owned cases", () => {
		const required = new Set<string>(REQUIRED_CORPUS_CASES);
		for (const line of corpus.filter(isOwned)) {
			if (!required.has(line.name)) {
				throw new Error(
					`corpus case "${line.name}" is not in the required list`,
				);
			}
		}
	});
});

async function checkSlotId(id: string, expectedValid: boolean): Promise<void> {
	document.body.innerHTML = "";
	const slot = document.createElement("spira-slot");
	slot.setAttribute("id", "s0123456789abcdef-0");
	slot.innerHTML = "<p>fallback</p>";
	const other = document.createElement("spira-slot");
	other.setAttribute("id", "other");
	other.innerHTML = "<p>untouched</p>";
	document.body.append(slot, other);
	installSlotMover(document.body);

	const template = document.createElement("template");
	template.dataset.spiraSlot = id;
	template.innerHTML = "<em>resolved</em>";
	document.body.append(template);

	if (expectedValid) {
		await vi.waitFor(() => {
			expect(slot.querySelector("em")?.textContent).toBe("resolved");
		});
		expect(template.isConnected).toBe(false);
		expect(other.querySelector("em")).toBeNull();
		expect(other.querySelector("p")?.textContent).toBe("untouched");
	} else {
		await settle();
		expect(template.isConnected).toBe(true);
		expect(slot.querySelector("em")).toBeNull();
		expect(slot.querySelector("p")?.textContent).toBe("fallback");
		expect(other.querySelector("em")).toBeNull();
		expect(other.querySelector("p")?.textContent).toBe("untouched");
	}
}

async function checkWhen(
	when: string,
	expectedAccepted: boolean,
): Promise<void> {
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	loader.mockClear();
	const el = island("{}", when);
	if (expectedAccepted) {
		await vi.waitFor(() => {
			expect(loader).toHaveBeenCalled();
		});
		expect(spy).not.toHaveBeenCalled();
	} else {
		await settle();
		expect(loader).not.toHaveBeenCalled();
		expect(spy).toHaveBeenCalledTimes(1);
	}
	el.remove();
	spy.mockRestore();
}

async function checkProps(
	props: string,
	expectedAccepted: boolean,
): Promise<void> {
	const spy = vi.spyOn(console, "error").mockImplementation(() => {});
	loader.mockClear();
	const el = island(props, "load");
	if (expectedAccepted) {
		await vi.waitFor(() => {
			expect(loader).toHaveBeenCalledTimes(1);
		});
		expect(spy).not.toHaveBeenCalled();
		await vi.waitFor(() => {
			expect(el.querySelector("button")).not.toBeNull();
		});
	} else {
		await settle();
		expect(loader).not.toHaveBeenCalled();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(el.querySelector("span")?.textContent).toBe("fallback");
		expect(el.querySelector("button")).toBeNull();
	}
	el.remove();
	spy.mockRestore();
}
