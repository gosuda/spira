import { useState } from "react";

export default function Counter(props: { label?: string }) {
	const [count, setCount] = useState(0);
	return (
		<button
			type="button"
			data-label={props.label ?? ""}
			data-island="react-fixture"
			onClick={() => setCount(count + 1)}
		>
			{`react ${count}`}
		</button>
	);
}
