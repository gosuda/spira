# cmd/sqlc-gen-spira

Status: implemented.

Package `sqlc-gen-spira` is a sqlc process plugin. It reads one `GenerateRequest` as JSON and writes LoGOs source files. The application author gets checked query functions and table types.

## Interface

The `sqlc.yaml` entry that the plugin expects has this shape:

```yaml
version: "2"
plugins:
  - name: spira
    process: { cmd: sqlc-gen-spira, format: json }
rules:
  - name: no-unbounded-write
    message: "UPDATE and DELETE need a WHERE clause"
    rule: 'query.sql.matches("(?is)^\\s*(update|delete)\\b") && !query.sql.matches("(?is)\\bwhere\\b")'
sql:
  - engine: sqlite
    schema: db/migrations
    queries: db/queries
    rules: [no-unbounded-write]
    codegen:
      - plugin: spira
        out: db/store
        options:
          package: store
          tables:
            orders: { type: Order, key: id, key_type: OrderID, version: version }
            order_lines: { type: OrderLine, key: id, key_type: OrderLineID }
          refs:
            order_lines.order_id: orders
          overrides: {}
```

The plugin reads one JSON object from standard input. The object has these fields:

```json
{
  "settings": { "engine": "sqlite" },
  "catalog": { "schemas": [{ "tables": [{ "rel": { "name": "orders" }, "columns": [] }] }] },
  "queries": [{ "text": "...", "name": "GetOrder", "cmd": ":one", "columns": [], "params": [], "filename": "orders.sql" }],
  "plugin_options": {}
}
```
The plugin writes one JSON object to standard output. The object has one field `files`. Each file has `name` and `contents`.

- sqlc starts the plugin with the full gRPC method path `/plugin.CodegenService/Generate` as its one argument. A bare `generate` argument also runs the plugin for manual use.
- `plugin_options` arrives as base64 JSON with the keys `package`, `tables`, `refs` and `overrides`. Unknown keys are an error.
- The output holds `models.sql.lgo` and one `<topic>.sql.lgo` file for each query file, where `<topic>` is the query file name without `.sql`.

## Requirements

### Engines and options

- The plugin MUST accept the engines `sqlite`, `postgresql`, `mysql` and `mssql`.
- The plugin MUST reject any other engine.
- One `sql` entry MUST have one engine.
- The plugin MUST read `package`, `tables`, `refs` and `overrides` from the plugin options.
- A `tables` entry MUST accept `type`, `key`, `key_type` and `version`.
- `refs` MUST map a column path to a table name.
- `overrides` MUST map a column type name to a LoGOs type from the scan list.
- An `overrides` type MUST win over the type map.
- The plugin MUST read `package` from the plugin options, or infer it from the output directory.
- When the output directory is empty or root, the package MUST be `models`.
- A package name of `_` MUST be an error.
- Any other package name MUST be a Go identifier.
- A Go identifier MUST follow `go/token.IsIdentifier`, which admits Unicode letters.
- The error for a bad package name MUST name the rejected value.

### Type map

- The plugin MUST lower-case `column.type.name` before it looks up the type.
- The plugin MUST read `length` and `unsigned` as separate column fields.
- The plugin MUST NOT expect a length suffix in `type.name`.
- A column with `not_null` false MUST become the option form of its mapped type.
- An array column MUST be an error that names the table and the column.
- An unmapped type MUST be an error that names the table and the column.
- The plugin MUST NOT guess a type.
- A column name with a backtick or a control character MUST be an error.
- The generated `col` tag MUST stay a raw string.
- On MySQL, an unsigned integer column MUST be an error unless `overrides` names a type.

Every engine:

- `text`, `varchar` and `char` MUST map to `string`.
- `numeric` and `decimal` MUST map to `string`.
- `datetime` and `date` MUST map to `time.Time`.

SQLite, PostgreSQL and MySQL:

- `timestamp` MUST map to `time.Time`.
- `boolean` and `bool` MUST map to `bool`.

PostgreSQL, MySQL and SQL Server:

- `bigint` MUST map to `int64`.
- `smallint` MUST map to `int16`.

PostgreSQL and MySQL:

- `double precision` MUST map to `float64`.
- `json` MUST map to `[]byte`.

SQLite:

- `integer` and `int` MUST map to `int64`.
- `real` MUST map to `float64`.
- `blob` MUST map to `[]byte`.

PostgreSQL:

- `int8` and `bigserial` MUST map to `int64`.
- `integer`, `int`, `int4` and `serial` MUST map to `int32`.
- `int2` MUST map to `int16`.
 - `uuid` MUST map to `string`.
 - `name` MUST map to `string`.
- `bpchar` MUST map to `string` because a fixed `CHAR(n)` arrives as `bpchar`.
 - `float8` MUST map to `float64`.
 - `real` and `float4` MUST map to `float32`.
- `bytea` and `jsonb` MUST map to `[]byte`.
- `timestamptz` MUST map to `time.Time`.

MySQL:

