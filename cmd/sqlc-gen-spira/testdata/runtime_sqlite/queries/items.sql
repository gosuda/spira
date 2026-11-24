-- name: GetItem :one
SELECT id, name FROM items WHERE id = ?;

-- name: ListItems :many
SELECT id, name FROM items ORDER BY id DESC;

-- name: InsertItem :execlastid
INSERT INTO items (name) VALUES (?);

-- name: RenameItem :execrows
UPDATE items SET name = ? WHERE id = ?;

-- name: DeleteItem :exec
DELETE FROM items WHERE id = ?;

-- name: FilterItems :many
SELECT id, name
FROM items
WHERE name <> sqlc.arg('omit_name')
  AND id IN (sqlc.slice('ids'))
  AND id > sqlc.arg('min_id')
ORDER BY id DESC;

-- name: FilterItemsWithRepeatedBind :many
SELECT id, name
FROM items
WHERE id >= sqlc.arg('anchor_id')
  AND (id IN (sqlc.slice('ids')) OR id = sqlc.arg('anchor_id'))
  AND name <> '?12' /* ?23 is not a bind */
  AND name <> sqlc.arg('omit_name')
ORDER BY id DESC;

-- name: FilterItemsAroundSlice :many
SELECT id, name
FROM items
WHERE id >= ?
  AND id IN (sqlc.slice('ids'))
  AND name <> ?
ORDER BY id DESC;
