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
	In      schema.Schema
	Doc     Doc?
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
func (r *Router) Routes() []RouteInfo
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request)

type Doc struct {
	Summary string
	Returns []Response
}

type Response struct {
	Status int
	Body   schema.Schema?
}

func Route[In any](r *Router, method string, pattern string, h func(ctx *Context, in In) (Reply, error))
func Bind[In any](ctx *Context) (In, error)
func (r *Router) Describe(method string, pattern string, doc Doc)
func (r *Router) MountRoute(method string, pattern string, in schema.Schema, h Handler)

type BindCtx struct {
	Req      *http.Request
	Body     []byte
	Rejected *RejectLog
}

type FieldTags struct {
	Name   string
	Body   string
	Path   string
	Query  string
	Header string
	Form   string
	Cookie string
}

type BindSpec struct {
	Field    string
	Source   string
	Key      string
	Raw      string
	Present  bool
	Rejected *RejectLog
}

type StructBindState struct {
	Set    bool
	Failed bool
	Cause  string
	Bad    bool
}

var ErrBindInvalid = fault.New("web.bind_invalid", fault.Invalid, "The request is invalid.")

var ErrBindUnprocessable = fault.New("web.bind_unprocessable", fault.Unprocessable, "The request cannot be processed.")

var ErrBodyTooLarge = fault.New("web.body_too_large", fault.TooLarge, "The request body is too large.")

func Faults() []*fault.Error

func BindRecord[In any](ctx *Context, row *In) (In, error)
func BindProblem(base *fault.Error, errs validate.Errors) error
func BindBodyBytes(ctx *Context, req *http.Request, want bool, rejected *RejectLog) ([]byte, error)
func CheckBound(row any, errs validate.Errors, rejected *RejectLog) error
func BindStructField(dst any, name string, spec BindSpec, state *StructBindState)

type RejectLog struct {
	// unexported fields
}

func (l *RejectLog) Add(field string, rule string, cause string)
func (l *RejectLog) Empty() bool
func (l *RejectLog) Text() string
func LogRejected(rejected *RejectLog)
func unknownMember(err error) (string, bool)

func CountBody[In any]() int
func CountForm[In any]() int
func BindSources[In any](bctx BindCtx, row *In, errs *validate.Errors)
func BindBodies[In any](row *In, body []byte, errs *validate.Errors, rejected *RejectLog)
func BindOneField[F any](bctx BindCtx, dst *(F), tags FieldTags, errs *validate.Errors)
func BindStructBranch[F any](dst *(F), spec BindSpec, errs *validate.Errors)
func BindStructValue(dst any, spec BindSpec, state *StructBindState)
func BindLeafBranch(dst any, spec BindSpec, errs *validate.Errors)
func LookupSource(req *http.Request, source string, key string) (string, bool, error)
func lookupQuery(raw string, key string) (string, bool, error)
func ParseFormBody(ctx *Context, req *http.Request, want bool) error
func ReadBody(req *http.Request, max int64) ([]byte, error)
func BindJSONField(dst any, spec BindSpec, body []byte, errs *validate.Errors)
func SetStringAny(dst any, raw string) error
func SetPresentAny(dst any)
func BindPlain(dst any, spec BindSpec, errs *validate.Errors) bool
func bindPlainFloatTime(dst any, spec BindSpec, errs *validate.Errors) bool
func BindPlainInt(dst any, spec BindSpec, errs *validate.Errors) bool
func bindPlainIntNarrow(dst any, spec BindSpec, errs *validate.Errors) bool
func bindPlainIntWide(dst any, spec BindSpec, errs *validate.Errors) bool
func BindPlainUint(dst any, spec BindSpec, errs *validate.Errors) bool
func bindPlainUintNarrow(dst any, spec BindSpec, errs *validate.Errors) bool
func bindPlainUintWide(dst any, spec BindSpec, errs *validate.Errors) bool
func BindOption(dst any, spec BindSpec, errs *validate.Errors) bool
func bindOptionFloatTime(dst any, spec BindSpec, errs *validate.Errors) bool
func BindOptionInt(dst any, spec BindSpec, errs *validate.Errors) bool
func bindOptionIntNarrow(dst any, spec BindSpec, errs *validate.Errors) bool
func bindOptionIntWide(dst any, spec BindSpec, errs *validate.Errors) bool
func BindOptionUint(dst any, spec BindSpec, errs *validate.Errors) bool
func bindOptionUintNarrow(dst any, spec BindSpec, errs *validate.Errors) bool
func bindOptionUintWide(dst any, spec BindSpec, errs *validate.Errors) bool
func BindAbsentOption(dst any) bool
func BindAbsentMore(dst any) bool
func BindingTag(tags FieldTags) (string, string)
func RouteSchema[In any]() schema.Schema

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
func (c *Context) Wrote() bool
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
	TLS               *tls.Config?
	H2C               bool
	// unexported fields
}

