# web

Package `web` routes HTTP and writes a closed set of replies. The application author registers handlers and stages in code. Values for one request ride on `Context`.

## Interface

```lgo
type Reply interface { Page | Fragment | Data | Redirect | Problem | Empty | Stream | Delegate }

type Page struct {
	Title  string
	Body   view.Node
	Status int
}

type Fragment struct {
	Body     view.Node
	Status   int
	Retarget string?
	Reswap   string?
	PushURL  string?
	Trigger  string?
}

type Data struct {
	Value  any
	Status int = 200
}

type Redirect struct {
	To     string
	Status int = 303
}

type Problem struct {
	Type     string = "about:blank" `json:"type,omitzero"`
	Title    string `json:"title,omitzero"`
	Status   int32  `json:"status,omitzero"`
	Detail   string `json:"detail,omitzero"`
	Instance string `json:"instance,omitzero"`
	Errors   validate.Errors `json:"errors,omitzero"`
}

type Empty struct {
	Status int = 204
}

type Stream struct {
	ContentType string
	Write       func(w io.Writer) error
}

type Delegate struct {
	To http.Handler
}

type Handler func(ctx *Context) (Reply, error)
type Stage func(next Handler) Handler

type RouteInfo struct {
	Method  string
	Pattern string
}

type Router struct {
	Layout      func(ctx *Context, p Page) view.Node
	ProblemView func(p Problem) view.Node?
	MaxBody     int64 = 1 << 20
	// unexported fields
}

func NewRouter() *Router
func (r *Router) Use(stages ...Stage)
func (r *Router) Group(prefix string, build func(g *Router))
func (r *Router) Handle(method string, pattern string, h Handler)
func (r *Router) Routes() const []RouteInfo
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request)

type Key[T any] struct {
	// unexported fields
}

func NewKey[T any](name string) *Key[T]
func Get[T any](ctx *Context, k *Key[T]) T?
func Set[T any](ctx *Context, k *Key[T], v T)

type Context struct {
	Request *http.Request
	// unexported fields
}

func (c *Context) Ctx() context.Context
func (c *Context) ResponseHeader() http.Header
func (c *Context) Status() int
func (c *Context) Htmx() Htmx

type Htmx struct {
	Request        bool
	Boosted        bool
	HistoryRestore bool
	Target         string
	Trigger        string
	CurrentURL     string
}

var RequestIDKey = NewKey[string]("web.request-id")

func Defaults() []Stage
func Recover() Stage
func RequestID() Stage
func AccessLog(log *slog.Logger) Stage
func CacheControl(directive string) Stage

type ProblemError struct {
	Problem Problem
}

func (e *ProblemError) Error() string
func Fail(p Problem) error

type Server struct {
	Addr              string = ":8080"
	Router            *Router
	ReadHeaderTimeout time.Duration = 5 * time.Second
	ShutdownGrace     time.Duration = 20 * time.Second
	// unexported fields
}

func (s *Server) Start(ctx context.Context) error
func (s *Server) Stop(ctx context.Context) error
```

## Requirements

### Routes and stages

- `Handle` MUST register `method` and `pattern` on `net/http.ServeMux`.
- `Handle` MUST panic when that pattern conflicts with a route already registered.
- `Handle` MUST panic when the pattern is malformed.
- The panic text for a conflict MUST name the pattern.
- `Use` MUST keep the stages in registration order.
- The first registered stage MUST be the outermost stage.
- `Group` MUST give the inner router the parent stages from the time of the call.
- A `Use` after `Group` MUST NOT apply to a route inside that group.
- `Routes` MUST list each route in registration order.
- A route inside a group MUST use the parent prefix plus the inner pattern.
- When the inner pattern starts with a host, the parent prefix MUST follow that host.
- The router MUST write a reply at the stage that returns it.
- The router MUST write an error at the stage that returns it.
- `next` MUST return `nil, nil`.
- A stage MUST read the written status from `Context.Status`.
- A stage that does not call `next` MUST NOT run the inner handler.
- A stage reply MUST be written when no status has been written yet.
- The router MUST drop a second reply when the response is already written.
- The router MUST NOT write an error body when the response is already written.
- An unmatched path MUST run the root stages.
- An unmatched path MUST then answer with the mux 404 handler.
- A wrong method MUST run the root stages.
- A wrong method MUST then answer with the mux 405 handler.
- The router MUST wrap the root stages for unmatched requests when `Use` runs on the root router.
- An unmatched request MUST NOT wrap a stage again.
- A request whose target is `*` and that matches no route MUST get the mux answer 400.
- That request MUST NOT get a redirect.
- A group stage MUST NOT run for a request that misses that group.
- `Delegate` MUST call `To.ServeHTTP` after the stages of that route.
- `Delegate` MUST pass a writer that unwraps to the response writer.

