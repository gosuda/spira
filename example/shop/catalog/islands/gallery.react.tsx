import { useState } from "react";

export default function Gallery(props: { items?: string[] }) {
	const items = props.items ?? [];
	const [active, setActive] = useState(0);
	const current = items[Math.min(active, Math.max(items.length - 1, 0))] ?? "";
	const next = items.length > 0 ? (items[(active + 1) % items.length] ?? "") : "";
	return (
		<div data-gallery="mounted">
			<div data-panel="current">{`front ${current}`}</div>
			<button
				type="button"
				onClick={() => {
					if (items.length > 0) {
						setActive((active + 1) % items.length);
					}
				}}
			>
				{items.length > 1 ? `show ${next}` : "only one item"}
			</button>
		</div>
	);
}
