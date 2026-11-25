# spira

spira is a behavioral rewrite of the Spring ecosystem in LoGOs (`.lgo` files). It is licensed under Apache-2.0 (`LICENSE`, `NOTICE`). It MAY copy code and tests from the clones under `.references/`; the section "Copying from the reference clones" gives the rules.

## Module rules

- This module holds only `.lgo` packages. Tests are `_test.lgo` files in an external test package (`package x_test`; `package main_test` for a command, which imports its own `main` package). The one in-package file a package may add is `export_test.lgo`: it holds no test and only exposes internal state that an external test must observe. [David Parnas]
- Build with `logos`. Plain `go` ignores `.lgo` files. [John Carmack]
- `logos.toml` sits next to `go.mod`. Unknown tables or keys are errors. Add a `[capabilities]` allowlist entry only when `logos build` reports a capability diagnostic, and name the exact module path it reports. [Tony Hoare]
- Strictly no cgo (human-supplied). `logos.toml` keeps `[build] cgo = "forbid"`; never change it, never set `CGO_ENABLED=1`, and never add a dependency that needs cgo. The gate runs the tests with `-race`: under this policy the toolchain links only the race runtime through `runtime/cgo`, and a package with `import "C"` still fails. `-race` needs a C compiler or `zig` in `PATH`. [Tony Hoare]
- Before you write, build, test, lint, review, or eject `.lgo` code, load every skill under `/home/alpha/repos-devtool/LoGOs/plugins/logos/skills/` that fits the task (`logos` always, `logos-concurrency` for `go group` and shared state, `logos-review` before a commit) and follow it. `logos-doc/SPEC.md` in the toolchain tree settles what the skills leave open. [Richard Feynman]

## Toolchain environment

The toolchain is a LoGOs worktree, not the system Go: `release-branch.go1.27` at `efbbc0403f` plus the base repairs of gosuda/LoGOs#294 (worktree head `340de82` on 2026-11-25). That head holds every fix this repository needs: the comptime packages (#102), `just eject` (#103, #118, #123, and the #294 repairs that resolve the test imports of variant roots, leave a bare option's nil check alone in comptime instances, and rewrite `EnableHTTP2ExtendedConnect` for stock Go), `resilience` (#109), interpolated text that holds a quote, a backquote or `//` (#119), the JSON options of the caller on static structs (#135), and the race detector under the cgo ban (#136). #116 rejects an exported comptime generic that names an unexported identifier of its package, so such a generic calls only exported names. After gosuda/LoGOs#294 merges, move the worktree to the base tip. Every command needs:

```sh
export GOROOT=/home/alpha/repos-devtool/LoGOs/.outline/worktree/spira-toolchain-tip PATH="$GOROOT/bin:$PATH" GOTOOLCHAIN=local
```

The `justfile` sets this itself. Override the root with `LOGOS_ROOT`. [John Carmack]

## Gates

- `just gate` MUST exit 0 before every commit. The native `.git/hooks/pre-commit` runs it. [Tony Hoare]
- `just slop` MUST exit 0 before every commit: sloplint at the standard profile over the TypeScript, JavaScript and shell files, failing on major findings; `.lgo` files are not parsed until gosuda/sloplint#37 lands. [Tony Hoare]
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
- Cross-cutting behavior is an ordered list of `web.Stage` values written in code. Every stage boundary is settled: the reply or the error that a handler or a stage returns is written at once, `next` returns `nil, nil`, and a stage reads the outcome from `ctx.Status()`. [Edsger W. Dijkstra]
- Errors are `(T, error)` with `?`, wrapped as `fmt.Errorf("<package>: <what>: %w", err)`. Absence is `T?`. Panic only for programmer errors at registration time. [Tony Hoare]
- Third-party modules: `golang.org/x/crypto` in `auth`; `github.com/quic-go/quic-go` in `http3` (MIT, no cgo); database drivers only in tests, `example/` and generated applications. Resolve versions with `logos get`; never type one from memory. [Richard Feynman]
- Tests run the real parts: in-memory SQLite and `net/http/httptest`. [John Carmack]

