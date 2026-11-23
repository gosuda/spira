# gateway

Package `gateway` forwards each request to a fixed list of upstreams. The application author names the path, the upstream URLs and the stages. Each route is one path predicate plus stages, in one proxy, as in Spring Cloud Gateway.

## Interface

```lgo
type Route struct {
	Host        string?
	PathPrefix  string
	StripPrefix bool
	To          []string
	Stages      []web.Stage
}

func Mount(r *web.Router, routes []Route, policy resilience.Policy)

func Faults() []*fault.Error
```

## Requirements

### Registration

- `Mount` MUST register each route with an empty method, so one registration accepts every method.
- A prefix other than `/` MUST be registered as that path and as that path with a trailing slash.
- When the prefix already ends in a slash, the trailing slash variant MUST be skipped.
- A prefix of `/` MUST be registered as `/` only.
- When `Host` is set, the pattern MUST include that host.
- A request for another host MUST NOT select that route.
- A route with no `Host` MUST be registered with no host constraint.
- A path that continues the prefix without a slash, such as `/shopping` for `/shop`, MUST NOT select the route.
- A `PathPrefix` with `{`, `}` or `*` MUST be refused at registration.

### Forward

- The proxy MUST keep the request method.
- The proxy MUST keep the query string.
- When the upstream URL has a query, the proxy MUST send that query before the request query.
- The proxy MUST join those two queries with `&`.
- The proxy MUST keep the request body.
- The proxy MUST set `X-Forwarded-For` from the client address.
- The proxy MUST set `X-Forwarded-Host` from the inbound host.
- The proxy MUST set `X-Forwarded-Proto` from the inbound scheme.
- The proxy MUST NOT keep a client value for those three headers.
- The proxy MUST keep a caller header that is not one of those three.
- When `StripPrefix` is false, the tail MUST be the request path.
- Inside a `Group`, the mounted prefix MUST be the group prefix plus `PathPrefix`.
- Outside a `Group`, the mounted prefix MUST be `PathPrefix`.
- When `StripPrefix` is true, the tail MUST be the request path without the mounted prefix.
- When that remainder is empty, the tail MUST be `/`.
- Otherwise the stripped tail MUST start with `/`.
- When the stripped remainder starts with a slash, the tail MUST be that remainder.
- When the upstream base path is empty or `/`, the upstream path MUST be the tail.
- The proxy MUST join base and tail in escaped form and MUST derive the path from that join.
- The escaped join MUST always unescape; a failure panics as a programmer error.
- The proxy MUST cut the stripped suffix from the escaped request path and MUST match the prefix on decoded segments.
- The proxy MUST send the request to the upstream scheme and host.
- Each request MUST start at the next upstream in list order.
- After the last upstream, the next request MUST start at the first.
- Router stages MUST run before the route stages.
- Route stages MUST run in list order.
- The proxy MUST run after the route stages.
- A stage that returns a reply MUST NOT send the request to an upstream.
- Each route stage boundary MUST be settled as in [web](web.md).
- A route stage MUST read the upstream status from `ctx.Status()` after `next`.
- The proxy MUST NOT forward a client `Forwarded` header.
- The proxy MUST refuse a request whose escaped path holds a segment that decodes to `.` or `..`, alone or between encoded slashes, with the `gateway.dot_segment` fault (400), before any upstream sees it. RFC 3986 makes `%2e` equal to `.`, so an upstream that decodes and then removes dot segments would otherwise resolve such a path outside the mounted prefix or the upstream base path. A segment that does not decode MUST be refused the same way.

### Failure

