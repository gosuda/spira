/** @jsxImportSource solid-js */

import type { JSX } from "solid-js";
import { createSignal } from "solid-js";

export default function Counter(props: { label?: string }): JSX.Element {
	const [count, setCount] = createSignal(0);
	return (
		<button
			type="button"
			data-label={props.label ?? ""}
			onClick={() => setCount(count() + 1)}
		>
			{`solid ${count()}`}
		</button>
	);
}
