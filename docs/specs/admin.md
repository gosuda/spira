# admin

Package `admin` lists registered instances and the status of each one. The application author mounts the console behind a guard and registers one instance. The registry and the registrator follow the split in Spring Boot Admin.

## Interface

```lgo
type Instance struct {
	Name   string `json:"name"`
	OpsURL string `json:"opsUrl"`
}

type Server struct {
	Interval     time.Duration = 10 * time.Second
	Now          (func() time.Time)?
	MaxInstances int = 100
	// unexported fields
}

func (s *Server) Mount(r *web.Router, guard web.Stage)
func (s *Server) Start(ctx context.Context) error
func (s *Server) Stop(ctx context.Context) error

type Client struct {
	Server string
	Self   Instance
}

func (c *Client) Start(ctx context.Context) error
func (c *Client) Stop(ctx context.Context) error
```

## Requirements

### Mount

- `Mount` MUST panic when `guard` is nil.
- `Mount` MUST run `guard` before each of the four routes.
- `Mount` MUST add `POST /admin/instances` for registration.
- `Mount` MUST add `DELETE /admin/instances/{name}` for removal.
- `Mount` MUST add `GET /admin` as the console page.
- `Mount` MUST add `GET /admin/events` as the event stream.
- `Mount` MUST panic when `Interval` is not positive.
- `Mount` MUST panic when `MaxInstances` is below 1.

### Registration

- `POST` MUST accept a JSON `Instance` with `name` and `opsUrl`.
- A malformed body MUST answer 400 and name the cause.
- An empty name MUST answer 422.
- A name holding a slash MUST answer 422.
- A non-`http` URL MUST answer 422.
- A URL with credentials MUST answer 422.
- A URL without a host MUST answer 422.
- A new name MUST answer 201 with that instance.
- A known name with the same URL MUST answer 200.
- A changed URL MUST reset that status to unknown.
- Past `MaxInstances` names MUST answer 429.
- `DELETE` of a missing name MUST answer 404.
- `DELETE` of a known name MUST answer 204.

### Console

- `GET /admin` MUST list each name with its status.
- `GET /admin/events` MUST stream one row per status change.
- That stream MUST follow the event rules in [live](live.md).
- Rows MUST carry `id` of the form `instance-<name>`.
- The registry MUST hold at most `MaxInstances` names.
- The registry MUST live in `logos/sync.Locked`.

### Polling

- The poll MUST run every `Interval` through a scheduler entry.
- The poll MUST request `/ops/health` on each `OpsURL`.
- The poll MUST use one breaker per instance.
- A nil `Now` MUST mean `time.Now`.
- An unhealthy answer MUST mark that instance down.
- A status change MUST publish exactly one event.
- `Start` MUST begin polling and `Stop` MUST end it.

### Registrator

- `Client.Start` MUST register `Self` with `POST /admin/instances`.
- `Client.Stop` MUST remove `Self` with `DELETE /admin/instances/{name}`.
- A second `Stop` MUST still succeed.

## Errors

- `admin: Mount requires a guard stage` when `guard` is nil.
- `admin: Interval must be positive` when `Interval` is not positive.
- `admin: MaxInstances must be at least 1` when the bound is below 1.
- `admin: read instance: <cause>`, `admin: close instance body: <cause>`, `admin: instance body too large` and `admin: decode instance: <cause>` for a bad body.
- `admin: invalid instance name` when the name is empty, too long or holds a slash.
- `admin: invalid ops URL` when the URL is not an absolute `http` or `https` URL without credentials.
- `admin: registry full` when the registry holds `MaxInstances` names.
- `admin: unknown instance <name>` when `DELETE` names no instance.
- `admin: events not ready` when the topic is missing.
- `admin: <METHOD> <path>: status <code>: <prefix>` when registration answers outside 2xx.
- `admin: encode instance <name>: <cause>` when the client cannot encode `Self`.

## Proof

- `TestAdminListsStatusesAndEmitsSingleRecoveryEvent` proves the two statuses and the single recovery event.
- `TestAdminGuardRefusesWithoutCredentials` proves that all four routes answer 401 without the guard credential.
- `TestAdminRejectsBadOpsURL` proves that a bad URL or name answers 422 and a malformed body answers 400.
- `TestAdminRegistryBound` proves that the registry refuses past `MaxInstances` and frees the slot on `DELETE`.
- `TestAdminClientRegistersAndDeregisters` proves that `Start` registers and `Stop` removes the instance.
- `TestAdminMountRequiresGuard` proves the panic for a nil guard.
- `TestAdminRejectsBadConfig` proves the panics for a bad interval and a bad bound.
- `TestAdminReRegisterSameURLKeepsStatus` proves the 200 answers for a repeat and a changed URL.

## Not in scope

- The console does not speak a vendor admin protocol. The routes above are the whole API.
