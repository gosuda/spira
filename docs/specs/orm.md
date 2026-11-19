# orm

Status: specified; the package is not in the tree yet.

Package `orm` tracks entity rows in one transaction. The application loads a row, changes fields, and calls `Flush`.

## Interface

```lgo
type Table[E any, K comparable] struct {
	Name    string
	Key     string
	Version string
}

type StaleError struct {
	Table string
	Key   string
}

func InSession[T any](ctx context.Context, p *db.Pool, work func(s *Session) (T, error)) (T, error)
func Get[E any, K comparable](ctx context.Context, s *Session, t Table[E, K], key K) (*E?, error)
func Attach[E any, K comparable](s *Session, t Table[E, K], rows []E) []*E
func Add[E any, K comparable](s *Session, t Table[E, K], e *E)
func Remove[E any, K comparable](s *Session, t Table[E, K], e *E)
func Touch[E any, K comparable](s *Session, t Table[E, K], e *E)
func (s *Session) Flush(ctx context.Context) error
func (s *Session) Tx() *db.Tx
```

## Requirements

### Session

- `InSession` MUST open one transaction on `p`.
- `InSession` MUST pass one `Session` to `work`.
- `InSession` MUST call `Flush` after `work` returns a nil error.
- `InSession` MUST commit when `Flush` succeeds.
- `InSession` MUST roll back when `work` or `Flush` returns an error.
- A session MUST be used by one goroutine.
- `Tx` MUST return the transaction that the session holds.
- A query MUST see the database plus the rows that `Flush` has written.

### Identity

- Inside one session, one key MUST map to one entity pointer.
- `Get` MUST return the held pointer when the session already holds that key.
- `Get` MUST select the row by key when the session does not hold that key.
- `Get` MUST return an absent pointer when no row has that key.
- `Attach` MUST return the held pointer for a key that the session already holds.
- `Attach` MUST return a tracked pointer for a row that the session does not hold.
- `Attach` MUST NOT overwrite a held entity with a row that has the same key.
- A second `Get` of one key MUST return the same pointer.

### Change detection

- The session MUST keep a copy of each entity as loaded.
- `Flush` MUST compare each field with that copy.
- `Flush` MUST write only the columns that changed.
- `Flush` MUST add one to the version column on each update of a versioned table.
- `Flush` MUST use the key and the loaded version in the `WHERE` clause of an update.
- If an update does not change exactly one row, `Flush` MUST return `*StaleError`.
- After a successful write, `Flush` MUST store the next version on the entity and on the copy.
- An unchanged entity MUST write nothing.
- `Touch` MUST force a version increment on the next `Flush`.
- A table with an empty `Version` MUST update and delete by key only.

### Writes

- `Add` MUST insert the entity at `Flush`.
- `Remove` MUST delete the entity at `Flush`.
- `Flush` MUST insert rows in `Add` order.
- `Flush` MUST update rows in load order.
- `Flush` MUST delete rows in `Remove` order.
- Nothing MUST flush implicitly.
- A zero key MUST be left out of an insert.
- `Flush` MUST read the generated key back into the entity after an insert.
- On SQLite and MySQL, `Flush` MUST use `LastInsertId` to read the key.
- On PostgreSQL, `Flush` MUST use `RETURNING <key>` to read the key.
- On SQL Server, `Flush` MUST use `OUTPUT INSERTED.<key>` to read the key.
- An added row MUST start at version 1.
- `Remove` on a versioned table MUST delete with the key and the loaded version.

### SQL text

- On SQLite and MySQL, `Flush` MUST use `?` for each placeholder.
- On PostgreSQL, `Flush` MUST use `$1`, `$2` and so on.
- On SQL Server, `Flush` MUST use `@p1`, `@p2` and so on.
- On SQLite and PostgreSQL, `Flush` MUST quote each identifier with double quotes.
- On MySQL, `Flush` MUST quote each identifier with backticks.
- On SQL Server, `Flush` MUST quote each identifier with square brackets.
- Identifiers MUST come only from the `Table` value and the `col` tags.
- Reads MUST use the generated query functions, except `Get`.

## Errors

- `*StaleError` carries `Table` and `Key` when a versioned write changes no row or more than one row.
- Each other error comes from [db](db.md) and keeps its text.

## Proof

- The model-based property test compares `Get`, change, add, remove, touch and flush against a plain map as the oracle.
- The two-session test loads one row in two sessions, flushes the first, and requires `*StaleError` from the second flush.
- `Get` twice returns the same pointer.
- `Attach` returns the held pointer for a known key.
- The engine-tagged test runs the two-session `*StaleError` case on PostgreSQL, MySQL and SQL Server.

## Not in scope

- The package has no lazy loading, proxies, relations or cascades. A child row is its own entity, loaded by a checked query and attached.
- The package has no detached merge, criteria language or callbacks. The caller changes fields and calls `Flush`.
- The package has no repository layer. Reads use the generated functions from [db/store](sqlc-gen-spira.md).
