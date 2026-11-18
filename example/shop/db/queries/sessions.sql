-- name: GetSession :one
SELECT id_hash, user_id, roles, expires_at
FROM sessions
WHERE id_hash = ? AND expires_at > ?;

-- name: SaveSession :exec
INSERT INTO sessions (id_hash, user_id, roles, expires_at)
VALUES (?, ?, ?, ?);

-- name: DeleteSession :exec
DELETE FROM sessions
WHERE id_hash = ?;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions
WHERE expires_at <= ?;
