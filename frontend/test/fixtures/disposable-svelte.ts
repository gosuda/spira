export const svelteDisposable = {
	cleaned: false,
	effectRuns: 0,
	setGo: null as ((value: number) => void) | null,
};

export function resetSvelteDisposable(): void {
	svelteDisposable.cleaned = false;
	svelteDisposable.effectRuns = 0;
	svelteDisposable.setGo = null;
}
