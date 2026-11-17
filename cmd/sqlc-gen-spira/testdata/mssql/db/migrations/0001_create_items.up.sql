CREATE TABLE items (
    id         BIGINT IDENTITY(1,1) PRIMARY KEY,
    note       NVARCHAR(MAX) NULL,
    name       NVARCHAR(255) NOT NULL,
    created_at DATETIME2 NOT NULL,
    version    INT NOT NULL DEFAULT 1
);
