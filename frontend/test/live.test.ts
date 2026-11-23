import { installLiveUpdates } from "../src/live";

const stockUpdate =
	'<span id="stock-7" hx-swap-oob="outerHTML">Mug: $15.00, 4 in stock</span>';
const stockControl =
	'<button id="stock-toggle" type="button" data-live-toggle aria-pressed="false" hidden>Pause live stock updates</button>';

beforeAll(installLiveUpdates);

beforeEach(() => {
	document.body.innerHTML = `
		<section data-live-region="stock" hx-ext="sse" sse-connect="/stock/events">
			<ul id="results"><li><span id="stock-7">Mug: $12.00, 7 in stock</span></li></ul>
			<span id="stock-sink" sse-swap="stock" hx-swap="none"></span>
			${stockControl}
		</section>
		<section data-live-region="admin">
			<button type="button" data-live-toggle aria-pressed="false" hidden>Pause live status updates</button>
			<span id="shop-status">up</span>
			<div id="admin-sink" sse-swap="instance" hx-swap="none"></div>
		</section>
		<div id="outside-stock"></div>`;
	document.body.dispatchEvent(new CustomEvent("htmx:load", { bubbles: true }));
});

function fixtureElement(id: string): HTMLElement {
	const element = document.getElementById(id);
	if (!element) {
		throw new Error(`Missing fixture element: ${id}`);
	}
	return element;
}

function dispatchMessage(sink: string, name: string, data: string): boolean {
	return fixtureElement(sink).dispatchEvent(
		new CustomEvent("htmx:sseBeforeMessage", {
			bubbles: true,
			cancelable: true,
			composed: true,
			detail: new MessageEvent(name, { data }),
		}),
	);
}

function stockToggle(): HTMLButtonElement {
	const toggle = document.getElementById("stock-toggle");
	if (!(toggle instanceof HTMLButtonElement)) {
		throw new Error("Expected the stock pause button");
	}
	return toggle;
}

test("pause cancels stock messages until updates resume", () => {
	const toggle = stockToggle();
	expect(toggle.hidden).toBe(false);
	expect(toggle.getAttribute("aria-pressed")).toBe("false");

	toggle.click();
	expect(toggle.getAttribute("aria-pressed")).toBe("true");
	expect(dispatchMessage("stock-sink", "stock", stockUpdate)).toBe(false);

	expect(
		dispatchMessage(
			"admin-sink",
			"instance",
			'<span id="shop-status" hx-swap-oob="outerHTML">down</span>',
		),
	).toBe(true);

	toggle.outerHTML = stockControl;
	const replacement = stockToggle();
	replacement.dispatchEvent(new CustomEvent("htmx:load", { bubbles: true }));
	expect(replacement.hidden).toBe(false);
	expect(replacement.getAttribute("aria-pressed")).toBe("true");
	replacement.click();
	expect(replacement.getAttribute("aria-pressed")).toBe("false");
	expect(dispatchMessage("stock-sink", "stock", stockUpdate)).toBe(true);
});

test("a stock message needs a matching target in the current region", () => {
	fixtureElement("results").replaceChildren();
	expect(dispatchMessage("stock-sink", "stock", stockUpdate)).toBe(false);

	const outside = document.createElement("span");
	outside.id = "stock-7";
	fixtureElement("outside-stock").append(outside);
	expect(dispatchMessage("stock-sink", "stock", stockUpdate)).toBe(false);
});

test.each([
	'<span id="stock-invalid" hx-swap-oob="outerHTML">Mug</span>',
	'<span id="stock-8" hx-swap-oob="outerHTML">Mug</span><p>Other update</p>',
])("passes unexpected stock payloads through to htmx: %s", (data) => {
	expect(dispatchMessage("stock-sink", "stock", data)).toBe(true);
});

test("pause state and sink survive a search swap of the results list", () => {
	const toggle = stockToggle();
	toggle.click();
	expect(toggle.getAttribute("aria-pressed")).toBe("true");
	expect(dispatchMessage("stock-sink", "stock", stockUpdate)).toBe(false);

	const swapped = document.createElement("ul");
	swapped.id = "results";
	swapped.innerHTML =
		'<li><span id="stock-7">Mug: $12.00, 7 in stock</span></li>';
	fixtureElement("results").replaceWith(swapped);
	swapped.dispatchEvent(new CustomEvent("htmx:load", { bubbles: true }));

	expect(stockToggle().getAttribute("aria-pressed")).toBe("true");
	expect(dispatchMessage("stock-sink", "stock", stockUpdate)).toBe(false);

	stockToggle().click();
	expect(stockToggle().getAttribute("aria-pressed")).toBe("false");
	expect(dispatchMessage("stock-sink", "stock", stockUpdate)).toBe(true);

	const filteredOut =
		'<span id="stock-9" hx-swap-oob="outerHTML">Kettle: $20.00, 1 in stock</span>';
	expect(dispatchMessage("stock-sink", "stock", filteredOut)).toBe(false);
});

function adminToggle(): HTMLButtonElement {
	const toggle = document.querySelector(
		'section[data-live-region="admin"] button[data-live-toggle]',
	);
	if (!(toggle instanceof HTMLButtonElement)) {
		throw new Error("Expected the admin pause button");
	}
	return toggle;
}

test("resume replays the instance updates paused in the region", () => {
	const toggle = adminToggle();
	toggle.click();
	expect(toggle.getAttribute("aria-pressed")).toBe("true");
	const down =
		'<tr id="instance-shop" hx-swap-oob="outerHTML"><td>shop</td><td>down</td></tr>';
	expect(dispatchMessage("admin-sink", "instance", down)).toBe(false);
	expect(fixtureElement("shop-status").textContent).toBe("up");
	const redelivered: Array<unknown> = [];
	fixtureElement("admin-sink").addEventListener(
		"htmx:sseBeforeMessage",
		(event) => {
			redelivered.push((event as CustomEvent).detail);
		},
	);
	toggle.click();
	expect(toggle.getAttribute("aria-pressed")).toBe("false");
	expect(redelivered).toHaveLength(1);
	expect((redelivered[0] as MessageEvent).data).toBe(down);
	expect(dispatchMessage("admin-sink", "instance", down)).toBe(true);
});