- `Mount` MUST give each upstream its own breaker when `Policy.Breaker` is set.
- That copy MUST use the same `Window`, `FailureRate`, `OpenFor` and `Now`.
- A nil `Policy.Breaker` MUST leave the upstream with no breaker.
- `Mount` MUST NOT apply `Policy.Retry`.
- `Policy.Timeout` MUST bound the wait for response headers.
- `Policy.Timeout` MUST be measured from the start of the delivery: a response completed after the deadline counts as missed.
- When the response and the timeout settle together, the response MUST win.
- `Policy.Timeout` MUST NOT end the body read after the headers arrive.
- The proxy MUST write the first body chunk before the upstream finishes the body.
- The proxy MUST cancel the upstream request when the client context ends.
- A transport error MUST count as a failure of that upstream.
- An upstream status of 502, 503 or 504 MUST count as a failure of that upstream.
- Any other upstream status MUST pass through to the client.
- A passed-through status MUST NOT open the breaker.
- An open breaker MUST skip that upstream.
- A request with no body MUST try the later upstreams after a failure only when its method is idempotent: GET, HEAD, OPTIONS, TRACE, PUT or DELETE (RFC 9110 section 9.2.2). A bodyless POST or PATCH MUST stop after its first upstream, as a request with a body does.
- A request whose body is nil or `http.NoBody` MUST count as a request with no body.
- A request with a body MUST stop after its first upstream.
- A request whose body length is unknown MUST prove empty with one read under `Policy.Timeout`, whatever the method: end of stream counts as no body and the idempotent-method rule above decides whether it retries, and a byte counts as a body that is pushed back and stops after the first upstream.
- A wait that yields no byte and no end of stream MUST answer 502 without trying an upstream.
- When that wait ends without a byte, the gateway MUST end the blocked body read through `http.ResponseController.SetReadDeadline`, so that the 502 reaches the client while the client still holds the request body open.
- When every tried upstream fails, the proxy MUST answer 502.
- That answer MUST use the content type `application/problem+json`.
- The body MUST be the JSON encoding of a [web](web.md) problem with title `Bad Gateway` and status 502.
- The body MUST NOT contain an upstream address.
- A refusal MUST carry a fresh body for each client.
- Each failure that ends the upstream chain MUST be the `gateway.upstream_unavailable` fault.
- The 502 answer MUST carry the constant problem, not the cause text.
- Breaker admission and open duration MUST follow [resilience](resilience.md).

### Code table

| Code | Kind | Message |
|---|---|---|
| `gateway.upstream_unavailable` | unavailable | "The gateway could not reach an upstream." |
| `gateway.dot_segment` | invalid | "The request path holds a dot segment." |

## Errors

- `gateway: upstream answered <status>` is the cause of the `gateway.upstream_unavailable` fault for an upstream status of 502, 503 or 504. The client sees the 502 problem, not this text.
- `gateway: upstream headers exceeded <timeout>` is the cause of the `gateway.upstream_unavailable` fault when the headers miss `Policy.Timeout`. The client sees the 502 problem, not this text.
- `gateway: upstream answered without a response` is the cause of the `gateway.upstream_unavailable` fault when the transport returns no response and no error. The client sees the 502 problem, not this text.
- `gateway: route <prefix>: path prefix must start with /` when `PathPrefix` does not start with `/`.
- `gateway: route <prefix>: path prefix must not contain wildcards` when `PathPrefix` holds `{`, `}` or `*`.
- `gateway: route <prefix>: no upstream` when `To` is empty.
- `gateway: route <prefix>: upstream <raw> is not an absolute http or https URL` when an upstream is not an absolute `http` or `https` URL with a host.
- `gateway: encode bad gateway problem: <cause>` when the 502 problem body cannot be encoded.

## Proof

