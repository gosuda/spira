# example/shop

The shop is the sample application. Package `shopdb` holds its schema. The application author gets one router that exercises the server packages, plus the migration pairs and the checked queries.

## Interface

```text
    DB *db.Pool
    Jobs *job.Scheduler
    Web *web.Server
    Registry *admin.Server
    Admin *admin.Client
    app.Run

example/shop/catalog/
    GET /catalog
    detail page
    search fragment
    GET /api/products
    view.Later recommendations
    islands/gallery.react.tsx
    islands/filter.solid.tsx

example/shop/cart/
    POST /cart/items
    islands/badge.svelte

example/shop/orders/
    POST /orders
    POST /orders/{id}/cancel

example/shop/account/
    GET /account
    POST /account/login
    logout
    page behind auth.Require(auth.Authenticated())

example/shop/stock/
    GET /stock/events

example/edge/main.lgo
    gateway in front of the shop
    forwards /shop/catalog
```

```lgo
func FS() fs.FS
```

## Requirements

### Application

- `main` MUST be ordinary statements that end in `app.Run`.
- The application struct MUST hold `DB *db.Pool`.
- The application struct MUST hold `Jobs *job.Scheduler`.
- The application struct MUST hold `Web *web.Server`.
- The application struct MUST hold `Registry *admin.Server`.
- The application struct MUST hold `Admin *admin.Client`.
- Feature fields that are parts MUST be non-nil pointers, as the [module conventions](../../AGENTS.md) state.
- The sample MUST apply the steps from `shopdb.FS` at start.
- That database MUST be SQLite.
- A read MUST call a generated function in `db/store`.
- With JavaScript off, each htmx control MUST work as a link or a form post.
- Each island MUST have a server-rendered fallback.
- The shop MUST register through its loopback listener.
- A non-loopback public URL MUST NOT stop startup.

### Catalog

- `GET /catalog` MUST be the product list page.
- `GET /catalog` MUST start with `<!doctype html>`.
- A catalog request with `HX-Request: true` MUST return the body fragment.
- That fragment MUST NOT contain `<html`.
- Both of those responses MUST include `HX-Request` in `Vary`.
- The catalog feature MUST offer a detail page.
- The catalog feature MUST offer a search control that swaps a fragment.
- `GET /api/products` MUST be a data reply from [web](web.md).
- The catalog MUST render recommendations with `view.Later` from [view](view.md).
- That slot MUST show its fallback before its content.
- That content MUST appear without a page reload.
- The catalog page MUST contain a `spira-island` element.
- That element MUST have entry `example/shop/catalog/islands/gallery.react.tsx`.
- The catalog MUST include island `filter.solid.tsx`.
- A product name `<script>alert(1)</script>` MUST appear in the catalog page as `&lt;script&gt;`.

### Cart

- `POST /cart/items` MUST bind the posted form.
- The cart handler MUST run `Check` on that value.
- `POST /cart/items` with `quantity=-1` MUST return 422.
- That response MUST be a fragment that holds the field message.
- The cart MUST include island `badge.svelte`.

### Orders

- `POST /orders` MUST create the order and its lines inside `orm.InSession`.
- `POST /orders/{id}/cancel` MUST load the order with `orm.Get`.
- When `Flush` returns `*orm.StaleError`, cancel MUST answer 409 through `web.Fail`.
- Two parallel cancels of one order MUST yield one 200 and one 409.
- The 409 response MUST use content type `application/problem+json`.

### Account

- `GET /account` without a session MUST return 401.
- The account page MUST sit behind `auth.Require(auth.Authenticated())`.
- `POST /account/login` MUST accept form fields `user` and `password`.
- A successful login MUST set cookie `__Host-spira`.
- That cookie MUST include `Secure`, `HttpOnly` and `SameSite=Lax`.
- `GET /account` with that cookie MUST return 200.
- The account feature MUST provide logout.

### Stock and operations

- A scheduler entry from [job](job.md) MUST publish stock on a topic from [bus](bus.md).
- `GET /stock/events` MUST be an event stream from [live](live.md).
- That stream MUST write `event:` lines and `data:` lines.
- Those lines MUST follow the interval of the stock job.
- The router MUST use `meter.HTTP` from [meter](meter.md).
- The sample MUST mount [ops](ops.md), [openapi](openapi.md) and [admin](admin.md).
- `GET /ops/metrics` without credentials MUST return 401.
- With credentials, that body MUST list `http_request_duration_seconds`.
- After a catalog request, that series MUST have label `route="GET /catalog"`.
- `GET /openapi.json` MUST contain `"openapi":"3.1.0"`.
- That document MUST contain path `/api/products`.
- `GET /admin` MUST list the shop instance as up.
- A failed database check MUST show that instance as down.
- That row MUST change without a page reload.
- `example/edge` MUST forward `/shop/catalog` to the shop.

