# ai/anthropic

Package `ai/anthropic` is the Anthropic provider. It implements [`ai.Model`](ai.md) over the Messages API.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Client struct {
	BaseURL   string
	Key       string
	HTTP      *http.Client
	Policy    resilience.Policy
	MaxTokens int
	MaxLine   int
	MaxStream int64
}

func (c *Client) Chat(ctx context.Context, req ai.Request) (ai.Reply, error)
func (c *Client) Stream(ctx context.Context, req ai.Request) iter.Seq2[ai.Chunk, error]

var ErrProviderRejected = fault.New("anthropic.provider_rejected", fault.Invalid, "The model provider rejected the request.")
var ErrProviderRateLimited = fault.New("anthropic.provider_rate_limited", fault.RateLimited, "The model provider rate limited the request.")
var ErrProviderError = fault.New("anthropic.provider_error", fault.Unavailable, "The model provider returned an error.")
var ErrProviderTooLarge = fault.New("anthropic.provider_too_large", fault.TooLarge, "The provider response is too large.")
var ErrProviderStreamCut = fault.New("anthropic.provider_stream_cut", fault.Unavailable, "The model provider stream was cut.")
var ErrInvalidRequest = fault.New("anthropic.invalid_request", fault.Invalid, "The model request is invalid.")
var ErrTooManyRedirects = fault.New("anthropic.too_many_redirects", fault.Unavailable, "The provider request failed.")
func Faults() []*fault.Error
```

`Key` is sent as the `x-api-key` header when it is not empty. `Policy` governs retries and the breaker. `MaxTokens` is the fallback for a request with no `MaxTokens`; the default is 4096. The provider requires `max_tokens`, so a fallback avoids a failing call, while the request value always wins. A stream line longer than `MaxLine` bytes (1 MiB when zero) or a stream longer than `MaxStream` bytes (64 MiB when zero) ends the stream with `anthropic.provider_too_large`.

## Requirements

- `Chat` MUST send `POST <BaseURL>/v1/messages` with `stream` false.
- `Stream` MUST send the same request with `stream` true.
- Every request MUST send the `anthropic-version` header with the value `2026-10-21`.
- Every request MUST send `x-api-key` when `Key` is not empty.
- `max_tokens` MUST be the request value when set, else `Client.MaxTokens`, else 4096.
- System messages MUST become the top-level `system` field, joined by a blank line.
- Tool results MUST go out as `tool_result` blocks in a message whose role is `user`.
- Tool arguments MUST be a JSON object on the wire and JSON text in `ai.ToolCall.Arguments`.
- A `thinking` block and a `thinking_delta` MUST become reasoning parts of the reply.
- A reasoning part of a request MUST NOT go out: the provider accepts a thinking block only with its signature.
- `Stream` MUST assemble `input_json_delta` fragments into one complete call at `content_block_stop`.
- The reply MUST take its `id`, `model` and `stop_reason` from the response.
- The finish value MUST come from `stop_reason` through [`ai.FinishOf`](ai.md).
- Usage MUST count `input_tokens` plus both cache token counts as the input.
- The stream MUST return at the `event: message_stop` line even when the body stays open.
- The stream MUST also return at a data record of type `message_stop`.
- A stream record that is not JSON MUST yield `anthropic.provider_stream_cut` and end the stream.
- A stream cut before `message_stop` MUST yield `anthropic.provider_stream_cut` and no reply.
- An `error` event MUST yield `anthropic.provider_stream_cut` with the parsed error type.
- Non-streamed calls MUST run under `resilience.Do` with the `Policy` field.
- `Chat` MUST end a 4xx answer other than 408 and 429 after one attempt.
- `Chat` MUST add no result to the breaker for that answer.
- `Chat` MUST retry a 500 answer as `anthropic.provider_error`.
- `Chat` MUST retry a 429 answer as `anthropic.provider_rate_limited`, after a valid `Retry-After`.
- `Stream` MUST retry a failing initial answer as `Chat` does.
- `Stream` MUST NOT make a second request after one event.
- `Stream` MUST arm an idle bound of `Policy.Timeout` after the initial answer succeeds.
- Ten seconds MUST be that bound when the timeout is not positive.
- Each read byte and line MUST reset that bound.
- An idle expiry MUST end the stream as `anthropic.provider_stream_cut`.
- A nonpositive `Policy.Timeout` MUST bound attempts at ten seconds.
- `Stream` MUST pause the idle bound while yielding a chunk.
- `Stream` MUST hold the next attempt for a valid `Retry-After`, within `Retry.Max`.
- A response body over 1 MiB MUST end the call as `anthropic.provider_too_large`.
- The body of a failing status MUST be cut at 1 MiB.
- A 4xx answer other than 408 and 429 MUST surface as `anthropic.provider_rejected`.
- A status fault cause MUST hold the status, the parsed error type and the body length.
- A status fault cause MUST NOT hold the body text or the key.
- The key MUST NOT appear in an error.
- `Chat` MUST keep a failing status when its body stops mid-read, with the read cause.
- `Stream` MUST keep a failing initial status when its body stops mid-read, with the read cause.
- The client MUST NOT send `x-api-key` to another origin after a redirect.
- A valid `Retry-After` MUST hold the next `Chat` attempt, within `Retry.Max`.
- An unparsable or negative `Retry-After` MUST keep the configured backoff.
- A wait past `Retry.Max` MUST be capped at it, and a large value MUST NOT overflow.
- A provider error type MUST reach the cause; the provider message MUST NOT.
- A tool block with no argument fragments MUST use its start input when it is a JSON object, else `{}`.
- The stream MUST keep each usage counter from the latest event that names it.
- A nonempty `Format` MUST go out as `output_config.format` with `type` `json_schema`.
- A `Format` that is not a JSON object MUST fail as `anthropic.invalid_request` before any request.
- A bad tool schema MUST fail as `anthropic.invalid_request` before any request.
 - Tool arguments and schemas MUST reach the wire as written, except that leading and trailing whitespace is trimmed.
 - Blank tool arguments MUST become `{}`.
 - Blank tool schemas MUST become `{"type": "object"}`.
- A body over 1 MiB cut by a read error MUST still end as the size limit error.
- Too many redirects MUST surface as `anthropic.too_many_redirects`.

### Code table

| Code | Kind | Message |
|---|---|---|
| `anthropic.provider_rejected` | invalid | The model provider rejected the request. |
| `anthropic.provider_rate_limited` | rate_limited | The model provider rate limited the request. |
| `anthropic.provider_error` | unavailable | The model provider returned an error. |
| `anthropic.provider_too_large` | too_large | The provider response is too large. |
| `anthropic.provider_stream_cut` | unavailable | The model provider stream was cut. |
| `anthropic.invalid_request` | invalid | The model request is invalid. |
| `anthropic.too_many_redirects` | unavailable | The provider request failed. |

## Errors

- `anthropic.provider_rejected` MUST surface for a 4xx answer other than 408 and 429.
- `anthropic.provider_rate_limited` MUST surface for a 429 answer.
- `anthropic.provider_error` MUST surface for a 5xx answer, a 408 answer and a transport failure.
- `anthropic.provider_too_large` MUST surface for a body over 1 MiB.
- `anthropic.provider_stream_cut` MUST surface for a cut stream, a broken record and an error event.
- `anthropic.invalid_request` MUST surface for a bad `Format` and a bad tool schema.
- `anthropic.too_many_redirects` MUST surface past ten redirect hops.

## Proof

- `TestChatReplies` proves the path, the two headers, the reply identity, the finish value, the usage sum and the text part.
- `TestChatRequestWithToolIsTheReferenceOracle` proves the request body against the reference JSON for a prompt with one tool.
- `TestChatRequestTurnsToolResultsIntoUserBlocks` proves the tool call and tool result wire forms and the `user` role.
- `TestDefaultMaxTokensIsSent` proves the 4096 fallback and the fallback of `Client.MaxTokens`.
- `TestSystemMessagesJoinIntoTheSystemField` proves the `system` field and that a blank system text is left out.
- `TestStreamCollectsTheReferenceReply` proves the collected plain stream, its text, usage and identity.
- `TestStreamToolCallAssemblesFragments` proves one complete call from the fragments.
- `TestStreamEndsAtMessageStopWhileTheBodyStaysOpen` proves the stream returns before the body closes.
- `TestCutStreamYieldsErrorChunkAndNoReply` proves the cut stream error and no reply.
- `TestStreamErrorEvent` proves the error event ends the stream as the stream cut fault with the parsed type.
- `TestStreamRecordThatIsNotJSONIsAnError` proves the decode error and that no chunk follows it.
- `TestStreamEndsAtAMessageStopRecordWithoutEventLines` proves the end at a `message_stop` data record while the body stays open.
- `TestThinkingBlockBecomesAReasoningPartAndIsNotSentBack` proves the reasoning part of a reply and that a request sends none.
- `TestStreamThinkingDeltasBecomeOneReasoningPart` proves the reasoning text of a stream.
- `TestBadRequestIsFinal` proves a 400 ends after one request as the provider rejection.
- `TestServerErrorIsRetried` proves a 500 is retried as the provider error.
- `TestRateLimitedIsRetried` proves a 429 is retried as the rate limited fault.
- `TestClientErrorAddsNoResultToTheBreaker` proves a 400 adds no breaker result.
- `TestBodyOverTheLimitIsFinal` proves the size limit fault ends the call.
- `TestFailingStatusBodyIsCutAtOneMiB` proves the failing body is cut and the detail keeps the status.
- `TestKeyNeverAppearsInError` proves the key stays out of errors.
- `TestChatBodyOverLimitWithCutConnectionIsFinal` proves the cut oversize body ends after one attempt.
- `TestTruncatedFailingBodyKeepsTheStatus` proves the status of a cut 400, the single attempt, the empty breaker sample and the read cause.
- `TestRedirectToAnotherOriginDropsTheKey` proves the key stops at the origin, and `TestRedirectOnTheSameOriginKeepsTheKey` proves it survives there.
- `TestRetryAfterHoldsTheNextAttempt` proves the second attempt waits out the advertised second.
- `TestEchoedKeyNeverAppearsInError` and `TestStreamErrorEventHidesTheKey` prove the key stays out of the rejected and stream faults.
- `TestStreamBareToolCallUsesTheStartInput` proves the empty object for a fragment-free tool block.
- `TestStreamDeltaKeepsEarlierCacheCounts` and `TestStreamCacheOnlyDeltaKeepsUncachedCounts` prove the held counters.
- `TestFormatGoesOutAsOutputConfig` and `TestFormatGoesOutOnTheStreamToo` prove the schema field in both modes.
- `TestFormatThatIsNotAnObjectIsAnError` proves the rejection before any request.
- `TestToolReplayKeepsLargeIntegersExact` proves the exact digits of a replayed large integer.
- `TestRetryAfterIsBoundedByTheRetryMaximum` proves the cap and the saturating parse.
- `TestRetryAfterLeavesACallerFaultFinal` proves a 400 stays final with `Retry-After`.
- `TestKeyStraddlingTheCutIsRedacted` proves the key stays out of the cut rejected fault.
- `TestStreamCarriesTheStartInputOfABareTool` and `TestStreamReplacesANonObjectStartInput` prove the seed rule.
- `TestPlainStreamFixtureEndsWithItsDataLine` proves the fixture is a verbatim replay.
- `TestStreamMakesOneAttemptOnAFailingStatus` proves a 400 stream answer ends after one request.
- `TestStreamCancelKeepsThePrefixAndTheCause` proves a stream cancel ends as the stream cut fault and keeps the cause.
- `TestStreamRetriesARateLimitedAnswerBeforeAnyEvent` proves a 429 stream answer is retried before any event.
- `TestStreamDoesNotRetryAfterOneEvent` proves no second request follows one yielded event.
- `TestStreamTruncatedFailingBodyKeepsTheStatus` proves a cut 400 stream body keeps the status and the read cause.
- `TestFaultsMatchSpecCodeTable` proves `Faults()` equals the code table above.
- `TestAdversarialSecretsStayOutOfPublicView` proves secrets and hostile input stay out of the public view.
- `TestBadToolSchemaIsAnInvalidRequest` proves a bad tool schema ends as the invalid request fault.
- `TestTooManyRedirectsEndAsUnavailable` proves eleven hops end as the redirects fault.
- No test needs a key or the network.

## Not in scope

- The vendor SDK. The package uses raw HTTP.
- Embeddings. The Messages API does not serve them.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
- `temperature`, `top_p` and `top_k`. The pinned API version removed them.
