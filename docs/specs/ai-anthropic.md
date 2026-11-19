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
}

func (c *Client) Chat(ctx context.Context, req ai.Request) (ai.Reply, error)
func (c *Client) Stream(ctx context.Context, req ai.Request) iter.Seq2[ai.Chunk, error]
```

`Key` is sent as the `x-api-key` header when it is not empty. `Policy` governs retries and the breaker. `MaxTokens` is the fallback for a request with no `MaxTokens`; the default is 4096. The provider requires `max_tokens`, so a fallback avoids a failing call, while the request value always wins.

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
- A stream record that is not JSON MUST yield an error and end the stream.
- A stream cut before `message_stop` MUST yield an error chunk and no reply.
- An `error` event MUST yield an error naming the error type and message.
- Non-streamed calls MUST run under `resilience.Do` with the `Policy` field.
- `Chat` MUST end a 4xx answer other than 408 and 429 after one attempt.
- `Chat` MUST add no result to the breaker for that answer.
- `Chat` MUST retry a 500 answer.
- `Chat` MUST retry a 429 answer, after a valid `Retry-After`.
- `Stream` MUST retry a failing initial answer as `Chat` does.
- `Stream` MUST NOT make a second request after one event.
- `Stream` MUST hold the next attempt for a valid `Retry-After`, within `Retry.Max`.
- A response body over 1 MiB MUST end the call with the size limit error.
- The body of a failing status MUST be redacted and then cut at 1 MiB.
- An error MUST name the package, the status and the body as `ai/anthropic: <status>: <body>`.
- The key MUST NOT appear in an error.
- `Chat` MUST keep a failing status when its body stops mid-read, with the partial body and the read cause.
- `Stream` MUST keep a failing initial status when its body stops mid-read, with the partial body and cause.
- The client MUST NOT send `x-api-key` to another origin after a redirect.
- A valid `Retry-After` MUST hold the next `Chat` attempt, within `Retry.Max`.
- An unparsable or negative `Retry-After` MUST keep the configured backoff.
- A wait past `Retry.Max` MUST be capped at it, and a large value MUST NOT overflow.
- An error body that echoes the key MUST carry it redacted.
- A tool block with no argument fragments MUST use its start input when it is a JSON object, else `{}`.
- The stream MUST keep each usage counter from the latest event that names it.
- A nonempty `Format` MUST go out as `output_config.format` with `type` `json_schema`.
- A `Format` that is not a JSON object MUST fail before any request.
- Tool arguments and schemas MUST reach the wire byte for byte as written.
- A body over 1 MiB cut by a read error MUST still end as the size limit error.

## Errors

- `ai/anthropic: <status>: <body>` when the provider returns a failing status.
- `ai/anthropic: response exceeds the size limit of 1048576 bytes` when a body is too large.
- `ai/anthropic: stream: <type>: <message>` when the stream sends an error event.
- `ai/anthropic: stream ended before message_stop` when the stream is cut.
- `ai/anthropic: decode stream event: <cause>` when a stream record is not JSON.
- `ai/anthropic: tool call <id>: arguments: <cause>` and `ai/anthropic: tool <name>: schema: <cause>` when a tool text is not JSON.
- `ai/anthropic: encode request: <cause>`, `ai/anthropic: read response: <cause>` and `ai/anthropic: decode response: <cause>` for the JSON and body steps.
- `ai/anthropic: stopped after 10 redirects` when the redirect chain runs past ten hops.
- `ai/anthropic: format is not a JSON schema: <cause>` when `Format` is not a JSON object.

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
- `TestStreamErrorEvent` proves the error text of an error event and that the stream ends at it.
- `TestStreamRecordThatIsNotJSONIsAnError` proves the decode error and that no chunk follows it.
- `TestStreamEndsAtAMessageStopRecordWithoutEventLines` proves the end at a `message_stop` data record while the body stays open.
- `TestThinkingBlockBecomesAReasoningPartAndIsNotSentBack` proves the reasoning part of a reply and that a request sends none.
- `TestStreamThinkingDeltasBecomeOneReasoningPart` proves the reasoning text of a stream.
- `TestBadRequestIsFinal` proves a 400 ends after one request.
- `TestServerErrorIsRetried` proves a 500 is retried.
- `TestRateLimitedIsRetried` proves a 429 is retried.
- `TestClientErrorAddsNoResultToTheBreaker` proves a 400 adds no breaker result.
- `TestBodyOverTheLimitIsFinal` proves the size limit error ends the call.
- `TestFailingStatusBodyIsCutAtOneMiB` proves the failing body is cut.
- `TestKeyNeverAppearsInError` proves the key stays out of errors.
- `TestChatBodyOverLimitWithCutConnectionIsFinal` proves the cut oversize body ends after one attempt.
- `TestTruncatedFailingBodyKeepsTheStatus` proves the status of a cut 400, the single attempt, the empty breaker sample and the read cause.
- `TestRedirectToAnotherOriginDropsTheKey` proves the key stops at the origin, and `TestRedirectOnTheSameOriginKeepsTheKey` proves it survives there.
- `TestRetryAfterHoldsTheNextAttempt` proves the second attempt waits out the advertised second.
- `TestEchoedKeyNeverAppearsInError` and `TestStreamErrorEventHidesTheKey` prove the redacted 401 and stream errors.
- `TestStreamBareToolCallUsesTheStartInput` proves the empty object for a fragment-free tool block.
- `TestStreamDeltaKeepsEarlierCacheCounts` and `TestStreamCacheOnlyDeltaKeepsUncachedCounts` prove the held counters.
- `TestFormatGoesOutAsOutputConfig` and `TestFormatGoesOutOnTheStreamToo` prove the schema field in both modes.
- `TestFormatThatIsNotAnObjectIsAnError` proves the rejection before any request.
- `TestToolReplayKeepsLargeIntegersExact` proves the exact digits of a replayed large integer.
- `TestRetryAfterIsBoundedByTheRetryMaximum` proves the cap and the saturating parse.
- `TestRetryAfterLeavesACallerFaultFinal` proves a 400 stays final with `Retry-After`.
- `TestKeyStraddlingTheCutIsRedacted` proves the redaction runs before the cut.
- `TestStreamCarriesTheStartInputOfABareTool` and `TestStreamReplacesANonObjectStartInput` prove the seed rule.
- `TestPlainStreamFixtureEndsWithItsDataLine` proves the fixture is a verbatim replay.
- `TestStreamMakesOneAttemptOnAFailingStatus` proves a 400 stream answer ends after one request.
- `TestStreamCancelKeepsThePrefixAndTheCause` proves a stream cancel keeps the package prefix and the cause.
- `TestStreamRetriesARateLimitedAnswerBeforeAnyEvent` proves a 429 stream answer is retried before any event.
- `TestStreamDoesNotRetryAfterOneEvent` proves no second request follows one yielded event.
- `TestStreamTruncatedFailingBodyKeepsTheStatus` proves a cut 400 stream body keeps the status and the read cause.
- No test needs a key or the network.

## Not in scope

- The vendor SDK. The package uses raw HTTP.
- Embeddings. The Messages API does not serve them.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
- `temperature`, `top_p` and `top_k`. The pinned API version removed them.
