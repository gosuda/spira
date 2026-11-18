# admin

Package `admin` lists registered instances and the status of each one. The application author mounts the console behind a guard and registers one instance. The registry and the registrator follow the split in Spring Boot Admin.

Status: specified; the package is not in the tree yet.

## Interface

```lgo
type Instance struct {
	Name   string
	OpsURL string
}

type Server struct {
	// unexported fields
}

func (s *Server) Mount(r *web.Router, guard web.Stage)

type Client struct {
	Server string
	Self   Instance
}

func (c *Client) Start(ctx context.Context) error
func (c *Client) Stop(ctx context.Context) error
```

## Requirements

- `Mount` MUST add `POST /admin/instances`.
- `POST /admin/instances` MUST accept a JSON `Instance`.
- `Mount` MUST add `DELETE /admin/instances/{name}`.
- `DELETE /admin/instances/{name}` MUST remove the instance of that name.
- `Mount` MUST add `GET /admin`.
- `GET /admin` MUST be a page from [view](view.md).
- That page MUST list each instance and its status.
- `Mount` MUST add `GET /admin/events`.
- `GET /admin/events` MUST be an event stream from [live](live.md).
- That stream MUST push one row fragment for each status change.
- A change from failing to healthy MUST produce exactly one event.
- `Mount` MUST apply `guard` to every route it adds.
- A scheduler entry from [job](job.md) MUST poll each instance.
- That poll MUST request `/ops/health` on `OpsURL` every 10 seconds.
- That poll MUST use [client](client.md) with a breaker from [resilience](resilience.md).
- A status change MUST be published on a topic from [bus](bus.md).
- A `*Client` MUST satisfy `Part` in [app](app.md).
- `Start` MUST register `Self` with `POST /admin/instances` at `Server`.
- `Stop` MUST deregister `Self` with `DELETE /admin/instances/{name}`.

## Proof

- The plan names one test with two `httptest` instances, one healthy and one failing.
- That test proves each instance shows its status.
- The same test proves that recovery of the failing instance produces exactly one event.

## Not in scope

- The console does not speak a vendor admin protocol. The routes above are the whole API.
