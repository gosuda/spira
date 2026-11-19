# ai/mcp

Package `ai/mcp` speaks the Model Context Protocol for tools at specification revision `2025-11-25`. The application author uses `Client` to list tools and `Mount` to serve them.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Envelope struct {
	JSONRPC string         `json:"jsonrpc"`
	ID      jsontext.Value `json:"id,omitempty"`
	Method  string         `json:"method,omitempty"`
	Params  jsontext.Value `json:"params,omitempty"`
	Result  jsontext.Value `json:"result,omitempty"`
	Error   *RPCError?     `json:"error,omitzero"`
}

type RPCError struct {
	Code    int32          `json:"code"`
	Message string         `json:"message"`
	Data    jsontext.Value `json:"data,omitempty"`
}

func (e *RPCError) Error() string

type Implementation struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type Transport interface {
	Notify(ctx context.Context, msg Envelope) error
	Request(ctx context.Context, msg Envelope) (Envelope, error)
	Close() error
}

func NewStdio(r io.Reader, w io.Writer) *Stdio
type Stdio struct {
	source  io.Reader
	sink    io.Writer
	reader  *bufio.Reader
	pending []byte
	broken  bool
}
func (s *Stdio) Notify(ctx context.Context, msg Envelope) error
func (s *Stdio) Request(ctx context.Context, msg Envelope) (Envelope, error)
func (s *Stdio) Close() error
func NewHTTP(endpoint string, client *http.Client) *HTTP
type HTTP struct {
	endpoint string
	client   *http.Client
	session  string
}
func (h *HTTP) Notify(ctx context.Context, msg Envelope) error
func (h *HTTP) Request(ctx context.Context, msg Envelope) (Envelope, error)
func (h *HTTP) Close() error

type Client struct {
	t       Transport
	next    sync.Locked[int64]
	Name    string = "spira"
	Version string = "0.1.0"
}

func NewClient(t Transport) *Client
func (c *Client) Initialize(ctx context.Context) error
func (c *Client) Tools(ctx context.Context) ([]ai.Tool, error)
func (c *Client) Call(ctx context.Context, name string, arguments string) (string, error)
func (c *Client) Close() error

