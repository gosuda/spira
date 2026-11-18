# ai/session

Status: implemented. The SQL store is not in the tree yet.

Package `ai/session` keeps conversation history as an append-only event log. An application uses `Service` to create, append, expire and compact a session.
It uses `Remember` to wrap a model, so each call loads the history and records the turn.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type EventType string

const (
	EventMessage    EventType = "MESSAGE"
	EventCompaction EventType = "COMPACTION"
)

type Event struct {
	ID      string
	Session string
	At      time.Time
	Type    EventType
	Message ai.Message?
}

type Session struct {
	ID        string
	CreatedAt time.Time
	ExpiresAt time.Time
}

type Boundary struct {
	Summary []ai.Message
}

type Service struct {
	TTL time.Duration
	Now (func() time.Time)?

	store sync.Locked[memory]
}

func (s *Service) Find(id string) *Session?
func (s *Service) Ensure(id string) (*Session?, error)
func (s *Service) Events(ctx context.Context, id string) ([]Event, error)
func (s *Service) Active(ctx context.Context, id string) ([]ai.Message, error)
func (s *Service) LastN(ctx context.Context, id string, n int) ([]Event, error)
func (s *Service) Append(ctx context.Context, id string, version int64, events ...Event) (bool, error)
func (s *Service) Version(ctx context.Context, id string) (int64, error)
func (s *Service) Compact(ctx context.Context, id string, version int64, boundary Boundary) (bool, error)

func History(stored []ai.Message, request []ai.Message) []ai.Message
func LastUserOrTool(messages []ai.Message) ai.Message?
func Remember(s *Service, id string) ai.Layer

type Turn struct {
	Model   ai.Model
	Request ai.Request
	Limits  ai.Limits
}

