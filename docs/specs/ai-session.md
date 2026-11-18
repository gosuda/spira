# ai/session

Status: specified; the package is not in the tree yet.

Package `ai/session` keeps conversation history as an append-only event log. The application author uses `Service` to find, append, expire and compact sessions, and `Remember` to wrap a model.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Service struct {
	// unexported fields
}

func Remember(s *Service, id string) Layer
func History(...)
```

## Requirements

- `Service` MUST find or create a session by id.
- `Service` MUST append events with a compare-and-set on the event version.
- A stale version MUST return false, not an error.
- `Service` MUST reject a system message before the version check.
- `Service` MUST expire a session by time.
- `Service` MUST compact a session.
- The active view MUST be the message events after the newest compaction boundary.
- `LastN` MUST extend backward to the start of a turn.
- `LastN` MUST NOT return a tool result without its call.
- `History` MUST put system texts first.
- `History` MUST deduplicate system texts.
- `History` MUST drop blank system texts.
- `History` MUST drop orphan tool messages.
- `History` MUST NOT double the turn that the loop resends.
- `Remember` MUST load history before the call.
- `Remember` MUST append the trailing user or tool message and the assistant reply after the call.
- `Remember` MUST append once on a stream, on the collected reply.
- The in-memory store MUST be a concrete type.
- The SQL store MUST run over `db` for SQLite, PostgreSQL, MySQL and SQL Server.
- The store interface MUST exist because two implementations exist.

## Errors

- The package MUST return an error when events contain a system message.
- The package MUST return the store error when a store call fails.

## Proof

- The `SessionMemoryTests` cases prove the session memory rules.
- The `EventFilterTests` cases prove the event filter rules.
- Two appends at one version MUST have exactly one return true.

## Not in scope

- Deprecated chat memory repositories. Sessions replace them.
- Message window chat memory. Sessions replace it.