### Request values

- `Get` and `Set` MUST keep a value on the request that stored it.
- `Get` MUST return an absent value when the key was not set.
- `Get` and `Set` MUST use the key pointer, not the name string.
- `Htmx` MUST treat a non-empty header value as true.
- `Htmx.Request` MUST come from `HX-Request`.
- `Htmx.Boosted` MUST come from `HX-Boosted`.
- `Htmx.HistoryRestore` MUST come from `HX-History-Restore-Request`.
- `Htmx.Target` MUST come from `HX-Target`.
- `Htmx.Trigger` MUST come from `HX-Trigger`.
- `Htmx.CurrentURL` MUST come from `HX-Current-URL`.
- `ResponseHeader` MUST be the header map of the response.
- Before a write, `Status` MUST be 200.

### Replies

- A `Page` MUST follow the page rules in [wire-contract](wire-contract.md).
- A full page MUST call `Layout` on the root router.
- A `Page` or `Fragment` whose `Status` is 0 MUST use status 200.
- A `Page`, a `Fragment` and an HTML problem MUST use `text/html; charset=utf-8`.
- A full page with no `Layout` MUST answer 500.
- The router MUST run `view.CheckSlots` on a page or a fragment before it writes the status.
- When that check fails, the router MUST answer 500 and MUST NOT write a byte of the view.
- A `Fragment` MUST set `Vary` to `HX-Request`.
- A set `Retarget` MUST write `HX-Retarget`.
- A set `Reswap` MUST write `HX-Reswap`.
- A set `PushURL` MUST write `HX-Push-Url`.
- A set `Trigger` MUST write `HX-Trigger`.
- `Data` MUST encode `Value` with `encoding/json/v2`.
- `Data` MUST use content type `application/json`.
- An htmx request that is not boosted MUST answer 200 with `HX-Redirect`.
- Any other `Redirect` MUST set `Location` to `To`.
- Any other `Redirect` MUST use `Status`.
- A problem whose `Status` is 0 MUST use status 500.
- The problem comparison MUST use only `text/html`, `application/json` and `application/problem+json`.
- A missing or invalid `q` MUST count as 1.
- A `q` of 0 MUST lose.
- On an equal `q`, the earlier type MUST win.
- HTML MUST be used only when `text/html` wins and `ProblemView` returns a node.
- Every other problem MUST use `application/problem+json`.
- A set `ProblemView` MUST add `Vary: Accept` on every problem.
- An unset `ProblemView` MUST NOT add `Vary: Accept`.
- `Empty` MUST write `Status`.
- `Empty` MUST NOT write a body.
- `Stream` MUST set `ContentType`.
- `Stream` MUST use status 200.
- `Stream` MUST flush after each write to `Write`.
- A status outside 100 to 999 MUST panic in the writer.
- `Recover` MUST turn that panic into the internal problem.

### Stages and the server

- `Defaults` MUST be `Recover` and then `RequestID`.
- `Recover` MUST turn a handler panic into the internal problem.
- `Recover` MUST turn a `Layout` panic into the internal problem.
- The internal problem MUST use title `Internal Server Error` and status 500.
- The internal problem MUST NOT include the panic text or the error text.
- An unknown error MUST be logged as `web: handler failed`.
- `Fail` MUST be written as its problem, including a wrapped or joined error.
- `RequestID` MUST keep an inbound `X-Request-Id` of 1 to 64 allowed bytes.
- An allowed byte MUST be a letter, a digit, `.`, `_` or `-`.
- Any other inbound id MUST be replaced with 32 lowercase hex characters.
- `RequestID` MUST set the response header `X-Request-Id`.
- `RequestID` MUST store that id under `RequestIDKey`.
- `CacheControl` MUST set the directive only when the status is 200 to 299.
- `AccessLog` MUST log the method, the route, the status, the duration and the request id.
- The logged route MUST be the mux pattern, or the URL path when the pattern is empty.
- `Start` and `Stop` MUST be usable as an [app](app.md) part.
- `Start` MUST listen before it returns.
- A cancelled start context MUST NOT stop the server.
- `Stop` MUST wait for an in-flight request until `ShutdownGrace` ends.
- `Stop` MUST return at the caller deadline when that deadline is sooner.
- `Stop` MUST close open connections when shutdown times out.
- `Stop` of a server that is not started MUST return a nil error.

## Errors

