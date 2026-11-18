# ai/anthropic

Status: specified; the package is not in the tree yet.

Package `ai/anthropic` is the Anthropic provider. It implements [`ai.Model`](ai.md) over the Messages API.

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
```

The plan states the three fields and the methods. It does not state the type name `Client` or the field name `HTTP`.

## Requirements

- `Chat` MUST send `POST <BaseURL>/v1/messages`.
- `Chat` MUST send the `x-api-key` header.
- `Chat` MUST send the `anthropic-version` header.
- `Chat` MUST read content blocks.
- `Chat` MUST read `stop_reason` into the finish value through [`ai.FinishOf`](ai.md).
- `Chat` MUST read `input_tokens` and `output_tokens` into usage.
- `Chat` MUST read the named stream events of the reference.
- Non-streamed calls MUST go through `client` with a `resilience.Policy`.
- A 400 answer MUST be final.
- A 500 answer MUST be retried.
- A 429 answer MUST be retried.
- An error MUST name the package, the status and the body as `ai/anthropic: <status>: <body>`.
- The key MUST NOT appear in an error or a log.
- A cut stream MUST yield an error chunk and no reply.

## Errors

- `ai/anthropic: <status>: <body>` when the provider returns a failing status.
- The stream error when the stream ends early.

## Proof

- The reference mock-server tests are the wire oracle.
- The reference request JSON for a prompt with one tool is the request body oracle.
- A cut stream test proves the error chunk and no reply.
- A 400 test proves the answer is final.
- A 500 test proves the answer is retried.
- A 429 test proves the answer is retried.
- No test needs a key or the network.

## Not in scope

- The vendor SDK. The package uses raw HTTP.
- Embeddings. The Messages API does not serve them.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
