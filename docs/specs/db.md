# db

Package `db` is the run-time path for SQL. The application author opens one pool and scans each row into a struct.

## Interface

```lgo
type Querier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows?, error)
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

type SQLite struct{}
type Postgres struct{}
type MySQL struct{}
type MSSQL struct{}

type Dialect interface {
	SQLite | Postgres | MySQL | MSSQL
}

func DialectOf(driver string, dsn string) (Dialect, error)
func Open(driver string, dsn string) (*Pool?, error)

type Pool struct {
	// unexported fields
}

func (p *Pool) Dialect() Dialect
func (p *Pool) Prepared() int
func (p *Pool) Prepare(ctx context.Context, query string) error
func (p *Pool) Start(ctx context.Context) error
func (p *Pool) Stop(ctx context.Context) error
func (p *Pool) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows?, error)
func (p *Pool) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)

type Tx struct {
	// unexported fields
}

func (t *Tx) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows?, error)
func (t *Tx) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)

func InTx[T any](ctx context.Context, p *Pool, work func(tx *Tx) (T, error)) (T, error)
func Exec(ctx context.Context, q Querier, query string, args ...any) (sql.Result, error)
func In(query string, name string, count int) string

type ScanPlan struct {
	Type  string
	Names []string
	Paths []string
	Count int
}

func Query[T any](ctx context.Context, q Querier, query string, args ...any) ([]T, error)
func One[T any](ctx context.Context, q Querier, query string, args ...any) (found T?, err error)
func PlanFields[T any](prefix string, plan *ScanPlan) error
func PlanField[F any](path string, name string, tag string, plan *ScanPlan) error
func PlanLeaf(path string, name string, tag string, plan *ScanPlan)
func ScanRow[T any](row *(T), rows *sql.Rows, plan ScanPlan) error
func ScanFields[T any](row *(T), prefix string, dests *[]any) error
func ScanField[F any](dst *(F), path string, dests *[]any) error
func AppendNamed[F any](dst *(F), path string, dests *[]any)
func ScanPlain(dst any, path string, dests *[]any) bool
func ScanOption(dst any, path string, dests *[]any) bool
func CheckScan(cols []string, plan ScanPlan) error
func TypeName[T any]() string
func SnakeName(name string) string

type NotNullDest[V any] struct {
	// unexported fields
}

func (d *NotNullDest[V]) Scan(src any) error

type OptionDest[V any] struct {
	// unexported fields
}

func (d *OptionDest[V]) Scan(src any) error

func Faults() []*fault.Error
func ClassifyDriverError(d Dialect, cause error) error
```

## Requirements

### Driver and pool

- `DialectOf` MUST return `SQLite` for the driver name `sqlite`.
- `DialectOf` MUST return `Postgres` for the driver name `pgx`.
- `DialectOf` MUST return `Postgres` for the driver name `postgres`.
- If the driver name is `mysql`, `DialectOf` MUST read `parseTime` from the query part of the DSN only.
- The query part MUST be the text after the first `?` that follows the last `/`.
- If `parseTime` there is `true`, `1`, `t` or `T`, `DialectOf` MUST return `MySQL`. `true` matches in any letter case.
- `DialectOf` MUST return `MSSQL` for the driver name `sqlserver`.
- `Open` MUST record the dialect that `DialectOf` returns for that driver and DSN.
- `Pool` MUST implement [app.Part](app.md).
- `Start` MUST ping the database.
- `Stop` MUST close each prepared statement before it closes the database handle.
- `Stop` MUST return when its context ends, even if a statement still runs.
- After such a return, the close MUST continue and finish when the statement ends.
- The package MUST NOT import a database driver.

### Transactions

- `InTx` MUST pass the transaction to `work` as the `tx` argument.
- `InTx` MUST commit when `work` returns a nil error.
- `InTx` MUST call `Rollback` when `work` returns an error.
- `InTx` MUST call `Rollback` when `work` panics.
- `InTx` MUST let that panic continue after `Rollback`.
- `InTx` MUST return the error from `work` without a wrap.
- If commit fails, `InTx` MUST return the zero value of `T`.

