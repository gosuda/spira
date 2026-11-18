# ai/ollama

Status: specified; the package is not in the tree yet.

Package `ai/ollama` is the Ollama provider. It implements [`ai.Model`](ai.md) and [`ai.Embedder`](ai.md) over the local API.

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

- `Chat` MUST send `POST <BaseURL>/api/chat`.
- `Chat` MUST read NDJSON that ends at `done`.
- `Chat` MUST read tool arguments as JSON objects.
- `Chat` MUST read `prompt_eval_count` and `eval_count` into usage.
- `Embed` MUST send `POST <BaseURL>/api/embed`.
- Non-streamed calls MUST go through `client` with a `resilience.Policy`.
- A 400 answer MUST be final.
- A 500 answer MUST be retried.
- A 429 answer MUST be retried.
- An error MUST name the package, the status and the body as `ai/ollama: <status>: <body>`.
- The key MUST NOT appear in an error or a log.
- A cut stream MUST yield an error chunk and no reply.

## Errors

- `ai/ollama: <status>: <body>` when the provider returns a failing status.
- The stream error when the stream ends before `done`.

## Proof

- The reference request JSON for a prompt with one tool is the request body oracle.
- A cut stream test proves the error chunk and no reply.
- A 400 test proves the answer is final.
- A 500 test proves the answer is retried.
- A 429 test proves the answer is retried.
- No test needs a key or the network.

## Not in scope

- The decision model. The capability set excludes it.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