### Admin

- `POST /admin/instances` with a shopper session MUST return 403.
- `POST /admin/instances` without credentials MUST return 401.
- `POST /admin/instances` with the service token MUST return 201.
- `GET /admin` with a shopper session MUST return 200.

### Schema

- `FS` MUST return the embedded migration directory.
- `Load` of that directory MUST return six steps, in this order: `0001_create_products`, `0002_create_users`, `0003_create_sessions`, `0004_create_cart_items`, `0005_create_orders` and `0006_create_order_lines`.
- Each step MUST have non-empty up text and non-empty down text.
- Each down script MUST drop the table that its up script creates.
- The up scripts MUST match the text below.

```sql
CREATE TABLE products (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    price      INTEGER NOT NULL CHECK (price >= 0),
    stock      INTEGER NOT NULL CHECK (stock >= 0),
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE sessions (
    id_hash    TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    roles      TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE cart_items (
    id         INTEGER PRIMARY KEY,
    owner_kind TEXT NOT NULL CHECK (owner_kind IN ('session', 'user')),
    owner_key  TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products (id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (owner_kind, owner_key, product_id)
);

CREATE TABLE orders (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    status     TEXT NOT NULL CHECK (status IN ('open', 'cancelled')),
    total      INTEGER NOT NULL CHECK (total >= 0),
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE order_lines (
    id         INTEGER PRIMARY KEY,
    order_id   INTEGER NOT NULL REFERENCES orders (id),
    product_id INTEGER NOT NULL REFERENCES products (id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0)
);
```

- `sessions.user_id` MUST reference `users.id`.
- `cart_items.product_id` MUST reference `products.id`.
- `orders.user_id` MUST reference `users.id`.
- `order_lines.order_id` MUST reference `orders.id`.
- `order_lines.product_id` MUST reference `products.id`.
- `cart_items.quantity` MUST be greater than 0.
- `orders.status` MUST be `open` or `cancelled`.
- `orders.version` MUST default to 1.
- A second `Apply` of these steps MUST NOT change the table set.
- `CheckReversible` on these steps MUST pass.
- The query files MUST match the text below.

```sql
-- name: GetUserByName :one
SELECT id, name, password_hash
FROM users
WHERE name = ?;

-- name: CreateUser :execlastid
INSERT INTO users (name, password_hash)
VALUES (?, ?);

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

-- name: ListProducts :many
SELECT id, name, price, stock, created_at
FROM products
ORDER BY id;

-- name: SearchProducts :many
SELECT id, name, price, stock, created_at
FROM products
WHERE name LIKE ?
ORDER BY id;

-- name: GetProduct :one
SELECT id, name, price, stock, created_at
FROM products
WHERE id = ?;

-- name: ListRecommendedProducts :many
SELECT id, name, price, stock, created_at
FROM products
WHERE stock > 0 AND id <> ?
ORDER BY created_at DESC, id DESC
LIMIT 3;

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

-- name: GetSession :one
SELECT id_hash, user_id, roles, expires_at
FROM sessions
WHERE id_hash = ? AND expires_at > ?;

-- name: SaveSession :exec
INSERT INTO sessions (id_hash, user_id, roles, expires_at)
VALUES (?, ?, ?, ?);

-- name: DeleteSession :exec
DELETE FROM sessions
WHERE id_hash = ?;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions
WHERE expires_at <= ?;

-- name: ListWatchedProductStock :many
SELECT id, name, stock, price
FROM products
WHERE id IN (sqlc.slice('ids'))
ORDER BY id;
```

- Each annotated query MUST prepare on the migrated schema.

## Errors

- Panic `shopdb: embedded migrations: <cause>` when the embedded migration directory cannot be opened.

## Proof

- `TestLoadReturnsStepsInOrder` proves the six step names, their order and that both sides are non-empty.
- `TestApplyAppliesAndReapplies` proves that a second `Apply` leaves the table set unchanged.
- `TestCheckReversiblePasses` proves that each down script restores the schema. The oracle is `migrate.CheckReversible`.
- `TestQueryStatementsPrepare` proves that each annotated query prepares after `Apply`. The oracle is `database/sql` `PrepareContext` on the same SQLite file.
- `TestForeignKeysEnforced` proves all five references: `sessions.user_id`, `cart_items.product_id`, `orders.user_id`, `order_lines.order_id` and `order_lines.product_id`.
- `TestCheckConstraintsReject` proves that cart quantity 0 is rejected and that order status `lost` is rejected.
- The plan names end-to-end tests through `httptest` and an in-memory database for the routes above.
- The plan also names `store.PrepareAll` for the generated package.

## Not in scope

- Package `shopdb` does not emit query functions. [sqlc-gen-spira](sqlc-gen-spira.md) emits them into `db/store`.
