# spira

Spring's server-side ideas, rebuilt in LoGOs with no container and no reflection.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

spira is a web framework for applications written in [LoGOs](https://github.com/gosuda/loGos), a fork of the Go toolchain that compiles `.lgo` files. It covers what a Spring application uses on the server: routing, HTML views, htmx fragments, browser islands, SQL access, sessions, metrics and model calls. An application is ordinary statements in `main`. No container resolves parts and nothing scans annotations. Where Spring asks a type a question at run time through `reflect` or a proxy, spira asks at compile time with a LoGOs comptime generic.

- **No reflection.** No `.lgo` file in the module imports `reflect`. `app.Run` walks the fields of the application struct at compile time.
- **One runtime dependency.** `golang.org/x/crypto`, for Argon2id password hashing. The only other module in `go.mod`, `modernc.org/sqlite`, is imported by tests alone.
- **Plain Go out.** `logos eject` turns the module into Go source that upstream Go 1.27.4 builds. `just eject` checks this.
- **Page or fragment from one handler.** A `web.Page` reply writes the whole document, or only the body when htmx asks for it.

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

Contents: [Install](#install) · [Quick start](#quick-start) · [Features](#features) · [Usage](#usage) · [Development](#development) · [License](#license)

## Install

The system `go` cannot build this module. You need a LoGOs toolchain built from source.

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

3. Check the install. The output starts with `logos version go1.27.4`.

   ```sh
   logos version
   ```

4. Create a module and add spira. `logos get` resolves the version and writes it into `go.mod`.

   ```sh
   mkdir hello && cd hello
   logos mod init example.com/hello
   logos get github.com/gosuda/spira@main
   ```

## Quick start

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

`layout` wraps each page in the document shell. `app.Run` starts every field of `App` that implements `app.Part`, in field order, and stops them in reverse order on `SIGINT` or `SIGTERM`.

LoGOs audits what a dependency can reach and denies network access by default. Allow the one spira package that opens sockets. Write `logos.toml` next to `go.mod`:

```toml
[capabilities]
transitive_net_allowlist = ["github.com/gosuda/spira/web"]
```

Build and run:

```sh
logos build -o hello-bin .
./hello-bin
```

The build prints warnings named `capabilities::unauthorized_reflect`. They do not stop the build. Standard library packages that spira imports, such as `fmt`, use `reflect`; spira's own code does not.

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

## Features

Each package has a specification under [docs/specs](docs/specs/README.md). The last column says what this tree holds today.

| Package | What you get | In the tree |
|---|---|---|
| `app` | `app.Run` starts and stops the `app.Part` fields of one struct in declaration order | yes |
| `config` | `config.Load[T]` fills a struct from environment, map, file and remote sources, with `required` tags and an error per key | yes |
| `web` | `net/http.ServeMux` patterns, ordered `web.Stage` lists, typed context keys, the closed `web.Reply` union, RFC 9457 problems, `web.Server` | yes; typed `Bind` and `Route` wait for `schema` |
| `validate` | `validate.Errors` and the `validate.Checker` interface; a rule is code in `Check` | yes |
| `view` | HTML as values from node functions: escaping, a URL scheme filter, `Island` custom elements, `Later` streamed slots; no template language | yes |
| `asset`, `frontend/` | Vite manifest tags in document order; island adapters for React, Svelte 5 and Solid; the slot mover; htmx with `allowEval` off | yes |
| `bus`, `live` | `bus.Topic[T]` fans events out in process and never blocks a publisher; `live.Events` streams HTML fragments as server-sent events | yes |
| `db` | `db.Open` over `database/sql` for SQLite, PostgreSQL, MySQL and SQL Server; `db.InTx`; `db.Query` and `db.One` scan by `col` tag; a 256-entry statement cache | yes; option fields (`string?`) wait for a LoGOs fix |
| `migrate` | `*.up.sql` and `*.down.sql` pairs; `migrate.CheckReversible` proves that each `down` restores the schema | yes |
| `auth` | Argon2id passwords, cookie sessions over a `SessionStore`, `auth.Authenticate` and `auth.Require` stages, `auth.Bearer`, cross-origin and security headers | yes |
| `meter`, `ops` | Prometheus counters, gauges and histograms capped at 1000 series per metric; `/ops` health, info, metrics and routes behind a guard you must pass | yes |
| `client`, `resilience`, `cache` | A typed JSON client under a timeout, retry and circuit-breaker policy; an LRU cache that runs one load per key | yes |
| `gateway`, `job` | Reverse proxy to static upstream lists with a breaker per upstream; a scheduler, a queue and chunked batch runs | yes |
| `ai`, `ai/ollama`, `ai/mcp` | Messages, tools, the `ai.Run` tool loop, `ai.Collect` stream merge, `ai.Wrap` layers, tool search; the Ollama provider with chat, streaming and embeddings; a Model Context Protocol client over stdio or HTTP and a server mount for your tools | yes; the other providers and the session and retrieval packages are specified |
| `cmd/spira` | `spira dev` runs Vite and `logos run` together and restarts the server when an `.lgo` file changes | `dev` yes; `new` is specified |
| `schema`, `openapi`, `admin`, `orm`, `cmd/sqlc-gen-spira` | Type descriptions, an OpenAPI 3.1 document, an admin console, entity sessions, SQL checked by `sqlc` before run time | specified, not yet in the tree |

## Usage

A feature is a struct that holds the concrete values it uses, and its methods are the handlers. `main` builds each feature as a struct literal, registers its methods and ends in `app.Run`.

One handler serves a full page and an htmx fragment. With the quick start program running:

```sh
curl -s localhost:18080/                        # the whole document
curl -s -H 'HX-Request: true' localhost:18080/  # <p>Hello from spira</p>
```

The other replies follow the same rule. `web.Fragment` writes HTML with `HX-Retarget`, `HX-Reswap`, `HX-Push-Url` or `HX-Trigger`. `web.Data` writes JSON. `web.Redirect` answers `HX-Redirect` for htmx and `Location` otherwise. `web.Problem` writes RFC 9457 problem details.

Where to read next:

- HTTP: [web](docs/specs/web.md)
- Pages and islands: [view](docs/specs/view.md), [frontend](docs/specs/frontend.md), [wire contract](docs/specs/wire-contract.md)
- Data: [db](docs/specs/db.md), [migrate](docs/specs/migrate.md)
- Login and sessions: [auth](docs/specs/auth.md)
- What maps to which Spring concept, and what spira does not build: [scope and lexicon](docs/specs/scope-and-lexicon.md)

`example/shop/db` holds the migrations and queries of the sample shop. The rest of the sample is specified in [example-shop](docs/specs/example-shop.md).

## Development

The module builds with `logos`, not `go`. The `justfile` sets the toolchain environment; `LOGOS_ROOT` overrides the toolchain path.

```sh
just build    # logos build ./...
just lint     # logos lint ./...
just test     # logos test -count=1 ./...
just web      # pnpm install, biome + tsc + vitest, vite build
just gate     # build lint test web
just eject    # logos eject to /tmp/spira-eject, then upstream go build
```

`logos.toml` forbids cgo, so tests run without the race detector.

### Contributing

Read [CONTRIBUTE.md](CONTRIBUTE.md) for the steps to land a change and [REVIEW.md](REVIEW.md) for what a reviewer checks. [AGENTS.md](AGENTS.md) holds the module rules in full. A defect in the LoGOs toolchain is never worked around in silence: it goes through the finding protocol in that file.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
