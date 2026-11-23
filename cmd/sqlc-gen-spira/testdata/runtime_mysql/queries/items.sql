-- name: ReadItem :one
SELECT id, note, name, created_at, version
FROM spira_mysql_runtime_items
WHERE id = ?;

-- name: CreateItem :execlastid
INSERT INTO spira_mysql_runtime_items (name, created_at)
VALUES (?, ?);

-- name: ClearItemNote :exec
UPDATE spira_mysql_runtime_items
SET note = ''
WHERE id = ?;

-- name: ReviseItem :execrows
UPDATE spira_mysql_runtime_items
SET name = ?, version = version + 1
WHERE id = ? AND version = ?;

-- name: ListMatchingItems :many
SELECT id
FROM spira_mysql_runtime_items
WHERE name <> sqlc.arg(blocked_name)
  AND id IN (sqlc.slice(selected_ids))
  AND version >= sqlc.arg(min_version)
ORDER BY id;
