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

### Type map

- The plugin MUST lower-case `column.type.name` before it looks up the type.
- The plugin MUST read `length` and `unsigned` as separate column fields.
- The plugin MUST NOT expect a length suffix in `type.name`.
- A column with `not_null` false MUST become the option form of its mapped type.
- An array column MUST be an error that names the table and the column.
- An unmapped type MUST be an error that names the table and the column.
- The plugin MUST NOT guess a type.
- A column name with a backtick or a control character MUST be an error, because the generated `col` tag is a raw string.
- On MySQL, an unsigned integer column MUST be an error unless `overrides` names a type.

All engines:

- `bigint` MUST map to `int64`.
- `smallint` MUST map to `int16`.
- `boolean` and `bool` MUST map to `bool`.
- `text`, `varchar` and `char` MUST map to `string`.
- `double precision` and `double` MUST map to `float64`.
- `json` MUST map to `[]byte`.
- `timestamp`, `datetime` and `date` MUST map to `time.Time`.
- `numeric` and `decimal` MUST map to `string`.

SQLite:

- `integer` and `int` MUST map to `int64`.
- `real` MUST map to `float64`.
- `blob` MUST map to `[]byte`.

PostgreSQL:

- `int8` and `bigserial` MUST map to `int64`.
- `integer`, `int`, `int4` and `serial` MUST map to `int32`.
- `int2` MUST map to `int16`.
- `uuid` MUST map to `string`.
- `bpchar` MUST map to `string` because a fixed `CHAR(n)` arrives as `bpchar`.
- `float8` MUST map to `float64`.
- `bytea` and `jsonb` MUST map to `[]byte`.
- `timestamptz` MUST map to `time.Time`.

MySQL:

- `tinyint` with `length` 1 MUST map to `bool`.
- `tinyint` with any other `length` MUST map to `int16`.
- `mediumint`, `int` and `integer` MUST map to `int32`.
- `float` MUST map to `float32`.
- `tinytext`, `mediumtext` and `longtext` MUST map to `string`.
- `binary`, `varbinary`, `tinyblob`, `blob`, `mediumblob` and `longblob` MUST map to `[]byte`.

SQL Server:

- `bit` MUST map to `bool`.
- `tinyint` MUST map to `int16`.
- `int` MUST map to `int32`.
- `real` MUST map to `float32`.
- `float` MUST map to `float64`.
- `nchar`, `nvarchar`, `ntext` and `uniqueidentifier` MUST map to `string`.
- `binary`, `varbinary` and `image` MUST map to `[]byte`.
- `datetime2`, `smalldatetime` and `datetimeoffset` MUST map to `time.Time`.
- `money` and `smallmoney` MUST map to `string`.

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
- `PrepareAll` MUST prepare every generated statement.
- `PrepareAll` MUST return the first failure with the query name.

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
- An output column with no name MUST be the error `<Name>: column <i> needs an alias`.
- Function, constant, row and argument names MUST derive from the query name in Pascal-case.
- Two parameters with one name MUST differ by the parameter number suffix.
- Each slice marker in the query text MUST pair with the slice parameter of that name.
- A slice parameter without a marker MUST pass as one argument.
- On SQLite, sqlc numbers each bare `?` before it numbers a slice. A bare `?` MUST bind the next of those numbers, and a slice marker MUST NOT advance that count.

### Refusals

- A query that writes a versioned table without its version column MUST fail.
- The error MUST be `<Name>: writes versioned table <table> without <version column>`.
- `:execresult`, `:copyfrom` and batch commands MUST be the error `<Name>: command <cmd> is not supported`.
- The plugin MUST refuse an `UPDATE` or `DELETE` that omits the version column name.
- Two queries with one name MUST be the error `duplicate query "<Name>"`.
- A slice marker without a slice parameter MUST name the marker.

## Errors

- `<Name>: command <cmd> is not supported` for `:execresult`, `:copyfrom` and batch commands.
- `<Name>: column <i> needs an alias` for an output column with no name.
- `<Name>: writes versioned table <table> without <version column>` for a versioned write that omits the version column.
- `duplicate query "<Name>"` for two queries with one name.
- A slice marker without a slice parameter names the marker and the query.
- An unknown embed table MUST be the error naming the query and the table.
- An unmapped type and an array column each produce an error.
- A column name with a backtick or a control character produces an error that names the table or the query.
- An unsigned MySQL integer produces an error.
- Each error names the table and the column.
- Any engine other than `sqlite`, `postgresql`, `mysql` and `mssql` produces an error.

## Proof

- Each test builds the request model from a captured fixture.
- The model asserts entity types and fields, key types, query names, commands and row types.
- `TestEngineQueryModels` proves four fixtures give one `Items` entity and a `:one` `GetItem` over it.
- It also proves a three-parameter `UpdateItem` with one `UpdateItemArgs` struct.
- `TestSliceQuery` proves a `sqlc.slice` parameter becomes a `[]T` expanded with `db.In`, and a marker-less slice passes as one argument.
- `TestEmbedQuery` proves a `sqlc.embed` table becomes a nested field of the row struct.
- `TestSingleColumnEmbed` proves one embed column with no type becomes the same nested field.
- Each negative case requires the named message.
- The cases are an unmapped type, an array column, an unsigned integer, an unknown engine, and a versioned write.
- The rest are an unsupported command, an unnamed column, a duplicate query name, and an orphan marker.
- `TestGenerateJSONRoundTrip` proves one request decodes from JSON and encodes to a two-file response.
- The four request files under `cmd/sqlc-gen-spira/testdata/<engine>/request.json` record the engine and the column type names that sqlc reports.
- The `mssql` file has `settings.engine` equal to `mssql`.
- The parent compiles the generated text and runs the end-to-end proof against `database/sql`: that proof is not in this package.

## Not in scope

- The plugin does not support `:execresult`, `:copyfrom` or batch commands. No requirement names them.
- The plugin does not build a query builder. The `.sql` files are the source of truth.
- The plugin does not evaluate the `WHERE` rule. `sqlc vet` rejects an unbounded write before generation.
