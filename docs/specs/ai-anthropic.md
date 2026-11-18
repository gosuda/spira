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
- A 4xx answer other than 408 and 429 MUST end the call after one attempt.
- A 4xx answer other than 408 and 429 MUST add no result to the breaker.
- A 500 answer MUST be retried.
- A 429 answer MUST be retried.
- A response body over 1 MiB MUST end the call with the size limit error.
- The body of a failing status MUST be cut at 1 MiB.
- An error MUST name the package, the status and the body as `ai/anthropic: <status>: <body>`.
- The key MUST NOT appear in an error.

## Errors

- `ai/anthropic: <status>: <body>` when the provider returns a failing status.
- `ai/anthropic: response exceeds the size limit of 1048576 bytes` when a body is too large.
- `ai/anthropic: stream: <type>: <message>` when the stream sends an error event.
- `ai/anthropic: stream ended before message_stop` when the stream is cut.
- `ai/anthropic: decode stream event: <cause>` when a stream record is not JSON.
- `ai/anthropic: tool call <id>: arguments: <cause>` and `ai/anthropic: tool <name>: schema: <cause>` when a tool text is not JSON.
- `ai/anthropic: encode request: <cause>`, `ai/anthropic: read response: <cause>` and `ai/anthropic: decode response: <cause>` for the JSON and body steps.

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
- No test needs a key or the network.

## Not in scope

- The vendor SDK. The package uses raw HTTP.
- Embeddings. The Messages API does not serve them.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
- `temperature`, `top_p` and `top_k`. The pinned API version removed them.
