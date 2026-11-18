# frontend

The `frontend` workspace builds the browser code for islands, slots and htmx. The server does not run React, Svelte or Solid.

## Interface

File layout:

- `package.json`, `pnpm-lock.yaml`, `biome.json`, `tsconfig.json`
- `vite.config.ts`, `vitest.config.ts`
- `src/entry.ts`, `src/island.ts`, `src/slots.ts`
- `src/adapters/react.ts`, `src/adapters/svelte.ts`, `src/adapters/solid.ts`, `src/adapters/wasm.ts`
- `test/island.test.ts`, `test/wasm.test.ts`, `test/corpus.test.ts`
- `test/fixtures/Counter.react.tsx`, `test/fixtures/Counter.svelte`, `test/fixtures/Counter.solid.tsx`

Scripts in `package.json`:

- `check` runs `biome check . && tsc --noEmit && vitest run`
- `build` runs `vite build`
- `dev` runs `vite`

Exported TypeScript names:

```ts
export type IslandModule = { default: unknown }
export type IslandLoader = () => Promise<IslandModule>
export type IslandTable = Record<string, IslandLoader>
export type IslandMount = (
	target: HTMLElement,
	component: unknown,
	props: Record<string, unknown>,
) => void
export class SpiraIslandElement extends HTMLElement
export function defineIslands(table: IslandTable): void
export function installSlotMover(root?: ParentNode): void
// src/adapters/react.ts and src/adapters/svelte.ts
export function mount(target: HTMLElement, component: unknown, props: Record<string, unknown>): void
// src/adapters/solid.ts
export function mount(target: HTMLElement, component: unknown, props: Record<string, unknown>): () => void
// src/adapters/wasm.ts
export function mount(target: HTMLElement, component: unknown, props: Record<string, unknown>): void
export function loader(entry: string): () => Promise<{ default: unknown }>
```

`mount` is exported from each adapter. `loader` is exported from `src/adapters/wasm.ts`. `installSlotMover` defaults `root` to `document`. Solid `mount` returns the dispose function of `render`.

## Requirements

### Build

- `check` MUST run Biome, `tsc --noEmit` and Vitest.
- `build` MUST run `vite build`.
- `dev` MUST run `vite`.
- The Vite build MUST write a manifest.
- The Vite build MUST write files to `dist`.
- The Vite build MUST use `src/entry.ts` as its one input.
- The dev server MUST allow `SPIRA_ORIGIN` when that value is set.
- The dev server MUST allow `http://localhost:8080` when `SPIRA_ORIGIN` is empty.
- The Svelte plugin MUST apply only to `*.svelte`.
- The React plugin MUST apply only to `*.react.tsx`.
- The Solid plugin MUST apply only to `*.solid.tsx`.
- TypeScript MUST set `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Tests MUST run under happy-dom.

### Islands and slots

- `entry.ts` MUST import `htmx.org` and `htmx-ext-sse`.
- `entry.ts` MUST set `htmx.config.allowEval` to false.
- The island glob MUST be `../../example/**/islands/*.{svelte,react.tsx,solid.tsx}`.
- An island key MUST be the module path with the `../../` prefix removed.
- The client MUST follow the island and slot rules in [wire-contract](wire-contract.md).
- `defineIslands` MUST define the custom element `spira-island` once.
- `when="load"` MUST start the load when the element connects.
- `when="visible"` MUST start the load on the first intersection.
- `when="idle"` MUST start the load in `requestIdleCallback`.
- A missing table entry MUST log one error that names the entry.
- A missing table entry MUST leave the fallback in place.
- Before a successful mount, the element MUST remove its child nodes.
- The React adapter MUST call `createRoot(target).render(createElement(component, props))`.
- The Svelte adapter MUST call Svelte 5 `mount` with `target` and `props`.
- The Solid adapter MUST call `render` with the component and `target`.
- A `.wasm` entry MUST load `/islands/wasm_exec.js` one time.
- A `.wasm` entry MUST instantiate `/islands/` plus the file name of the entry.
- The wasm mount MUST set `globalThis.__spiraIsland` to `{ hostId, props }`.
- `hostId` MUST be the element id.
- `props` in that object MUST be the JSON text of the parsed props.
- When the element has no id, the wasm mount MUST assign `spira-wasm-<n>`.
- A failed wasm load MUST log one error that names the entry.
- A failed wasm load MUST leave the fallback in place.
- `installSlotMover` MUST move each `template[data-spira-slot]` into the `spira-slot` with the same id.
- The slot match MUST compare the id attribute byte for byte.
- `installSlotMover` MUST move a template that is already in the tree.
- `installSlotMover` MUST move a template that is added after that call.

## Proof

- `test/island.test.ts` mounts a React, Svelte and Solid fixture through `spira-island` and checks that a click changes the text.
- That file also proves a missing entry, a bad `when` value, malformed props and a non-object props value. Each case logs one error and keeps the fallback.
- `moves template content into the matching spira-slot` proves the slot mover.
- `treats the slot id as a value, not a selector` proves the byte-for-byte id match.
- `leaves a template with no matching slot in place` proves that an unknown slot id does not remove the template.
- `test/wasm.test.ts` proves the host object, the assigned id, the cleared fallback and a failed fetch.
- `test/corpus.test.ts` checks the slot and island lines of `wire/corpus.jsonl` against the client.

## Not in scope

- The server does not render React, Svelte or Solid. Each of those needs a JavaScript runtime.
- The entry glob does not include `.wasm`. A caller can still pass a wasm loader to `defineIslands`.
