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
func ScanRow[T any](row *T, rows *sql.Rows, plan ScanPlan) error
func ScanFields[T any](row *T, prefix string, dests *[]any) error
func ScanField[F any](dst *F, path string, dests *[]any) error
func AppendPlain[F any](dst *F, path string, dests *[]any)
func AppendOption[F any](dst *F, path string, dests *[]any)
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
- `Tx` MUST run a cached statement with `StmtContext` on the transaction.
- `Tx` MUST run an uncached statement on the transaction itself.
- `Prepare` MUST prepare the given text.
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
- A NULL in a field that is not an option MUST be an error.
- `Query` MUST report an unsupported field type before it reads a row.
- `AppendPlain` MUST accept `time.Time`, `[]byte`, `string` and `bool`.
- `AppendPlain` MUST accept `int`, `int8`, `int16`, `int32` and `int64`.
- `AppendPlain` MUST accept `float32` and `float64`.
- `AppendPlain` MUST accept a named type whose underlying type is `string`.
- `AppendOption` MUST accept `time.Time?`, `string?`, `bool?`, `int16?`, `int32?` and `int64?`.
- `AppendOption` MUST accept `float32?` and `float64?`.
- The pool MUST serve concurrent `Query` calls.

## Errors

- `db: unknown driver "<name>"` when the driver name is not one of the four names above.
- `db: mysql DSN needs parseTime=true` when the query part of a `mysql` DSN does not turn `parseTime` on.
- `db: stop: <cause>` when the context of `Stop` ends before the close finishes. `<cause>` is the context error.
- `db: open <driver>: <cause>` when `sql.Open` fails.
- `db: ping: <cause>` when `Start` cannot ping.
- `db: close: <cause>` when the handle close fails. The cause joins the statement close error and the handle error.
- If the handle close succeeds, `Stop` returns the statement close error, or nil.
- `db: begin: <cause>` when the transaction does not start.
- `db: commit: <cause>` when commit fails.
- `db: prepare: <cause>` when prepare fails. The cause is the engine error.
- `db: prepare close: <cause>` when a direct prepare cannot close its statement.
- `db: prepared statement missing` when the cache returns no statement.
- `db: prepared statement cache full` when the cache cannot store one more held statement.
- `db: query: <cause>` when a query fails.
- `db: exec: <cause>` when exec fails.
- `db: query returned no rows` when a prepared statement returns no row handle.
- `db: query returned no rows handle` when `Query` or `One` gets no row handle.
- `db: <Type> has <n> fields, query returned <m> columns` when the column count differs. The word `columns` stays plural for every count, including 1. `<Type>` is the `%T` text of `T`.
- `db: column <i> is "<name>", field <path> expects "<col>"` when a column name differs. The index starts at 0. `<path>` is the `%T` text, a dot, and each field name.
- `db: NULL in non-optional <path>` when a field that is not an option receives NULL.
- `db: <path>: unsupported type` for a field type that the scan does not accept.
- `db: <Type>: query returned more than one row` when `One` sees a second row.
- `db: scan <Type>: <cause>` when row iteration fails.

## Proof

- `TestDialectOfMatchesEachDriverName` proves the four driver names.
- `TestOpenRejectsUnknownDriver` and `TestOpenRejectsMysqlWithoutParseTime` prove the two open refusals.
- `TestDialectOfRejectsParseTimeInThePassword` proves that `parseTime=true` outside the query part does not count.
- `TestStopReturnsByItsDeadlineWhileAStatementRuns` proves the bounded `Stop` and the close that finishes after it. A registered SQL function holds the statement open until the test releases it.
- `TestInTxCommitsOnSuccess` proves that a nil error commits the insert.
- `TestInTxRollsBackOnError` and `TestInTxRollsBackWhenWorkFails` prove that an error undoes the insert and returns that error.
- `TestInTxRollsBackOnPanic` and `TestInTxRollsBackWhenWorkPanics` prove that a panic undoes the insert and continues.
- `TestInTxCommitFailureReturnsCommitErrorAlone` proves that a commit failure returns only `db: commit`.
- `TestStatementCacheNeverExceedsCapacity` proves the limit of 256 statements.
- `TestInExpandsTheMarker` proves marker replacement, `NULL`, and a second marker left unchanged.
- `TestInRunsThroughThePoolUncached` and `TestPrepareOfMarkedTextStaysUncached` prove that `In` text does not enter the cache.
- `TestPrepareRejectsAMissingTable` proves the `db: prepare` wrap.
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
- `TestQueryRejectsNullInNonOptional` proves the NULL error for a field that is not an option.
- No test proves the option field rules. A row type with an option field does not build with LoGOs `144fcceb02`.
- `TestQueryRejectsUnsupportedFieldBeforeRows` proves the unsupported-type error before a row is read.
- `TestQueryServesSixteenConcurrentReaders` proves concurrent reads on one pool.
- `TestEnginePostgres`, `TestEngineMySQL` and `TestEngineMSSQL` prove a round trip, a commit, a rollback and `Prepare` on each engine. `just engines` starts the three engines. Each test skips when its DSN variable is not set.

## Not in scope

- The package does not analyze SQL. [sqlc-gen-spira](sqlc-gen-spira.md) checks the text before run time.
- The package does not import a driver. The application imports the driver it opens.
- There is no ambient transaction. `InTx` passes the `Tx` value to `work`.
