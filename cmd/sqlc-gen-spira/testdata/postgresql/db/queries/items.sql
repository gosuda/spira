-- name: GetItem :one
SELECT id, note, name, created_at, version
FROM items
WHERE id = $1;

-- name: UpdateItem :exec
UPDATE items
SET name = $1, version = version + 1
WHERE id = $2 AND version = $3;
