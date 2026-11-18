# spira

A web framework for applications written in LoGOs. spira gives the Spring ecosystem's server-side shape to `.lgo` files: typed routing, HTML views, htmx fragments, browser islands, checked SQL, sessions, metrics and model calls.

An application is ordinary statements in `main`. There is no container, no reflection and no annotation scanning. Compile-time generics do the work that Spring does with proxies and `reflect`.

**Checked at compile time.** Types, options and closed unions are checked by the LoGOs compiler. `logos eject` turns the module back into plain Go that builds with upstream Go.

**One language end to end.** The server and the browser share one wire contract: typed views, htmx fragments and custom-element islands for React, Svelte 5 and Solid.

**SQL checked before run time.** The design analyzes SQL files with `sqlc` against the migration schema and emits typed LoGOs code; the generator is specified in [sqlc-gen-spira](docs/specs/sqlc-gen-spira.md) and is not in the tree yet.

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

Output of `curl -i localhost:18080/`:

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Vary: HX-Request, HX-Boosted, HX-History-Restore-Request

<!doctype html><html><head><title>Hello</title></head><body><h1>Hello</h1><p>Hello from spira</p></body></html>
```

Contents: [Install](#install) · [Quick start](#quick-start) · [Features](#features) · [Usage](#usage) · [State](#state) · [Development](#development) · [Contributing](#contributing) · [License](#license)

## Install

spira is written in LoGOs, a Go toolchain fork that compiles `.lgo` files. The system `go` cannot build this module. You need a LoGOs toolchain built from source.

1. Clone and build LoGOs. Go 1.27.3 is known to work as the bootstrap compiler.

   ```sh
   git clone https://github.com/gosuda/loGos.git
   cd loGos
   unset GOROOT GOTOOLCHAIN
   bootstrap_root=$(go env GOROOT)
   (cd src && GOROOT_BOOTSTRAP="$bootstrap_root" ./make.bash)
   ```

2. Put the toolchain on your `PATH` for every later command.

   ```sh
   export GOROOT="$PWD"
   export PATH="$GOROOT/bin:$PATH"
   export GOTOOLCHAIN=local
   ```

3. Verify the install.

   ```sh
   logos version
   ```

   Expected output starts with `logos version go1.27.4`.

4. Create a module and add spira.

   ```sh
   mkdir hello && cd hello
   logos mod init example.com/hello
   logos get github.com/gosuda/spira@main
   ```

   `logos get` resolves the version and writes it into `go.mod`.

## Quick start

Write `main.lgo` in the module directory with the program from the title block. The layout function wraps each page in the document shell. `Router.Handle` registers a handler for `GET /`. `app.Run` starts every field of the application struct that implements `app.Part`, in field order, and stops them in reverse order on `SIGINT` or `SIGTERM`.

The capability audit denies network access by default. `logos.toml` authorizes the one spira package that opens sockets. Write it at the module root:

```toml
[capabilities]
transitive_net_allowlist = ["github.com/gosuda/spira/web"]
```

Packages that use more of the standard library, such as `db` or `auth`, add their own entries the same way; `logos build` names the package and the capability in its diagnostic.

The build also prints warnings named `capabilities::unauthorized_reflect`. They are warnings by default and do not stop the build: standard library packages that spira imports, such as `fmt`, use `reflect`. spira's own code does not import it.

Build and run:

```sh
logos build -o hello-bin .
./hello-bin
```

In a second terminal:

```sh
curl -i localhost:18080/
```

The response is the page shown above. `Vary: HX-Request, HX-Boosted, HX-History-Restore-Request` tells caches that the same URL can return a fragment or a full page depending on the htmx headers.

A `Page` reply writes the body alone for a plain htmx request, and the full layout for any other request, including a boosted one. `web.Fragment` writes an HTML fragment with `HX-Retarget`, `HX-Reswap`, `HX-Push-Url` or `HX-Trigger` headers. `web.Data` writes JSON. `web.Redirect` answers `HX-Redirect` for htmx and `Location` otherwise. `web.Problem` writes RFC 9457 problem details.

## Features

- **HTTP core** (`web`): `net/http.ServeMux` patterns, ordered `web.Stage` middleware, typed context keys, closed-union `web.Reply`, RFC 9457 problems, `web.Server` as an `app.Part`.
- **Application lifecycle** (`app`): `app.Run` starts and stops the `app.Part` fields of one struct in declaration order.
- **Configuration** (`config`): `config.Load[T]` fills a struct from `config.Env()`, `config.Map`, `config.File` and `config.Remote`, with `required` tags and per-key errors.
- **Validation** (`validate`): `validate.Errors` and the `validate.Checker` interface; rules are code in `Check`.
- **Views** (`view`): HTML as values from node functions, with escaping, URL scheme filtering, `Island` custom elements and `Later` streamed slots. No template language.
- **Assets** (`asset`): reads the Vite manifest, emits entry tags in document order, serves build output with immutable caching for `assets/`.
- **Browser workspace** (`frontend/`): pnpm, Vite, TypeScript strict, Biome, Vitest. Island adapters for React, Svelte 5, Solid and a LoGOs-WASM entry; the slot mover for `Later` fragments; htmx with `allowEval` off.
- **Push** (`bus`, `live`): `bus.Topic[T]` fans out in-process events without blocking publishers; `live.Events` streams `view.Node` fragments as server-sent events with a heartbeat.
- **Data** (`db`): `db.Open` over `database/sql` for SQLite, PostgreSQL, MySQL and SQL Server; `db.InTx`; comptime-scanned `db.Query` and `db.One` with `col` tags; a 256-entry prepared-statement cache; `db.In` for slice parameters. Option fields (`string?`) in a row type do not build yet: they wait for a comptime fix in LoGOs.
- **Migrations** (`migrate`): `migrate.Load` reads `*.up.sql`/`*.down.sql` pairs, `migrate.Apply` runs them in order, `migrate.CheckReversible` proves each `down` restores the schema fingerprint.
- **Checked SQL** (`cmd/sqlc-gen-spira`): specified; the package is not in the tree yet. It will be a sqlc plugin that emits typed row structs, distinct key types, `orm.Table` values and query functions, and refuses unmapped column types and writes to versioned tables that skip the version column.
- **Sessions** (`orm`): specified in `docs/specs/orm.md`; the package is not in the tree yet.
- **Auth** (`auth`): Argon2id password hashing, `auth.Sessions` cookie sessions over a `SessionStore`, `auth.Authenticate` and `auth.Require` stages, `auth.Bearer`, `auth.CrossOrigin`, `auth.SecureHeaders` and `auth.DevHeaders`.
- **Metrics and ops** (`meter`, `ops`): Prometheus counters, gauges and histograms with a 1000-series cap per metric; `meter.HTTP` records request duration by route; `ops.Mount` serves `/ops/live`, `/ops/ready`, `/ops/health`, `/ops/info`, `/ops/metrics` and `/ops/routes` behind a required guard stage.
- **Outbound** (`client`, `resilience`, `cache`): typed JSON client over `resilience.Policy` (timeout, retry, circuit breaker); `cache.Memory` LRU with `cache.Load` single-flight.
- **Background work** (`job`, `gateway`): `job.Scheduler`, `job.Queue` and `job.Chunk` for batch runs; `gateway.Mount` reverse-proxies path prefixes to static upstream lists with per-upstream breakers.
- **Model calls** (`ai`): messages, tools, `ai.Run` tool loop, `ai.Collect` stream merge, `ai.Wrap` layers and `ai.SearchTools`. Provider packages (`ai/openai`, `ai/anthropic`, `ai/ollama`, `ai/session`, `ai/rag`, `ai/mcp`) are specified and not in the tree yet.
- **Command** (`cmd/spira`): `spira dev <main-package>` runs the Vite dev server and `logos run` together and restarts the server when an `.lgo` file changes. `spira new` is specified and not in the tree yet.

## Usage

The example above is the shortest real program: a router, a layout and one page. Features are structs that hold the concrete values they use; `main` is ordinary statements that end in `app.Run`.

For the HTTP surface, read the [web specification](docs/specs/web.md). For pages, read [view](docs/specs/view.md) and [frontend](docs/specs/frontend.md). For data, read [db](docs/specs/db.md), [migrate](docs/specs/migrate.md) and [sqlc-gen-spira](docs/specs/sqlc-gen-spira.md). For auth, read [auth](docs/specs/auth.md). The [scope and lexicon](docs/specs/scope-and-lexicon.md) maps each Spring concept to its spira form and lists what spira does not build.

`example/shop/db` holds the shop sample's migration pairs and checked queries. The rest of the sample application is specified in [example-shop](docs/specs/example-shop.md) and lands in later commits.

## State

This tree holds these packages: `ai`, `app`, `asset`, `auth`, `bus`, `cache`, `client`, `cmd/spira` (`dev` only), `config`, `db`, `example/shop/db`, `frontend`, `gateway`, `job`, `live`, `meter`, `migrate`, `ops`, `resilience`, `validate`, `view`, `web`, and the `wire` corpus.

`docs/specs/` specifies the whole framework, including packages not yet in the tree: `admin`, `openapi`, `schema`, `orm`, `cmd/sqlc-gen-spira`, `spira new`, and the `ai` provider and session packages. Each specification file says whether its package is in the tree.

## Development

The module builds with `logos`, not `go`. `logos.toml` sits next to `go.mod` and turns off cgo. The `justfile` exports the toolchain environment itself; `LOGOS_ROOT` overrides the toolchain path.

```sh
just build    # logos build ./...
just lint     # logos lint ./...
just test     # logos test -count=1 ./...
just web      # pnpm install, biome + tsc + vitest, vite build
just gate     # build lint test web
just eject    # logos eject to /tmp/spira-eject, then upstream go build
```

The pre-commit hook runs `just gate`. A commit that fails lint or tests does not land.

Database drivers (`modernc.org/sqlite`, `github.com/jackc/pgx/v5`, `github.com/go-sql-driver/mysql`, `github.com/microsoft/go-mssqldb`) are test and example dependencies only; the library imports none of them. `tools/go.mod` pins `sqlc` as a Go tool for the generator.

## Contributing

Read [AGENTS.md](AGENTS.md) before you change code. It holds the module rules, the design procedure, the wire contract and the finding protocol for LoGOs toolchain defects. Spira never uses dependency injection, reflection or annotation-driven behavior; a package exports an interface only when spira ships two implementations of it.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
