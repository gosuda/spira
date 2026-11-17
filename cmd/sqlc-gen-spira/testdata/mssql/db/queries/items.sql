-- name: GetItem :one
SELECT id, note, name, created_at, version
FROM items
WHERE id = @p1;

-- name: UpdateItem :exec
UPDATE items
SET name = @p1, version = version + 1
WHERE id = @p2 AND version = @p3;
