# job

Package `job` runs scheduled work, a bounded queue and a chunked batch. The application author starts the scheduler and the queue with the other long-lived parts.

## Interface

```lgo
type Stats struct {
	Items  int
	Chunks int
}

type ChunkError struct {
	Stats Stats
	Err   error
}

func (e *ChunkError) Error() string
func (e *ChunkError) Unwrap() error

type Chunk[In any, Out any] struct {
	Read    func(ctx context.Context, yield func(In, error) bool)
	Process func(in In) (Out, error)
	Write   func(ctx context.Context, items const []Out) error
	Size    int = 100
}

func (c Chunk[In, Out]) Run(ctx context.Context) (Stats, error)

type Queue[T any] struct {
	// unexported fields
}

func NewQueue[T any](workers int, capacity int, handle func(ctx context.Context, item T) error) *Queue[T]
func (q *Queue[T]) Start(ctx context.Context) error
func (q *Queue[T]) Stop(ctx context.Context) error
func (q *Queue[T]) Enqueue(ctx context.Context, item T) error

type Scheduler struct {
	// unexported fields
}

func (s *Scheduler) Every(name string, interval time.Duration, run func(ctx context.Context) error)
func (s *Scheduler) Skipped() uint64
func (s *Scheduler) Start(ctx context.Context) error
func (s *Scheduler) Stop(ctx context.Context) error

func Faults() []*fault.Error
```

## Requirements

### Scheduler

- A `*Scheduler` MUST satisfy `Part` in [app](app.md).
- `Every` MUST panic when `interval` is not positive.
- `Every` MUST panic when `Start` has returned nil.
- `Start` MUST return an error on a second call.
- `Start` MUST wait one `interval` before the first call of a run.
- `Start` MUST call that run again after each further `interval`.
- When the context passed to `Start` ends, the scheduler MUST stop its runs.
- A run that is still active at the next tick MUST be skipped.
- The scheduler MUST NOT keep a skipped tick for a later run.
- `Skipped` MUST count each skipped tick of every job.
- A run error MUST NOT stop later ticks of that job.
- A run error MUST be logged with message `job: run failed` and the job name.
- A run panic MUST NOT stop later ticks of that job.
- A run panic MUST be logged with message `job: run panicked` and the job name.
- `Stop` MUST cancel the run context.
- `Stop` MUST wait until the runs end or until `ctx` ends.
- When `ctx` ends first, `Stop` MUST return that context error.
- `Stop` before a successful `Start` MUST return nil.
- A cancelled runner MUST clear its job's busy mark.
- A runner MUST clear a busy mark only when its own `Start` set that mark.
- A pump that sees the end of the run context MUST NOT set or keep the job's busy mark.

### Queue

- A `*Queue` MUST satisfy `Part` in [app](app.md).
- `Enqueue` MUST block while the queue is full.
- When `ctx` ends while the queue is full, `Enqueue` MUST return that context error.
- `Enqueue` before `Start` MUST return `job: queue closed`.
- `Enqueue` after `Stop` MUST return `job: queue closed` without waiting.
- `Start` MUST return an error on a second call.
- Cancel of the `Start` context MUST NOT discard items that `Enqueue` accepted.
- `Stop` MUST run the handle function for each accepted item that is still waiting.
- When `ctx` ends before the handlers return, `Stop` MUST return that context error.
- After that timeout, the handler context MUST end.
- A handler error MUST NOT stop the queue.
- A handler error MUST be logged with message `job: handle failed`.
- A handler panic MUST NOT stop the queue.
- A handler panic MUST be logged with message `job: handle panicked`.
- `Stop` before `Start` MUST return nil.
- `Start` after `Stop` MUST return `job: queue stopped`.
- `Stop` before `Start` MUST prevent a later `Start`.

### Chunk

- A `Size` below 1 MUST act as 100.
- `Run` MUST call `Write` when the open batch reaches `Size`.
- `Run` MUST call `Write` for a shorter batch after `Read` ends.
- `Stats.Items` MUST count the items in `Write` calls that returned nil.
- `Stats.Chunks` MUST count those `Write` calls.
- A read error MUST stop the run before `Write` of the open batch.
- `Run` MUST pass its context to `Read`.
- `Run` MUST stop before the next item when its context has ended.
- A `Read` that ignores its context MAY delay `Run` until it yields or returns.
- A process error MUST stop the run before `Write` of the open batch.
- A write error MUST stop the run.
- A write error MUST NOT cause another `Write` call.
- When `ctx` has ended, `Run` MUST NOT call `Write`.
- When `ctx` has ended after `Read` returns, `Run` MUST return the context error, also with no open batch.
- On a read, process or write error, the `Stats` result MUST be the zero value.
- On an ended context before `Write`, the `Stats` result MUST be the zero value.
- On each of those failures, the error MUST be the `job.chunk_failed` fault.
- `ChunkError.Stats` MUST count only batches that `Write` already accepted.
- `Unwrap` MUST return the cause that `errors.Is` matches.

