# cache

Package `cache` stores a bounded set of values and can load a missing value once for many callers. The application author chooses the capacity and the time to live.

## Interface

```lgo
type Memory[K comparable, V any] struct {
	Now func() time.Time
	// unexported fields
}

func NewMemory[K comparable, V any](capacity int, ttl time.Duration) *Memory[K, V]
func (c *Memory[K, V]) Get(k K) V?
func (c *Memory[K, V]) Put(k K, v V)
func (c *Memory[K, V]) Delete(k K)
func Load[K comparable, V any](ctx context.Context, c *Memory[K, V], k K, load func(ctx context.Context) (V, error)) (V, error)
```

## Requirements

### Store

- `NewMemory` MUST set `Now` to `time.Now`.
- `Put` MUST store the value at the front of the use order.
- `Put` of a key that is already stored MUST replace that value.
- `Get` of a stored key that has not expired MUST return that value.
- That `Get` MUST move the key to the front of the use order.
- `Get` of an absent key MUST return nil.
- `Delete` MUST remove the key.
- When the entry count exceeds `capacity`, `Put` MUST drop the entry at the back of the use order.
- `Put` MUST repeat that drop until the count equals `capacity`.
- A time to live of 0 MUST NOT expire an entry.
- When the time to live is above 0, an entry MUST expire once its age reaches that duration.
- `Get` of an expired key MUST remove it.
- That `Get` MUST return nil.
- The age MUST be `Now` minus the store time.
- A key that is not equal to itself MUST NOT be stored.

### Load

- `Load` of a stored key that has not expired MUST return that value.
- That `Load` MUST NOT call `load`.
- For a key that equals itself, `Load` MUST run one `load` at a time.
- Other callers for that key MUST wait for that `load`.
- A failed `load` MUST NOT store a value.
- Waiters of that failure MUST receive the same error.
- Callers for different keys MUST be allowed to run `load` at the same time.
- `Load` of a key that is not equal to itself MUST call `load` on every call.
- That `Load` MUST NOT join a flight.
- `Put` during a load MUST keep the value from `Put` in the store.
- `Load` MUST still return the value from `load` to that caller.
- `Delete` during a load MUST leave the key absent.
- `Load` MUST still return the value from `load` to that caller.
- When the leader context has ended and `load` returns an error, each waiter MUST start again.
- A waiter whose context has ended MUST return that context error.
- That waiter MUST NOT lead the next load.
- A waiter whose context ends while it waits MUST return that context error.

## Errors

- `cache: capacity must be at least 1` when `capacity` is below 1.
- Each waiter of a panicking `load` receives the error `cache: load panicked`.
- The leader MUST panic again with the original panic value.

## Proof

- `TestMixedOperationsMatchLRUModel` proves get, put and delete against an independent list model of the use order.
- `TestExpiryFollowsNowField` proves expiry from the `Now` field, including the equal-duration bound and a zero time to live.
- `TestLoadRunsOnceForConcurrentCallers` proves that many callers of one key run `load` once.
- `TestLoadFailureSharedAndNotCached` proves that a failure is shared and is not stored.
- `TestLoadWaiterContextCancel` proves that a waiter cancel returns the context error.
- `TestLoadPanicReleasesWaiters` proves the waiter error after a panic.
- `TestDifferentKeysLoadConcurrently` proves that different keys can load at the same time.
- `TestNewMemoryRejectsBadCapacity` proves the capacity panic.
- `TestGetPutDeleteRoundTrip` proves a stored value, a replace and a delete.
- `TestPutDuringLoadKeepsThePutValue` proves that `Put` wins in the store and that `Load` still returns the loaded value.
- `TestDeleteDuringLoadKeepsTheKeyAbsent` proves that `Delete` during a load leaves the key absent.
- `TestNaNKeyPutEvictionTerminates` proves that a key which is not equal to itself is not stored.
- `TestNaNKeyLoadRunsLoadEveryTime` and `TestNaNKeyLoadNeverJoinsAFlight` prove that such a key never shares a load.
- `TestLeaderCancelRestartsLoadForWaiters` proves that a cancelled leader tells waiters to start again.
- `TestLeaderOrdinaryFailureStillReachesWaiters` proves that a normal failure still reaches the waiters.
- `TestRestartedWaiterWithAnEndedContextDoesNotLoad` proves that an ended waiter does not lead the next load.

## Not in scope

- `Get` does not call `load`. The caller uses `Load` when a miss must fill the store.
