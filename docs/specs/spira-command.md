# cmd/spira

The `spira` command generates an application and runs the application and the frontend workspace together. It restarts the application when an `.lgo` file changes.

Status: `spira new` and `spira dev` are both in the tree.

## Interface

```text
usage: spira new [-engine sqlite|postgresql|mysql|mssql] [-spira-dir <path>] <dir> <module-path>
usage: spira dev <main-package>
```

## Requirements

### Arguments

- The command MUST accept `new`, an optional `-engine` flag, an optional `-spira-dir` flag, and two arguments: a directory and a module path.
- The command MUST accept `dev` and one main-package argument.
- On any other arguments, the command MUST write `usage: spira new [-engine sqlite|postgresql|mysql|mssql] [-spira-dir <path>] <dir> <module-path>` or `usage: spira dev <main-package>` to stderr.
- The command MUST then exit 2.

### spira new

The subcommand `spira new` writes a minimal application into `<dir>` from files embedded with `embed`.

- `spira new` MUST write files embedded with `embed` into `<dir>`.
- `spira new` MUST write `go.mod`, `go.sum`, `logos.toml`, `justfile`, `sqlc.yaml`, `tools/go.mod` and `tools/go.sum`.
- The `justfile` MUST have the recipes `gate`, `sql`, `sql-check` and `web`.
- `spira new` MUST write `db/migrations/0001_create_users.up.sql` and `db/migrations/0001_create_users.down.sql`.
- `spira new` MUST write `db/migrations/0002_create_sessions.up.sql` and `db/migrations/0002_create_sessions.down.sql`.
- `spira new` MUST write `db/queries/users.sql` and `db/queries/sessions.sql`.
- `spira new` MUST write `main.lgo` with ordinary statements, an application struct and `app.Run`.
- `spira new` MUST write a `features/home/` folder with a page, a form and one Svelte island.
- `spira new` MUST write a `features/account/` folder with login, logout, a protected page and a session store built on `auth` primitives.
- `spira new` MUST write `features/account/faults.lgo` with one internal fault.
- `spira new` MUST write a test that runs `migrate.CheckReversible` and `store.PrepareAll`.
- `spira new` MUST write a copy of `frontend/` whose island glob is `../../features/**/islands/*.{svelte,react.tsx,solid.tsx}`.
- The engine MUST select the SQL dialect of the migrations and queries.
- The engine MUST select the `engine` key in `sqlc.yaml`.
- The engine MUST select the driver import in `main.lgo`.
- The engine MUST select the default DSN in `main.lgo`.
- For `sqlite`, the driver import MUST be `modernc.org/sqlite`.
- For `postgresql`, the driver import MUST be `github.com/jackc/pgx/v5/stdlib`.
- For `mysql`, the driver import MUST be `github.com/go-sql-driver/mysql`.
- For `mssql`, the driver import MUST be `github.com/microsoft/go-mssqldb`.
- For `mssql`, the migrations and queries MUST use SQL Server spellings.
- The default engine MUST be `sqlite`.
- For `sqlite`, the test MUST use an in-memory database.
- For `postgresql`, the test MUST read `SPIRA_TEST_POSTGRES_DSN`.
- For `mysql`, the test MUST read `SPIRA_TEST_MYSQL_DSN`.
- For `mssql`, the test MUST read `SPIRA_TEST_MSSQL_DSN`.
- The login handler MUST call `auth.VerifyAgainstDummy` when the user is missing.
- A missing user and a wrong password MUST answer `auth.invalid_credentials`.
- The account handlers MUST NOT call `web.Fail` with a literal problem.
- A bad session user id MUST wrap the account fault.
- `spira new` MUST refuse a non-empty `<dir>`.
- `spira new` MUST accept only `sqlite`, `postgresql`, `mysql` and `mssql` for `-engine`.
- With `-spira-dir <path>`, `spira new` MUST write a `replace github.com/gosuda/spira => <path>` line into the generated `go.mod` and require `spira` at `v0.0.0`.
- Without `-spira-dir`, `spira new` MUST require `spira` at the pseudo-version of the binary build revision, or refuse with a message that names `-spira-dir` when no revision is available.
- After `just sql` in the generated directory, `logos build ./...` MUST pass.
- After `just sql` in the generated directory, `logos test ./...` MUST pass.

### spira dev

