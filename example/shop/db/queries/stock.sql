-- name: ListWatchedProductStock :many
SELECT id, name, stock, price
FROM products
WHERE id IN (sqlc.slice('ids'))
ORDER BY id;
