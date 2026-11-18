# ai/openai

Status: specified; the package is not in the tree yet.

Package `ai/openai` is the OpenAI-compatible provider. It implements [`ai.Model`](ai.md) and [`ai.Embedder`](ai.md) over the chat completions and embeddings endpoints.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Client struct {
	BaseURL string
	Key     string
	HTTP    *http.Client
}

func (c *Client) Chat(ctx context.Context, req ai.Request) (ai.Reply, error)
func (c *Client) Stream(ctx context.Context, req ai.Request) iter.Seq2[ai.Chunk, error]
func (c *Client) Embed(ctx context.Context, texts const []string) ([][]float32, error)
```

The plan states the three fields and the methods. It does not state the type name `Client` or the field name `HTTP`.

## Requirements

- `Chat` MUST send `POST <BaseURL>/chat/completions`.
- `Chat` MUST send the bearer token in the `Authorization` header.
- `Chat` MUST read server-sent events that end with `data: [DONE]`.
- `Chat` MUST assemble tool arguments from fragments into one complete call.
- `Chat` MUST read usage from `prompt_tokens`, `completion_tokens` and `total_tokens`.
- `Embed` MUST send `POST <BaseURL>/embeddings`.
- `Chat` MUST accept a base URL without `/v1` for DeepSeek.
- `Chat` MUST turn a `reasoning_content` member into a reasoning part for DeepSeek.
- `Chat` MUST read Mistral content when it is a chunk array.
- `Chat` MUST send `safe_prompt` and `random_seed` when the caller sets them for Mistral.
- Non-streamed calls MUST go through `client` with a `resilience.Policy`.
- A 400 answer MUST be final.
- A 500 answer MUST be retried.
- A 429 answer MUST be retried.
- An error MUST name the package, the status and the body as `ai/openai: <status>: <body>`.
- The key MUST NOT appear in an error or a log.
- A cut stream MUST yield an error chunk and no reply.

## Errors

- `ai/openai: <status>: <body>` when the provider returns a failing status.
- The stream error when the stream ends before `data: [DONE]`.

## Proof

- The reference request JSON for a prompt with one tool is the request body oracle.
- A cut stream test proves the error chunk and no reply.
- A 400 test proves the answer is final.
- A 500 test proves the answer is retried.
- A 429 test proves the answer is retried.
- No test needs a key or the network.

## Not in scope

- The vendor SDK. The package uses raw HTTP.
- The Responses API. It is a second wire shape.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
