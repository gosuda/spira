const regionSelector = "[data-live-region]";
const toggleSelector = "[data-live-region] button[data-live-toggle]";

function isFilteredStockUpdate(event: Event, region: Element): boolean {
	if (
		region.getAttribute("data-live-region") !== "stock" ||
		!(event instanceof CustomEvent)
	) {
		return false;
	}
	const { detail } = event;
	if (
		!(detail instanceof MessageEvent) ||
		detail.type !== "stock" ||
		typeof detail.data !== "string"
	) {
		return false;
	}

	const template = region.ownerDocument.createElement("template");
	template.innerHTML = detail.data;
	const { content } = template;
	const update = content.firstElementChild;
	if (
		content.childElementCount !== 1 ||
		!update?.matches('span[hx-swap-oob="outerHTML"]') ||
		!/^stock-[0-9]+$/.test(update.id) ||
		content.textContent?.trim() !== update.textContent?.trim() ||
		update.querySelector("[hx-swap-oob], [data-hx-swap-oob], template") !== null
	) {
		return false;
	}
	const target = region.ownerDocument.getElementById(update.id);
	return target?.closest(regionSelector) !== region;
}

export function installLiveUpdates(): void {
	const pausedRegions = new WeakSet<Element>();

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
		}
		toggle.setAttribute("aria-pressed", String(!wasPaused));
	});

	document.addEventListener("htmx:sseBeforeMessage", (event) => {
		if (!(event.target instanceof Element)) {
			return;
		}
		const region = event.target.closest(regionSelector);
		if (
			region &&
			(pausedRegions.has(region) || isFilteredStockUpdate(event, region))
		) {
			event.preventDefault();
		}
	});
}
