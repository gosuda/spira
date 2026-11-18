# bus

Package `bus` fans one value out to in-process subscribers. `Publish` does not block the caller.

## Interface

```lgo
type Topic[T any] struct {
	// unexported fields
}

func NewTopic[T any](buffer int) *Topic[T]
func (t *Topic[T]) Publish(v T)
func (t *Topic[T]) Subscribe(ctx context.Context) <-chan T
func (t *Topic[T]) Dropped() uint64
```

## Requirements

- `NewTopic` MUST panic when `buffer` is below 0.
- `Subscribe` MUST give the caller a channel of `buffer` capacity.
- `Publish` MUST offer the value to each subscriber.
- `Publish` MUST NOT block.
- When the channel is full, `Publish` MUST drop that value for that subscriber.
- `Dropped` MUST count each dropped delivery.
- A subscriber that keeps reading MUST receive a value that another subscriber drops.
- `Subscribe` MUST remove the subscriber when `ctx` ends.
- `Subscribe` MUST close the channel after that removal.
- A later `Publish` MUST NOT send on the closed channel.

## Errors

- `NewTopic` panics with `bus: negative buffer` when `buffer` is below 0.

## Proof

- `TestNewTopicRejectsNegativeBuffer` proves the panic text.
- `TestSlowSubscriberLosesEventsAndFastReceivesAll` proves that a full subscriber keeps only its buffer and a fast subscriber receives every value.
- `TestPublishNeverBlocksWithFullSubscriber` proves that 1000 publishes to a full channel of capacity 0 return without a wait and set `Dropped` to 1000.
- `TestConcurrentPublishersDeliverEveryEvent` proves that four publishers of 250 values each are all delivered once when the buffer holds them.
- `TestChannelClosesWhenContextEnds` proves that the channel closes after `ctx` ends and a later publish does not panic.

## Not in scope

- The package does not send to a broker. [scope-and-lexicon](scope-and-lexicon.md) names that limit.
