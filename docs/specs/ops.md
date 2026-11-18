# ops

Package `ops` serves live status, readiness, build information, metrics and the route list under `/ops`. The application author passes a guard, so those routes stay closed unless that guard allows the caller. The split of the endpoint from its exposure follows Spring Boot Actuator.

## Interface

```lgo
type Options struct {
	Checks       map[string]func(ctx context.Context) error
	Info         map[string]string
	Registry     *meter.Registry
	CheckTimeout time.Duration = 5 * time.Second
}

func Mount(r *web.Router, guard web.Stage, o Options)
```

## Requirements

### Mount

- `Mount` MUST register six GET routes under `/ops`.
- The paths MUST be `/ops/live`, `/ops/ready`, `/ops/health`, `/ops/info`, `/ops/metrics` and `/ops/routes`.
- `Mount` MUST run `guard` before each of those handlers.

### Live

- `GET /ops/live` MUST answer 200.
- The live body MUST be a JSON object whose member `status` is `ok`.
- The live handler MUST NOT run `Checks`.

### Checks

- `GET /ops/ready` and `GET /ops/health` MUST build the same check report.
- The handler MUST run the checks one after another.
- Each check MUST receive a child of the request context.
- That child context MUST end after `CheckTimeout`.
- An omitted `CheckTimeout` MUST be 5 seconds.
- A check that returns a nil error MUST have status `ok`.
- A check that returns an error MUST have status `fail`.
- The fail member `error` MUST be that error text.
- A check that panics MUST have status `fail`.
- The report MUST list checks in name order.
- The report JSON MUST use the member names `status` and `checks`.
- Each check JSON MUST use the member names `name`, `status` and `error`.
- The member `error` MUST be absent when the check has no error text.
- When every check has status `ok`, the HTTP status MUST be 200.
- When every check has status `ok`, the report member `status` MUST be `ok`.
- When any check has another status, the HTTP status MUST be 503.
- When any check has another status, the report member `status` MUST be `unavailable`.
- A report with no checks MUST use HTTP status 200.
- A report with no checks MUST use report status `ok`.
- A report with no checks MUST encode `checks` as an empty list.

### Info

- `GET /ops/info` MUST answer 200.
- The body MUST use the member names `module`, `version`, `go` and `info`.
- When `ReadBuildInfo` returns true, `module` MUST be the main module path.
- When `ReadBuildInfo` returns true, `version` MUST be the main module version.
- When `ReadBuildInfo` returns true, `go` MUST be the Go version from that result.
- When `ReadBuildInfo` returns false, `module`, `version` and `go` MUST each be `unknown`.
- The member `info` MUST be `Options.Info`.

### Metrics and routes

- `GET /ops/metrics` MUST answer 200.
- The metrics `Content-Type` MUST be `text/plain; version=0.0.4; charset=utf-8`.
- The metrics body MUST be the text from `Registry.Handler`, as [meter](meter.md) defines it.
- `GET /ops/routes` MUST answer 200.
- The routes body MUST be the JSON form of the slice from [web](web.md) `Routes`.
- Each route object MUST use the member names `Method` and `Pattern`.

## Errors

- `ops: Options.Registry is required` when `Registry` is nil.
- `ops: Options.CheckTimeout must be positive` when `CheckTimeout` is not positive.
- `ops: check panicked: <value>` is the check error text when a check panics. `<value>` is the panic value.

## Proof

- `TestReadyNamesFailingCheck` proves that a failed check makes `/ops/ready` answer 503 and names that check.
- `TestReadyAndHealthPassAllChecks` proves that both routes answer 200 when every check passes.
- `TestLiveAnswers200WhileServing` proves that live answers 200, and that health with no checks answers 200.
- `TestEveryOpsEndpointRefusedWithoutGuardCredentials` proves that `Mount` runs the guard on all six routes.
- `TestMetricsServesRegistryTextWithRouteLabel` proves the metrics text and its content type.
- `TestRoutesEndpointListsRoutes` proves the `Method` and `Pattern` members.
- `TestInfoEndpointReportsBuildInfo` proves the Go version and the `info` map.
- `TestPanickingCheckFails` proves that a panic becomes a failed check and that the body holds the panic value.
- `TestTimedOutCheckFails` proves that the check context ends at `CheckTimeout`.
- `TestMountRefusesNonPositiveCheckTimeout` proves the panic for a zero `CheckTimeout`.

## Not in scope

- The package does not choose who may call the routes. The guard does that, so the routes are not open by default.
