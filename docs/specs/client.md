# client

Package `client` sends a JSON request and decodes a JSON answer. A status outside the 2xx class is an error the caller reads with `errors.As`.

## Interface

```lgo
type StatusError struct {
	Status      int
	ProblemType string
	BodyLen     int
}

func (e *StatusError) Error() string

type Request[In any] struct {
	Method string
	Path   string
	Body   In?
	Header http.Header
}

type Client struct {
	Base    string
	Policy  resilience.Policy
	MaxBody int64 = 1 << 20
	HTTP    *http.Client
}

func New(base string, policy resilience.Policy) *Client
func Get[Out any](ctx context.Context, c *Client, path string) (Out, error)
func Send[In any, Out any](ctx context.Context, c *Client, req Request[In]) (Out, error)
func Faults() []*fault.Error
```

## Requirements

### Request

- `New` MUST set `HTTP` to `http.DefaultClient`.
- An omitted `MaxBody` MUST be 1048576 bytes.
- `Get` MUST call `Send` with method `GET` and no body.
- `Send` MUST change the method to upper case before it chooses a retry.
- The request URL MUST be `Base` followed by `Path`.
- When `Body` is set, `Send` MUST encode that value as JSON.
- `Send` MUST copy the caller headers onto the request.
- When `Body` is set, `Send` MUST set `Content-Type` to `application/json` after that copy.
- That set MUST replace a caller `Content-Type`.
- `Send` MUST close the response body on every path that received a response.
- `Send` MUST use the caller context, so a cancel ends the request.

### Answer

- A status from 200 to 299 inclusive MUST be a success.
- Every success body MUST be read under `MaxBody`.
- A success body longer than `MaxBody` MUST be an error.
- A success body of length `MaxBody` MUST be accepted.
- `HEAD`, status 204 and status 205 MUST return the zero value of `Out`.
- Those three successes MUST NOT decode the body as JSON.
- Every other success MUST decode the body as JSON into `Out`.
- A status outside 200 to 299 MUST produce a fault that wraps a `*StatusError`.
- `StatusError.Status` MUST be that response status.
- `ProblemType` MUST be the problem `type` when the media type is `application/problem+json` and the body decodes as a [web](web.md) problem.
- Any other error body MUST leave `ProblemType` empty.
- `BodyLen` MUST be the number of error body bytes read, at most `MaxBody`.
- `StatusError.Error` MUST name only the status and the problem type and MUST NOT carry any body text.
### Retry and breaker

- `Send` MUST apply `Policy.Retry` only for `GET`, `HEAD`, `PUT` and `DELETE`.
- `Send` MUST clear `Retry` for every other method.
- `Send` MUST keep the breaker and the timeout for every method.
- `Send` MUST treat a status from 400 to 499 as a caller fault, except 408 and 429.
- A caller fault MUST NOT be retried.
- A caller fault MUST NOT open the breaker.
- A caller fault MUST NOT count as a success for the breaker.
- `Send` MUST report a caller fault to [resilience](resilience.md) as an `Ignored` error.
- Every other status outside 200 to 299 MUST be an attempt error.
- A decode failure MUST be an attempt error, so [resilience](resilience.md) may retry it.
- An encode failure MUST be returned before any attempt.
- An open breaker MUST stop the request before a network call.
- An open breaker error MUST match `ErrCircuitOpen` with `errors.Is`.
- An attempt timeout MUST match `ErrTimeout` with `errors.Is`.
- Each MUST propagate without another client fault.
- `Send` MUST add the method and path to the cause.
- `Send` MUST NOT create a second fault over it.

### Code table

| code | kind | message |
|---|---|---|
| `client.upstream_rejected` | unavailable | The upstream rejected the request. |
| `client.upstream_failed` | unavailable | The upstream request failed. |
| `client.upstream_timeout` | timeout | The upstream timed out. |
| `client.upstream_rate_limited` | rate_limited | The upstream is rate limited. |
| `client.response_too_large` | too_large | The upstream response is too large. |
| `client.request_failed` | internal | The outbound request failed. |

## Errors

