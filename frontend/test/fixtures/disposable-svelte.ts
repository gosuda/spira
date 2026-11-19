export const svelteDisposable = {
	cleaned: false,
	cleanups: 0,
	effectRuns: 0,
	setGo: null as ((value: number) => void) | null,
};

export function resetSvelteDisposable(): void {
	svelteDisposable.cleaned = false;
	svelteDisposable.cleanups = 0;
	svelteDisposable.effectRuns = 0;
	svelteDisposable.setGo = null;
}
