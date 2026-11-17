-- name: GetItem :one
SELECT id, note, name, created_at, version
FROM items
WHERE id = ?;

-- name: UpdateItem :exec
UPDATE items
SET name = ?, version = version + 1
WHERE id = ? AND version = ?;
