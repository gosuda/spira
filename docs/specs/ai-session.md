# ai/session

Status: implemented.

Package `ai/session` keeps conversation history as an append-only event log. An application uses `Service` to create, append, expire and compact a session.
It uses `Remember` to wrap a model, so each call loads the history and records the turn. `SQLStore` keeps the same log in a database through `db`.
`Find` and `Ensure` bound each database call with a five second timeout. An unset TTL means 24 hours.

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

func (s *Service) Delete(ctx context.Context, id string) error

type Store interface {
	Ensure(id string) (*Session?, error)
	Find(id string) *Session?
	Events(ctx context.Context, id string) ([]Event, error)
	Active(ctx context.Context, id string) ([]ai.Message, error)
	LastN(ctx context.Context, id string, n int) ([]Event, error)
	Append(ctx context.Context, id string, version int64, events ...Event) (bool, error)
	Version(ctx context.Context, id string) (int64, error)
	Compact(ctx context.Context, id string, version int64, boundary Boundary) (bool, error)
	Delete(ctx context.Context, id string) error
}

type SQLStore struct {
	Pool *db.Pool
	TTL  time.Duration
	Now  (func() time.Time)?
}

func (s *SQLStore) Prepare(ctx context.Context) error
func (s *SQLStore) Ensure(id string) (*Session?, error)
func (s *SQLStore) Find(id string) *Session?
func (s *SQLStore) Events(ctx context.Context, id string) ([]Event, error)
func (s *SQLStore) Active(ctx context.Context, id string) ([]ai.Message, error)
func (s *SQLStore) LastN(ctx context.Context, id string, n int) ([]Event, error)
func (s *SQLStore) Append(ctx context.Context, id string, version int64, events ...Event) (bool, error)
func (s *SQLStore) Version(ctx context.Context, id string) (int64, error)
func (s *SQLStore) Compact(ctx context.Context, id string, version int64, boundary Boundary) (bool, error)
func (s *SQLStore) Delete(ctx context.Context, id string) error

func History(stored []ai.Message, request []ai.Message) []ai.Message
func LastUserOrTool(messages []ai.Message) ai.Message?
func Remember(s *Service, id string) ai.Layer

type Turn struct {
	Model   ai.Model
	Request ai.Request
	Limits  ai.Limits
}

func (s *Service) Run(ctx context.Context, id string, t Turn) (ai.Reply, error)

var ErrBlankID = fault.New("session.blank_id", fault.Invalid, "The session id must not be blank.")
var ErrIDTooLarge = fault.New("session.id_too_large", fault.TooLarge, "The id exceeds the 255-byte limit.")
var ErrEmptyBatch = fault.New("session.empty_batch", fault.Invalid, "The append batch is empty.")
var ErrSystemMessage = fault.New("session.system_message", fault.Invalid, "A system message is not stored.")
var ErrForeignEvent = fault.New("session.foreign_event", fault.Invalid, "The event names another session.")
var ErrInvalidCount = fault.New("session.invalid_count", fault.Invalid, "The count must be positive.")
var ErrAlreadyWrapped = fault.New("session.already_wrapped", fault.Invalid, "The model is already wrapped.")
var ErrContention = fault.New("session.contention", fault.Unavailable, "The session store is busy.")
var ErrStoredMessage = fault.New("session.stored_message", fault.Internal, "The stored message is invalid.")

