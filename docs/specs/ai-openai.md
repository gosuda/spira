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
```

`Model` names the model for `Embed`, which takes no model argument. `Key` is sent as the bearer token when it is not empty. `SafePrompt` and `RandomSeed` are the Mistral options. They go out only when the caller sets them.

## Requirements

- `Chat` MUST send `POST <BaseURL>/chat/completions` with `stream` false.
- `Stream` MUST send the same request with `stream` true.
- `Chat` MUST send the bearer token in the `Authorization` header when `Key` is set.
- `Chat` MUST read server-sent events that end with `data: [DONE]`.
- `Stream` MUST end at the `data: [DONE]` record and MUST NOT wait for the body to close.
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
- The body of a failing status MUST be cut at 1 MiB.
- `Chat` and `Embed` MUST run each attempt under `resilience.Do` with `Policy`.
- A 4xx answer other than 408 and 429 MUST end the call after one attempt.
- That answer MUST NOT count as a failure or as a success for the breaker.
- `Chat` and `Embed` MUST report that answer to `resilience.Do` as an `Ignored` error.
- Any other failing answer MUST be retried under `Policy.Retry`.
- An option that the request does not set MUST be absent from the JSON.
- A `Format` of `json` MUST go out as `{"type":"json_object"}`.
- A `Format` that is a JSON object MUST go out as a `json_schema` response format.
- Any other `Format` MUST be an error before the request is sent.
- A stream that ends before `data: [DONE]` MUST yield an error and no reply.
- An error MUST name the package, the status and the body as `ai/openai: <status>: <body>`.
- The key MUST NOT appear in an error or a log.

## Errors

- `ai/openai: <status>: <body>` when the provider returns a failing status.
- `ai/openai: stream ended before [DONE]` when the stream is cut.
- `ai/openai: format is not json and not a JSON schema` when `Format` is any other text.
- `ai/openai: tool <name> schema: <cause>` when a tool schema is not a JSON object.
- `ai/openai: embedding index <i> is outside the <n> vectors of the answer` when the provider names an index it did not send.
- `ai/openai: encode request: <cause>`, `ai/openai: read response: <cause>` and `ai/openai: decode response: <cause>` for the JSON and body steps.
- `ai/openai: response exceeds the size limit of <n> bytes` when a body is larger than its limit.

## Proof

- `TestChatReplies` proves the reply fields: identity, finish, usage and the text part.
- `TestChatRequestWithToolIsTheReferenceOracle` proves the request body equals the reference JSON for a prompt with one tool.
- `TestStreamCollectsTheReferenceReply` proves a stream that ends at `data: [DONE]` yields the reference reply through `ai.Collect`.
- `TestStreamToolCallAssemblesFragments` proves fragments assemble into one complete tool call.
- `TestStreamEndsAtDoneWhileTheBodyStaysOpen` proves the stream ends at `data: [DONE]` while the server keeps the body open.
- `TestCutStreamYieldsErrorChunkAndNoReply` proves the error for a stream cut before `data: [DONE]`.
- `TestEmbeddingsReturnVectorsInInputOrder` proves the embed path and the vector order.
- `TestEmbedBodyOverItsLimitIsFinal` proves the size limit and that the call is not repeated.
- `TestEmbeddingIndexOutsideTheAnswerIsAnError` proves the error for an index outside the answer.
- `TestDeepSeekReasoningPart` proves `reasoning_content` becomes a reasoning part.
- `TestMistralChunkArrayContentAndOptions` proves the chunk-array content and the Mistral options on the wire.
- `TestFormatGoesOutAsJSONObjectOrSchema` proves the two wire forms of `Format` and the error for any other text.
- `TestUnauthorizedIsFinal` proves that a 401 answer ends after one request with the named error.
- `TestRateLimitedIsRetried` proves that a 429 answer is retried.
- `TestServerErrorIsRetried` proves that a 500 answer is retried.
- `TestClientErrorAddsNoResultToTheBreaker` proves a 500 answer and a 400 answer add no result to the breaker.
- `TestFailingStatusBodyIsCutAtOneMiB` proves a failing status body is cut at one mebibyte and the status is still classified.
- `TestBadRequestIsFinal` proves that a 400 answer ends after one request.
- `TestKeyNeverAppearsInError` proves the key is absent from the error text and present as the bearer header.
- No test needs a key or the network.

## Not in scope

- The vendor SDK. The package uses raw HTTP.
- The Responses API. It is a second wire shape.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
