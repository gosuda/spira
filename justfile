logos_root := env_var_or_default("LOGOS_ROOT", "/home/alpha/repos-devtool/LoGOs/.outline/worktree/spira-toolchain-tip")
upstream_go := env_var_or_default("UPSTREAM_GO", "/home/linuxbrew/.linuxbrew/bin/go")

export GOROOT := logos_root
export GOTOOLCHAIN := "local"
export PATH := logos_root / "bin" + ":" + env_var("PATH")

gate: build lint test web slop

build:
    logos build ./...

lint:
    logos lint ./...

slop:
    sloplint check --mode threshold --strictness standard --fail-on major --root "{{justfile_directory()}}"

test:
    logos test -race -count=1 ./...

web:
    cd frontend/test/fixtures/wasm/ticker && GOOS=js GOARCH=wasm logos build -o ../ticker.wasm ./
    cp "{{logos_root}}/lib/wasm/wasm_exec.js" frontend/test/fixtures/wasm/wasm_exec.js
    pnpm --dir frontend install --frozen-lockfile
    pnpm --dir frontend run check
    pnpm --dir frontend run build

eject:
    rm -rf /tmp/spira-eject
    logos eject -o /tmp/spira-eject
    cd /tmp/spira-eject && env -u GOROOT -u GOTOOLCHAIN {{upstream_go}} build ./...

engines:
    ./scripts/engines.sh logos test -tags engines -count=1 -v -run Engine ./db/... ./ai/session/... ./ai/rag/... ./migrate/... ./cmd/sqlc-gen-spira/... ./cmd/spira/...
