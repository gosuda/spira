# client

Package `client` sends a JSON request and decodes a JSON answer. A status outside the 2xx class is an error the caller reads with `errors.As`.

## Interface

```lgo
type StatusError struct {
	Status  int
	Problem web.Problem?
	Prefix  string
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
- A status outside 200 to 299 MUST produce a `*StatusError`.
- `StatusError.Status` MUST be that response status.
- `Problem` MUST be set when the media type is `application/problem+json` and the body decodes as a [web](web.md) problem.
- Any other error body MUST leave `Problem` nil.
- An error-status body longer than `MaxBody` MUST be cut at `MaxBody`.
- That cut MUST NOT by itself be an error.
- `Prefix` MUST hold at most 256 bytes of the error body.

### Retry and breaker

- `Send` MUST apply `Policy.Retry` only for `GET`, `HEAD`, `PUT` and `DELETE`.
- `Send` MUST clear `Retry` for every other method.
- `Send` MUST keep the breaker and the timeout for every method.
- `Send` MUST treat a status from 400 to 499 as a caller fault, except 408 and 429.
- A caller fault MUST NOT be retried.
- A caller fault MUST NOT open the breaker.
- Every other status outside 200 to 299 MUST be an attempt error.
- A decode failure MUST be an attempt error, so [resilience](resilience.md) may retry it.
- An encode failure MUST be returned before any attempt.
- An open breaker MUST stop the request before a network call.
- That error MUST be one that `errors.Is` reports as `ErrOpen`.

## Errors

- `client: encode body for <METHOD> <PATH>: <cause>` when the JSON encode fails.
- `client: <METHOD> <PATH>: <cause>` when the attempt fails or the answer is refused.
- `(*StatusError).Error` with a problem is `client: <Status> <Title>: <Detail>`.
- `(*StatusError).Error` without a problem is `client: status <Status>: <Prefix>`.
- `read response: <cause>` when a body read fails. `Send` wraps this text in the method-and-path error.
- `decode: <cause>` when JSON decode fails. `Send` wraps this text the same way.
- `body exceeds <limit> bytes` when a success body is longer than `MaxBody`. `Send` wraps it as `read response: <that text>`.

## Proof

- `TestRetriesApplyOnlyToIdempotentMethods` proves the method list against a server that counts calls.
- `TestSendEncodesJSONBodyAndCallerHeaders` proves the JSON body, the content type and a caller header.
- `TestProblemAnswerBecomesStatusErrorWithProblem` proves the problem fields on a 503 answer.
- `TestPlainErrorStatusNamesStatusAndBoundsBody` proves a text error, the status and the bounded prefix.
- `TestBodyReadUnderSizeLimit` and `TestMaxBodyLimitIsExact` prove the `MaxBody` bound, including an equal length.
- `TestOpenBreakerStopsRequestsBeforeTheWire` proves that an open breaker sends no further request.
- `TestClientErrorIsNotRetriedAndDoesNotOpenTheBreaker` proves that a 404 is not retried and does not open the breaker.
- `TestTooManyRequestsIsRetried` proves that status 429 is retried.
- `TestCallerContextCancelsRequest` proves that the caller context ends the request.
- `TestAttemptTimeoutEndsSlowAttempt` proves the per-attempt timeout.
- `TestResponseBodyClosedOnEveryPath` proves that each response body is closed.
- `TestInvalidJSONForResultTypeNamesPath` proves that a decode error names the path.
- `TestErrorTextStaysUsable` proves both `Error` texts.
- `TestOversizedCallerFaultStaysCallerFault` proves that a long 404 body stays a caller fault and bounds the prefix.
- `TestHeadSuccessSkipsDecode` proves that `HEAD` skips decode.
- `TestNoContentAndResetContentSkipDecode` proves that status 204 and status 205 skip decode.
- `TestGetEmptyBodyStillADecodeError` proves that an empty `GET` body is a decode error.

## Not in scope

- The package does not build a client from an interface. That OpenFeign form is not used. The caller uses `Get` or `Send`.
