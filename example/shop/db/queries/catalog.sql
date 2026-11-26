-- name: ListProducts :many
SELECT id, name, price, stock, created_at
FROM products
ORDER BY id;

-- name: SearchProducts :many
SELECT id, name, price, stock, created_at
FROM products
WHERE name LIKE ? ESCAPE '\'
ORDER BY id;

-- name: GetProduct :one
SELECT id, name, price, stock, created_at
FROM products
WHERE id = ?;

-- name: ListRecommendedProducts :many
SELECT id, name, price, stock, created_at
FROM products
WHERE stock > 0 AND id <> ?
ORDER BY created_at DESC, id DESC
LIMIT 3;