- A 408 answer is `ErrUpstreamTimeout`; match it with `errors.Is`.
- A 429 answer is `ErrUpstreamRateLimited`; match it with `errors.Is`.
- A 400 to 499 answer except 408 and 429 is `ErrUpstreamRejected` wrapping a `*StatusError`; match it with `errors.Is` and read the status with `errors.As`.
- Any other status outside 200 to 299 is `ErrUpstreamFailed` wrapping a `*StatusError`.
- A transport, error-body read, success-body read or decode failure is `ErrUpstreamFailed` wrapping the cause.
- A success body longer than `MaxBody` is `ErrResponseTooLarge` wrapping the limit cause.
- A JSON encode or request construction failure is `ErrRequestFailed` wrapping the cause.
- No fault message, field or client-visible text MUST carry a downstream body.
- No client-visible text MUST carry a key, token, cookie, name or path.
- The method and path MUST ride only in the cause.

### Owner rulings

- An upstream 4xx answer except 408 and 429 MUST map to `ErrUpstreamRejected`.
- That fault MUST keep kind Unavailable.
- A 408 answer MUST map to `ErrUpstreamTimeout`.
- A 429 answer MUST map to `ErrUpstreamRateLimited`.
- Transport, read and decode failures MUST share `ErrUpstreamFailed`.
- Encode and request-construction failures MUST share `ErrRequestFailed`.
- `ErrRequestFailed` MUST keep kind Internal.
## Proof

- `TestRetriesApplyOnlyToIdempotentMethods` proves the method list against a server that counts calls.
- `TestSendEncodesJSONBodyAndCallerHeaders` proves the JSON body, the content type and a caller header.
- `TestProblemAnswerBecomesStatusErrorWithProblem` proves the problem type on a 503 answer without the detail.
- `TestPlainErrorStatusNamesStatusAndBoundsBody` proves a text error carries the status and no body text.
- `TestBodyReadUnderSizeLimit` and `TestMaxBodyLimitIsExact` prove the `MaxBody` bound, including an equal length.
- `TestOpenBreakerStopsRequestsBeforeTheWire` proves that an open breaker sends no further request.
- `TestClientErrorIsNotRetriedAndDoesNotOpenTheBreaker` proves that a 404 is not retried and does not open the breaker.
- `TestClientErrorAddsNoResultToTheBreaker` proves that a 404 adds no result to the breaker window.
- `TestTooManyRequestsIsRetried` proves that status 429 is retried.
- `TestCallerContextCancelsRequest` proves that the caller context ends the request.
- `TestAttemptTimeoutEndsSlowAttempt` proves the per-attempt timeout.
- `TestResponseBodyClosedOnEveryPath` proves that each response body is closed.
- `TestInvalidJSONForResultTypeNamesPath` proves that a decode error names the path.
- `TestErrorTextStaysUsable` proves both `Error` texts carry no body.
- `TestOversizedCallerFaultStaysCallerFault` proves that a long 404 body stays a caller fault with a bounded length.
- `TestUpstreamRejectedIsFault` proves that a 404 returns `ErrUpstreamRejected`.
- `TestUpstreamFailedIsFault` proves that a 502 returns `ErrUpstreamFailed`.
- `TestUpstreamTimeoutIsFault` proves that a 408 returns `ErrUpstreamTimeout`.
- `TestUpstreamRateLimitedIsFault` proves that a 429 returns `ErrUpstreamRateLimited`.
- `TestResponseTooLargeIsFault` proves that an oversize success body returns `ErrResponseTooLarge`.
- `TestRequestFailedIsFault` proves that an encode failure returns `ErrRequestFailed`.
- `TestFaultPublicHidesSecret` proves that no secret or hostile value reaches the client view.
- `TestFaultsMatchCodeTable` proves that `Faults()` matches the code table with no duplicates.
- `TestHeadSuccessSkipsDecode` proves that `HEAD` skips decode.
- `TestNoContentAndResetContentSkipDecode` proves that status 204 and status 205 skip decode.
- `TestGetEmptyBodyStillADecodeError` proves that an empty `GET` body is a decode error.

## Not in scope

- The package does not build a client from an interface. That OpenFeign form is not used. The caller uses `Get` or `Send`.
