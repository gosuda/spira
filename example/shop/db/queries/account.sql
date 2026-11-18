-- name: GetUserByName :one
SELECT id, name, password_hash
FROM users
WHERE name = ?;

-- name: CreateUser :execlastid
INSERT INTO users (name, password_hash)
VALUES (?, ?);
