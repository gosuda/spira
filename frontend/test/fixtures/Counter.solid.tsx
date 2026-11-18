/** @jsxImportSource @solidjs/web */

import type { JSX } from "@solidjs/web";
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
