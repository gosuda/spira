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
	ProbeToken   string?
	AllowedHosts []string
	// unexported fields
}

func (s *Server) Mount(r *web.Router, guard web.Stage)
func (s *Server) Start(ctx context.Context) error
func (s *Server) Stop(ctx context.Context) error

type Client struct {
	Server string
	Self   Instance
	Token  string?
}

func (c *Client) Start(ctx context.Context) error
func (c *Client) Stop(ctx context.Context) error

var ErrInvalidInstance = fault.New("admin.invalid_instance", fault.Unprocessable, "The instance registration is invalid.")
var ErrOpsHostRefused = fault.New("admin.ops_host_refused", fault.Unprocessable, "The instance ops host is not allowed.")
var ErrNotReady = fault.New("admin.not_ready", fault.Internal, "The admin service is not ready.")
var ErrRegistryFull = fault.New("admin.registry_full", fault.RateLimited, "The instance registry is full.")
var ErrRegistryUnreachable = fault.New("admin.registry_unreachable", fault.Unavailable, "The admin registry is unreachable.")
var ErrUnknownInstance = fault.New("admin.unknown_instance", fault.NotFound, "The instance was not found.")
func Faults() []*fault.Error
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
- A malformed body MUST answer 422 with `admin.invalid_instance`.
- Each refusal MUST carry field errors that name the field and the rule only.
- An empty name MUST answer 422.
- A name holding a slash MUST answer 422.
- A dot-only name MUST answer 422.
- A non-`http` URL MUST answer 422.
- A URL with credentials MUST answer 422.
- A URL without a host MUST answer 422.
- An empty allowlist MUST refuse every registration.
- A host outside the allowlist MUST answer 422 with `admin.ops_host_refused`.
- The allowlist MUST hold exact host or host:port strings.
- The host comparison MUST be case-insensitive over the parsed URL host.
- An entry with a wildcard or a slash MUST never match.
- The refusal MUST NOT echo the URL.
- A new name MUST answer 201 with that instance.
- A known name with the same URL MUST answer 200.
- A changed URL MUST reset that status to unknown.
- Past `MaxInstances` names MUST answer 429.
- `DELETE` of a missing name MUST answer 404.
- `DELETE` of a known name MUST answer 204.
- `DELETE` MUST match the `opsUrl` query value when present.
- A mismatched `opsUrl` MUST answer 404 and keep the record.

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
- The poll MUST skip an `OpsURL` whose host is outside the allowlist.
- The poll client MUST NOT follow redirects.
- The poll MUST use one breaker per instance.
- A nil `Now` MUST mean `time.Now`.
- The probe MUST send the operator token when set.
- The poll MUST probe each instance concurrently with a bound of 8.
- Each result MUST apply and publish as its probe completes.
- A cancelled sweep MUST apply and publish nothing.
- An unhealthy answer MUST mark that instance down.
- A status change MUST publish exactly one event.
- `Start` MUST begin polling and `Stop` MUST end it.

### Registrator

- `Client.Start` MUST register `Self` with `POST /admin/instances`.
- `Client.Stop` MUST remove `Self` with `DELETE /admin/instances/{name}`.
- `Client` MUST send its token as a bearer header when set.
- `Client.Stop` MUST tolerate a 404 answer.
- A second `Stop` MUST still succeed.

### Code table

| Code | Kind | Message |
|---|---|---|
| `admin.invalid_instance` | unprocessable | The instance registration is invalid. |
| `admin.ops_host_refused` | unprocessable | The instance ops host is not allowed. |
| `admin.not_ready` | internal | The admin service is not ready. |
| `admin.registry_full` | rate_limited | The instance registry is full. |
| `admin.registry_unreachable` | unavailable | The admin registry is unreachable. |
| `admin.unknown_instance` | not_found | The instance was not found. |

## Errors

- `admin: Mount requires a guard stage` when `guard` is nil.
- `admin: Interval must be positive` when `Interval` is not positive.
- `admin: MaxInstances must be at least 1` when the bound is below 1.
- `admin.invalid_instance`: `ErrInvalidInstance`, kind `unprocessable`, message `The instance registration is invalid.` Returned for a bad body, name or URL.
- `admin.ops_host_refused`: `ErrOpsHostRefused`, kind `unprocessable`, message `The instance ops host is not allowed.` Returned when the ops host is outside the allowlist.
- `admin.not_ready`: `ErrNotReady`, kind `internal`, message `The admin service is not ready.` Returned when the topic is missing.
- `admin.registry_full`: `ErrRegistryFull`, kind `rate_limited`, message `The instance registry is full.` Returned past the bound.
- `admin.registry_unreachable`: `ErrRegistryUnreachable`, kind `unavailable`, message `The admin registry is unreachable.` The cause MUST hold no body text.
- `admin.unknown_instance`: `ErrUnknownInstance`, kind `not_found`, message `The instance was not found.` Returned for a missing or mismatched record.

## Proof

- `TestAdminListsStatusesAndEmitsSingleRecoveryEvent` proves the two statuses and the single recovery event.
- `TestAdminGuardRefusesWithoutCredentials` proves that all four routes answer 401 without the guard credential.
- `TestAdminRejectsBadOpsURL` proves that a bad URL or name answers 422 and a malformed body answers 422.
- `TestAdminFaultsMatchSpecCodeTable` proves that `Faults` holds each spec table code once.
- `TestAdminFaultInvalidInstanceName` proves that a hostile name answers 422 without echo.
- `TestAdminFaultInvalidInstanceURL` proves that a credentialed URL answers 422 without echo.
- `TestAdminFaultMalformedBodyHidesSecret` proves that a malformed body answers 422 without echo.
- `TestAdminFaultUnknownInstanceHidesName` proves that a missing delete answers 404 without echo.
- `TestAdminFaultRegistryFull` proves that a full registry answers 429 with its code.
- `TestAdminFaultRegistryUnreachable` proves that a failing registry wraps without its body.
- `TestAdminRegistryBound` proves that the registry refuses past `MaxInstances` and frees the slot on `DELETE`.
- `TestAdminClientRegistersAndDeregisters` proves that `Start` registers and `Stop` removes the instance.
- `TestAdminClientAgainstGuard` proves that a guarded console needs the client token.
- `TestAdminPollGuardedHealth` proves that a guarded health endpoint needs the probe token.
- `TestAdminHandoff` proves that an old client stop keeps the replacement.
- `TestAdminPollConcurrent` proves that a healthy row flips before a blocked probe ends.
- `TestAdminStopPreservesStatus` proves that a stopped sweep keeps the status silent.
- `TestAdminMountRequiresGuard` proves the panic for a nil guard.
- `TestAdminRejectsBadConfig` proves the panics for a bad interval and a bad bound.
- `TestAdminReRegisterSameURLKeepsStatus` proves that a repeat keeps up and a move resets unknown.
- `TestAdminRefusesUnlistedHostWithoutOutboundRequest` proves that an unlisted host is refused with no outbound request.
- `TestAdminEmptyAllowlistRefuses` proves that an empty allowlist refuses every registration.
- `TestAdminListedHostAcceptedAndPolled` proves that a listed host is accepted and polled.
- `TestAdminRedirectOutsideAllowlistMakesNoSecondRequest` proves that a redirect outside the allowlist is not followed.
- `TestAdminRefusesCredentialedAndForeignSchemeURLs` proves that credentialed and foreign-scheme URLs are refused without echo.

## Not in scope

- The console does not speak a vendor admin protocol. The routes above are the whole API.