func (s *Service) Run(ctx context.Context, id string, t Turn) (ai.Reply, error)
```

## Requirements

- `Service` MUST find or create a session by id.
- `Service` MUST keep the in-memory store inside `Service`.
- `Service` MUST expire a session by time.
- `Service` MUST free the expired sessions when it opens a session.
- `Service` MUST NOT look for expired sessions more than one time in each TTL.
- `Service` MUST append events with a compare-and-set on the event version.
- A stale version MUST return false, not an error.
- `Service` MUST reject a system message before the version check.
- `Service` MUST reject an event whose session does not match the id.
- `Service` MUST record a compaction as a boundary event plus one summary event per summary message.
- The active view MUST be the summary events of the newest boundary, then every message event after it.
- `LastN` MUST extend backward to the start of a turn.
- `LastN` MUST reject a count that is not positive.
- `History` MUST put system texts first.
- `History` MUST deduplicate system texts.
- `History` MUST drop blank system texts.
- `History` MUST NOT double the turn that a tool loop resends.
- `History` MUST keep a one-message request as new history.
- `LastUserOrTool` MUST return none for a request of system messages only.
- `History` MUST drop an assistant tool call that no following tool result answers.
- `Remember` MUST store the call message again when the request resumes it but the log lacks it.
- `History` MUST keep a stored call answerable to its result in true log order, not adjacent.
- `Service.Run` MUST take the unwrapped model in `Turn.Model`.
- `Service.Run` MUST refuse a `Turn.Model` that `Remember` or `Run` already wrapped.
- `Service.Run` MUST record every `ai.Run` turn that carries a direct tool, including a confirm resume.
- `Remember` MUST append the turn after an append that another call made during the call.
- `Remember` MUST append the turn to a new session when the session expires during the call.
- `Remember` MUST NOT store a call message that the log already holds.
- `Remember` MUST record once when nested inside other layers for the same session.
- `Service.Run` MUST run the tool loop through `Remember`.
- `Service.Run` MUST store a direct tool answer without another model call.
- `Service` MUST give each session generation its own version sequence.
- A stale version from an expired session MUST NOT append to the new session.
- `Service` MUST copy message parts on store and on read.
- `History` MUST keep only the result parts that answer the kept call.
- `Remember` MUST append the trailing user or tool message and the assistant reply after the call.
- `Remember` MUST append nothing when the call fails.
- `Remember` MUST append nothing when the caller stops the stream.
- `Remember` MUST append nothing when a stream fails after yielding chunks.
- A SQL store over `db` MUST serve SQLite, PostgreSQL, MySQL and SQL Server.
- The in-memory store MUST be a concrete type.

## Errors

- `Service` MUST return an error when an event carries a system message.
- `Service` MUST return an error when an append has no events.
- `Service` MUST return an error when an event names another session.
- `Service` MUST return an error when `LastN` gets a non-positive count.

## Proof

- `TestEnsureCreatesSessionWithTTL` proves creation, the TTL and `Find`.
- `TestEnsureReturnsSameSession` proves creation is idempotent.
- `TestFindReturnsNilForMissing` proves absence is an option.
- `TestAppendAndEventsInOrder` proves append order and the event view.
- `TestAppendStaleVersionReturnsFalse` proves the compare-and-set.
- `TestAppendSystemMessageRejectedBeforeVersion` proves the rejection precedes the version check.
- `TestConcurrentAppendsExactlyOneSucceeds` proves exactly one winner of two concurrent appends.
- `TestExpiryWithFakeClock` proves expiry uses the clock.
- `TestExpiredSessionsAreFreedWhenALaterSessionOpens` proves the store frees expired sessions and keeps the others.
- `TestLastNExtendsToTurnStart` proves the plain window.
- `TestLastNExtendsBackToTurnBoundary` proves the backward extension.
- `TestLastNCountsNonMessageEvents` proves non-message events count in the window.
- `TestLastNWithoutTurnStartIsPlainWindow` proves a log with no turn start keeps the window.
- `TestLastNLargerThanLogReturnsWholeLog` proves the whole log is the answer when it is short.
- `TestLastNMustBePositive` proves the count guard.
- `TestActiveViewWithoutBoundaryIsWholeLog` proves a log with no boundary is its own view.
- `TestCompactRecordsBoundary` proves the boundary and its summary events.
- `TestCompactStaleVersionReturnsFalse` proves the compare-and-set on compaction.
- `TestHistoryPutsSystemFirst` proves the system order.
- `TestHistoryDeduplicatesSystem` proves one copy per system text.
- `TestHistoryDropsBlankSystem` proves a blank system text is not sent.
- `TestHistoryDropsOrphanToolCall` proves an unanswered call is dropped.
- `TestHistoryDropsOrphanToolResult` proves a result with no call is dropped.
- `TestHistoryKeepsOnlyTheResultThatAnswersAStoredCall` proves a mixed tool message keeps one part.
- `TestHistoryDoesNotDoubleOverlap` proves a reloded call still overlaps.
- `TestHistoryLaterRoundPrependsOnlyWhatLoopDoesNotCarry` proves the loop round prepends nothing twice.
- `TestHistoryWithLoopsOwnHistoryOff` proves the loop tail alone still gets the history.
- `TestHistoryRequestSystemFirst` proves a request system text goes first.
- `TestHistorySingleMessageRequestNoOverlap` proves a repeated user message is new.
- `TestLastUserOrTool` proves the trailing message rules.
- `TestRememberChatAppendsUserAndReply` proves the chat record.
- `TestRememberChatLoadsHistory` proves the prompt carries the stored messages.
- `TestRememberChatFailedCallAppendsNothing` proves a failed chat records nothing.
- `TestRememberStreamAppendsOnce` proves one record per stream.
- `TestRememberStreamFailedCallAppendsNothing` proves a cut stream records nothing.
- `TestRememberStreamStoppedEarlyAppendsNothing` proves a stopped stream records nothing.
- `TestRememberStreamLateFailureAppendsNothing` proves a late stream failure records nothing.
- `TestRememberRecordsATurnBesideAConcurrentTurn` proves the turn follows a concurrent append.
- `TestRememberRecordsADirectToolAnswer` proves a direct answer reaches the next prompt.
- `TestRememberKeepsAResumedToolExchangeTogether` proves a resumed call keeps its result answerable in order.
- `TestRunStoresTheCallWithTheDirectResultAcrossAnExpiry` proves call and result store together across expiry.
- `TestRunRefusesAModelTheSessionAlreadyWrapped` proves the double-wrap refusal.
- `TestRunRecordsOnceWhenRememberHidesInsideSearch` proves nested layers record once.
- `TestCompactFromAnExpiredSessionCannotHideTheNewTurn` proves a stale compaction loses to the new turn.
- `TestRememberRestoresAResumedCallAfterExpiry` proves an expired session still replays the call.
- `TestAppendKeepsThePartsOfTheStoredMessage` proves an input edit leaves the stored parts alone.
- `TestActiveKeepsThePartsOfTheReturnedMessage` proves a read edit leaves the stored parts alone.

## Not in scope

- Deprecated chat memory repositories. Sessions replace them.
- Message window chat memory. Sessions replace it.