func Mount(r *web.Router, path string, tools []ai.Tool, guard web.Stage)
```

`Envelope` is the JSON-RPC message: `jsonrpc`, `id`, `method`, `params`, `result`, `error`. `id`, `params` and `result` are `jsontext.Value`; `error` is `*RPCError?` with `Code int32`, `Message`, `Data`. A transport is used by one goroutine at a time. Every blocking call takes a context; a transport checks the context between messages, and a blocked read ends when the peer closes its end. A stdio pipe that carries a deadline ends a blocked read or write at the context deadline. A pipe with no deadline support keeps the call blocked until the peer writes or closes its end.

## Requirements

- The client MUST send `initialize` with `protocolVersion` `2025-11-25`, an empty `capabilities` object and `clientInfo` from `Client.Name` and `Client.Version`.
- The client MUST send `notifications/initialized` with no params after the initialize reply.
- The client MUST answer a server protocol version other than `2025-11-25` with the error `mcp: server answered protocol version "<version>", want "2025-11-25"`.
- The client MUST send `tools/list` and follow `nextCursor` until a result carries none.
- The client MUST send `tools/call` with the tool name and the arguments as a JSON object.
- The client MUST send blank arguments as `{}`.
- Arguments that are not a JSON object MUST be the error `mcp: tools/call <name> arguments: <cause>`.
- `Tools` MUST return `ai.Tool` values whose `Call` issues `tools/call`.
- `Tools` MUST set `Description` from the wire description.
- `Tools` MUST set `Schema` from the wire `inputSchema` text.
- A result with `isError` MUST become the tool's result text, not a Go error.
- A protocol error MUST become a Go error of the form `mcp: protocol error <code>: <message>`.
- An HTTP JSON reply that is not a response MUST be a Go error.
- An HTTP JSON reply whose id differs from the request id MUST be a Go error.
- `Mount` MUST serve `initialize`, `tools/list` and `tools/call` on one `POST` endpoint behind the guard.
- `Mount` MUST answer a notification with 202 and an empty body.
- `Mount` MUST validate `Origin`: an absent `Origin` is allowed.
- A present `Origin` MUST parse as `http` or `https`.
- A present `Origin` MUST match the request `Host`; anything else answers 403 with a no-id JSON-RPC error.
- `Mount` MUST answer 400 for a present `MCP-Protocol-Version` other than `2025-11-25`.
- `Mount` MUST answer 400 for a body that is not one JSON-RPC envelope, with error `-32700`.
- `Mount` MUST take a guard as `ops` and `admin` do.
- The guard MUST run before any protocol method.
- A refused request MUST never reach a tool.
- The `initialize` answer MUST carry `capabilities.tools.listChanged` false. The tool list is fixed at `Mount` time, so the server never emits `notifications/tools/list_changed`.
- The `initialize` answer MUST carry `serverInfo` `spira` `0.1.0`.
- The `initialize` answer MUST echo the request id.
- `Mount` MUST serve every tool in one `tools/list` page and no `nextCursor`.
- Each `tools/list` item MUST carry `name`, `description` and the tool's `Schema` as `inputSchema`.
- A blank `Schema` MUST become `{"type":"object"}` in `inputSchema`.
- `Mount` MUST answer an unknown `tools/call` name with protocol error `-32602` `Unknown tool: <name>`.
- `Mount` MUST answer malformed params with `-32602` `Invalid params`.
- `Mount` MUST answer an unknown method with `-32601` `Method not found`.
- Each protocol error MUST echo the request id at HTTP 200.
- `tools/call` MUST run the tool's `Call` with the arguments object.
- Blank arguments MUST become `{}` for `tools/call`.
- A `Call` error MUST become a result whose `isError` is true and whose text is the error text.
- Blank error text MUST become `tool <name> failed` in the result text.
- A result MUST be one `text` content item.
- The `text` member MUST be present on the wire, also for an empty result.
- `text` content items MUST be joined with `\n` in arrival order.
- Joined text content items MUST become the tool result text.
- `image`, `audio`, `resource_link` and `resource` content items MUST carry no text.
- The client MUST drop `image`, `audio`, `resource_link` and `resource` content items.
- `structuredContent` MUST be dropped.
- The text content that accompanies `structuredContent` MUST be the result text.
- An envelope field that is absent on the wire MUST omit through `omitempty` on `jsontext.Value`.
- Plain and pointer fields MUST omit through `omitzero`.
- The error member MUST be the nilable pointer `*RPCError?`.
- The wire types MUST hold no option of a struct value, which static JSON does not decode.
- The stdio transport MUST send one JSON-RPC message per line, with no embedded newline.
- The stdio transport MUST skip messages that are not the response of the request it waits for.
- An HTTP request MUST return the matching response while the server keeps its event stream open.
- A stdio read or write on a pipe that carries a deadline MUST end at the context deadline.
- A pipe without deadline support MAY block a read or a write until the peer writes or closes its end.
- A stdio write that sends part of a line MUST poison the transport; later sends MUST fail without writing.
- A stdio read that ends at the deadline MUST keep its bytes; the next request MUST finish the line.
- A stdio line held past a deadline MUST fit in 4 MiB; beyond that later sends MUST fail without writing.
- Deadline setup that answers `os.ErrNoDeadline` MUST fall back to blocking I/O.
- A failing HTTP status with a cut body MUST keep the status with the read cause.
- A failing HTTP status with a cut RPC error body MUST keep the status, the read cause and the error.
- A stdio line over 4 MiB cut by a read error MUST report the size limit and poison the transport.

## Errors

- The package MUST return a Go error when the server returns a JSON-RPC error reply.
- The package MUST return a Go error when the server returns an HTTP error status with a JSON-RPC error body.
- The package MUST return the tool result text when the result has `isError`.

## Proof

- `ai/mcp/testdata/` holds the example messages of the `basic/lifecycle`, `basic/transports` and `server/tools` pages.
- `testdata/SOURCES` names each page URL and file.
- `TestFixtureReplay` reads those fixtures through both transports.
- Stdio runs over an in-process pipe pair.
- HTTP runs over `net/http/httptest`.
- `TestExecutionError`, `TestProtocolError`, `TestInitializeError`, `TestInitializeVersion` and `TestContentJoin` pin the error and content rules on both transports.
- `TestHTTPTransportNorms` pins the Accept header, the 202 answer for notifications and the session id echo.
- `TestHTTPTransportNorms` also pins the protocol version header.
- `TestHTTPStreamResponse` pins the stream reply path with a `notifications/tools/list_changed` message before the response.
- `TestHTTPStreamReplyWhileOpen` pins a reply that arrives while the server keeps the stream open.
- `TestHTTPReplyIDMismatch` pins the refused reply whose id does not match.
- `TestMountInitialize` pins `listChanged` false.
- `TestMountCallNonObjectArguments` and `TestClientCallNonObjectArguments` pin the object shape of `arguments` on the server and on the client.
- `TestMountCallEmptyText` pins the `text` member of an empty result.
- `TestStdioDeadlineWithoutReply` pins a read that ends at the context deadline on a pipe, with both ends open.
- `TestStdioPartialWritePoisonsTransport` pins the poisoned transport and the missing second frame.
- `TestStdioSplitReplyAcrossDeadline` pins a reply split across a deadline.
- `TestStdioWithoutDeadlineSupport` pins requests over descriptors without deadline support.
- `TestStdioPendingBound` pins the refusal after an overlong newline-less peer.
- `TestMountInitialize`, `TestMountToolsList` and `TestMountCall` replay the specification's example requests (`lifecycle/initialize-request.json`, `tools/tools-call-request.json`) at the server and check the response members the seam can carry.
- `TestMountOrigin`, `TestMountProtocolVersion` and `TestMountGuard` pin a 403 for a foreign `Origin`.
- They also pin a 400 for an unsupported version.
- They also pin that the guard runs and a refused request never reaches a tool.
- `TestMountCallToolError`, `TestMountUnknownTool`, `TestMountMalformed`, `TestMountUnknownMethod` and `TestMountNotification` pin the error results and the protocol error codes.
- They also pin the 400 for an unparseable body and the 202 for a notification.
- `TestMountClientServer` runs the client of this package against `Mount` over `net/http/httptest`.
- `TestMountClientServer` covers initialize, list and call.
- `TestHTTPRequestKeepsTheStatusOfACutBody` proves the kept status and the read cause.
- `TestHTTPNotifyKeepsTheStatusOfACutBody` proves the kept status and the read cause.
- `TestHTTPKeepsStatusOnCutJSONRPCError` proves the kept status, the read cause and the RPC error.
- `TestStdioOverlongLineWithReadErrorPoisonsTransport` proves the over-limit report and the unusable transport.

## Not in scope

- Media parts in messages. No requirement names them.
- Resources. No requirement names them.
- Prompts. No requirement names them.
- Sampling and elicitation. No requirement names them.
- The deprecated HTTP+SSE transport. No requirement names it.
- GET on the endpoint (no server-to-client stream) and server-initiated requests. The server answers 405 for methods other than POST through the router.
- Sessions: `Mount` issues no `MCP-Session-Id` (a MAY), so no session state is held.
- Resumability and redelivery of stream events. The client reads one response per POST and issues none of the MAYs.
