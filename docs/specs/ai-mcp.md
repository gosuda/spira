# ai/mcp

Status: specified; the package is not in the tree yet.

Package `ai/mcp` speaks the Model Context Protocol for tools. The application author uses `Client` to list tools and `Mount` to serve them.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Client struct {
	// unexported fields
}

func (c *Client) Tools(ctx context.Context) ([]ai.Tool, error)
func Mount(r *web.Router, path string, tools const []ai.Tool, guard web.Stage)
```

## Requirements

- The client MUST send `initialize`.
- The client MUST send `notifications/initialized`.
- The client MUST send `tools/list` with its cursor.
- The client MUST send `tools/call`.
- `Tools` MUST return tools the loop can call.
- A result with `isError` MUST become the tool's result text.
- A protocol error MUST become a Go error.
- `Mount` MUST serve the same four methods on one Streamable HTTP endpoint.
- `Mount` MUST validate `Origin`.
- `Mount` MUST answer 400 for an unsupported `MCP-Protocol-Version`.
- `Mount` MUST take a guard as `ops` and `admin` do.
- The guard MUST run before the protocol methods.
- The stdio transport MUST send one JSON-RPC message per line.
- The Streamable HTTP transport MUST use one endpoint.
- The client and server MUST use protocol revision `2025-11-25`.
- A foreign `Origin` MUST answer 403.

## Errors

- The package MUST return a Go error when the server returns a protocol error.
- The package MUST return the tool result text when the result has `isError`.

## Proof

- The example messages of the `basic/lifecycle`, `basic/transports` and `server/tools` pages are fixtures.
- The client MUST read those fixtures.
- The server MUST produce those fixtures.
- A request with a foreign `Origin` MUST answer 403.

## Not in scope

- Media parts in messages. No requirement names them.
- Resources. No requirement names them.
- Prompts. No requirement names them.
- Sampling and elicitation. No requirement names them.
- The deprecated HTTP+SSE transport. No requirement names it.
- Annotations. Reflection drops them.
