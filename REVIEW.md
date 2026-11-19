# Review guide

This file tells a reviewer what to check in a change.
It holds only rules that this repository enforces.
The [module conventions](AGENTS.md) state the rules in full.
This file names the evidence for each rule and the check that proves it.

## How to review

1. Read the diff first. Read the commit message second.
2. Apply each check in the table below to the diff.
3. Ask for a test that fails without the repair for each defect report. The report MUST show the command and the failing output. It MUST then show the same test green with the repair. A report without both outputs is not proof.
4. Reject a rule violation. Do not repair it yourself in the review.
5. Leave a finding to the finding protocol. See [AGENTS.md](AGENTS.md), section "Finding protocol".

## Rules and checks

| Rule | Where it shows | Check |
|---|---|---|
| The module holds only `.lgo` packages. Tests sit in an external `package x_test`. One `export_test.lgo` per package is the limit, and it holds no test. | Every `*_test.lgo` file in the tree; `db/export_test.lgo` | Review the diff. Reject an in-package test file. |
| Every build, test and lint command uses the LoGOs worktree toolchain, not the system Go. | `justfile` (`logos_root`, `export GOROOT`); [AGENTS.md](AGENTS.md), section "Toolchain environment" | Any `just gate` recipe proves it. Reject a command that uses another Go root. |
| `just gate` MUST pass before every commit. | `.git/hooks/pre-commit`, which runs `exec just gate` (see [CONTRIBUTE.md](CONTRIBUTE.md), section "Set up"); `justfile` recipe `gate` | The hook stops the commit when the gate fails. Reject a commit message that says the gate was skipped. |
| `just eject` MUST pass at the end of a unit of work. | `justfile` recipe `eject`; [AGENTS.md](AGENTS.md), section "Gates" | Run `just eject`. An eject failure is a finding, not a style note. |
| cgo stays forbidden. Tests run with `-race`. | `logos.toml` (`cgo = "forbid"`); `justfile` recipe `test`; [AGENTS.md](AGENTS.md) | `logos build` rejects a dependency that needs cgo. Reject `CGO_ENABLED=1` or a changed `logos.toml` build table. |
| No `reflect`. A question about a type is a comptime generic. | [AGENTS.md](AGENTS.md); `app.Run` in `app/app.lgo` walks fields at compile time | `logos lint` does not flag `reflect`, so grep the diff for `"reflect"`. Reject any hit. |
| Concurrency goes through `go group` only. Shared mutable state lives in `logos/sync.Locked[T]`. No package-level mutable state. | [AGENTS.md](AGENTS.md); the `sessions` field in `auth/session.lgo` | `logos build` rejects a bare `go` statement with the diagnostic `concurrency::unsupervised_goroutine`. Grep the diff for a package-level `var` that is not a constant table. |
| Struct tags name wire fields only. A tag never selects behavior. | [AGENTS.md](AGENTS.md); the tags in `db`, `web` and `config` | Review each new tag against the tag list in [AGENTS.md](AGENTS.md). Reject a tag that turns behavior on or off. |
| Cross-cutting behavior is an ordered list of `web.Stage` values written in code. The stage boundary is settled. | [AGENTS.md](AGENTS.md); `web.Stage` in `web/web.lgo` | Reject a registry, an annotation, a scan or a priority number. Check that a stage writes one outcome and reads it through the context. |
| No ambient transaction. A transaction is a value that the caller passes. | [AGENTS.md](AGENTS.md); `db.InTx` in `db/db.lgo` hands `*Tx` to `work` | Reject code that reads a transaction from a global, a context value or a package variable. |
| Every `ops` and `admin` mount takes a guard. The guard runs before each route. | `ops.Mount` in `ops/ops.lgo`; `docs/specs/ops.md`; `docs/specs/admin.md`; the test `TestEveryOpsEndpointRefusedWithoutGuardCredentials` | The signature is the first check; `logos build` rejects a call without the guard argument. Reject a route that the mount adds behind no guard. |
| Errors are `(T, error)` with `?`, wrapped as `fmt.Errorf("<package>: <what>: %w", err)`. Absence is `T?`. Panic only for programmer errors at registration time. | [AGENTS.md](AGENTS.md), section "Conventions" | Review each new error path. Reject a panic in a request path, a swallowed error, or a wrap without the package prefix. |
| A package exports an interface only when spira ships two or more implementations of it. | [AGENTS.md](AGENTS.md) | Count the implementations in the tree. Reject an interface with one implementation and no second one in the same diff. |
| Tests run the real parts: in-memory SQLite and `net/http/httptest`. No mocks. | `web/web_test.lgo`; `example/shop/db/migrations_test.lgo` | Review each new test. Reject a mock of a spira type or of the database. |
| A change that adds behavior lands only after its new tests failed on the tree without the change. | [AGENTS.md](AGENTS.md), section "Gates" | Ask for the red output. No red output, no approval. |
| A compiler workaround carries a finding. A silent workaround is a review defect. | [AGENTS.md](AGENTS.md), section "Finding protocol" | Every workaround cites a draft under `.outline/findings/` or a LoGOs test. Reject a workaround that cites neither. |
| Copied code obeys the licence rules. Each source project appears once in `NOTICE`. The commit body names the source. | [AGENTS.md](AGENTS.md), section "Copying from the reference clones"; `NOTICE` | Check the licence of the source clone. Check the header comment in the copied file. Check the `NOTICE` entry and the repository, path and revision in the commit body. |
| The server packages and the frontend share one wire corpus. A change to one side changes the other side and the corpus in one commit. | [AGENTS.md](AGENTS.md), section "Wire contract"; `wire/corpus.jsonl`; `live/corpus_test.lgo`; `view/view_test.lgo`; `frontend/test/corpus.test.ts` | `logos test` and `just web` both read the corpus. Reject a case that one side keeps in its own file. Reject a one-sided change to the slot, island or event format. |
| A package specification stays true to the code. A disagreement is a defect in one of them, repaired in the same commit. | `docs/specs/README.md` | Read the spec of each touched package. Reject a diff that changes the code or the spec alone. |
| Third-party modules stay in the allowed set. Database drivers appear only in tests, `example/` and generated applications. Versions come from `logos get`. | [AGENTS.md](AGENTS.md); `go.mod`; `tools/go.mod` | Reject a new module outside the set in [AGENTS.md](AGENTS.md). Reject a version typed by hand. Reject a driver import in a runtime package. |

## What is not a rule

- The lint thresholds (nesting, line count, parameter count) are LoGOs lint defaults. `logos lint` in `just gate` enforces them.
- The ignore entries for `.outline/` and `.references/` are visible in `.gitignore`.
