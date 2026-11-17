# spira

spira is a behavioral rewrite of the Spring ecosystem in LoGOs (`.lgo` files). It copies ideas, never code, from the clones under `.references/`.

## Module rules

- This module holds only `.lgo` packages. Tests are `_test.lgo` files in an external test package (`package x_test`). [David Parnas]
- Build with `logos`. Plain `go` ignores `.lgo` files. [John Carmack]
- `logos.toml` sits next to `go.mod`. Unknown tables or keys are errors. Add a `[capabilities]` allowlist entry only when `logos build` reports a capability diagnostic, and name the exact module path it reports. [Tony Hoare]
- Strictly no cgo (human-supplied). `logos.toml` keeps `[build] cgo = "forbid"`; never change it, never set `CGO_ENABLED=1`, and never add a dependency that needs cgo. The race detector needs cgo, so the gate runs tests without `-race`. [Tony Hoare]
- Before you write, build, test, lint, review, or eject `.lgo` code, load every skill under `/home/alpha/repos-devtool/LoGOs/plugins/logos/skills/` that fits the task (`logos` always, `logos-concurrency` for `go group` and shared state, `logos-review` before a commit) and follow it. `logos-doc/SPEC.md` in the toolchain tree settles what the skills leave open. [Richard Feynman]

## Toolchain environment

The toolchain is a LoGOs worktree, not the system Go. Every command needs:

```sh
export GOROOT=/home/alpha/repos-devtool/LoGOs/.outline/worktree/spira-dogfood PATH="$GOROOT/bin:$PATH" GOTOOLCHAIN=local
```

The `justfile` sets this itself. Override the root with `LOGOS_ROOT`. [John Carmack]

## Gates

- `just gate` MUST exit 0 before every commit. The native `.git/hooks/pre-commit` runs it. [Tony Hoare]
- `just eject` MUST exit 0 at the end of every unit of work. An eject failure is a finding. [Tony Hoare]

## Conventions

- No dependency injection and no other JVM habit: no containers, component registries, factories, builders, getters and setters, annotation-driven behavior, exception hierarchies, inheritance template classes, or mock-driven tests. [Dieter Rams]
- An application is ordinary statements in `main`. A feature is a struct literal with non-nil `*T` fields. Nothing in spira resolves, looks up, or wires parts. [Dieter Rams]
- A package exports an interface only when spira ships two or more implementations of it. [David Parnas]
- No `reflect`. Answer a question about a type with a comptime generic. [Tony Hoare]
- Concurrency only through `go group`. Shared mutable state lives in `logos/sync.Locked[T]`. No package-level mutable state. [Edsger W. Dijkstra]
- Every blocking call takes a `context.Context` and a timeout. [John Carmack]
- Struct tags name wire fields only (`json`, `path`, `query`, `header`, `form`, `cookie`, `body`, `env`, `col`). A tag never selects behavior. [Claude Shannon]
- Cross-cutting behavior is an ordered list of `web.Stage` values written in code. [Edsger W. Dijkstra]
- Errors are `(T, error)` with `?`, wrapped as `fmt.Errorf("<package>: <what>: %w", err)`. Absence is `T?`. Panic only for programmer errors at registration time. [Tony Hoare]
- Third-party modules: `golang.org/x/crypto` in `auth`; database drivers only in tests, `example/` and generated applications. Resolve versions with `logos get`; never type one from memory. [Richard Feynman]
- Tests run the real parts: in-memory SQLite and `net/http/httptest`. [John Carmack]

## Finding protocol

A finding is any case where the toolchain at the worktree revision disagrees with `logos-doc/SPEC.md`, crashes, miscompiles, gives a misleading diagnostic, lacks a form that would remove real spira code, or where `just eject` output fails to build or behaves differently from the native build. For each finding, in this order:

1. Reduce it to the smallest `.lgo` file that shows it. Classify it: defect (behavior contradicts a SPEC sentence or is a crash) or enhancement (SPEC is silent or says otherwise). [Richard Feynman]
2. Defect: in the worktree, add the reduced case as a test where the worktree `AGENTS.md` says tests of that kind go (`test/logos/run/`, `test/logos/lint/`, or `src/internal/types/testdata/logos/`), run the matching command from that file (`go test -count=1 cmd/internal/testdir -run 'Test/logos/'` or the package test), and see it fail. Fix the compiler, runtime or library. If the fix changes a language rule, update its Table T row in `logos-doc/IMPLEMENTATION.md` and the SPEC sentence in the same commit. If it changes a lint rule, make the mirrored change in `/home/alpha/repos-devtool/gglint` and keep its `TestLogosPorts` green. Pass the slice gate the worktree `AGENTS.md` names, commit in the worktree on the detached HEAD, rebuild with `make.bash`, then use the correct form in spira. [Christopher Alexander]
3. Enhancement, or a defect whose fix does not fit one LoGOs slice: add no compiler change. Write spira with the plain form the current compiler accepts. [Herbert Simon]
4. Draft the text for `gosuda/loGos` in every case: title in imperative form; body with the LoGOs revision, the reduced `.lgo` file, the expected result with the SPEC section it rests on, the actual output verbatim, and for a fixed defect the local commit hash, the failing-then-passing test output and the spira code that the fix unblocks (as a `gosuda/spira` link once that step is pushed). Use the matching file under `.github/ISSUE_TEMPLATE` or the pull-request template, and follow `CONTRIBUTING.md`. [Edward Tufte]
5. Keep each draft as `spira/.outline/findings/<nn>-<slug>.md`. Nothing about a finding is written outward without the user's approval of its text. A fixed defect gets a pull-request draft and no separate issue; an enhancement or an unfixed defect gets an issue draft. [Kenya Hara]
6. Spira never keeps a workaround for a fixed defect. After the rebuild, the spira code uses the form the SPEC promises and the tests pass on it. [Dieter Rams]
