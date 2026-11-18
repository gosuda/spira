CREATE TABLE orders (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    status     TEXT NOT NULL CHECK (status IN ('open', 'cancelled')),
    total      INTEGER NOT NULL CHECK (total >= 0),
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL
);
