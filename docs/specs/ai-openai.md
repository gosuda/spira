# ai/openai

Package `ai/openai` is the OpenAI-compatible provider. It implements [`ai.Model`](ai.md) and [`ai.Embedder`](ai.md) over the chat completions and embeddings endpoints.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Client struct {
	BaseURL    string
	Model      string
	Key        string
	SafePrompt bool?
	RandomSeed int?
	HTTP       *http.Client
	Policy     resilience.Policy
}

func (c *Client) Chat(ctx context.Context, req ai.Request) (ai.Reply, error)
func (c *Client) Stream(ctx context.Context, req ai.Request) iter.Seq2[ai.Chunk, error]
func (c *Client) Embed(ctx context.Context, texts const []string) ([][]float32, error)

var ErrProviderRejected = fault.New("openai.provider_rejected", fault.Invalid, "The model provider rejected the request.")
var ErrProviderRateLimited = fault.New("openai.provider_rate_limited", fault.RateLimited, "The model provider rate limited the request.")
var ErrProviderError = fault.New("openai.provider_error", fault.Unavailable, "The model provider returned an error.")
var ErrProviderTooLarge = fault.New("openai.provider_too_large", fault.TooLarge, "The provider response is too large.")
var ErrProviderStreamCut = fault.New("openai.provider_stream_cut", fault.Unavailable, "The model provider stream was cut.")
var ErrInvalidRequest = fault.New("openai.invalid_request", fault.Invalid, "The model request is invalid.")
func Faults() []*fault.Error
```

`Model` names the model for `Embed`, which takes no model argument. `Key` is sent as the bearer token when it is not empty. `SafePrompt` and `RandomSeed` are the Mistral options. They go out only when the caller sets them.

## Requirements

- `Chat` MUST send `POST <BaseURL>/chat/completions` with `stream` false.
- `Stream` MUST send the same request with `stream` true.
- `Chat` MUST send the bearer token in the `Authorization` header when `Key` is set.
- `Chat` MUST read server-sent events that end with `data: [DONE]`.
- `Stream` MUST end at the `data: [DONE]` record and MUST NOT wait for the body to close.
- `Stream` MUST end with an error when no event arrives for `Policy.Timeout`.
- `Stream` MUST refresh the idle deadline on every read from the provider.
- The time that the caller spends on a chunk MUST NOT count toward that timeout.
- `Stream` MUST close the response body on every path, also when the caller stops at an error.
- `Stream` MUST read delta content that is a string or a Mistral chunk array.
- `Chat` MUST assemble tool arguments from fragments into one complete call.
- `Chat` MUST read usage from `prompt_tokens`, `completion_tokens` and `total_tokens`.
- `Embed` MUST send `POST <BaseURL>/embeddings`.
- `Embed` MUST return the vectors in input order.
- `Chat` MUST accept a base URL without `/v1` for DeepSeek.
- `Chat` MUST turn a `reasoning_content` member into a reasoning part for DeepSeek.
- `Chat` MUST read Mistral content when it is a chunk array.
- `Chat` MUST send `safe_prompt` and `random_seed` when the caller sets them for Mistral.
- `Chat` MUST accept a response body of at most 1 MiB.
- `Embed` MUST accept a response body of at most 1 MiB plus 128 KiB for each input text.
- A larger body MUST end the call after one attempt.
- A body already over its limit MUST end the call even when its read fails.
- The body of a failing status MUST be cut at 1 MiB.
- `Chat` and `Embed` MUST run each attempt under `resilience.Do` with `Policy`.
- A 4xx answer other than 408 and 429 MUST end the call after one attempt.
- That answer MUST NOT count as a failure or as a success for the breaker.
- `Chat` and `Embed` MUST report that answer to `resilience.Do` as an `Ignored` error.
- Any other failing answer MUST be retried under `Policy.Retry`.
- An option that the request does not set MUST be absent from the JSON.
- `TopK` MUST go out as `top_k` when the caller sets it, for the compatible servers that take it.
- A `Format` of `json` MUST go out as `{"type":"json_object"}`.
- A `Format` that is a JSON object MUST go out as a `json_schema` response format.
- That response format MUST set `strict`, as the reference does, so the answer conforms to the schema.
- The caller MUST give a schema of the strict subset of the provider.
- Any other `Format` MUST surface as `openai.invalid_request` before the request is sent.
- A bad tool schema MUST surface as `openai.invalid_request` before the request is sent.
- A stream that ends before `data: [DONE]` MUST yield `openai.provider_stream_cut` and no reply.
- A provider error event or a broken stream record MUST yield `openai.provider_stream_cut`.
- A stall MUST yield `openai.provider_stream_cut` and satisfy `IsStall`.
- A 4xx answer other than 408 and 429 MUST surface as `openai.provider_rejected`.
- A 429 answer MUST surface as `openai.provider_rate_limited`.
- Any other failing answer MUST surface as `openai.provider_error`.
- A failing status MUST win over a failed error-body read, keeping the read cause.
- A status fault cause MUST hold the status, the parsed error type and the body length.
- A status fault cause MUST NOT hold the body text or the key.
- A body over its limit MUST surface as `openai.provider_too_large`.
- An inconsistent embedding answer MUST surface as `openai.provider_error`.
- A zero Policy.Timeout MUST fall back to the default idle bound.
- A caller cancel MUST yield `openai.provider_stream_cut` and satisfy `errors.Is` with `context.Canceled`.
- The key MUST NOT appear in an error or a log.

### Code table

| Code | Kind | Message |
|---|---|---|
| `openai.provider_rejected` | invalid | The model provider rejected the request. |
| `openai.provider_rate_limited` | rate_limited | The model provider rate limited the request. |
| `openai.provider_error` | unavailable | The model provider returned an error. |
| `openai.provider_too_large` | too_large | The provider response is too large. |
| `openai.provider_stream_cut` | unavailable | The model provider stream was cut. |
| `openai.invalid_request` | invalid | The model request is invalid. |

## Errors

- `openai.provider_rejected` MUST surface for a 4xx answer other than 408 and 429.
- `openai.provider_rate_limited` MUST surface for a 429 answer.
- `openai.provider_error` MUST surface for a 5xx answer, a 408 answer and a transport failure.
- `openai.provider_too_large` MUST surface for a body over its limit.
- `openai.provider_stream_cut` MUST surface for a cut stream, a broken record, an error event and a stall.
- `openai.invalid_request` MUST surface for a bad `Format` and a bad tool schema.

## Proof

- `TestChatReplies` proves the reply fields: identity, finish, usage and the text part.
- `TestChatRequestWithToolIsTheReferenceOracle` proves the request body equals the reference JSON for a prompt with one tool.
- `TestStreamCollectsTheReferenceReply` proves a stream that ends at `data: [DONE]` yields the reference reply through `ai.Collect`.
- `TestStreamToolCallAssemblesFragments` proves fragments assemble into one complete tool call.
- `TestStreamEndsAtDoneWhileTheBodyStaysOpen` proves the stream ends at `data: [DONE]` while the server keeps the body open.
- `TestCutStreamYieldsErrorChunkAndNoReply` proves the error for a stream cut before `data: [DONE]` and the public code of the cut.
- `TestStreamErrorEventYieldsStreamCut` proves an error event ends the stream as the stream cut fault with the parsed type.
- `TestStreamOfAStalledProviderEndsAtThePolicyTimeout` proves the error for a provider that stops sending.
- `TestStreamKeepsAProviderWhoseEventsStayInsideTheTimeout` proves the idle bound resets on every line read and never fires.
- `TestStreamKeepsReceivingToolFragments` proves tool-only fragments reset the idle bound and assemble into one call.
- `TestStreamResetsBeforeTheFirstChunk` proves resets precede the first yielded chunk.
- `TestStreamCanceledBeforeHeadersKeepsThePackagePrefix` proves a canceled stream still names the package.
- `TestStreamCancelBetweenChunksKeepsThePackagePrefix` proves a mid-stream cancel keeps the package prefix.
- `TestStreamCancelBetweenBufferedChunksKeepsThePackagePrefix` proves a cancel over buffered chunks keeps the package prefix.
- `TestStreamTouchesTheTimerOnPartialReads` proves the idle bound refreshes on every provider read, also before the newline.
- `TestStreamEndsWhenDoneHasNoTrailingNewline` proves a final line without a newline still ends the stream.
- `TestZeroTimeoutStreamsWithoutAnIdleBound` proves a zero timeout still streams a full answer under a positive fallback bound.
- `TestStreamStallBeforeHeadersNamesTheStall` proves a stall before headers ends as the stream cut fault and satisfies `IsStall`.
- `TestIdleProbeAffectsOnlyItsOwnClient` proves the idle probe of one client never counts another client.
- `TestStreamClosesTheBodyOfAFailingAnswer` proves the body of a failing answer closes when the caller stops.
- `TestChatReportsFailingStatusWhenTheBodyStalls` proves a stalled 400 body ends after one request with the status error.
- `TestStreamReportsFailingStatusWhenTheBodyStalls` proves a stalled 400 body ends the stream with the status error.
- `TestStreamReadsMistralChunkArrayContent` proves array and string delta content in one stream.
- `TestTopKGoesOutWhenTheCallerSetsIt` proves `top_k` on the wire only for a caller value.
- `TestEmbeddingsReturnVectorsInInputOrder` proves the embed path and the vector order.
- `TestEmbedBodyOverItsLimitIsFinal` proves the size limit and that the call is not repeated.
- `TestEmbedBodyOverLimitWithCutConnectionIsFinal` proves a cut body over the limit ends after one attempt.
- `TestEmbeddingIndexOutsideTheAnswerIsAnError` proves the error for an index outside the answer.
- `TestDeepSeekReasoningPart` proves `reasoning_content` becomes a reasoning part.
- `TestMistralChunkArrayContentAndOptions` proves the chunk-array content and the Mistral options on the wire.
- `TestFormatGoesOutAsJSONObjectOrSchema` proves the two wire forms of `Format` and the error for any other text.
- `TestUnauthorizedIsFinal` proves that a 401 answer ends after one request as the provider rejection.
- `TestRateLimitedIsRetried` proves that a 429 answer is retried as the rate limited fault.
- `TestServerErrorIsRetried` proves that a 500 answer is retried as the provider error.
- `TestClientErrorAddsNoResultToTheBreaker` proves a 500 answer and a 400 answer add no result to the breaker.
- `TestFailingStatusBodyIsCutAtOneMiB` proves a failing status body is cut at one mebibyte and the status is still classified.
- `TestBadRequestIsFinal` proves that a 400 answer ends after one request as the provider rejection.
- `TestKeyNeverAppearsInError` proves the key is absent from the error text and present as the bearer header.
- `TestFaultsMatchSpecCodeTable` proves `Faults()` equals the code table above.
- `TestAdversarialSecretsStayOutOfPublicView` proves secrets and hostile input stay out of the public view.
- `TestBadToolSchemaIsAnInvalidRequest` proves a bad tool schema ends as the invalid request fault.
- No test needs a key or the network.

## Not in scope

- The vendor SDK. The package uses raw HTTP.
- The Responses API. It is a second wire shape.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
