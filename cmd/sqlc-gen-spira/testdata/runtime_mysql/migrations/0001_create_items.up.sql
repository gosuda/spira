CREATE TABLE spira_mysql_runtime_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    note TEXT,
    name TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    version INT NOT NULL DEFAULT 1
);
