-- name: ListOrdersForUser :many
SELECT id, user_id, status, total, version, created_at
FROM orders
WHERE user_id = ?
ORDER BY id DESC;

-- name: GetOrder :one
SELECT id, user_id, status, total, version, created_at
FROM orders
WHERE id = ?;

-- name: ListOrderLines :many
SELECT order_lines.id, order_lines.order_id, order_lines.product_id,
       order_lines.quantity, order_lines.unit_price, products.name AS product_name
FROM order_lines
JOIN products ON products.id = order_lines.product_id
WHERE order_lines.order_id = ?
ORDER BY order_lines.id;
