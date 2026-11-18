CREATE TABLE products (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    price      INTEGER NOT NULL CHECK (price >= 0),
    stock      INTEGER NOT NULL CHECK (stock >= 0),
    created_at TIMESTAMP NOT NULL
);