func (s *Server) Start(ctx context.Context) error
func (s *Server) Serve(ctx context.Context, l net.Listener) error
func (s *Server) Stop(ctx context.Context) error
func TrackConn(ctx context.Context, conn net.Conn) (net.Conn, error)
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
- `Routes` MUST return a new slice on each call.
- `Routes` MUST copy each `Doc` response list.
- A caller MUST NOT change a schema that a route record holds.
- A route inside a group MUST use the parent prefix plus the inner pattern.
- When the inner pattern starts with a host, the parent prefix MUST follow that host.
- The router MUST write a reply at the stage that returns it.
- The router MUST write an error at the stage that returns it.
- `next` MUST return `nil, nil`.
- A stage MUST read the written status from `Context.Status`.
- `Context.Wrote` MUST report whether the status is written.
- A `Flush` on the response MUST mark the status as written with status 200 when the writer supports Flush.
- A successful `Hijack` MUST mark the response as written.
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
- An asterisk request MUST run the root stages.
- The router MUST answer an unmatched request with the handler chosen before the stages ran, except an asterisk target.
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
- `ResponseHeader` MUST be the header map of the response.
- Before a write, `Status` MUST be 200.
### Typed binding and routes

- `Bind` MUST read `path`, `query`, `header`, `form` and `cookie` tags.
- `Bind` MUST convert each present value to the field type.
- `Bind` MUST collect every field failure before it answers.
- `Bind` MUST keep `;` as data when it reads query values.
- A `form` field MUST bind from the form body when the request carries one, and from the query otherwise.
- `Bind` MUST parse a form body only for inputs with `form` fields.
- A form body that does not parse MUST fail the bind even when the query parses.
- `Bind` MUST apply `MaxBody` to a form body and answer 413 past the limit.
- A present value that does not decode MUST fail with rule `format`.
- `Bind` MUST leave untagged fields alone.
- `Bind` MUST decode one `body:"json"` field under `MaxBody`.
- `Bind` MUST reject an unknown JSON member in the body.
- `Bind` MUST answer 400 when any field fails.
- `Bind` MUST answer 413 when the body passes `MaxBody`.
- `Bind` MUST answer 422 when `Check` returns errors.
- A missing non-option value MUST fail with rule `required`.
- An absent option value MUST stay absent with no error.
- Field types MUST be string, bool, the int kinds, float64, `time.Duration`, named strings and their option forms.
- `Route` MUST set each top-level `Wire` to the binding-tag key.
- Each `Source` MUST name its source or stay empty.
- A `body` field MUST keep its JSON wire name.
- `Route` MUST store that schema in the `RouteInfo`.
- `Route` MUST run `Bind` before it calls the handler.
- `Describe` MUST attach the `Doc` to the named route.
- `Describe` MUST resolve the pattern against the calling router's group prefix.
- `Describe` MUST panic when the route is unknown.
- A field failure message MUST name only the field and the rule.
- An unknown JSON member MUST fail with rule `unknown`.

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
- `Recover` MUST re-panic `http.ErrAbortHandler` without a log line or a problem answer.
- `Recover` MUST turn a `Layout` panic into the internal problem.
- The internal problem MUST use title `Internal Server Error` and status 500.
- The internal problem MUST NOT include the panic text or the error text.
- An unknown error MUST be logged as `web: handler failed`.
- A fault that answers 500 or above MUST be logged as `web: handler failed`.
- `Fail` MUST be written as its problem, including a wrapped or joined error.
- `ProblemError.Error` MUST return `web: ` plus `Problem.Title`.
- The answer status MUST be 400 for `invalid`, 422 for `unprocessable` and 401 for `unauthenticated`.
- The answer status MUST be 403 for `forbidden`, 404 for `not_found` and 409 for `conflict`.
- The answer status MUST be 413 for `too_large`, 429 for `rate_limited` and 499 for `canceled`.
- The answer status MUST be 504 for `timeout`, 503 for `unavailable` and 500 for `internal`.
- A fault wrapped under `fmt.Errorf` and a fault joined under `errors.Join` MUST map by the outermost fault in the chain.
- The public view MUST carry the fault code and the constant message.
- The public view MUST NOT carry cause text, driver text or a submitted value.
- The body of a fault answer MUST use content type `application/problem+json`.
- `RequestID` MUST keep an inbound `X-Request-Id` of 1 to 64 allowed bytes.
- An allowed byte MUST be a letter, a digit, `.`, `_` or `-`.
- Any other inbound id MUST be replaced with 32 lowercase hex characters.
- `RequestID` MUST set the response header `X-Request-Id`.
- `RequestID` MUST store that id under `RequestIDKey`.
- `CacheControl` MUST set the directive only when the status is 200 to 299.
- `AccessLog` MUST log the method, the route, the status, the duration and the request id.
- `AccessLog` MUST log the request when the handler aborts the stream.
- The logged route MUST be the mux pattern, or the URL path when the pattern is empty.
- `Start` MUST listen before it returns.
- `Start` MUST listen on `Addr`, then serve the listener as `Serve` does.
- `Serve` MUST serve the caller listener instead of listening on `Addr`.
- `Serve` MUST take ownership of the listener when it succeeds.
- `Serve` MUST fail before serving and MUST NOT close the listener when the server is started, the router is nil, or `TLS` holds no certificate, `GetCertificate` or `GetConfigForClient`.
- A cancelled start context MUST NOT stop the server.
- The server MUST pass `OPTIONS *` to the router.
- `Stop` MUST wait for an in-flight request until `ShutdownGrace` ends.
- `Stop` MUST return at the caller deadline when that deadline is sooner.
- `Stop` MUST close open connections when shutdown times out.
- `Stop` MUST close each connection that a handler took over through `Hijack`.
- `Stop` MUST close those connections after `Shutdown` returns, also when shutdown times out.
- After that, a `Hijack` MUST fail and MUST close its connection.
- When a handler closes its upgraded connection, the server MUST forget that connection.
- A hijacked connection MUST support TCP half-close.
- `Stop` of a server that is not started MUST return a nil error.
- `TLS` MUST stay nil for cleartext or hold the server TLS config.
- When `TLS` is set, the server MUST serve HTTPS with TLS 1.3 as the minimum version.
- The minimum MUST also hold for a config returned by `GetConfigForClient`.
- `Start` MUST fail before binding when `TLS` holds no certificate, `GetCertificate` or `GetConfigForClient`.
- When `TLS` is set, the server MUST advertise `h2` and `http/1.1` through ALPN.
- `H2C` MUST stay false unless prior-knowledge cleartext HTTP/2 is wanted.
- When `H2C` is true, the server MUST accept prior-knowledge cleartext HTTP/2.
- When `H2C` is false, a prior-knowledge preface MUST NOT become an HTTP/2 session.
- `Stop` MUST end HTTP/2 streams within `ShutdownGrace` like HTTP/1.1 connections.
- `TrackConn` MUST return the tracked connection when the context comes from the server.
- `TrackConn` MUST return the same connection when the context holds no server state.
- Extended CONNECT over HTTP/2 MUST stay unbuilt in this toolchain.