- `web: page reply has no layout; set Router.Layout` is the detail of a full page with no `Layout`.
- `web: encode data reply: <cause>` when `Data` does not encode.
- `web: write data reply: <cause>` when the data body write fails.
- `web: encode problem: <cause>` when a problem does not encode.
- `web: write problem: <cause>` when the problem body write fails.
- `web: stream: <cause>` when `Stream.Write` fails.
- `web: render page body: <cause>`, `web: render page layout: <cause>`, `web: render fragment body: <cause>` and `web: render problem view: <cause>` when [view](view.md) fails.
- `web: request id entropy: <cause>` when the replacement id cannot be drawn.
- `web: server already started` when `Start` runs on a live server.
- `web: server needs a router` when `Router` is nil.
- `web: listen <addr>: <cause>` when the listen fails.
- `web: serve: <cause>` when `Serve` fails with an error other than `http.ErrServerClosed`.
- `web: shutdown: <cause>` when `Shutdown` fails. `Stop` then closes the listener and joins that error.
- `ProblemError.Error` returns `web: ` plus `Problem.Title`.
- A dropped second reply is logged as `web: reply dropped, the response is already written`.
- An encode or write failure of a reply is logged once as `web: reply write failed`, and the client gets the internal problem.
- An error after the response was written is logged as `web: error after the response was written`.

## Proof

- `TestPageReplyRespectsHtmxHeaders` proves the full page, the fragment and the boosted page, plus `Vary`.
- `TestStageOrderFollowsRegistration` and `TestStageAfterGroupSkipsInnerRoutes` prove stage order.
- `TestRedirectUnderHtmxAndPlain` proves `HX-Redirect` and `Location`.
- `TestFailWritesProblemMembers` and `TestJoinedProblemErrorsKeepTheProblem` prove problem members and a wrapped `Fail`.
- `TestUnknownErrorAndPanicStayHidden` proves that an unknown error and a panic omit their text.
- `TestPageWithoutLayoutIs500` proves the missing-layout detail.
- `TestProblemViewOnlyWhenAcceptPrefersHTML`, `TestProblemNegotiationTable` and `TestProblemVaryAcceptOnlyWithView` prove the Accept rules.
- `TestSetAndGetIsolatedPerRequest` and `TestGetOfUnsetKeyIsAbsent` prove per-request values.
- `TestRequestIDAcceptsValidAndReplacesInvalid` proves the id rules.
- `TestConflictingPatternPanics` proves that a second `Handle` of the same pattern panics and names it.
- `TestFragmentWritesHtmxHeaders` proves the four `HX-*` fragment headers.
- `TestDataReplyEncodesJSON` and `TestDataEncodeFailureAnswersProblem` prove JSON and the encode failure.
- `TestCacheControlSetsHeaderOnSuccessOnly` proves the 2xx limit.
- `TestAccessLogRecordsRequestFields` proves the log fields.
- `TestRoutesListsRegistrationOrder` proves route order, including a group prefix.
- `TestGroupPrefixFollowsTheHostOfAPattern` proves a host pattern inside a group.
- `TestStreamWritesAndFlushes` proves the stream body and the flush.
- `TestDelegateHandsEveryMethodToTheHandlerBehindTheStages` and `TestDelegateHijackUpgrade` prove `Delegate`, including a raw 101 upgrade.
- `TestStageSetsResponseHeaderOnEveryReply`, `TestStageReadsTheWrittenStatus`, `TestStageReplyWithoutNextIsWritten` and `TestStageProblemSetsStatusForOuterStages` prove the stage boundary.
- `TestProblemWithoutStatusAnswers500` and `TestInvalidReplyStatusBecomesProblemUnderRecover` prove status 0 and an invalid status.
- `TestLayoutPanicUnderRecoverIsProblem` proves a `Layout` panic.
- `TestBannedSlotAnswersProblemBeforeAnyPageByte` proves the slot check for a page, a page body and a fragment.
- `TestUnmatchedRequestsRunRootStages` proves the 404 and 405 path.
- `TestUnmatchedChainWrapsAStageOnlyAtUse` proves that an unmatched request wraps no stage and that a later `Use` still applies.
- `TestAsteriskTargetIsRejectedWithoutARedirect` proves the 400 for the request target `*`.
- `TestServerStopWaitsForInFlightRequest` proves that `Stop` waits for a live request.
- `TestSecondStartOnTakenPortFails` proves the listen error.
- `TestServerServesAfterStartContextCancel` proves that a cancelled start context does not stop the server.
- `TestServerStopReturnsWithinGraceWhenHandlerNeverReturns` proves the grace deadline.
- `TestServerStopReturnsByTheCallerDeadline` proves the caller deadline.
- `TestServerStopClosesOpenConnectionsWhenShutdownTimesOut` proves that a timed-out shutdown closes the request.

## Not in scope

- The package does not scan for handlers. The application calls `Handle`.
- Request values do not live in package-global state. They ride on `Context`, as the [module conventions](../../AGENTS.md) require.
