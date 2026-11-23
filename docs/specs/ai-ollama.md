# ai/ollama

Package `ai/ollama` is the Ollama provider. It implements [`ai.Model`](ai.md) and [`ai.Embedder`](ai.md) over the local API.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Client struct {
	BaseURL   string
	Model     string
	HTTP      *http.Client
	Policy    resilience.Policy
	MaxLine   int
	MaxStream int64
}

func (c *Client) Chat(ctx context.Context, req ai.Request) (ai.Reply, error)
func (c *Client) Stream(ctx context.Context, req ai.Request) iter.Seq2[ai.Chunk, error]
func (c *Client) Embed(ctx context.Context, texts const []string) ([][]float32, error)

var ErrProviderRejected = fault.New("ollama.provider_rejected", fault.Invalid, "The model provider rejected the request.")
var ErrProviderRateLimited = fault.New("ollama.provider_rate_limited", fault.RateLimited, "The model provider rate limited the request.")
var ErrProviderError = fault.New("ollama.provider_error", fault.Unavailable, "The model provider returned an error.")
var ErrProviderTooLarge = fault.New("ollama.provider_too_large", fault.TooLarge, "The provider response is too large.")
var ErrProviderStreamCut = fault.New("ollama.provider_stream_cut", fault.Unavailable, "The model provider stream was cut.")
var ErrInvalidRequest = fault.New("ollama.invalid_request", fault.Invalid, "The model request is invalid.")
func Faults() []*fault.Error
```

`Model` names the model for `Embed`, which takes no model argument. Ollama sends no key. A stream line longer than `MaxLine` bytes (1 MiB when zero) or a stream longer than `MaxStream` bytes (64 MiB when zero) ends the stream with `ollama.provider_too_large`.

## Requirements

- `Chat` MUST send `POST <BaseURL>/api/chat` with `stream` false.
- `Stream` MUST send the same request with `stream` true.
- `Stream` MUST read NDJSON that ends at the object with `done` true.
- `Stream` MUST end at that object and MUST NOT wait for the body to close.
- A tool call MUST carry its arguments as one complete JSON object text.
- Usage MUST come from `prompt_eval_count` and `eval_count`.
- `Embed` MUST send `POST <BaseURL>/api/embed`.
- `Embed` MUST return the vectors in input order.
- `Chat` MUST accept a response body of at most 1 MiB.
- `Embed` MUST accept a response body of at most 1 MiB plus 128 KiB for each input text.
- A larger body MUST end the call after one attempt.
- A body already over its limit MUST end the call even when its read fails.
- The body of a failing status MUST be cut at 1 MiB.
- The read cap for that body MUST be 1 MiB, not the success limit.
- The status of a failing answer MUST win over a failed body read.
- `Chat` and `Embed` MUST run each attempt under `resilience.Do` with `Policy`.
- A 4xx answer other than 408 and 429 MUST end the call after one attempt.
- That answer MUST NOT count as a failure or as a success for the breaker.
- `Chat` and `Embed` MUST report that answer to `resilience.Do` as an `Ignored` error.
- Any other failing answer MUST be retried under `Policy.Retry`.
- An option that the request does not set MUST be absent from the JSON.
- A `Format` of `json` MUST go out as the JSON string `json`.
- A `Format` that is a JSON object MUST go out as that object.
- A `Format` of `{}` MUST go out as an empty JSON object.
- Any other `Format` MUST surface as `ollama.invalid_request` before the request is sent.
- A bad tool schema MUST surface as `ollama.invalid_request` before the request is sent.
- A stream that ends before `done` MUST yield `ollama.provider_stream_cut` and no reply.
- A caller cancel during `Stream` MUST yield `ollama.provider_stream_cut` wrapping `context.Canceled`.
- Tool call arguments that are not a JSON object MUST surface as `ollama.invalid_request` before the request is sent.
- A 4xx answer other than 408 and 429 MUST surface as `ollama.provider_rejected`.
- A 429 answer MUST surface as `ollama.provider_rate_limited`.
- Any other failing answer MUST surface as `ollama.provider_error`.
- A provider error field MUST surface as `ollama.provider_error` with the body length.
- A status fault cause MUST hold the status and the body length.
- A status fault cause MUST NOT hold the body text.

### Code table

| Code | Kind | Message |
|---|---|---|
| `ollama.provider_rejected` | invalid | The model provider rejected the request. |
| `ollama.provider_rate_limited` | rate_limited | The model provider rate limited the request. |
| `ollama.provider_error` | unavailable | The model provider returned an error. |
| `ollama.provider_too_large` | too_large | The provider response is too large. |
| `ollama.provider_stream_cut` | unavailable | The model provider stream was cut. |
| `ollama.invalid_request` | invalid | The model request is invalid. |

## Errors

- `ollama.provider_rejected` MUST surface for a 4xx answer other than 408 and 429.
- `ollama.provider_rate_limited` MUST surface for a 429 answer.
- `ollama.provider_error` MUST surface for a 5xx answer, a 408 answer, a transport failure and a provider error field.
- `ollama.provider_too_large` MUST surface for a body over its limit.
- `ollama.provider_stream_cut` MUST surface for a cut stream and a broken line.
- `ollama.invalid_request` MUST surface for a bad `Format`, a bad tool schema and bad tool arguments.

## Proof

- `TestChatRequestBodyMatchesReferenceShape` compares the request body with the reference JSON for a prompt with one tool.
- `TestStreamCutBeforeDoneYieldsErrorAndNoReply` proves the error chunk for a cut stream.
- `TestStreamCallerCancelYieldsPrefixedCancelError` proves a caller cancel yields the stream cut fault and keeps the cause.
- `TestStreamCanceledBeforeHeadersYieldsStreamCut` proves a cancel before headers yields the stream cut fault and keeps the cause.
- `TestStreamEndsAtTheDoneRecordWhileTheBodyStaysOpen` proves that the stream ends at `done` while the server keeps the body open.
- `TestClientErrorIsFinal` proves that a 400 answer costs one request as the provider rejection. The test server counts the requests.
- `TestServerErrorIsRetried` proves that a 500 answer is retried as the provider error.
- `TestClientErrorAddsNoResultToTheBreaker` proves that a 400 answer adds no result to the breaker window.
- `TestEmbedReturnsEmbeddingsInInputOrder` proves the embed path and the vector order.
- `TestEmbedAcceptsABatchLargerThanOneMebibyte` proves that 128 vectors of 1024 values decode.
- `TestEmbedBodyOverItsLimitIsFinal` proves the size limit and that the call is not repeated.
- `TestChatBodyOverLimitWithCutConnectionIsFinal` proves a cut body over the limit ends after one attempt.
- `TestEmbedRejectsAStalledErrorBodyAfterOneRequest` proves a 1 MiB error body held open still ends after one request.
- `TestEmbedKeepsTheStatusOfAFailingAnswerWhoseBodyIsCut` proves a cut 400 body still ends after one request with the 400 fault.
- `TestStreamKeepsTheStatusOfAFailingAnswerWhoseBodyIsCut` proves a cut 400 body yields the status, not a read error.
- `TestFormatGoesOutAsJSONModeOrAsASchemaObject` proves the two wire forms of `Format`, the empty object, the omission of an unset `Format`, and the error for any other text.
- `TestFaultsMatchSpecCodeTable` proves `Faults()` equals the code table above.
- `TestAdversarialSecretsStayOutOfPublicView` proves secrets and hostile input stay out of the public view.
- `TestBadToolSchemaIsAnInvalidRequest` proves a bad tool schema ends as the invalid request fault.
- `TestProviderErrorFieldIsAProviderError` proves the error field ends as the provider error on both paths.
- No test needs a key or the network.

## Not in scope

- The decision model. The capability set excludes it.
- Image, speech, transcription, moderation and decisions. The capability set excludes them.
