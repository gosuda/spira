-- name: UpsertCartItem :execrows
INSERT INTO cart_items (owner_kind, owner_key, product_id, quantity)
VALUES (?, ?, ?, ?)
ON CONFLICT (owner_kind, owner_key, product_id)
DO UPDATE SET quantity = cart_items.quantity + excluded.quantity;

-- name: ListCartItems :many
SELECT cart_items.id, sqlc.embed(products), cart_items.quantity
FROM cart_items
JOIN products ON products.id = cart_items.product_id
WHERE cart_items.owner_kind = ? AND cart_items.owner_key = ?
ORDER BY cart_items.id;

-- name: CountCartItems :one
SELECT COUNT(*) AS count
FROM cart_items
WHERE owner_kind = ? AND owner_key = ?;

-- name: RemoveCartItem :execrows
DELETE FROM cart_items
WHERE id = ? AND owner_kind = ? AND owner_key = ?;

-- name: ClearCart :execrows
DELETE FROM cart_items
WHERE owner_kind = ? AND owner_key = ?;
