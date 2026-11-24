import htmx, { type HtmxSwapSpecification } from "htmx.org";

const regionSelector = "[data-live-region]";
const toggleSelector = "[data-live-region] button[data-live-toggle]";

function soleOuterSwap(owner: Document, data: unknown): Element | null {
	if (typeof data !== "string") {
		return null;
	}
	const template = owner.createElement("template");
	template.innerHTML = data;
	const { content } = template;
	const update = content.firstElementChild;
	if (
		content.childElementCount !== 1 ||
		!update?.matches('[hx-swap-oob="outerHTML"]') ||
		update.id === "" ||
		content.textContent?.trim() !== update.textContent?.trim() ||
		update.querySelector("[hx-swap-oob], [data-hx-swap-oob], template") !== null
	) {
		return null;
	}
	return update;
}

function isFilteredStockUpdate(event: Event, region: Element): boolean {
	if (
		region.getAttribute("data-live-region") !== "stock" ||
		!(event instanceof CustomEvent)
	) {
		return false;
	}
	const { detail } = event;
	if (!(detail instanceof MessageEvent) || detail.type !== "stock") {
		return false;
	}
	const update = soleOuterSwap(region.ownerDocument, detail.data);
	if (!update?.matches("span") || !/^stock-[0-9]+$/.test(update.id)) {
		return false;
	}
	const target = region.ownerDocument.getElementById(update.id);
	return target?.closest(regionSelector) !== region;
}

export function installLiveUpdates(): void {
	const pausedRegions = new WeakSet<Element>();
	const retainedUpdates = new WeakMap<
		Element,
		Array<{ key: string | undefined; target: Element; message: MessageEvent }>
	>();
	const maxRetainedUpdates = 128;

	function retainPausedUpdate(
		region: Element,
		target: Element,
		message: MessageEvent,
	): void {
		const kept = retainedUpdates.get(region) ?? [];
		const key = soleOuterSwap(region.ownerDocument, message.data)?.id;
		const superseded =
			key === undefined ? -1 : kept.findIndex((update) => update.key === key);
		if (superseded !== -1) {
			kept.splice(superseded, 1);
		}
		kept.push({ key, target, message });
		if (kept.length > maxRetainedUpdates) {
			kept.shift();
		}
		retainedUpdates.set(region, kept);
	}

	function swapSpecFor(target: Element): HtmxSwapSpecification {
		const raw =
			target.getAttribute("hx-swap") ??
			target.getAttribute("data-hx-swap") ??
			"";
		const swapStyle = raw.split(/\s+/, 1)[0] || htmx.config.defaultSwapStyle;
		return {
			swapStyle,
			swapDelay: htmx.config.defaultSwapDelay,
			settleDelay: htmx.config.defaultSettleDelay,
		};
	}

	function replayRetainedUpdates(region: Element): void {
		const kept = retainedUpdates.get(region);
		retainedUpdates.delete(region);
		if (!kept) {
			return;
		}
		for (const { target, message } of kept) {
			if (!target.isConnected) {
				continue;
			}
			if (!htmx.trigger(target, "htmx:sseBeforeMessage", message)) {
				continue;
			}
			htmx.swap(target, message.data, swapSpecFor(target));
		}
	}

	function revealToggle(toggle: HTMLButtonElement): void {
		const region = toggle.closest(regionSelector);
		if (region) {
			toggle.setAttribute("aria-pressed", String(pausedRegions.has(region)));
			toggle.hidden = false;
		}
	}

	function revealToggles(root: Document | Element): void {
		if (root instanceof HTMLButtonElement && root.matches(toggleSelector)) {
			revealToggle(root);
		}
		for (const toggle of root.querySelectorAll<HTMLButtonElement>(
			toggleSelector,
		)) {
			revealToggle(toggle);
		}
	}

	revealToggles(document);
	document.addEventListener("htmx:load", ({ target }) => {
		if (target instanceof Element) {
			revealToggles(target);
		}
	});

	document.addEventListener("click", ({ target }) => {
		if (!(target instanceof Element)) {
			return;
		}
		const toggle = target.closest(toggleSelector);
		if (!(toggle instanceof HTMLButtonElement) || toggle.hidden) {
			return;
		}
		const region = toggle.closest(regionSelector);
		if (!region) {
			return;
		}
		const wasPaused = pausedRegions.delete(region);
		if (!wasPaused) {
			pausedRegions.add(region);
		} else {
			replayRetainedUpdates(region);
		}
		toggle.setAttribute("aria-pressed", String(!wasPaused));
	});

	document.addEventListener("htmx:sseBeforeMessage", (event) => {
		if (!(event.target instanceof Element)) {
			return;
		}
		const region = event.target.closest(regionSelector);
		if (region && pausedRegions.has(region)) {
			retainPausedUpdate(
				region,
				event.target,
				(event as CustomEvent<MessageEvent>).detail,
			);
			event.preventDefault();
		} else if (region && isFilteredStockUpdate(event, region)) {
			event.preventDefault();
		}
	});
}
