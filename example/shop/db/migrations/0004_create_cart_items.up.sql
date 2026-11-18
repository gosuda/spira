CREATE TABLE cart_items (
    id         INTEGER PRIMARY KEY,
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('session', 'user')),
    owner_key  TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products (id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (owner_kind, owner_key, product_id)
);