### Code table

| Code | Kind | Message |
|---|---|---|
| `web.bind_invalid` | invalid | The request is invalid. |
| `web.bind_unprocessable` | unprocessable | The request cannot be processed. |
| `web.body_too_large` | too_large | The request body is too large. |

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
- `web: server TLS needs a certificate` when `TLS` holds no certificate, `GetCertificate` or `GetConfigForClient`.
- `web: listen <addr>: <cause>` when the listen fails.
- `web: serve: <cause>` when `Serve` or `ServeTLS` fails with an error other than `http.ErrServerClosed`.
- `web: shutdown: <cause>` when `Shutdown` fails. `Stop` then closes the listener and joins that error.
- `web: server is stopping` when a handler calls `Hijack` or `TrackConn` after `Stop` closed the upgraded connections.
- `web: close upgraded connection: <cause>` when `Stop` cannot close an upgraded connection.
- `web: CloseRead not supported by the underlying connection` when the taken-over connection lacks a read half-close, and the same text with `CloseWrite` for the write side. Callers MUST check the returned error: the methods exist on every hijacked connection, so a type assertion alone reports support.
- `web: encode fault` when a fault view does not encode.
- `web: write fault` when a fault body write fails.
- A dropped second reply is logged as `web: reply dropped, the response is already written`.
- An encode or write failure of a reply is logged once as `web: reply write failed`, and the client gets the internal problem.
- An error after the response was written is logged as `web: error after the response was written`.
- `web: bind form cannot be read` when the form does not parse.
- `web: bind body is larger than the limit` when the body passes `MaxBody`.
- `web: bind body is not valid JSON for this request` when the body does not decode.
- `web: bind <name> is not a known field` with rule `unknown` and the member name as the field.
- `web: bind needs a struct input` when `In` is not a struct.
- `web: describe <method> <pattern>: no such route` panics when `Describe` names no route.