- `tinyint` with `length` 1 MUST map to `bool`.
 - `tinyint` with any other `length` MUST map to `int16`.
 - `mediumint`, `int` and `integer` MUST map to `int32`.
 - `float` MUST map to `float32`.
 - `double` MUST map to `float64`.
- `tinytext`, `mediumtext` and `longtext` MUST map to `string`.
- `binary`, `varbinary`, `tinyblob`, `blob`, `mediumblob` and `longblob` MUST map to `[]byte`.

SQL Server:

- `bit` MUST map to `bool`.
- `tinyint` MUST map to `int16`.
- `int` MUST map to `int32`.
- `real` MUST map to `float32`.
- `float` MUST map to `float64`.
- `nchar`, `nvarchar`, `ntext` and `uniqueidentifier` MUST map to `string`.
 - `datetime2`, `smalldatetime`, `datetimeoffset` and `time` MUST map to `time.Time`.
- `money` and `smallmoney` MUST map to `string`.
- `binary`, `varbinary` and `image` MUST map to `[]byte`.

### Models

- Every generated file MUST start with `// Code generated by sqlc-gen-spira. DO NOT EDIT.`
- The plugin MUST write `models.sql.lgo` and one `<topic>.sql.lgo` for each query file.
- `models.sql.lgo` MUST hold one struct for each catalog table.
- Each table struct MUST have a `col` tag for each column.
- The struct name MUST be `tables.<name>.type` when that option is set.
- If no `type` option is set, the struct name MUST be the Pascal-case table name.
- For each table with `key_type`, the plugin MUST emit `type <key_type> <underlying>`.
- The key column MUST use `<key_type>`.
- Each column that `refs` points at that table MUST use `<key_type>`.
- A nullable key column MUST use the underlying option type; an option of a named type cannot be dispatched.
- For each PostgreSQL enum, the plugin MUST emit a named string type, its constants, and `Valid() bool`.
- For each table with `key`, the plugin MUST emit `var <Type>Table = orm.Table[<Type>, <key_type>]` with `Name`, `Key` and `Version`.
- The plugin MUST emit `func PrepareAll(ctx context.Context, p *db.Pool) error`.
- `PrepareAll` MUST prepare every generated statement through one shared query table, looping in query order.
- `PrepareAll` MUST return the first failure as `PrepareAll: <name>: <cause>`, wrapping the engine error with `%w`.
- The wrapped error MUST satisfy `errors.Is` and `errors.As` to the `db` prepare error.
- Every emitted call MUST pass a query constant and bound arguments.
- Compiled query constants MUST preserve every SQL byte, including carriage returns.
- The plugin MUST NOT build SQL from values.

### Queries

- A `:one` query MUST return `(<Row>?, error)`.
- A `:many` query MUST return `([]<Row>, error)`.
- A `:exec` query MUST return `error`.
- A `:execrows` query MUST return `(int64, error)`.
- A `:execlastid` query MUST return `(int64, error)`.
- Up to two parameters MUST be positional and typed.
- Three or more parameters MUST become one `<Name>Args` struct.
- An `Args` field MUST carry the entity field name and its column type.
- A one-column result MUST return that column type.
- A result whose columns are one table's columns in order MUST return that table struct.
- Any other result MUST return a `<Name>Row` struct.
- `sqlc.embed` MUST become a nested field of the table struct.
- The nested field MUST use the embedded table struct name.
- A nullable key parameter MUST use the underlying option type.
- An embed column MUST resolve to the nested field without a type lookup.
- Function, constant, row and argument names MUST derive from the query name in Pascal-case.
- Two parameters with one name MUST differ by the parameter number suffix.
- An output column with no name MUST be the error `sqlc-gen-spira: <Name>: column <i> needs an alias`.
- A slice parameter without a marker MUST pass as one argument.
- On SQLite, sqlc numbers each bare `?` before it numbers a slice. A bare `?` MUST bind the next of those numbers, and a slice marker MUST NOT advance that count.

### Refusals

- A query that writes a versioned table without its version column MUST fail.
- The error MUST be `sqlc-gen-spira: <Name>: writes versioned table <table> without <version column>`.
- `:execresult`, `:copyfrom` and batch commands MUST be the error `sqlc-gen-spira: <Name>: command <cmd> is not supported`.
 - The plugin MUST refuse an `UPDATE` or `DELETE` that omits the version column name.
 - `UPDATE` and `DELETE` detection MUST ignore string literals and SQL comments.
 - A backslash MUST escape only in MySQL strings and PostgreSQL escape strings.
- PostgreSQL continuation segments MUST keep the first string segment's escape mode.
- PostgreSQL escape prefixes MUST begin outside an identifier.
- PostgreSQL dollar strings MUST end at their matching case-sensitive delimiter.
- Dollar delimiters MUST begin outside quoted or unquoted identifiers.
- Two queries with one name MUST be the error `sqlc-gen-spira: duplicate query "<Name>"`.
- A slice marker without a slice parameter MUST name the marker.

### Gate

