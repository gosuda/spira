# spira

spira is a behavioral rewrite of the Spring ecosystem in LoGOs (`.lgo` files). It copies ideas, never code, from the clones under `.references/`.

## Module rules

- This module holds only `.lgo` packages. Tests are `_test.lgo` files in an external test package (`package x_test`; `package main_test` for a command, which imports its own `main` package). The one in-package file a package may add is `export_test.lgo`: it holds no test and only exposes internal state that an external test must observe. [David Parnas]
- Build with `logos`. Plain `go` ignores `.lgo` files. [John Carmack]
- `logos.toml` sits next to `go.mod`. Unknown tables or keys are errors. Add a `[capabilities]` allowlist entry only when `logos build` reports a capability diagnostic, and name the exact module path it reports. [Tony Hoare]
- Strictly no cgo (human-supplied). `logos.toml` keeps `[build] cgo = "forbid"`; never change it, never set `CGO_ENABLED=1`, and never add a dependency that needs cgo. The race detector needs cgo, so the gate runs tests without `-race`. [Tony Hoare]
- Before you write, build, test, lint, review, or eject `.lgo` code, load every skill under `/home/alpha/repos-devtool/LoGOs/plugins/logos/skills/` that fits the task (`logos` always, `logos-concurrency` for `go group` and shared state, `logos-review` before a commit) and follow it. `logos-doc/SPEC.md` in the toolchain tree settles what the skills leave open. [Richard Feynman]

## Toolchain environment

The toolchain is a LoGOs worktree, not the system Go: upstream `release-branch.go1.27` with the fixes of gosuda/LoGOs#102, #103, #109, #110, #111, #113 and #114 applied. The comptime packages need #102, `just eject` needs #103, and `resilience` needs #109. Every command needs:

```sh
export GOROOT=/home/alpha/repos-devtool/LoGOs/.outline/worktree/spira-toolchain-tip PATH="$GOROOT/bin:$PATH" GOTOOLCHAIN=local
```

The `justfile` sets this itself. Override the root with `LOGOS_ROOT`. [John Carmack]

## Gates

- `just gate` MUST exit 0 before every commit. The native `.git/hooks/pre-commit` runs it. [Tony Hoare]
- `just eject` MUST exit 0 at the end of every unit of work. An eject failure is a finding. [Tony Hoare]
- A change that adds behavior lands only after its new tests have been seen to fail on the tree without the change. [Tony Hoare]

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

## Design procedure

Follow these steps in order before a new exported name lands. [Christopher Alexander]

1. Survey: read how two or more of the clones under `.references/` solve the problem. Record in the commit body what spira keeps and what it drops. [Richard Feynman]
2. Lexicon: name every exported identifier with a word the application author already uses for the thing (`Route`, `Stage`, `Slot`, `Island`). A name that needs a comment to explain it is the wrong name. [Kenya Hara]
3. Caller first: write the file an application author would write, in `example/` or in a test, before the package. It MUST fail to build for the missing names only. [Tony Hoare]
4. One layer: the caller file reaches the standard library through one spira call at most. A second spira layer between them needs a reason in the commit body. [Dieter Rams]
5. Probe: build every LoGOs form the design needs in a scratch module before a brief or a package uses it. A form that fails is a finding. [Richard Feynman]
6. Signature freeze: a signature that a later plan step names changes only together with that step text. [David Parnas]

## Wire contract

The server packages (`view`, `web`, `live`) and `frontend/` share these rules. A change to one side changes the other side and the corpus in the same commit. [Claude Shannon]