## Proof

- `TestPageReplyRespectsHtmxHeaders` proves the full page, the fragment and the boosted page, plus `Vary`.
- `TestStageOrderFollowsRegistration` and `TestStageAfterGroupSkipsInnerRoutes` prove stage order.
- `TestRedirectUnderHtmxAndPlain` proves `HX-Redirect` and `Location`.
- `TestFailWritesProblemMembers` and `TestJoinedProblemErrorsKeepTheProblem` prove problem members and a wrapped or joined fault.
- `TestInternalFaultIsLoggedOnce` proves that a 500 fault is logged once while a 409 fault stays quiet.
- `TestWrappedLegacyProblemKeepsTheProblem` proves that a wrapped `Fail` keeps its problem.
- `TestUnknownErrorAndPanicStayHidden` proves that an unknown error answers the fixed internal view and that both omit their text.
- `TestErrAbortHandlerAbortsACutStream` proves that a cut stream ends in a body read error.
- `TestAccessLogRecordsAnAbortedStream` proves the log record for an aborted stream.
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
- `TestWroteTurnsTrueWhenTheStatusIsWritten` proves `Context.Wrote` before and after `next`.
- `TestWroteTurnsTrueAfterADelegatedFlush` proves `Wrote` and `Status` after a delegated `Flush`.
- `TestWroteStaysFalseWhenTheWriterLacksFlush` proves `Wrote` stays false without Flush support.
- `TestWroteTurnsTrueAfterADelegatedHijack` proves `Wrote` after a delegated raw 101 upgrade.
- `TestProblemWithoutStatusAnswers500` and `TestInvalidReplyStatusBecomesProblemUnderRecover` prove status 0 and an invalid status.
- `TestLayoutPanicUnderRecoverIsProblem` proves a `Layout` panic.
- `TestBannedSlotAnswersProblemBeforeAnyPageByte` proves the slot check for a page, a page body and a fragment.
- `TestUnmatchedRequestsRunRootStages` proves the 404 and 405 path.
- `TestUnmatchedRequestKeepsTheHandlerChosenBeforeStages` proves that a stage rewrite keeps the unmatched handler.
- `TestAsteriskRequestURIUsesTheLiveMuxAnswer` proves the asterisk exception to the frozen classification.
- `TestUnmatchedChainWrapsAStageOnlyAtUse` proves that an unmatched request wraps no stage and that a later `Use` still applies.
- `TestAsteriskTargetIsRejectedWithoutARedirect` proves the 400 for the request target `*` and the root stage header.
- `TestServerStopWaitsForInFlightRequest` proves that `Stop` waits for a live request.
- `TestSecondStartOnTakenPortFails` proves the listen error.
- `TestStartWithoutTLSCertificateFailsAndFreesThePort` proves that a missing certificate fails `Start` before binding and leaves the port free.
- `TestStartWithDynamicCertificateConfigServes` proves that a dynamic certificate config still starts.
- `TestCloneTLSKeepsTheFloorOnDynamicConfigs` proves the TLS 1.3 floor on `GetConfigForClient` configs.
- `TestServerServesAfterStartContextCancel` proves that a cancelled start context does not stop the server.
- `TestServerAnswersOptionsAsteriskWith400` proves that `OPTIONS *` reaches the router.
- `TestServerStopReturnsWithinGraceWhenHandlerNeverReturns` proves the grace deadline.
- `TestServerStopReturnsByTheCallerDeadline` proves the caller deadline.
- `TestServerStopClosesOpenConnectionsWhenShutdownTimesOut` proves that a timed-out shutdown closes the request.
- `TestServerStopClosesAnUpgradedConnection` proves that `Stop` closes a connection that a handler took over.
- `TestServerStopClosesAnUpgradedConnectionAfterTheGrace` proves the same after a shutdown timeout, the `Hijack` error after `Stop`, and that the late socket ends closed.
- `TestServerForgetsAnUpgradedConnectionThatItsHandlerCloses` proves that a connection closed by its handler leaves the set.
- `TestUpgradedConnectionKeepsTCPHalfClose` proves the half-close of a hijacked connection.
- `TestUpgradedConnectionWithoutHalfCloseReportsNamedError` proves the named half-close errors when the peer lacks them.
- `TestTLSServesHTTP2` proves TLS serves HTTP/2 with ALPN `h2`.
- `TestH2CPriorKnowledgeServesHTTP2` proves prior-knowledge h2c serves HTTP/2 when `H2C` is true.
- `TestH2CRefusedWithoutField` proves prior-knowledge h2c is refused when `H2C` is false.
- `TestServerStopReturnsWithinGraceForH2WhenHandlerNeverReturns` proves the grace deadline for an h2 stream.
- `TestServerStopClosesH2StreamWhenShutdownTimesOut` proves a timed-out shutdown ends an h2 stream context.
- `TestTrackConnWithoutServerReturnsUntracked` proves `TrackConn` without server state returns the same connection.
- `TestRouteBindsTypedFields` proves path, query, header, cookie and form binding.
- `TestBindCollectsEveryFieldError` proves that one 400 lists every bad field.
- `TestBindRequiredFieldMissing` proves the `required` rule.
- `TestBindCheckerFailureAnswers422` proves the 422 answer and the pass-through.
- `TestBindUnknownJSONMemberRejected` proves an unknown member fails with rule `unknown` and its name.
- `TestBindUnknownJSONMemberNamesAreExact` proves exact names for empty and escaped unknown members.
- `TestBindHostileValueNeverEchoed` proves submitted values never reach the response.
- `TestBindDurationAndNamedString` proves durations and named strings.
- `TestRouteBindsBodyField` proves JSON body decoding.
- `TestBindBodyOverMaxBody` proves the 413 answer.
- `TestMalformedFormWithSemicolonQueryIsRejected` proves that a malformed form body fails even when the query parses.
- `TestSemicolonQueryAloneKeepsTheForm` proves that a semicolon query does not disturb a valid form.
- `TestFormFieldMissingFromBodyIsRequired` proves that a form field missing from the body fails instead of reading the query.
- `TestGetFormFieldsBindFromTheQuery` proves that form fields without a form body bind from the query.
- `TestJSONRouteSkipsFormParsing` proves that a JSON-only route leaves a form-labeled body unread.
- `TestFormBodyOverMaxBodyIsRejected` proves the 413 answer for an oversized form body.
- `TestMalformedOptionQueryValueIsAFieldError` proves that a malformed query value fails with rule `format` instead of absence.
- `TestRouteInfoCarriesSchemaAndDoc` proves the stored `Wire`, the stored `Source` and the attached `Doc`.
- `TestRoutesReturnsACopy` proves that mutating one call leaves the next call unchanged.
- `TestDescribeUnknownRoutePanics` proves the unknown-route panic.
- `TestDescribeInsideAGroupAttachesTheDoc` proves that `Describe` in a group finds the prefixed route.
- `TestRoutesDeepCopiesDocReturns` proves that mutating a returned `Doc` leaves the next call unchanged.
- `TestWebFaultsMatchSpecCodeTable` proves the declared set equals the code table.
- `TestFaultKindMapsToStatusAndCode` proves one status and public code per kind.
- `TestWrappedAndJoinedFaultsMapByOutermost` proves a wrapped or joined fault keeps its outermost fault.
- `TestFaultCauseNeverReachesClient` proves a wrapped cause never reaches the response.

## Not in scope

- The package does not scan for handlers. The application calls `Handle`.
- Request values do not live in package-global state. They ride on `Context`, as the [module conventions](../../AGENTS.md) require.