### Code table

| Code | Kind | Message |
|---|---|---|
| `job.queue_closed` | unavailable | "The job queue is closed." |
| `job.queue_stopped` | canceled | "The job queue was stopped." |
| `job.scheduler_already_started` | internal | "The scheduler is already started." |
| `job.queue_already_started` | internal | "The queue is already started." |
| `job.chunk_failed` | internal | "The chunk job failed." |

## Errors

- Panic `job: Every "<name>": interval must be positive` when `interval` is not positive.
- Panic `job: Every "<name>": scheduler already started` when `Every` follows a successful `Start`.
- A second `Start` on a scheduler is the `job.scheduler_already_started` fault.
- Panic `job: NewQueue: workers must be at least 1` when `workers` is below 1.
- Panic `job: NewQueue: capacity must not be negative` when `capacity` is below 0.
- A second `Start` on a queue is the `job.queue_already_started` fault.
- `Enqueue` with no open queue returns the `job.queue_closed` fault.
- `Start` after `Stop` returns the `job.queue_stopped` fault.
- A read, process, write or context failure of `Run` is the `job.chunk_failed` fault. The `*ChunkError` cause carries the accepted `Stats` and the failure.

## Proof

- `TestEveryRejectsNonPositiveInterval` proves the panic for interval 0 and for a negative interval.
- `TestEveryAfterStartPanics` proves the panic after `Start`.
- `TestSchedulerTicksAtLeastThreeTimes` proves repeated ticks.
- `TestSchedulerLogsJobErrorAndKeepsTicking` proves that a run error is logged with the job name and that ticks continue.
- `TestSchedulerSkipsTicksDuringRun` proves the skip count and that a skipped tick is not kept.
- `TestSchedulerRecoversJobPanic` proves that a run panic is logged with the job name and that ticks continue.
- `TestQueueBackpressure` proves that a full queue waits and then returns the context deadline.
- `TestQueueDrainsAfterStartContextCancel` proves that cancel of the `Start` context does not drop accepted items.
- `TestQueueHandlerErrorDoesNotStopQueue` proves that a handler error does not stop the queue.
- `TestQueueRecoversHandlerPanic` proves that a handler panic does not stop the queue.
- `TestNewQueueRejectsBadWorkers` and `TestNewQueueRejectsNegativeCapacity` prove the two `NewQueue` panics.
- `TestQueueStopTimesOutWhenHandlerNeverReturns` proves the `Stop` deadline and the handler context end.
- `TestEnqueueAfterStopFails` proves the immediate `job.queue_closed` match after `Stop`.
- `TestStartTwiceFails` proves the `scheduler_already_started` and `queue_already_started` matches.
- `TestChunkWriteFailureStopsRun` proves the stop, the `job.chunk_failed` match, the `*ChunkError` stats from the cause, and the fault error text.
- `TestChunkSuccessStats` proves the item count, the chunk count and the final short batch.
- `TestChunkReadError` proves that a read error is a `job.chunk_failed` fault with zero stats before any write.
- `TestChunkPassesItsContextToRead` proves that `Read` sees the end of the context of `Run`.
- `TestChunkStopsBeforeNextItemAfterContextEnds` proves the stop before the next item.
- `TestChunkReportsAContextThatEndsWhileReadWaits` proves the fault when the context ends between batches.
- `TestQueueStopRacingStartLeavesNoLiveRun` proves that a `Start`/`Stop` race leaves no live queue.
- `TestSchedulerKeepsABusyMarkAgainstARunnerOfAnEarlierStart` proves that a runner of an earlier `Start` does not clear a later busy mark.
- `TestSchedulerRunsJobOnNextTickAfterRunnerCancelledBeforeTick` proves that a cancelled runner does not skip the next tick after a restart.
- `TestSchedulerSkipsWhileAnEarlierStartStillRuns` proves that a restart skips ticks while a timed-out stop leaves a run active.
- `TestSchedulerDoesNotLeakABusyMarkFromACancelledPump` proves that a pump cancelled during shutdown leaves no busy mark for a later start.
- `TestSchedulerCancelledTickDoesNotCountASkip` proves that a tick on an already cancelled context counts no skip while the job is busy.
- `TestSchedulerReclaimsTickSentBeforeCancel` proves that a pump cancelled after its send takes its tick back and leaves no busy mark.
- `TestSchedulerReleasesClaimWhenCancelWinsBeforeSend` proves that a pump cancelled before its send clears the claim it just made.
- `TestQueueClosedThroughEnqueueBeforeStart` and `TestQueueStoppedThroughStartAfterStop` prove the closed and stopped matches through `Enqueue` and `Start`.
- `TestChunkFailedThroughWriteError` proves the `job.chunk_failed` match, the stats on the cause, and that hostile input in the cause reaches no public view.
- `TestFaultsMatchSpecCodeTable` proves that `Faults` holds no duplicate and equals the code table.

## Not in scope

- The queue does not cross a process boundary. A broker needs a client that this module does not take.
