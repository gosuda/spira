CREATE TABLE items (
    id         BIGSERIAL PRIMARY KEY,
    note       TEXT,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1
);