### Statements

- The pool MUST keep at most 256 prepared statements.
- When the cache is full, the pool MUST evict the statement whose last use is oldest.
- A statement that a caller still holds MUST stay usable after eviction, until release.
- Text that `In` returns MUST NOT enter the cache.
- `QueryContext` and `ExecContext` MUST run text that starts with `/*db:nocache*/` on the handle without caching it.
- `Tx` MUST run a cached statement with `StmtContext` on the transaction.
- `Tx` MUST run an uncached statement on the transaction itself.
- `Prepare` MUST prepare the given text.
- `Prepare` MUST check the text against the engine also when the cache holds that text.
- `Prepare` MUST release that statement before it returns.
- `Prepare` MUST NOT keep text that starts with `/*db:nocache*/`.
- `Prepared` MUST return the number of statements in the cache.
- `Exec` MUST call `ExecContext` on the same querier.
- `QueryContext` MUST wrap a driver error once.
- `ExecContext` MUST wrap a driver error once.

### Slice marker

- `In` MUST replace only the first marker `/*SLICE:<name>*/?`.
- `In` MUST leave a later marker unchanged.
- If `count` is greater than 0, `In` MUST replace the marker with `count` copies of `?`, joined by commas.
- If `count` is 0 or less, `In` MUST replace the marker with `NULL`.
- `In` MUST start the result with `/*db:nocache*/`.

### Scan

- `Query` and `One` MUST read struct fields in declaration order.
- A nested struct MUST expand to its fields, in declaration order, at that position.
- A `time.Time` field MUST take one column. It MUST NOT expand to its fields.
- A `T` that is not a struct MUST take one column.
- The expected column name MUST be the `col` tag when that tag is not empty.
- If the `col` tag is empty, the expected name MUST be `SnakeName` of the field name.
- `SnakeName` MUST write every letter in lower case.
- `SnakeName` MUST insert `_` before an uppercase letter that follows a non-uppercase character.
- `SnakeName` MUST insert `_` before an uppercase letter when the next character is lowercase.
- `Query` and `One` MUST compare columns before they read a row.
- A query that returns no rows MUST still report a column mismatch.
- `Query` MUST return an empty slice when the query returns no row.
- `One` MUST return an absent value when the query returns no row.
- `One` MUST reject a second row.
- An option field MUST become absent when the column is NULL.
- An option field MUST hold the column value when the column is not NULL.
- An option field MUST read the same value at any position among plain fields.
- A NULL in a field that is not an option MUST be an error.
- `Query` MUST report an unsupported field type before it reads a row.
- `ScanField` MUST accept `time.Time`, `[]byte`, `string` and `bool`.
- `ScanField` MUST accept `int`, `int8`, `int16`, `int32` and `int64`.
- `ScanField` MUST accept `float32` and `float64`.
- `ScanField` MUST accept a named type whose underlying type is `bool`, `int`, `int8`, `int16`, `int32`, `int64`, `float32`, `float64` or `string`.
- `ScanField` MUST accept `time.Time?`, `string?`, `bool?`, `int16?`, `int32?` and `int64?`.
- `ScanField` MUST accept `float32?` and `float64?`.

### Constraint violations

- The pool MUST map unique and foreign-key failures to `db.constraint_violation`.
- SQLite MUST count a `Code()` low byte of 19.
- `Postgres` MUST count `SQLState()` `23505` and `23503`.
- `MSSQL` MUST count `SQLErrorNumber()` `2627`, `2601` and `547`.
- `MySQL` MUST count `1062`, `1451` and `1452`.
- The MySQL check MUST read only the fixed `Error <number>` prefix.
- The check MUST run only when the pool dialect is `MySQL`.
- The check MUST NOT inspect text after the prefix.
- The prefix MUST serve as the code because `MySQL` exposes no accessor.
- Scan errors without a dialect MUST use only the method checks.
- The pool MUST map other driver failures to `db.statement_failed`.
- Only connection failures MUST map to `db.unavailable`.
- `driver.ErrBadConn`, `sql.ErrConnDone` and transport errors MUST mean the connection failed.
- Context errors MUST pass through unclassified for callers to match.
- `sql.ErrNoRows` MUST pass through unchanged.
- `ClassifyDriverError` MUST return declared faults with the legacy cause text.
- Declared faults MUST pass through without another wrap.