- The command MUST start the server as `logos run <main-package>`.
- The command MUST start the frontend as `pnpm --dir frontend run dev`.
- The command MUST set `SPIRA_VITE_ORIGIN` to `http://localhost:5173` on the server process.
- That value MUST replace an inherited `SPIRA_VITE_ORIGIN`.
- SIGINT MUST stop the server process group and the frontend process group.
- SIGTERM MUST stop the server process group and the frontend process group.
- After that stop, the command MUST reap those processes.
- The frontend start MUST return nil only when the start error wraps `context.Canceled`.
- The loop MUST report each server start on `Started` with role `server`.
- The loop MUST report each frontend start on `Started` with role `frontend`.
- A report MUST carry the command and the process environment.
- The loop MUST NOT block when `Started` is nil.
- A blocked report MUST end when the context ends.

### Restart

- The command MUST poll every 500 ms.
- The command MUST restart the server when the modification time of an `.lgo` file changes.
- The command MUST restart the server when the size of an `.lgo` file changes.
- The command MUST restart the server when an `.lgo` file appears.
- The command MUST restart the server when an `.lgo` file disappears.
- The command MUST NOT restart the server for a file whose name does not end in `.lgo`.
- The command MUST NOT restart the server for an `.lgo` file under `node_modules`.
- The command MUST NOT restart the server for an `.lgo` file under a directory whose name starts with `.`.
- An `.lgo` change MUST NOT restart the frontend process.
- A restart MUST stop the previous server process group before the next server start.
- After the server process exits by itself, the command MUST wait for an `.lgo` change.
- That wait MUST log one warning.
- That warning MUST be `cmd/spira: server exited; next .lgo change restarts it`.
- That warning MUST include the process exit error.

### Root

- The dev loop MUST refuse a root that is not a directory.
- That refusal MUST start no process.
- When the dev loop returns an error, the command MUST write it to stderr.
- The command MUST then exit 1.

## Errors

- A usage error for `spira new` when the `-engine` value is not in the list. The plan states no message text.
- `usage: spira dev <main-package>` on stderr when the arguments are not `dev` and one package.
- A refusal for `spira new` when `<dir>` is not empty. The plan states no message text.
- `cmd/spira: <root> is not a directory` when the root is not a directory.
- `cmd/spira: start <command>: <cause>` when a process fails to start.
- `cmd/spira: start <command>: no process` when a start yields no process.
- `cmd/spira: server exited; next .lgo change restarts it` when the server exits or fails to start, with the cause on the warning.
- `cmd/spira: frontend exited` when the frontend process exits while the command context is still active.
- `cmd/spira: stop server group` when the stop of a server process group fails.

## Proof

- `TestNewGeneratesExpectedFiles` proves the file set and the engine pieces for `sqlite`, `postgresql`, `mysql` and `mssql`.
- `TestNewGeneratesExpectedFiles` proves the account faults and the `auth` login shape.
- `TestNewRejectsUnknownEngine` proves an unknown engine is a usage error that leaves no directory.
- `TestNewRefusesNonEmptyDir` proves generation refuses a non-empty directory without writing.
- `TestNewRejectsBadModulePath` proves bad module paths are refused without writing.
- `TestNewUsageShapes` proves every other argument shape prints the `spira new` usage.
- `TestNewPseudoVersion` proves the pseudo-version shape, its error paths, and the `v0.0.0` version for a `-spira-dir` build.
- Generation plus `just sql`, `logos build ./...` and `logos test ./...` MUST pass for every engine.
- The three server engines MUST run with their DSN exported.
- `TestWatchRestartsServerOnlyOnLgoChange` proves a restart on an `.lgo` change, and no restart for a `.txt` file or for `node_modules`.
- `TestWatchCancelEndsLoopAndKillsStandinGroups` proves that cancel stops the server group and the frontend group.
- `TestWatchServerSelfExitWaitsForChange` proves that a server exit waits for an `.lgo` change.
- `TestWatchServerSelfExitLogsOneWarningWithRealStatus` proves one warning with the real exit error.
- `TestWatchRestartReapsPreviousServerBeforeNextStart` proves the previous server is gone before the next start, and that a size-only change restarts.
- `TestWatchCancelReapsAllChildren` proves that cancel reaps the child processes.
- `TestWatchRejectsRootThatIsNotADirectory` proves the directory error and that no process starts.
- `TestWatchGivesTheViteOriginToTheServer` proves `SPIRA_VITE_ORIGIN` is `http://localhost:5173` even when the parent holds another value.
- `TestFrontendCancelDuringStartupReturnsNil` proves that a cancel during startup returns nil and leaves no child.
- `TestFrontendLaunchFailureWithLiveContextReturnsError` proves that a launch failure with a live context returns the start error.
- `TestFrontendLaunchFailureRacingCancelReturnsError` proves that a launch failure racing a cancel returns the start error.
