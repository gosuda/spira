# spira

Spring's server-side ideas, rebuilt in LoGOs with no container and no reflection.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

spira is a web framework for applications written in [LoGOs](https://github.com/gosuda/loGos), a fork of the Go toolchain that compiles `.lgo` files. It is for a team that wants the server behavior Spring gives (routing, HTML views, htmx fragments, browser islands, checked SQL, sessions, metrics and model calls) without dependency injection or run-time proxies. An application is ordinary statements in `main`. Where Spring asks a type a question at run time through `reflect`, spira asks at compile time with a LoGOs comptime generic.

```lgo
func index(ctx *web.Context) (web.Reply, error) {
	return web.Page{Title: "Hello", Body: view.P(view.T("Hello from spira"))}, nil
}

r := web.NewRouter()
r.Layout = layout
r.Handle("GET", "/", index)
// GET /                        -> <!doctype html><html>...<p>Hello from spira</p></body></html>
// GET / with HX-Request: true  -> <p>Hello from spira</p>
```

- **No reflection.** No `.lgo` file in the module imports `reflect`; `grep -R '"reflect"' --include='*.lgo' .` prints nothing.
- **No container.** `app.Run` only orders the start and stop of the `app.Part` fields of one struct. Nothing resolves or wires parts.
- **One runtime module.** `golang.org/x/crypto` for Argon2id. The four database drivers in `go.mod` are imported only by tests.
- **Plain Go out.** `logos eject` writes the module as Go source that upstream Go 1.27.4 builds. `just eject` checks this.
- **One handler, page or fragment.** `web.Page` writes the whole document, or only its body when htmx asks.

Contents: [Quick start](#quick-start) · [Installation](#installation) · [Why spira](#why-spira) · [Usage](#usage) · [What main ships](#what-main-ships) · [Development](#development) · [License](#license)

## Quick start

With a LoGOs toolchain already on `PATH` (see [Installation](#installation)), this app runs in under two minutes. Create a module and add spira:

```sh
mkdir hello && cd hello
logos mod init example.com/hello
logos get github.com/gosuda/spira@main
```

Write `main.lgo` in the module directory:

```lgo
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/gosuda/spira/app"
	"github.com/gosuda/spira/view"
	"github.com/gosuda/spira/web"
)

func layout(ctx *web.Context, p web.Page) view.Node {
	return view.Html(
		view.Head(view.Title(view.T(p.Title))),
		view.Body(view.H1(view.T(p.Title)), p.Body),
	)
}

func index(ctx *web.Context) (web.Reply, error) {
	return web.Page{Title: "Hello", Body: view.P(view.T("Hello from spira"))}, nil
}

type App struct {
	Web *web.Server
}

func main() {
	ctx := context.Background()
	r := web.NewRouter()
	r.Layout = layout
	r.Handle("GET", "/", index)
	root := &App{Web: &web.Server{Addr: ":18080", Router: r}}
	if err := app.Run(ctx, root); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
```

Allow the one package that opens sockets by writing `logos.toml` next to `go.mod`:

```toml
[capabilities]
transitive_net_allowlist = ["github.com/gosuda/spira/web"]
```

Build and run:

```sh
logos build -o hello-bin .
./hello-bin
```

The build prints `capabilities::unauthorized_reflect` warnings. They are warnings, not errors: the module code imports no `reflect`, while standard library packages such as `fmt` reach it.

In a second terminal:

```sh
curl -i localhost:18080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Vary: HX-Request, HX-Boosted, HX-History-Restore-Request

<!doctype html><html><head><title>Hello</title></head><body><h1>Hello</h1><p>Hello from spira</p></body></html>
```

`layout` wraps each page in the document shell. `app.Run` starts every field of `App` that implements `app.Part`, in field order, and stops them in reverse order on `SIGINT` or `SIGTERM`.

## Installation

The system `go` cannot build this module. You need a LoGOs toolchain built from source; the `loGos` repository's default branch is `release-branch.go1.27`, built with the fixes that [AGENTS.md](AGENTS.md) lists under "Toolchain environment". A plain default-branch build misses them.

1. Clone and build LoGOs. Go 1.27.4 is known to work as the bootstrap compiler.

   ```sh
   git clone https://github.com/gosuda/loGos.git
   cd loGos
   unset GOROOT GOTOOLCHAIN
   bootstrap_root=$(go env GOROOT)
   (cd src && GOROOT_BOOTSTRAP="$bootstrap_root" ./make.bash)
   ```

2. Put the toolchain on `PATH` for every later command. When you run spira's own recipes from another checkout, point `LOGOS_ROOT` at your LoGOs build; the `justfile` default is the maintainer's worktree path.

   ```sh
   export GOROOT="$PWD"
   export PATH="$GOROOT/bin:$PATH"
   export GOTOOLCHAIN=local
   export LOGOS_ROOT="$PWD"
   ```

3. Check the install. The output starts with `logos version go1.27.4`, but the version line alone does not prove the listed fixes are present; confirm them in your LoGOs checkout.

   ```sh
   logos version
   ```

4. In an application module, add spira. `logos get` resolves the version and writes it into `go.mod`. Skip the `mkdir` when you already created `hello` in Quick start; the lines below assume a fresh directory.

   ```sh
   mkdir hello && cd hello
   logos mod init example.com/hello
   logos get github.com/gosuda/spira@main
   ```

The two repository commands are build-time tools, not runtime dependencies. From a spira checkout, `logos build -o /tmp/spira ./cmd/spira` builds the dev loop, and `logos build -o /tmp/sqlc-gen-spira ./cmd/sqlc-gen-spira` builds the sqlc plugin.

## Why spira

- **Behavior stays explicit.** A route, a stage, a cache and a guard are values in code. There is no annotation, scan, interceptor registry or proxy.
- **Compile-time answers.** `app.Run`, `schema.Of`, `db.Query` and the generated SQL functions inspect types at compile time or before a row is scanned, without `reflect`.
- **Bounded by construction.** `meter` folds a metric past 1000 series into `overflow`, `bus.Topic` drops for a slow subscriber instead of blocking, and `web.Server` carries a header-read deadline (`ReadHeaderTimeout`) and a shutdown grace (`ShutdownGrace`).
- **Errors keep a public boundary.** `fault` gives each failure a stable code and a client-safe message; the cause stays in logs.
- **The exit is real.** If the experiment does not fit, `just eject` leaves ordinary Go that upstream Go builds.

## Usage

A feature is a struct that holds the concrete values it uses, and its methods are the handlers. `main` builds each feature as a struct literal, registers its methods and ends in `app.Run`.

One handler serves a full page and an htmx fragment. With the quick start program running:

```sh
curl -s localhost:18080/                        # the whole document
curl -s -H 'HX-Request: true' localhost:18080/  # <p>Hello from spira</p>
```

The other replies follow the same rule. `web.Fragment` writes HTML with `HX-Retarget`, `HX-Reswap`, `HX-Push-Url` or `HX-Trigger`. `web.Data` writes JSON. `web.Redirect` answers `HX-Redirect` for htmx and `Location` otherwise. `web.Problem` writes RFC 9457 problem details. `web.Delegate` hands a request to any `http.Handler`.

### Data and migrations

`example/shop/db` holds the migration pairs and annotated queries of the sample schema; `docs/specs/example-shop.md` specifies the application around them. `db.Open` takes the driver name and DSN, `db.InTx` hands a transaction to the work function, and `db.Query`/`db.One` scan rows by `col` tag. `migrate.Apply` runs the pending `*.up.sql` scripts in order, `migrate.Rollback` runs the matching `*.down.sql` scripts, and `migrate.CheckReversible` proves that each `down` restores the schema.

`cmd/sqlc-gen-spira` is a sqlc process plugin. It reads sqlc's `GenerateRequest` and writes table structs plus typed functions for `:one`, `:many`, `:exec`, `:execrows` and `:execlastid` queries. The accepted engines are SQLite, PostgreSQL, MySQL and SQL Server. `tools/go.mod` pins sqlc with a Go `tool` directive.

### Commands

- `spira dev <main-package>` starts `logos run` for the application and `pnpm --dir frontend run dev`, gives the server `SPIRA_VITE_ORIGIN=http://localhost:5173`, and restarts the server when an `.lgo` file changes.
- `sqlc-gen-spira` runs under sqlc as a `process` plugin; it also accepts `generate` for manual use and reads a request from standard input.

## What main ships

Each package has a specification under [docs/specs](docs/specs/README.md). These directories exist on `main` today.

| Area | Packages | What you get |
|---|---|---|
| Lifecycle and configuration | `app`, `config` | `app.Run` over one struct; `config.Load[T]` over ordered environment, map, file and remote sources |
| HTTP core | `web`, `schema`, `validate` | `ServeMux` method patterns, ordered `web.Stage` lists, typed context keys, the closed `web.Reply` union, RFC 9457 problems, `web.Server`, type schemas, field checks |
| Pages and browser | `view`, `asset`, `frontend/`, `live`, `bus`, `websocket` | HTML as values with escaping and a URL scheme filter; Vite manifest tags; React, Svelte 5, Solid and WASM island adapters; server-sent events; in-process topics; RFC 6455 connections |
| Data | `db`, `migrate`, `cmd/sqlc-gen-spira` | Pools and transactions for four engines, checked scans, a 256-entry statement cache, reversible migration pairs, generated table types and query functions |
| Security and operations | `auth`, `fault`, `meter`, `ops`, `admin` | Argon2id passwords, cookie sessions, bearer and guard stages, a stable public error vocabulary, Prometheus text, guarded `/ops` endpoints, an admin console |
| Outbound and background | `client`, `resilience`, `cache`, `gateway`, `job` | Typed JSON calls under timeout, retry and a breaker; one-flight LRU cache; reverse proxy; scheduler, queue and chunked batch |
| Model calls | `ai`, `ai/openai`, `ai/anthropic`, `ai/ollama`, `ai/session`, `ai/rag`, `ai/mcp` | Messages, tools, `ai.Run`, `ai.Collect` stream merge, layers, structured output, OpenAI-compatible, Anthropic and Ollama providers, sessions, retrieval, an MCP client and server mount |
| Tools | `cmd/spira`, `fault/faulttest` | `spira dev`; the spec-backed fault disclosure test kit |

`orm`, `openapi` and `spira new` are specified but not in the tree yet. Generated code that uses keyed tables imports `orm.Table`, so leave `tables` entries empty until `orm` lands. The full map from Spring concepts to spira packages, including what spira does not build, is in [scope and lexicon](docs/specs/scope-and-lexicon.md).

## Documentation

- Package contracts: [docs/specs](docs/specs/README.md)
- HTTP: [web](docs/specs/web.md)
- Pages and islands: [view](docs/specs/view.md), [frontend](docs/specs/frontend.md), [wire contract](docs/specs/wire-contract.md)
- Data: [db](docs/specs/db.md), [migrate](docs/specs/migrate.md), [sqlc-gen-spira](docs/specs/sqlc-gen-spira.md)
- Login and sessions: [auth](docs/specs/auth.md)
- Model calls: [ai](docs/specs/ai.md)
- Scope and exclusions: [scope and lexicon](docs/specs/scope-and-lexicon.md)
- Sample schema contract: [example-shop](docs/specs/example-shop.md)

## Development

The module builds with `logos`, not `go`. The `justfile` sets the toolchain environment; `LOGOS_ROOT` overrides the toolchain path.

```sh
just build    # logos build ./...
just lint     # logos lint ./...
just test     # logos test -race -count=1 ./...
just web      # wasm fixture, pnpm install, biome + tsc + vitest, vite build
just gate     # build lint test web
just eject    # logos eject to /tmp/spira-eject, then upstream go build
```

`just engines` runs the engine-tagged tests against digest-pinned PostgreSQL, MySQL and SQL Server containers through `scripts/engines.sh`; it requires Docker. `logos.toml` forbids cgo, and the test recipe keeps `-race`.

### Contributing

Read [CONTRIBUTE.md](CONTRIBUTE.md) for the steps to land a change and [REVIEW.md](REVIEW.md) for what a reviewer checks. [AGENTS.md](AGENTS.md) holds the module rules in full. A defect in the LoGOs toolchain is never worked around in silence: it goes through the finding protocol in that file.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
