CREATE TABLE spira_sqlc_runtime_mssql_items (
    id      BIGINT PRIMARY KEY,
    note    NVARCHAR(120) NULL,
    name    NVARCHAR(255) NOT NULL,
    version INT NOT NULL
);
