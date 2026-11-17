CREATE TABLE items (
    id         INTEGER PRIMARY KEY,
    note       TEXT,
    name       TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1
);
