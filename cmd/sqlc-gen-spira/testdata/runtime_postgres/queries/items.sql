-- name: GetItem :one
SELECT id, shelf, title, revision FROM items WHERE id = $1;

-- name: ListItems :many
SELECT id
FROM items
WHERE shelf = sqlc.arg('shelf')
  AND id = ANY(sqlc.slice('ids'))
  AND revision = sqlc.arg('revision')
ORDER BY id;

-- name: AddItem :exec
INSERT INTO items (id, shelf, title, revision)
VALUES (sqlc.arg('id'), sqlc.arg('shelf'), sqlc.arg('title'), sqlc.arg('revision'));

-- name: RenameItem :execrows
UPDATE items SET title = sqlc.arg('title'), revision = revision + 1
WHERE id = sqlc.arg('id') AND revision = sqlc.arg('expected_revision');