- `just sql` MUST read the sqlc config path from its `config` parameter.
- `config` MUST default to `example/shop/sqlc.yaml`.
- `just sql` MUST fail with a message that names the path when the file does not exist.
- `just sql` MUST NOT create output when the file does not exist.
 - `just sql-check` MUST run the raw-query check first, then `sqlc vet`.
 - `just sql-check` MUST regenerate with `just sql` into a scratch directory last.
 - `just sql-check` MUST diff that scratch output against `db/store`.
- `just sql-check` MUST fail when generated `*.sql.lgo` files differ from the SQL.
- `just sql-check` MUST run `sqlc vet` on the same config.
- `just sql-check` MUST fail when `db.Query`, `db.One` or `db.Exec` appears outside the data packages.
- The raw-query check MUST skip generated `*.sql.lgo` files, `cmd/sqlc-gen-spira/gen.lgo`, and the packages `db`, `orm`, `migrate`, `ai/session` and `ai/rag`.
 - Outside the data packages, tests MUST use generated functions.

## Errors

- `sqlc-gen-spira: <Name>: command <cmd> is not supported` for `:execresult`, `:copyfrom` and batch commands.
- `sqlc-gen-spira: <Name>: column <i> needs an alias` for an output column with no name.
- `sqlc-gen-spira: <Name>: writes versioned table <table> without <version column>` for a versioned write that omits the version column.
- `sqlc-gen-spira: duplicate query "<Name>"` for two queries with one name.
- A slice marker without a slice parameter names the marker and the query.
- An unknown embed table MUST be the error naming the query and the table.
- An unmapped type and an array column each produce an error.
- A column name with a backtick or a control character produces an error that names the table or the query.
- An unsigned MySQL integer produces an error.
- Each error names the table and the column.
- Any engine other than `sqlite`, `postgresql`, `mysql` and `mssql` produces an error.

## Proof

- `TestPostgresContinuedEscapeStrings` checks continued escape strings, independent literals, and version words hidden in strings or comments.
- `TestPostgresTypedLiteralBoundaries` checks typed literals ending in `e` and genuine escape prefixes using native-validated fixtures.
- `TestPostgresDollarQuotedBoundaries` checks 14 native-validated dollar-string and identifier boundaries.
- `TestGeneratedQueryConstants` compiles eight full generated packages and checks their query values against runtime JSON.
- `TestSQLcPostgresLiteralPipeline` builds the plugin and runs the source-pinned `sqlc generate` on the same 40 inputs.
- Its 36 reachable inputs require 32 generated packages and four specific version refusals.
- The test compiles every generated package and compares its query constant with captured sqlc text at runtime.
- Four native-valid comment-continuation inputs require their observed upstream syntax errors and no generated source.

- Request-model tests build the model from captured fixtures.
- The model asserts entity types and fields, key types, query names, commands and row types.
- `TestEngineQueryModels` proves four fixtures give one `Items` entity and a `:one` `GetItem` over it.
- It also proves a three-parameter `UpdateItem` with one `UpdateItemArgs` struct.
- `TestSliceQuery` proves a `sqlc.slice` parameter becomes a `[]T` expanded with `db.In`, and a marker-less slice passes as one argument.
- `TestEmbedQuery` proves a `sqlc.embed` table becomes a nested field of the row struct.
- `TestSingleColumnEmbed` proves one embed column with no type becomes the same nested field.
 - Each negative case requires the named message.
 - The cases are an unmapped type, an array column, an unsigned integer, an unknown engine, and a versioned write.
 - The rest are an unsupported command, an unnamed column, a duplicate query name, and an orphan marker.
 - `TestVersionedWriteAcceptsBackslashEscapeBeforeVersion` proves a SQLite backslash escape keeps the version predicate visible.
 - The literal tests prove a read-only query with write words in string data generates, and that string data alone never satisfies the version check.
- The four request files under `cmd/sqlc-gen-spira/testdata/<engine>/request.json` record the engine and the column type names that sqlc reports.
- The `mssql` file has `settings.engine` equal to `mssql`.
- `TestSQLcSQLiteIntegration` builds the plugin with `logos build`, generates the store from `testdata/runtime_sqlite`, and runs the application with `logos run`.
- `sqlc generate` MUST reject a query that selects a column the migrations do not create.
- The application calls `store.PrepareAll` on an empty schema and requires the error to satisfy `errors.Is` to `db.ErrStatementFailed` and to name `GetItem`.
- The raw-query rule is proved on a scratch copy with a planted call and on the clean tree.
- The shop lane adds `sql-check` to `gate` after it publishes `example/shop/sqlc.yaml`.
 - `compareQueries` in `testdata/runtime_sqlite` proves the generated functions match direct `database/sql` calls for insert, rename, get, slice, delete and repeated binds.

## Not in scope

- The pinned sqlc rejects the four tested comment-continuation forms before invoking the plugin. Direct-generator coverage does not imply sqlc acceptance.

- The plugin does not support `:execresult`, `:copyfrom` or batch commands. No requirement names them.
- The plugin does not build a query builder. The `.sql` files are the source of truth.
- The plugin does not evaluate the `WHERE` rule. `sqlc vet` rejects an unbounded write before generation.