### Code table

| Code | Kind | Message |
| --- | --- | --- |
| `db.unknown_driver` | internal | "The database driver is unknown." |
| `db.missing_parse_time` | internal | "The database configuration is invalid." |
| `db.shape_mismatch` | internal | "A database result does not match the expected type." |
| `db.null_in_non_optional` | internal | "A database value does not match the expected type." |
| `db.statement_failed` | internal | "The database statement failed." |
| `db.constraint_violation` | conflict | "The record conflicts with an existing record." |
| `db.unavailable` | unavailable | "The database is unavailable." |

## Errors
- Unknown drivers MUST map to `db.unknown_driver` with the name in the cause.
- A `mysql` DSN without `parseTime=true` MUST map to `db.missing_parse_time`.
- Column count and name mismatches MUST map to `db.shape_mismatch`.
- A NULL in a non-option field MUST map to `db.null_in_non_optional`.
- Unique and foreign-key failures MUST map to `db.constraint_violation`.
- Other driver failures MUST map to `db.statement_failed`, except connection failures.
- Connection failures MUST map to `db.unavailable`.
- `InTx` MUST return the work error without a wrap.
- Causes MUST keep the legacy `db: <operation>:` prefix text.
- Public views MUST NOT carry table names, column names or values.

## Proof

- `TestDialectOfMatchesEachDriverName` proves the four driver names.
- `TestOpenRejectsUnknownDriver` and `TestOpenRejectsMysqlWithoutParseTime` prove the two open refusals.
- `TestDialectOfRejectsParseTimeInThePassword` proves that `parseTime=true` outside the query part does not count.
- `TestStopReturnsByItsDeadlineWhileAStatementRuns` proves the bounded `Stop` and the close that finishes after it. A registered SQL function holds the statement open until the test releases it.
- `TestStopReturnsByItsDeadlineWhileAStatementRuns` proves the shutdown probe adds no statement to the cache.
- `TestInTxCommitsOnSuccess` proves that a nil error commits the insert.
- `TestInTxRollsBackOnError` and `TestInTxRollsBackWhenWorkFails` prove that an error undoes the insert and returns that error.
- `TestInTxRollsBackOnPanic` and `TestInTxRollsBackWhenWorkPanics` prove that a panic undoes the insert and continues.
- `TestInTxCommitFailureReturnsCommitErrorAlone` proves that a commit failure returns `db.constraint_violation` with the `db: commit` cause.
- `TestStatementCacheNeverExceedsCapacity` proves the limit of 256 statements.
- `TestInExpandsTheMarker` proves marker replacement, `NULL`, and a second marker left unchanged.
- `TestInRunsThroughThePoolUncached` and `TestPrepareOfMarkedTextStaysUncached` prove that `In` text does not enter the cache.
- `TestPrepareRejectsAMissingTable` proves the `db: prepare` wrap.
- `TestPrepareChecksCachedTextAgainstTheSchema` proves that `Prepare` asks the engine again for cached text.
- `TestPrepareFeedsLaterQueriesThroughTheCache` and `TestPrepareLeavesNoStatementHeld` prove prepare, reuse and release.
- `TestTxSeesUncommittedRowThroughCachedStatement` proves `StmtContext` on a cached statement.
- `TestTxRunsUnseenStatementsOnItsOwnConnection` and `TestTxRunsUncachedStatementsOnItsOwnConnection` prove an uncached statement on the transaction.
- `TestPreparedStatementSurvivesEvictionUnderConcurrentLoad`, `TestEvictedHeldStatementStaysUsableUntilRelease` and `TestOpenRowsSurviveStatementEviction` prove that a held statement stays usable after eviction.
- `TestQueryAndExecErrorsWrapOnce` proves that a driver error is wrapped once.
- `TestQueryRejectsWrongColumnOrder`, `TestQueryRejectsExtraColumn`, `TestQueryRejectsMissingColumn` and `TestQueryRejectsWrongNestedOrder` prove the column count and the column name. The oracle is the query text.
- `TestQueryRejectsMismatchedColumnsWithoutRows` and `TestOneRejectsMismatchedColumnsWithoutRows` prove the column check for a query with no rows.
- `TestQueryExpectsSnakeCaseWithoutTag` proves the snake-case name when the `col` tag is empty.
- `TestQueryFlattensNestedStructs` proves nested field order against a direct `rows.Scan`.
- `TestQueryScansScalarColumns` and `TestQueryScansEveryPlainKind` prove a one-column scan and each plain field type. The oracle is a direct `rows.Scan`.
- `TestQueryScansTimestampColumn` proves that a `time.Time` field scans a timestamp column. The oracle is a direct `rows.Scan`.
- `TestOneReturnsAbsentWithoutARow` and `TestOneReturnsTheOnlyRow` prove the absent result and the single row.
- `TestOneRejectsTwoRows` proves the second-row error.
- `TestQueryRoundTripsOptionFields` proves absent and present values for every option field type.
- `TestOneRoundTripsAnOptionField` proves `One` returns absent option fields for a NULL row.
- `TestQueryKeepsOptionPosition` proves an option field scans between plain fields.
- `TestQueryScansNamedStringBesideOption` proves a named string field scans beside an option field.
- `TestQueryScansNamedScalars` proves named fields scan like their types, with `NULL` to an option read as absent.
- `TestQueryRejectsNullInNamedScalar` proves `NULL` in a named plain field is an error.
- `TestQueryRejectsUnsupportedFieldBeforeRows` proves the unsupported-type error before a row is read.
- `TestQueryServesSixteenConcurrentReaders` proves concurrent reads on one pool.
- `TestEnginePostgres`, `TestEngineMySQL` and `TestEngineMSSQL` prove a round trip, a commit, a rollback and `Prepare` on each engine. `just engines` starts the three engines. Each test fails naming its DSN variable when it is empty; the file carries `//go:build engines`, so the plain run skips it.
- `TestFaultUnknownDriver` proves `db.Open` rejects an unknown driver with `db.unknown_driver`.
- `TestFaultMissingParseTime` proves `db.Open` rejects a `mysql` DSN without `parseTime=true`.
- `TestFaultShapeMismatch` proves a column mismatch returns `db.shape_mismatch`.
- `TestFaultNullInNonOptional` proves a NULL returns `db.null_in_non_optional`.
- `TestFaultConstraintViolation` proves a duplicate insert returns `db.constraint_violation`.
- `TestFaultStatementFailed` proves a missing table returns `db.statement_failed` and not `db.unavailable`.
- `TestFaultPrefixParserTable` proves the `MySQL` prefix parser accepts and rejects its table.
- `TestFaultConstraintDialectGate` proves the gate blocks other dialects and hostile text.
- `TestFaultsMatchSpecTable` proves `Faults()` matches the code table without duplicates.
- `TestFaultPublicHidesSecretsAndHostile` proves public views hide secrets and hostile text.
- `TestEnginePostgresConstraintViolation`, `TestEngineMySQLConstraintViolation` and `TestEngineMSSQLConstraintViolation` prove a duplicate insert returns `db.constraint_violation` on each engine.
- `TestFaultConnectionClass` proves connection failures return `db.unavailable` and context errors pass through.
- `TestEngineMySQLRefusedPort` proves a refused port returns `db.unavailable` without a DSN.

## Not in scope

- The package does not analyze SQL. [sqlc-gen-spira](sqlc-gen-spira.md) checks the text before run time.
- The package does not import a driver. The application imports the driver it opens.
- There is no ambient transaction. `InTx` passes the `Tx` value to `work`.
