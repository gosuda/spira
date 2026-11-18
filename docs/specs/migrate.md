# migrate

Package `migrate` applies SQL migration pairs in name order and checks that each `down` file restores the schema.

## Interface

```lgo
type Step struct {
	Name string
	Up   string
	Down string
}

func Load(fsys fs.FS) ([]Step, error)
func Apply(ctx context.Context, p *db.Pool, steps const []Step) error
func Rollback(ctx context.Context, p *db.Pool, steps const []Step, count int) error
func CheckReversible(ctx context.Context, p *db.Pool, steps const []Step) error
```

## Requirements

### Load

- `Load` MUST read the files in the root of `fsys`.
- `Load` MUST ignore a directory entry.
- `Load` MUST order the steps by `.up.sql` file name.
- The `Name` of a step MUST be the `.up.sql` file name without that suffix.
- The `Up` of a step MUST be the text of its `.up.sql` file.
- The `Down` of a step MUST be the text of the `.down.sql` file with the same stem.
- `Load` MUST refuse an `.up.sql` file that has no matching `.down.sql` file.
- `Load` MUST refuse a `.down.sql` file that has no matching `.up.sql` file.
- Each error MUST name the file that has no match.

### Bookkeeping

- `Apply` MUST create the table `spira_migrations` before it reads the applied steps.
- The bookkeeping table MUST have the columns `name` and `applied_at`.
- `Apply` MUST use `text primary key` and `text not null` on SQLite and PostgreSQL.
- `Apply` MUST use `name varchar(255) primary key` and `applied_at varchar(64) not null` on MySQL and SQL Server.
- On SQL Server, `Apply` MUST create the table only when `OBJECT_ID('spira_migrations', 'U')` is null.
- `Apply` MUST write the step name and a UTC time in RFC 3339 format when it applies a step.
- `Apply` MUST read the applied names with `ORDER BY name`.
- `Apply` MUST store a step name as applied only after its `up` text has run in the same transaction.

### Apply

- `Apply` MUST run only the steps after the applied prefix.
- If an applied name is not the step name at the same index, `Apply` MUST fail.
- That failure MUST change no schema.
- If an applied name is outside the given steps, `Apply` MUST fail.
- A second `Apply` of the same steps MUST succeed and MUST not write a second bookkeeping row.
- Each step MUST run its `up` text and its bookkeeping insert in one transaction.
- `Apply` MUST use the dialect of `p` for each placeholder.
- On SQLite and MySQL, `Apply` MUST use `?` for each placeholder.
- On PostgreSQL, `Apply` MUST use `$1`, `$2` and so on.
- On SQL Server, `Apply` MUST use `@p1`, `@p2` and so on.

### Rollback

- `Rollback` MUST undo the last `count` applied steps in name order.
- `Rollback` MUST run each `down` text in its own transaction.
- `Rollback` MUST delete the bookkeeping row of each step that it undoes.
- `Rollback` MUST refuse a negative `count`.
- `Rollback` MUST refuse a `count` that is larger than the number of applied steps.
- A `Rollback` with `count` 0 MUST succeed and MUST change nothing.
- If an applied name is not in the given steps, `Rollback` MUST fail.

### CheckReversible

- `CheckReversible` MUST fail when the database already has a user table.
- `CheckReversible` MUST record a schema fingerprint before it applies any step.
- `CheckReversible` MUST record a schema fingerprint after each `up`.
- `CheckReversible` MUST run each `down` file from last to first.
- After each `down`, the fingerprint MUST equal the fingerprint from before that step.
- `CheckReversible` MUST return the error `migrate: <name> down does not restore the schema` on a mismatch.
- `CheckReversible` MUST NOT use the bookkeeping table.
- `CheckReversible` MUST NOT require the bookkeeping table.

### Fingerprint

- On SQLite, the fingerprint MUST be the sorted `sql` column of `sqlite_master`.
- The SQLite query MUST exclude a null `sql` and a name that starts with `sqlite_`.
- On PostgreSQL, the fingerprint MUST use `information_schema.columns` for `current_schema()`.
- On MySQL, the fingerprint MUST use `information_schema.columns` for `database()`.
- On SQL Server, the fingerprint MUST use `information_schema.columns` for `SCHEMA_NAME()`.
- Each row MUST have `table_name`, `column_name`, `data_type`, `is_nullable` and `column_default` on PostgreSQL, MySQL and SQL Server.
- The fingerprint MUST sort the rows and MUST compare them as one string.

## Errors

- `migrate: read migrations: <cause>` when `Load` cannot read the directory.
- `migrate: <file> has no matching .down.sql file` when an `up` file has no `down` file.
- `migrate: <file> has no matching .up.sql file` when a `down` file has no `up` file.
- `migrate: read <file>: <cause>` when `Load` cannot read a pair file.
- `migrate: create bookkeeping table: <cause>` when the bookkeeping table cannot be created.
- `migrate: read applied steps: <cause>` when the applied names cannot be read.
- `migrate: applied step %d is %q, expected %q` when an applied name differs from the step at that index.
- `migrate: applied step %q is not in the given steps` when an applied name is outside the steps.
- `migrate: record <name>: <cause>` when the bookkeeping insert fails.
- On SQLite, PostgreSQL and SQL Server, `migrate: <name> up: <cause>` when an `up` fails.
- On MySQL, `migrate: <name> failed; mysql does not roll back DDL, inspect the schema: <cause>` when an `up` fails.
- `migrate: cannot roll back %d of %d applied steps` when `count` is out of range.
- `migrate: <name> down: <cause>` when a `down` fails in `Rollback`.
- `migrate: unrecord <name>: <cause>` when the bookkeeping delete fails.
- `migrate: scratch database is not empty` when `CheckReversible` finds a user table.
- `migrate: inspect schema: <cause>` when the user-table query fails.
- `migrate: fingerprint: <cause>` when the fingerprint query fails.

## Proof

- `TestLoadOrdersByName` proves name order and the step name.
- `TestLoadRefusesDownWithoutUp` and `TestLoadRefusesUpWithoutDown` prove the two missing-file errors.
- `TestApplyAppliesInOrderAndIsIdempotent` proves apply order and a second apply that writes nothing.
- `TestApplyRefusesReorderedSteps` proves that a reordered list fails and leaves the schema unchanged. The oracle is a direct schema fingerprint.
- `TestApplyRefusesMissingMiddleStep` proves the same refusal for a missing middle step.
- `TestApplyFailingStepLeavesNothing` proves that a failed `up` leaves no user table and no bookkeeping row.
- `TestApplyPartialPrefixLeavesSchema` proves that a later apply runs only the remaining steps.
- `TestRollbackOneAndAll` proves one rollback and a full rollback, and the refusal of a large count.
- `TestCheckReversiblePasses` proves that a correct pair leaves no table. The oracle is a direct fingerprint.
- `TestCheckReversibleFailsOnLeftoverColumn` proves the mismatch error.
- `TestCheckReversibleRefusesNonEmpty` proves the empty-database rule.

## Not in scope

- The package does not generate SQL. The `up` and `down` text is the source of truth.
- The package does not repair a MySQL schema after a failed `up`. MySQL does not roll back DDL.
