# resilience

Package `resilience` runs one call under a timeout, an optional retry and an optional breaker. The caller handles the error. The breaker follows the run shape of Spring Cloud Circuit Breaker and has no fallback.

`Do`, `Policy`, `Retry` and `Breaker` follow four references. They are Spring Cloud Commons at 5535a2bf79b7605b5e934ee850e560cb013bd0e9 and Spring Cloud Circuit Breaker at 1f34fb9ed185c89967f44c45fae96ac4888854bd. They are also the retry package of Spring Framework at 4cb62d893e09e23791d661e8d9b35aedee7006d0 and the backoff of Reactor Core at b35a253039a539d1c710d4fb759244a37d429b82. Spira keeps one call run under a policy, a timeout for each attempt and a bounded number of attempts. Spira keeps a doubling backoff ceiling with a maximum, and an end to the retry on an error that says nothing about the dependency. Spira keeps the closed, open and half-open breaker states, with one probe in half-open. Spira copies no code. Spira drops the fallback function, the registries, the factories, the customizers and the configuration builders. Spira drops the bulkhead with its executor, and the listeners and observations. One `Ignored` wrapper replaces the lists of exception classes to include or exclude. Spira drops a breaker that opens on the first failure and closes after a quiet period. Here a full window at the failure rate opens the breaker. Spira drops jitter around the delay. Here the wait is a uniform duration below the ceiling.

## Interface

```lgo
var ErrCircuitOpen = fault.New("resilience.circuit_open", fault.Unavailable, "The upstream is unavailable.")
var ErrTimeout = fault.New("resilience.timeout", fault.Timeout, "The upstream timed out.")

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
func Ignored(err error) error
func Faults() []*fault.Error
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
- `Do` MUST NOT start another attempt after `ErrCircuitOpen`.
- `Do` MUST NOT start another attempt after the caller context ends.
- `Ignored` MUST mark an error that says nothing about the health of the dependency.
- `Do` MUST NOT start another attempt after an `Ignored` error.
- `Do` MUST then return the error that `Ignored` wraps.

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
- While the breaker is open, `Do` MUST return `ErrCircuitOpen`.
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
- An `Ignored` error MUST NOT add a result to the window.
- A probe that ends with an `Ignored` error MUST release its slot.
- That probe MUST NOT close the breaker.
- A result from an older admission MUST NOT change the breaker.
- A panicking call MUST count as a breaker failure.
- That panic MUST propagate to the caller of `Do`.
- Policies that hold the same `Breaker` pointer MUST share one breaker state.

### Code table

| code | kind | message |
|---|---|---|
| `resilience.circuit_open` | unavailable | The upstream is unavailable. |
| `resilience.timeout` | timeout | The upstream timed out. |

## Errors

- An open breaker is `ErrCircuitOpen`; match it with `errors.Is`.
- An attempt timeout when the caller context is still active is `ErrTimeout` wrapping the attempt error; match it with `errors.Is`.
- When the wait stops because the caller context ends, `Do` returns `errors.Join` of the last call error and the context error.
- When a call fails and the caller context has already ended, `Do` returns that same join.
- After the caller context ends, `Do` MUST join an ignored cause with the context error.
- When the caller context has not ended, `Do` returns `ErrCircuitOpen` as itself.

## Proof

- `TestBreakerTransitionsFollowTheTable` proves the state changes against a table of expected states. The clock is the `Now` field.
- `TestBreakerOpensWhenFullWindowReachesRate` proves that a full window at the failure rate opens the breaker.
- `TestHalfOpenAdmitsExactlyOneProbe` proves that half-open admits one probe.
- `TestBreakerSharedByPointerAcrossPolicies` proves that one pointer is one breaker.
- `TestDoRetriesUntilAttemptsExhausted` proves that failed attempts stop at `Attempts`.
- `TestDoReturnsTheFirstSuccess` proves that the first success ends the loop.
- `TestDoStopsRetryingAfterErrCircuitOpen` proves that `ErrCircuitOpen` ends the retry.
- `TestCircuitOpenIsFault` proves that an open breaker returns `ErrCircuitOpen`.
- `TestTimeoutIsFault` proves that an attempt timeout returns `ErrTimeout`.
- `TestFaultPublicHidesSecret` proves that no secret reaches the client view.
- `TestFaultsMatchCodeTable` proves that `Faults()` matches the code table with no duplicates.
- `TestBackoffStopsWhenContextEnds` proves that the wait stops with the caller context.
- `TestCallerCancellationIsNotCountedAsFailure` proves that a caller cancel is not a failure.
- `TestCancelledProbeReleasesTheSlot` proves that a cancelled probe frees the slot.
- `TestIgnoredErrorEndsRetriesAndReturnsItsCause` proves that an `Ignored` error is final and that `Do` returns its cause.
- `TestIgnoredErrorIsNoResultInTheWindow` proves that an `Ignored` error adds no result to the window.
- `TestIgnoredErrorJoinsContextErrorWhenCallerAlreadyEnded` proves that an ignored cause after cancellation is joined with the context error.
- `TestIgnoredProbeLeavesTheBreakerHalfOpen` proves that an `Ignored` probe releases its slot and does not close the breaker.
- `TestAttemptTimeoutCountsAsFailure` proves that an attempt timeout opens the breaker.
- `TestPolicyAndRetryDefaultsHold` proves the timeout, attempt, base and max defaults.
- `TestStaleFailureCannotStealTheProbe` and `TestStaleSuccessCannotCloseTheBreaker` prove that an older admission does not change the breaker.
- `TestPanickingProbeDoesNotHoldTheSlot` proves that a panic counts as a failure and does not hold the probe slot.

## Not in scope

- `Do` has no fallback value. The caller handles the error.
