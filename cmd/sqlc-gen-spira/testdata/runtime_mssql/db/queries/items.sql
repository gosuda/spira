-- name: GetItem :one
SELECT id, note, name, version
FROM spira_sqlc_runtime_mssql_items
WHERE id = @p1;

-- name: ListItems :many
SELECT id, note, name, version
FROM spira_sqlc_runtime_mssql_items
WHERE version >= @p1 AND id <= @p2
ORDER BY id;

-- name: UpdateItem :execrows
UPDATE spira_sqlc_runtime_mssql_items
SET name = @p1, version = version + 1
WHERE id = @p2 AND version = @p3;
