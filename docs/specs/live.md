# live

Package `live` writes server events as HTML fragments. The caller passes a channel of events and gets a [web](web.md) stream.

## Interface

```lgo
type Event struct {
	Name string
	Body view.Node
}

func NewEvent(name string, body view.Node) (Event, error)
func Events(ctx *web.Context, events <-chan Event) web.Reply
```

## Requirements

- `NewEvent` MUST refuse a name that holds a line feed or a carriage return.
- `Events` MUST return a `Stream` whose content type is `text/event-stream`.
- The stream MUST follow the event rules in [wire-contract](wire-contract.md).
- The first write MUST be the heartbeat.
- Each later heartbeat MUST follow 15 seconds after the previous one.
- `Events` MUST render `Body` with [view](view.md) before it writes the event.
- Each output line of the body MUST be one `data:` field.
- `Events` MUST treat a carriage return in the body as a line break.
- The stream MUST end when the request context ends.
- The stream MUST end when the event channel closes.
- A render failure MUST end the stream.
- A write failure after the client is gone MUST NOT be returned.
- A write failure while the client is present MUST be returned.
- An event name with a line break MUST end the stream.
- That failure MUST write no `event:` line.

## Errors

- `live: event name %q contains a line break` when the name holds a line feed or a carriage return.
- `live: heartbeat: <cause>` when the heartbeat write fails while the client is present.
- `live: write heartbeat: <cause>` is the cause of that heartbeat error.
- `live: render event %q: <cause>` when `view.Render` fails for the body.
- `live: write event %q: <cause>` when the event write fails while the client is present.
- A write failure after the request context has ended is not returned.

## Proof

- `TestEventMessageWireForm` proves the `event:` line, one `data:` field per body line, and the carriage-return split.
- `TestEventTextEscapedAndNameRejected` proves the name error and that view escaping reaches the `data:` field.
- `TestHeartbeatRepeatsEveryFifteenSeconds` proves the first heartbeat and the 15 second gap, with a test clock.
- `TestClientDisconnectEndsStreamAndSubscription` proves that the stream ends and the subscription channel closes after the client disconnects. The oracle is the group join.
- `TestSlowStreamSubscriberLosesEventsFastKeepsAll` proves that a slow subscriber drops events and a fast subscriber keeps them.
- `TestRenderErrorEndsStreamLoggedOnce` proves that a render failure ends the stream and is logged once.
- `TestWriteFailureIsLoggedOnlyWhileTheClientIsPresent` proves the two write-failure rules.
- `TestWireCorpus` in `corpus_test.lgo` checks the event lines against `wire/corpus.jsonl`.

## Not in scope

- The package does not ship a browser client. The htmx SSE extension lives in [frontend](frontend.md).