- Slot id: `s<16 hex digits>-<n>`. The 16 digits are random for each `Render` call; `n` counts slots from 0 in that call. [Claude Shannon]
- Slot match: the client compares the `id` attribute byte for byte. It MUST NOT build a selector from an id. [Tony Hoare]
- Island `when`: a closed set of values. An unknown value keeps the fallback and logs one error. [Tony Hoare]
- Island props: one JSON object. Malformed JSON, or a value that is not a plain object, keeps the fallback: no mount, no child removal, one error log. [Tony Hoare]
- Events: `live.Events` writes a named `event:` line before each `data:` body and sends a heartbeat comment. The stream ends when the client disconnects. [Claude Shannon]
- Fragments: a request with `HX-Request` gets the fragment without the document shell, and the response carries `Vary: HX-Request`. [Claude Shannon]
- Corpus: `wire/corpus.jsonl` holds one JSON object per line (`name`, `request`, `response`, `reject`). The LoGOs tests and the vitest tests both read this file; neither keeps a copy. [Richard Feynman]

## Finding protocol

A finding is any case where the toolchain at the worktree revision disagrees with `logos-doc/SPEC.md`, crashes, miscompiles, gives a misleading diagnostic, lacks a form that would remove real spira code, or where `just eject` output fails to build or behaves differently from the native build. For each finding, in this order:

1. Fetch `gosuda/loGos` and search its issues, its pull requests and the commits on its main branch for the symptom before any other step. If main already holds a fix, rebuild the toolchain from it and stop. Record the queries and the date in the draft as a `Searched:` line. [Richard Feynman]
2. Reduce it to the smallest reproducer: one `.lgo` file, or one command sequence in an empty module when the fault is not in source. The reproducer holds one fault. Add at least one control that differs in one construct and does not show the fault. A claim from a worker or from a failed build is not a finding until this reproducer shows it. [Richard Feynman]
3. Classify it: defect (behavior contradicts a SPEC sentence, is a crash, or is a diagnostic that names a compiler-made identifier or the wrong position) or enhancement (SPEC is silent or says otherwise). [Tony Hoare]
4. Defect: in a fix worktree under `LoGOs/.outline/worktree/`, never the toolchain worktree that spira builds with, add the reduced case as a test where the worktree `AGENTS.md` says tests of that kind go (`test/logos/run/`, `test/logos/lint/`, or `src/internal/types/testdata/logos/`), run the matching command from that file (`go test -count=1 cmd/internal/testdir -run 'Test/logos/'` or the package test), and see it fail. Write this test for every defect, also for one that is not fixed now. Fix the compiler, runtime or library. If the fix changes a language rule, update its Table T row in `logos-doc/IMPLEMENTATION.md` and the SPEC sentence in the same commit. If it changes a lint rule, make the mirrored change in `/home/alpha/repos-devtool/gglint` and keep its `TestLogosPorts` green. Pass the slice gate the worktree `AGENTS.md` names and commit in the fix worktree on the detached HEAD. After the test has been seen to fail on the base revision and pass on the fix commit, cherry-pick the commit into the toolchain worktree, rebuild with `make.bash`, then use the correct form in spira. [Christopher Alexander]
5. Enhancement, or a defect whose fix does not fit one LoGOs slice: add no compiler change. Write spira with the plain form the current compiler accepts, and write the draft in the same step. No brief and no commit carries a plain form before its reproducer exists. [Herbert Simon]
6. Draft the text for `gosuda/loGos` in every case, one fault per draft: title in imperative form; body with the `Searched:` line, the LoGOs revision, the reproducer and its controls, the expected result with the SPEC section it rests on, the actual output verbatim, and for a fixed defect the local commit hash, the failing-then-passing test output and the spira code that the fix unblocks (as a `gosuda/spira` link once that step is pushed). Use the matching file under `.github/ISSUE_TEMPLATE` or the pull-request template, and follow `CONTRIBUTING.md`. [Edward Tufte]
7. Keep each draft as `spira/.outline/findings/<nn>-<slug>.md`. Nothing about a finding is written outward without the user's approval of its text. A fixed defect gets a pull-request draft and no separate issue; an enhancement or an unfixed defect gets an issue draft. [Kenya Hara]
8. Spira never keeps a workaround for a fixed defect. After the rebuild, the spira code uses the form the SPEC promises and the tests pass on it. [Dieter Rams]