- `TestMethodBodyQueryAndHeaderArriveUnchanged` proves that method, body, query and a caller header arrive unchanged.
- `TestPrefixStrippedOrKeptByFlagAndShoppingNotRouted` proves strip, a kept prefix, and that `/shopping` does not select `/shop`.
- `TestUpstreamBasePathIsJoinedBeforeTheStrippedTail` proves the base-path join.
- `TestPercentEncodedPathArrivesEncoded` proves that an encoded slash stays encoded at a stripped tail start, at a base path end, and under an encoded prefix.
- `TestUpstreamQueryLeadsTheRequestQuery` proves the upstream query alone and joined with a request query.
- `TestForwardedHeadersHoldInboundValuesAndDropForgedOnes` proves the three forwarded headers and that a forged value is dropped.
- `TestUpstreamsTakeTurns` proves the rotation across the upstream list.
- `TestHostRouteMatchesOnlyItsHost` proves that a host route rejects another host.
- `TestMountInsideAGroupStripsTheGroupPrefixAndKeepsTheHost` proves strip and a host route inside a `Group`.
- `TestRouteStagesRunAfterRouterStagesBeforeTheProxy` proves the stage order.
- `TestStageAnswerKeepsTheRequestFromTheUpstream` proves that a stage reply does not reach an upstream.
- `TestSettledStagesLetTheProxyAnswer` proves that `web.Recover` and `web.AccessLog` as route stages let the upstream answer.
- `TestMountPanicsOnBadRoutes` proves the three registration panics.
- `TestMountRefusesWildcardPrefixButStripsLiteralNeighbor` proves that a wildcard prefix is refused and a literal neighbor still strips.
- `TestDeadUpstreamFailsOverForGetAndNeverReplaysPost` proves failover for a bodyless GET and no second try for a request with a body.
- `TestOpenBreakerSkipsItsUpstreamAndKeepsTheLiveOne` proves that an open breaker skips only its upstream.
- `TestBreakerRecoversThroughProbeWithSharedClock` proves probe recovery from the copied `Now`.
- `TestAllUpstreamsDeadAnswersProblemWithoutLeaking` proves the 502 problem and that the body names no upstream.
- `TestClientErrorsAndInternalErrorsPassThroughWithoutOpeningBreaker` proves that 404 and 500 pass through and do not open the breaker.
- `TestServiceUnavailableCountsAsFailedAndAnswersProblem` proves that status 503 counts as a failure.
- `TestTimeoutBeforeHeadersCountsAsFailed` proves that the header wait is bounded.
- `TestHeadersLateComparesCompletionAgainstDeadline` proves that a completion after the deadline counts as late and a completion at or before it does not.
- `TestClientCancelNeverReportsAHeaderTimeout` proves that a canceled client is never reported as a header timeout.
- `TestFirstChunkStreamsBeforeUpstreamFinishes` proves that the first chunk arrives before the upstream finishes.
- `TestClientCancelReachesUpstream` proves that a client cancel ends the upstream request.
- `TestSlashEndingPrefixServesSubpathsWithoutARedirect` proves that a prefix ending in a slash serves subpaths without a redirect.
- `TestStrippedTailStaysAnAbsolutePath` proves that a stripped tail stays an absolute path for the root prefix and for a prefix that ends in a slash.
- `TestTimeoutCauseNamesTheHeaderWait` proves that a missed header wait is reported as `gateway: upstream headers exceeded`.
- `TestBodyOutlivesTheHeaderTimeout` proves that the header timeout does not end the body read.
- `TestSharedRefusalBodyServesEveryConcurrentClient` proves that concurrent refusals each carry the full problem body.
- `TestMountLeavesARetryPolicyUntouched` proves that a retrying policy does not retry a POST.
- `TestClientForwardedHeaderNeverReachesTheUpstream` proves that a client `Forwarded` header does not ride along.
- `TestNilBreakerPolicyAddsNoBreaker` proves that a nil breaker leaves the upstream unguarded.
- `TestBodylessPostStopsAfterFirstUpstream` proves that a bodyless POST reaches exactly one upstream when that upstream fails.
- `TestBodylessGetAndDeleteFailOver` proves that a bodyless GET and a bodyless DELETE still fail over.
- `TestUnknownLengthEmptyBodyFailsOver` proves that an empty body of unknown length on a DELETE fails over.
- `TestUnknownLengthNonemptyBodyIsPreserved` proves that a nonempty body of unknown length reaches the upstream whole.
- `TestPeekEmptyFailsClosedOnStalledBody` proves that a stalled body of unknown length answers 502 without an upstream.
- `TestStalledBodyPeekAnswersWhileTheBodyStaysOpen` proves that a chunked request with no body byte gets its 502 within three seconds while the connection stays open.
- `TestPeekEmptyPushesBackReadyByte` proves that the empty-proof read hands the byte back.
- `TestCutEscapedSuffixKeepsOneLeadingSlash` proves that a stripped remainder starting with a slash keeps one leading slash.
- `TestBadGatewayThroughDeadUpstream` proves the fault match for a refused route and that the 502 answer names no upstream address.
- `TestBadGatewayRefusalHidesUpstreamSecrets` proves that an upstream error body with secrets and hostile input reaches neither the refusal nor the public view.
- `TestFaultsMatchSpecCodeTable` proves that `Faults` holds no duplicate and equals the code table.
- `TestDotSegmentsAreRefusedBeforeAnyUpstream` proves the 400 problem for encoded dot segments in every spelling, with and without `StripPrefix`, and that no upstream receives them.

## Not in scope

- A protocol switch is not supported. The proxy body is wrapped, so a WebSocket upgrade cannot pass through.
- The upstream list is fixed at `Mount`. The package has no discovery backend.
