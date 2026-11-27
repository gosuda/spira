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
func Faults() []*fault.Error
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

 - `Apply` and `Rollback` on one pool MUST serialize in this process.
 - Serialization MUST be per pool: migrations on another pool MUST NOT wait.
 - A done context MUST fail the wait instead of queueing.
 - A done context MUST fail even when the turn is free.
 - Operators MUST open one `Pool` per database; two pools MUST NOT migrate one database.
- If an applied name is not the step name at the same index, `Apply` MUST fail.
- That failure MUST change no schema.
- If an applied name is outside the given steps, `Apply` MUST fail.
- A second `Apply` of the same steps MUST succeed and MUST not write a second bookkeeping row.
- Each step MUST run its `up` text and its bookkeeping insert in one transaction.
- `Apply` MUST use the dialect of `p` for each placeholder.
- On SQLite and MySQL, `Apply` MUST use `?` for each placeholder.
- On PostgreSQL, `Apply` MUST use `$1`, `$2` and so on.
- On SQL Server, `Apply` MUST use `@p1`, `@p2` and so on.

- A release callback MUST free the turn only once.

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
- The fingerprint MUST sort the rows and MUST compare them as one string.

### Faults

- Pairing failures MUST map to `migrate.missing_down` with the file in the cause.
- Applied-step divergences MUST map to `migrate.order_mismatch`.
- A bad fingerprint match MUST map to `migrate.not_reversible`.
- A non-empty scratch database MUST map to `migrate.scratch_not_empty`.
- A failed write on MySQL MUST map to `migrate.partial_ddl`.
- Connection failures MUST map to `migrate.unavailable`.
- Steps MUST pass database faults through with the step name.

### Code table

| Code | Kind | Message |
| --- | --- | --- |
| `migrate.missing_down` | internal | "A migration is missing its down file." |
| `migrate.order_mismatch` | internal | "The applied migrations do not match the given steps." |
| `migrate.not_reversible` | internal | "A migration does not restore the schema." |
| `migrate.scratch_not_empty` | internal | "The scratch database is not empty." |
| `migrate.partial_ddl` | internal | "A migration failed and may have left its schema changes." |
| `migrate.unavailable` | unavailable | "The migration store is unavailable." |

## Errors

- Unmatched pair files MUST map to `migrate.missing_down` with the file in the cause.
- Applied-step divergences MUST map to `migrate.order_mismatch` with the names in the cause.
- A down file that does not restore the schema MUST map to `migrate.not_reversible`.
- A non-empty scratch database MUST map to `migrate.scratch_not_empty`.
- A failed MySQL write MUST map to `migrate.partial_ddl` with the step in the cause.
- Connection failures MUST map to `migrate.unavailable` with the cause.
- Steps MUST pass database faults through with the step name.
- Public views MUST NOT carry file names, step names or SQL text.

## Proof

- `TestLoadOrdersByName` proves name order and the step name.
- `TestLoadRefusesDownWithoutUp` and `TestLoadRefusesUpWithoutDown` prove the two missing-file errors.
- `TestApplyAppliesInOrderAndIsIdempotent` proves apply order and a second apply that writes nothing.
- `TestApplyRefusesReorderedSteps` proves that a reordered list fails and leaves the schema unchanged. The oracle is a direct schema fingerprint.
- `TestApplyFailingStepLeavesNothing` proves that a failed `up` leaves no user table and returns `db.statement_failed`.
- `TestApplyPartialPrefixLeavesSchema` proves that a later apply runs only the remaining steps.
- `TestRollbackOneAndAll` proves one rollback and a full rollback, and the refusal of a large count.
- `TestCheckReversiblePasses` proves that a correct pair leaves no table. The oracle is a direct fingerprint.
- `TestCheckReversibleFailsOnLeftoverColumn` proves the mismatch error.
- `TestCheckReversibleRefusesNonEmpty` proves the empty-database rule.
- `TestLoadRefusesUpWithoutDown` proves missing pair files return `migrate.missing_down`.
- `TestApplyRefusesReorderedSteps` proves reordered steps return `migrate.order_mismatch`.
- `TestCheckReversibleFailsOnLeftoverColumn` proves a bad pair returns `migrate.not_reversible`.
- `TestCheckReversibleRefusesNonEmpty` proves a dirty scratch database returns `migrate.scratch_not_empty`.
- `TestFaultUnavailable` proves store failures return `migrate.unavailable`.
- `TestEnginePartialDDLMySQL` proves a bad MySQL `up` returns `migrate.partial_ddl`.
- `TestEngineCheckReversiblePostgres` proves `CheckReversible` passes a correct pair and fails a pair whose down leaves a column on PostgreSQL, failing without `SPIRA_TEST_POSTGRES_DSN`.
- `TestEngineCheckReversibleMySQL` proves `CheckReversible` passes a correct pair and fails a pair whose down leaves a column on MySQL, failing without `SPIRA_TEST_MYSQL_DSN`.
- `TestEngineCheckReversibleMSSQL` proves `CheckReversible` passes a correct pair and fails a pair whose down leaves a column on SQL Server, failing without `SPIRA_TEST_MSSQL_DSN`.
- `TestFaultsMatchSpecTable` proves `Faults()` matches the code table without duplicates.
 - `TestReleaseFreesTheTurnOnlyOnce` proves a repeated release keeps the next turn held.
 - `TestMigrationTurnRejectsEndedContextOnFreePool` proves a cancelled context fails on a free pool.
 - `TestRollbackZeroSkipsTheTurn` proves `Rollback` with `count` 0 skips the turn on a cancelled context.
 - `TestQueuedApplyHonorsContext` proves a queued `Apply` fails on its context deadline and changes nothing.
- `TestFaultPublicHidesSecretsAndHostile` proves public views hide secrets and hostile text.

## Not in scope

- The package does not generate SQL. The `up` and `down` text is the source of truth.
- The package does not repair a MySQL schema after a failed `up`. MySQL does not roll back DDL.
