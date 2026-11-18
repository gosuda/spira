import { useEffect, useState } from "react";

export const reactDisposable = {
	cleaned: false,
	effectRuns: 0,
	lastGo: -1,
	setGo: null as ((value: number) => void) | null,
};

export function resetReactDisposable(): void {
	reactDisposable.cleaned = false;
	reactDisposable.effectRuns = 0;
	reactDisposable.lastGo = -1;
	reactDisposable.setGo = null;
}

export default function Disposable() {
	const [go, setGo] = useState(0);
	reactDisposable.setGo = setGo;
	useEffect(() => {
		reactDisposable.effectRuns += 1;
		reactDisposable.lastGo = go;
		return () => {
			reactDisposable.cleaned = true;
		};
	}, [go]);
	return <span>{`react go ${go}`}</span>;
}
