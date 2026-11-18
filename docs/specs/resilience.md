# resilience

Package `resilience` runs one call under a timeout, an optional retry and an optional breaker. The caller handles the error. The breaker follows the run shape of Spring Cloud Circuit Breaker and has no fallback.

## Interface

```lgo
var ErrOpen = errors.New("resilience: circuit open")

type Retry struct {
	Attempts int           = 3
	Base     time.Duration = 100 * time.Millisecond
	Max      time.Duration = 2 * time.Second
}

type Breaker struct {
	Window      int              = 20
	FailureRate float64          = 0.5
	OpenFor     time.Duration    = 30 * time.Second
	Now         (func() time.Time)?
	// unexported fields
}

type Policy struct {
	Timeout time.Duration = 10 * time.Second
	Retry   Retry?
	Breaker *Breaker?
}

func Do[T any](ctx context.Context, p Policy, call func(ctx context.Context) (T, error)) (T, error)
```

## Requirements

### Attempts

- A policy with no `Retry` MUST run the call once.
- When `Retry` is set, `Do` MUST run at most `Attempts` calls.
- When `Attempts` is below 1, `Do` MUST run the call once.
- An omitted `Attempts` MUST be 3.
- An omitted `Base` MUST be 100 milliseconds.
- An omitted `Max` MUST be 2 seconds.
- An omitted `Timeout` MUST be 10 seconds.
- A nil `Breaker` on an omitted policy MUST stay nil.
- `Do` MUST return the value from the first call that returns a nil error.
- `Do` MUST stop after that success.
- `Do` MUST return the last error when every attempt fails.
- `Do` MUST return the zero value of `T` together with an error.
- `Do` MUST NOT start another attempt after `ErrOpen`.
- `Do` MUST NOT start another attempt after the caller context ends.

### Timeout and wait

- Each attempt MUST pass the call a child context with timeout `Policy.Timeout`.
- `Do` MUST NOT wait before the first attempt.
- The wait before a later attempt MUST be a uniform random duration.
- That duration MUST start at 0 and MUST end before the ceiling.

- The ceiling before the first retry MUST be `Base`, or `Max` when `Base` is greater.
- Each later ceiling MUST be double the previous ceiling, and MUST NOT exceed `Max`.
- When the ceiling is 0 or below, the wait MUST be 0.
- `Do` MUST stop the wait when the caller context ends.
- An attempt timeout MUST count as a breaker failure when the caller context is still active.
- A caller cancellation MUST NOT count as a breaker failure.

### Breaker

- The breaker MUST start closed.
- A closed breaker MUST admit the call.
- The breaker MUST open when the window is full and the share of failures is at least `FailureRate`.
- The share MUST be the failure count divided by the number of results in the window.
- A window that is not full MUST keep the breaker closed.
- An omitted `Window` MUST be 20.
- A `Window` below 1 MUST count as 1.
- An omitted `FailureRate` MUST be 0.5.
- An omitted `OpenFor` MUST be 30 seconds.
- While the breaker is open, `Do` MUST return `ErrOpen`.
- While the breaker is open, `Do` MUST NOT call the function.
- The breaker MUST admit one probe when the open age is greater than or equal to `OpenFor`.
- The breaker MUST stay open when that age is below `OpenFor`.
- A nil `Now` MUST mean `time.Now`.
- A set `Now` MUST supply the time for that age.
- Half-open MUST admit one probe.
- While that probe runs, the breaker MUST reject every other call.
- A successful probe MUST close the breaker.
- A successful probe MUST clear the window.
- A failed probe MUST open the breaker again.
- A cancelled probe MUST release its slot.
- A released slot MUST allow another probe.
- A result from an older admission MUST NOT change the breaker.
- A panicking call MUST count as a breaker failure.
- That panic MUST propagate to the caller of `Do`.
- Policies that hold the same `Breaker` pointer MUST share one breaker state.

## Errors

- `ErrOpen` has the text `resilience: circuit open`.
- When the wait stops because the caller context ends, `Do` returns `errors.Join` of the last call error and the context error.
- When a call fails and the caller context has already ended, `Do` returns that same join.
- When the caller context has not ended, `Do` returns `ErrOpen` as itself.

## Proof

- `TestBreakerTransitionsFollowTheTable` proves the state changes against a table of expected states. The clock is the `Now` field.
- `TestBreakerOpensWhenFullWindowReachesRate` proves that a full window at the failure rate opens the breaker.
- `TestHalfOpenAdmitsExactlyOneProbe` proves that half-open admits one probe.
- `TestBreakerSharedByPointerAcrossPolicies` proves that one pointer is one breaker.
- `TestDoRetriesUntilAttemptsExhausted` proves that failed attempts stop at `Attempts`.
- `TestDoReturnsTheFirstSuccess` proves that the first success ends the loop.
- `TestDoStopsRetryingAfterErrOpen` proves that `ErrOpen` ends the retry.
- `TestBackoffStopsWhenContextEnds` proves that the wait stops with the caller context.
- `TestCallerCancellationIsNotCountedAsFailure` proves that a caller cancel is not a failure.
- `TestCancelledProbeReleasesTheSlot` proves that a cancelled probe frees the slot.
- `TestAttemptTimeoutCountsAsFailure` proves that an attempt timeout opens the breaker.
- `TestPolicyAndRetryDefaultsHold` proves the timeout, attempt, base and max defaults.
- `TestStaleFailureCannotStealTheProbe` and `TestStaleSuccessCannotCloseTheBreaker` prove that an older admission does not change the breaker.
- `TestPanickingProbeDoesNotHoldTheSlot` proves that a panic counts as a failure and does not hold the probe slot.

## Not in scope

- `Do` has no fallback value. The caller handles the error.