## Design procedure

Follow these steps in order before a new exported name lands. [Christopher Alexander]

1. Survey: read how two or more of the clones under `.references/` solve the problem. Record in the commit body what spira keeps, what it copies and what it drops. [Richard Feynman]
2. Lexicon: name every exported identifier with a word the application author already uses for the thing (`Route`, `Stage`, `Slot`, `Island`). A name that needs a comment to explain it is the wrong name. [Kenya Hara]
3. Caller first: write the file an application author would write, in `example/` or in a test, before the package. It MUST fail to build for the missing names only. [Tony Hoare]
4. One layer: the caller file reaches the standard library through one spira call at most. A second spira layer between them needs a reason in the commit body. [Dieter Rams]
5. Probe: build every LoGOs form the design needs in a scratch module before a brief or a package uses it. A form that fails is a finding. [Richard Feynman]
6. Signature freeze: a signature that a later plan step names changes only together with that step text. [David Parnas]

## Copying from the reference clones

- spira MAY copy or translate code from a clone under `.references/` when the licence of that clone is Apache-2.0, MIT, BSD or 0BSD. Read the licence file of the clone before you copy. [Richard Feynman]
- Do not copy from a clone that has another licence or no licence file at its root. Today these are `spring-projects/spring-tools` (EPL-1.0) and `spring-projects/spring-ai-examples`, `spring-projects/spring-batch-extensions`, `spring-projects/spring-integration-samples`, `spring-projects/spring-security-samples` and `spring-projects/spring-ws-samples` (no licence file found). [Tony Hoare]
- Copy the tests with the code. When a package copies or mirrors a behavior of a reference, port the test cases of the reference for that behavior into the `_test.lgo` files of the package: the inputs and the expected results. An expected result that comes from a reference test is an independent oracle. [Richard Feynman]
- A copy is LoGOs code that obeys every rule in this file. Translate it; do not transliterate it. Leave out reflection, containers, annotations, class hierarchies and mocks. If the copied unit cannot work without them, copy the algorithm and the test cases only. [Dieter Rams]
- Keep the notices. A file that is mostly a translation of one source file starts with a comment that names the source project, the source path and the copyright line of the source, and says that spira translated and changed it. This comment is a legal notice, so a rule against comments does not apply to it. [Tony Hoare]
- Record each source project once in `NOTICE` at the repository root: the project name, its licence, its copyright line, and the text of its own `NOTICE` file when it ships one. [Tony Hoare]
- Name the source in the commit body: the repository, the path and the revision (`git -C .references/<clone> rev-parse HEAD`) of each copied unit. [Richard Feynman]

## Wire contract

The server packages (`view`, `web`, `live`) and `frontend/` share these rules. A change to one side changes the other side and the corpus in the same commit. The full contract is [docs/specs/wire-contract.md](docs/specs/wire-contract.md); [docs/specs/README.md](docs/specs/README.md) lists the specification of every package. [Claude Shannon]

- Slot id: `s<16 hex digits>-<n>`. The 16 digits are random for each `Render` call; `n` counts slots from 0 in that call. [Claude Shannon]
- Slot match: the client compares the `id` attribute byte for byte. It MUST NOT build a selector from an id. [Tony Hoare]
- Island `when`: a closed set of values. An unknown value keeps the fallback and logs one error. [Tony Hoare]
- Island props: one JSON object. Malformed JSON, or a value that is not a plain object, keeps the fallback: no mount, no child removal, one error log. [Tony Hoare]
- Events: `live.Events` writes a named `event:` line before each `data:` body and sends a heartbeat comment. The stream ends when the client disconnects. [Claude Shannon]
- Fragments: a request with `HX-Request`, and without `HX-Boosted` and `HX-History-Restore-Request`, gets the fragment without the document shell. A page response carries `Vary: HX-Request, HX-Boosted, HX-History-Restore-Request`. [Claude Shannon]
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