func Faults() []*fault.Error
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
- `Service.Run` MUST refuse a `Turn.Model` that is directly a `Remember` or `Run` wrapper.
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
- `Store` MUST expose the nine session operations with the `Service` signatures.
- `SQLStore` MUST persist sessions and events through `db` only.
- `Prepare` MUST create `spira_sessions`, `spira_session_events` and their index, and run again without error.
- `Ensure` MUST open a session that `Append` accepts.
- Reads MUST order events by the sequence column, not the timestamp.
- Stored times MUST round-trip at nanosecond precision.
- A stale version MUST make `Append` return false and write nothing.
- `Delete` MUST remove one conversation and leave the others, on every store.
- Every part kind MUST round-trip with `Skipped` kept.
- Quotes and Unicode beyond the BMP MUST survive exactly.
- A hostile id MUST stay data and leave the table intact.
- A cancelled save MUST write nothing and keep the store usable.
- `LastN` on SQL MUST extend to the turn start.
- Conversations MUST stay isolated on every store.
- `Compact` MUST show only the summary and later messages as active.
- `Active` MUST return every message when no boundary exists.
- Statements MUST use `?` on SQLite and MySQL, `$n` on Postgres and `@pn` on MSSQL.
- Reads MUST use `LIMIT` on SQLite, Postgres and MySQL.
- Reads on MSSQL MUST use `FETCH`.
- Each engine case MUST fail naming its DSN variable when it is not set.
- `Find` MUST return none after `Delete`.
- `Version` MUST return zero after `Delete`.
- `Ensure` MUST reject a blank id.
- `Append` MUST reject a system message before any version check.
- `Append` MUST reject an empty batch.
- `Append` MUST reject an event of another session.
- `LastN` MUST reject a non-positive count on every store.
- `Compact` with a stale version MUST return false on every store.
- `Find` MUST return the live session with its times.
- `Ensure` MUST return the live session unchanged.
- `Delete` MUST succeed for a missing session.
- An input edit MUST NOT reach the stored parts.
- A read edit MUST NOT reach the next read.
- An expired session MUST be unfound, unread and version zero.
- `Ensure` past expiry MUST start a new generation.
- The old version MUST NOT append to the new generation.
- `SQLStore` MUST expire a session after 24 hours by default.
- `SQLStore` MUST keep a session just inside its TTL.
- `SQLStore` MUST honor a set TTL.
- Ids that differ only by a trailing space MUST name different conversations.
- `Ensure` MUST claim a missing or expired session in one atomic step.
- A claim that loses to another opener MUST return the live session and write nothing.
- Session keys MUST treat trailing spaces as significant on every engine.
- `Ensure` MUST reject an id longer than 255 bytes with an error that names the limit.
- `Ensure` MUST accept an id of exactly 255 bytes on every engine.
- `Append` MUST reject an id longer than 255 bytes with an error that names the limit.
- `Append` MUST reject an event with an id longer than 255 bytes with an error that names the limit.
- Session and event ids MUST share one 255-byte limit on every engine.
- Reads and `Delete` MUST treat an id longer than 255 bytes as a missing session.
- `Delete` MUST retire the session row before it clears the events of that session.
- `Service` and `SQLStore` MUST share one validation fault per bad batch.
- A blank id MUST map to `session.blank_id` with no id in the message.
- An id over 255 bytes MUST map to `session.id_too_large` on every store.
- An empty batch MUST map to `session.empty_batch`.
- A system message MUST map to `session.system_message` before any version check.
- An event of another session MUST map to `session.foreign_event` with both ids in the cause.
- A non-positive count MUST map to `session.invalid_count` on every store.
- A double-wrapped model MUST map to `session.already_wrapped`.
- A claim that fails eight times MUST map to `session.contention`.
- A stored message that is not JSON or holds an unknown part MUST map to `session.stored_message`.
- Storage failures MUST pass the `db` fault through with the operation name.
- A tool loop failure MUST pass the `ai` fault through with the run name.
- Public views MUST NOT carry ids, message text, SQL text or driver text.

### Code table

| Code | Kind | Message |
|---|---|---|
| `session.already_wrapped` | invalid | The model is already wrapped. |
| `session.blank_id` | invalid | The session id must not be blank. |
| `session.contention` | unavailable | The session store is busy. |
| `session.empty_batch` | invalid | The append batch is empty. |
| `session.foreign_event` | invalid | The event names another session. |
| `session.id_too_large` | too_large | The id exceeds the 255-byte limit. |
| `session.invalid_count` | invalid | The count must be positive. |
| `session.stored_message` | internal | The stored message is invalid. |
| `session.system_message` | invalid | A system message is not stored. |

## Errors

