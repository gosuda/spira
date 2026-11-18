/** @jsxImportSource @solidjs/web */

import type { JSX } from "@solidjs/web";
import { createEffect, createSignal } from "solid-js";

export const solidDisposable = {
	cleaned: false,
	effectRuns: 0,
	setGo: null as ((value: number) => void) | null,
};

export function resetSolidDisposable(): void {
	solidDisposable.cleaned = false;
	solidDisposable.effectRuns = 0;
	solidDisposable.setGo = null;
}

export default function Disposable(): JSX.Element {
	const [go, setGo] = createSignal(0);
	solidDisposable.setGo = setGo;
	createEffect(
		() => go(),
		() => {
			solidDisposable.effectRuns += 1;
			return () => {
				solidDisposable.cleaned = true;
			};
		},
	);
	return <span>{`solid go ${go()}`}</span>;
}
