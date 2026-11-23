logos_root := env_var_or_default("LOGOS_ROOT", "/home/alpha/repos-devtool/LoGOs/.outline/worktree/spira-toolchain-tip")
upstream_go := env_var_or_default("UPSTREAM_GO", "/home/linuxbrew/.linuxbrew/bin/go")

export GOROOT := logos_root
export GOTOOLCHAIN := "local"
export PATH := logos_root / "bin" + ":" + env_var("PATH")

gate: sql-check build lint test web slop

build:
    logos build ./...

lint:
    logos lint ./...

slop:
    sloplint check --mode threshold --strictness standard --fail-on major --root "{{justfile_directory()}}"

test:
    logos test -race -count=1 ./...

[positional-arguments]
sql config="example/shop/sqlc.yaml":
    #!/usr/bin/env bash
    set -euo pipefail
    plugin_dir="$(mktemp -d /tmp/spira-sql-plugin.XXXXXXXX)"
    trap 'rm -rf -- "${plugin_dir:?}"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    logos build -o "$plugin_dir/sqlc-gen-spira" ./cmd/sqlc-gen-spira
    test -x "$plugin_dir/sqlc-gen-spira"
    config="$1"
    if [[ "$config" != /* ]]; then
        config="$PWD/$config"
    fi
    PATH="$plugin_dir:$PATH" GOWORK=off go -C tools tool sqlc generate -f "$config"

sql-check:
    #!/usr/bin/env bash
    set -euo pipefail
    status=0
    rg --no-config -n -U --glob '*.lgo' --glob '!*.sql.lgo' \
        --glob '!/db/**' --glob '!/orm/**' --glob '!/migrate/**' \
        --glob '!/ai/session/**' --glob '!/ai/rag/**' \
        --glob '!/cmd/sqlc-gen-spira/gen.lgo' \
        '\bdb\s*\.\s*(Query|One|Exec)\b' . || status=$?
    case "$status" in
        0) printf 'sql-check: use generated queries instead of raw db calls\n' >&2; exit 1 ;;
        1) ;;
        *) printf 'sql-check: rg failed (exit %s)\n' "$status" >&2; exit "$status" ;;
    esac

    shop=example/shop
    scratch="$(mktemp -d /tmp/spira-sql-check.XXXXXXXX)"
    trap 'rm -rf -- "${scratch:?}"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    (
        cd "$shop"
        printf '%s\0' sqlc.yaml > "$scratch/sql-inputs"
        find db/migrations db/queries -name '.*' -prune -o \
            \( -type d -o -type l -o -name '*.sql' \) -print0 >> "$scratch/sql-inputs"
        while IFS= read -r -d '' input; do
            if [[ -L "$input" ]]; then
                printf 'sql-check: symlink is not a SQL input: %s\n' "$input" >&2
                exit 1
            fi
            if [[ -d "$input" ]]; then
                mkdir -p -- "$scratch/$input"
                continue
            fi
            if [[ ! -f "$input" ]]; then
                printf 'sql-check: expected a regular input file: %s\n' "$input" >&2
                exit 1
            fi
            cp --parents -- "$input" "$scratch"
        done < "$scratch/sql-inputs"
    )
    GOWORK=off go -C tools tool sqlc vet -f "$scratch/sqlc.yaml"
    just sql "$scratch/sqlc.yaml"
    diff -qr --no-dereference -- "$shop/db/store" "$scratch/db/store"
    unstaged="$(git --no-optional-locks diff --name-only -- '*.sql.lgo')"
    untracked="$(git --no-optional-locks ls-files --others --exclude-standard -- '*.sql.lgo')"
    if [[ -n "$unstaged$untracked" ]]; then
        printf 'sql-check: generated SQL files outside the index:\n%s\n%s\n' "$unstaged" "$untracked" >&2
        exit 1
    fi

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
    ./scripts/engines.sh logos test -tags engines -count=1 -v -run Engine ./db/... ./orm/... ./ai/session/... ./ai/rag/... ./migrate/... ./cmd/sqlc-gen-spira/... ./cmd/spira/...