- `Service` MUST return an error when an event carries a system message.
- `Service` MUST return an error when an append has no events.
- `Service` MUST return an error when an event names another session.
- `Service` MUST return an error when `LastN` gets a non-positive count.
- `SQLStore` MUST return an error for an unknown stored part kind.
- `SQLStore` MUST return an error for a stored message that is not JSON.
- Validation paths MUST return session faults with secrets only in the cause.
- Storage paths MUST return the `db` fault with the operation name.
- `Ensure` contention MUST map to `session.contention` after eight attempts.
- Unknown and expired sessions MUST stay absent with no error code.
- `Run` with a wrapped model MUST map to `session.already_wrapped`.
- Stored message failures MUST map to `session.stored_message` with the detail in the cause.
- Database failures MUST keep matching their `db` fault with `errors.Is`.
- `lockConflict` MUST match the driver text through the fault chain.

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
- `TestEngineSessionContractSQLite` proves the contract on SQLite with a repeated `Prepare`.
- `TestEngineSessionContractMemory` proves the contract on the in-memory store.
- `TestEngineSessionContractPostgres` proves the contract on PostgreSQL, failing without `SPIRA_TEST_POSTGRES_DSN`.
- `TestEngineSessionContractMySQL` proves the contract on MySQL, failing without `SPIRA_TEST_MYSQL_DSN`.
- `TestEngineSessionContractMSSQL` proves the contract on SQL Server, failing without `SPIRA_TEST_MSSQL_DSN`.
- `contractAppendOrdersBySequence` proves insertion order under equal timestamps on every store.
- `contractLastNExtendsToTurnStart` proves the turn-start extension and the count guard on every store.
- `contractConversationsStayIsolated` proves conversation isolation on every store.
- `contractDeleteFreesOneConversation` proves delete frees and recreates one conversation on every store.
- `contractEveryPartKindRoundTrips` proves every part kind round-trips on every store.
- `contractQuotesAndUnicodeSurvive` proves quotes and Unicode survive on every store.
- `contractHostileIDStaysData` proves a hostile id stays data on every store.
- `contractCancelledSaveWritesNothing` proves a cancelled save writes nothing on every store.
- `contractStaleVersionLoses` proves a stale version loses on every store.
- `contractCompactShapesTheActiveView` proves compaction shapes the active view on every store.
- `TestStoredPartsRoundTrip` proves every part kind, nil parts, the unknown kind and broken JSON.
- `TestSessionStatementsUsePlaceholders` proves the per-dialect placeholders, limits and key comparisons.
- `contractBlankIDIsRejected` proves the blank id error on every store.
- `contractAppendValidationsRejectBadBatches` proves the three bad batches on every store.
- `contractLastNMustBePositive` proves the count guard on every store.
- `contractCompactStaleVersionLoses` proves a stale compaction loses on every store.
- `contractFindReturnsTheLiveSession` proves Find returns the live session on every store.
- `contractEnsureLiveSessionKeepsVersion` proves a live Ensure changes nothing on every store.
- `contractDeleteMissingSessionSucceeds` proves a missing delete succeeds on every store.
- `contractInputEditLeavesStoredPartsAlone` proves input edits stay out on every store.
- `contractReadEditLeavesReturnedPartsAlone` proves read edits stay out on every store.
- `contractDefaultTTLCoversADay` proves the 24 hour boundary on every store.
- `contractCustomTTLCoversAMinute` proves a set TTL on every store.
- `contractTrailingSpaceIDsStayIsolated` proves trailing-space isolation on every store.
- `contractDeleteThenRecreateRefusesTheOldVersion` proves a deleted version stays dead on every store.
- `contractOverlongIDIsRefused` proves the id byte limit on every store.
- `TestEngineSessionClaimAdmitsOneWinner` proves one claim wins on PostgreSQL, MySQL and SQL Server, failing without its DSN. `TestSessionClaimAdmitsOneWinnerSQLite` proves it on SQLite.
- `TestEngineDeleteClearsAConcurrentAppend` proves a concurrent append leaves no rows after `Delete` on PostgreSQL, MySQL and SQL Server, failing without its DSN. `TestSessionDeleteClearsAConcurrentAppendSQLite` proves it on SQLite.
- `TestEngineSQLiteConcurrentEnsureOpensOneSession` proves two overlapping opens on SQLite share one session.
- `TestRememberNestedSameSessionRecordsOnce` proves nested layers record once.
- `TestSessionFaultsMatchSpecTable` proves the declared faults match the code table. Planted fault: a code missing from the table.
- `TestSessionFaultBlankID` proves the blank id fault through `Ensure`. Planted fault: comparing the error text.
- `TestSessionFaultIDTooLarge` proves the id limit fault for sessions and events. Planted fault: naming the byte count.
- `TestSessionFaultEmptyBatch` proves the empty batch fault through `Append`. Planted fault: accepting zero events.
- `TestSessionFaultSystemMessage` proves the system message fault before the version check. Planted fault: storing the message.
- `TestSessionFaultForeignEvent` proves the foreign event fault with ids in the cause. Planted fault: echoing an id.
- `TestSessionFaultInvalidCount` proves the count fault through `LastN`. Planted fault: allowing a zero window.
- `TestSessionFaultAlreadyWrapped` proves the wrapped model fault through `Run`. Planted fault: running the wrapped model.
- `TestSessionFaultContention` proves the contention fault after eight failed claims. Planted fault: retrying forever.
- `TestSessionFaultStoredMessage` proves the stored message fault for broken JSON and unknown parts. Planted fault: decoding the row.
- `TestSessionFaultDBPassthrough` proves storage failures keep the `db` fault. Planted fault: replacing it with a session code.
- `TestSessionFaultAdversarialNoLeak` proves hostile ids and text stay out of public views. Planted fault: leaking a secret.

## Not in scope

- Deprecated chat memory repositories. Sessions replace them.
- Message window chat memory. Sessions replace it.
