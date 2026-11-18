# ai/ollama

Package `ai/ollama` is the Ollama provider. It implements [`ai.Model`](ai.md) and [`ai.Embedder`](ai.md) over the local API.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Client struct {
	BaseURL string
	Model   string
	HTTP    *http.Client
	Policy  resilience.Policy
}

func (c *Client) Chat(ctx context.Context, req ai.Request) (ai.Reply, error)
func (c *Client) Stream(ctx context.Context, req ai.Request) iter.Seq2[ai.Chunk, error]
func (c *Client) Embed(ctx context.Context, texts const []string) ([][]float32, error)
```

`Model` names the model for `Embed`, which takes no model argument. Ollama sends no key.

## Requirements

- `Chat` MUST send `POST <BaseURL>/api/chat` with `stream` false.
- `Stream` MUST send the same request with `stream` true.
- `Stream` MUST read NDJSON that ends at the object with `done` true.
- `Stream` MUST end at that object and MUST NOT wait for the body to close.
- A tool call MUST carry its arguments as one complete JSON object text.
- Usage MUST come from `prompt_eval_count` and `eval_count`.
- `Embed` MUST send `POST <BaseURL>/api/embed`.
- `Embed` MUST return the vectors in input order.
- `Chat` and `Embed` MUST run each attempt under `resilience.Do` with `Policy`.
- A 4xx answer other than 408 and 429 MUST end the call after one attempt.
- That answer MUST NOT count as a failure or as a success for the breaker.
- `Chat` and `Embed` MUST report that answer to `resilience.Do` as an `Ignored` error.
- Any other failing answer MUST be retried under `Policy.Retry`.
- An option that the request does not set MUST be absent from the JSON.
- A `Format` of `json` MUST go out as the JSON string `json`.
- A `Format` that is a JSON object MUST go out as that object.
- Any other `Format` MUST be an error before the request is sent.
- A stream that ends before `done` MUST yield an error chunk and no reply.
- Tool call arguments that are not a JSON object MUST be an error before the request is sent.

## Errors

- `ai/ollama: <status>: <body>` when the provider returns a failing status.
- `ai/ollama: stream ended before done` when the stream is cut.
- `ai/ollama: tool call <name>: arguments are not a JSON object: <cause>` for bad arguments in a message.
- `ai/ollama: format is not json and not a JSON object` when `Format` is any other text.
- `ai/ollama: encode request: <cause>`, `ai/ollama: read response: <cause>` and `ai/ollama: decode response: <cause>` for the JSON and body steps.

## Proof

- `TestChatRequestBodyMatchesReferenceShape` compares the request body with the reference JSON for a prompt with one tool.
- `TestStreamCollectsCompleteToolCall` replays an NDJSON stream through `ai.Collect` and requires one complete tool call.
- `TestStreamCutBeforeDoneYieldsErrorAndNoReply` proves the error chunk for a cut stream.
- `TestStreamEndsAtTheDoneRecordWhileTheBodyStaysOpen` proves that the stream ends at `done` while the server keeps the body open.
- `TestClientErrorIsFinal` proves that a 400 answer costs one request. The test server counts the requests.
- `TestServerErrorIsRetried` proves that a 500 answer is retried.
- `TestClientErrorAddsNoResultToTheBreaker` proves that a 400 answer adds no result to the breaker window.
- `TestEmbedReturnsEmbeddingsInInputOrder` proves the embed path and the vector order.
- `TestFormatGoesOutAsJSONModeOrAsASchemaObject` proves the two wire forms of `Format` and the error for any other text.
- No test needs a key or the network.

## Not in scope

- The decision model. The capability set excludes it.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
