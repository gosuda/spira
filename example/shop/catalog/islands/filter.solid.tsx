/** @jsxImportSource @solidjs/web */

import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

export default function Filter(): JSX.Element {
	const [order, setOrder] = createSignal("unsorted");
	const apply = (next: "price_asc" | "price_desc") => {
		const list = document.querySelector("#results");
		if (list != null) {
			const items = Array.from(list.querySelectorAll<HTMLElement>("[data-price]"));
			items.sort((a, b) => {
				const pa = Number(a.dataset.price ?? "0");
				const pb = Number(b.dataset.price ?? "0");
				return next === "price_asc" ? pa - pb : pb - pa;
			});
			for (const item of items) {
				list.append(item);
			}
		}
		setOrder(next === "price_asc" ? "low first" : "high first");
	};
	return (
		<p data-filter="mounted">
			{`price order: ${order()}`}
			<button type="button" onClick={() => apply("price_asc")}>
				Price up
			</button>
			<button type="button" onClick={() => apply("price_desc")}>
				Price down
			</button>
		</p>
	);
}
