# http3

HTTP/3 for `web.Server` uses `github.com/quic-go/quic-go/http3`. `Start` opens one UDP listener on the same port as the TCP listener. The router answers HTTP/3 requests with the same stages and replies as other versions.

The standard library cannot serve HTTP/3. It keeps the glue in the unexported `http3ServerHandler` type in `src/net/http/server.go`. That file states that HTTP/3 is not yet accessible to end-users. `golang.org/x/net` holds a `quic` package but no `http3` package in the checked releases. A package under `internal` is not importable from outside its module. The `quic-go` `http3.Server` type is exported with `Serve`, `Shutdown` and `SetQUICHeaders`. Its licence is MIT. Its non-test code holds no `import "C"`.

## Interface

```lgo
type Server struct {
	Addr              string = ":8080"
	Router            *web.Router
	ReadHeaderTimeout time.Duration = 5 * time.Second
	ShutdownGrace     time.Duration = 20 * time.Second
	TLS               *tls.Config?
	H2C               bool
	H3                bool
	// unexported fields
}

func (s *Server) AltSvc() web.Stage
func (s *Server) Start(ctx context.Context) error
func (s *Server) Serve(ctx context.Context, l net.Listener, conn net.PacketConn) error
func (s *Server) Stop(ctx context.Context) error

var ErrH3NeedsTLS = fault.New("http3.h3_needs_tls", fault.Internal, "HTTP/3 needs a TLS configuration.")
var ErrListenUDP = fault.New("http3.listen_udp", fault.Internal, "The UDP listener failed to open.")
var ErrH3Serve = fault.New("http3.h3_serve", fault.Internal, "The HTTP/3 server failed.")
var ErrH3Shutdown = fault.New("http3.h3_shutdown", fault.Internal, "The HTTP/3 shutdown failed.")
func Faults() []*fault.Error
```

The other fields keep the meaning that [web](web.md) gives them, except `ReadHeaderTimeout`, which bounds the TCP listener only. `H3` turns HTTP/3 on.

## Requirements

### Listener and discovery

- `H3` MUST stay false unless the application wants HTTP/3.
- When `H3` is true, `Start` MUST open one UDP listener on `Addr` before it returns.
- The UDP listener MUST use the same port as the TCP listener.
- When `Addr` holds port 0, `Start` MUST bind TCP first on port 0, then UDP on the bound TCP port.
- On a UDP conflict `Start` MUST release both sockets and MUST try again a bounded number of times.
- `Serve` MUST serve the caller sockets instead of binding `Addr`.
- `Serve` MUST NOT close the caller sockets when it fails.
- When `H3` is true and `TLS` is nil, `Start` MUST fail and MUST NOT listen.
- The UDP listener MUST negotiate only ALPN `h3`.
- The UDP listener MUST use TLS 1.3 with no older version.
- `ReadHeaderTimeout` MUST bound the TCP listener header reads only.
- `ReadHeaderTimeout` MUST NOT be presented as bounding HTTP/3 header reads.
- `quic-go` v0.65.0 parses HEADERS with no per-stream deadline, only a `MaxHeaderBytes` size cap.
- A stalled header block therefore outlives the setting while other streams keep the connection alive.
- The TCP listener MUST keep the ALPN list that [web](web.md) fixes.
- Each HTTPS response MUST carry `Alt-Svc: h3=":<port>"; ma=2592000` while the UDP listener is open, with the actual UDP port.
- A cleartext response MUST NOT carry that header.
- A response when `H3` is false MUST NOT carry that header.
- The router MUST run the same stages for an HTTP/3 request as for other versions.
- The router MUST write the same replies for an HTTP/3 request as for other versions.
- `AltSvc` MUST set `Alt-Svc` with the bound UDP port on an HTTPS request while the server runs.
- The stage MUST skip a cleartext request, a stopped server and a server with `H3` false.
- `Start` MUST NOT add the stage to the router itself.
- When `H3` is false, `Start` MUST serve TCP only and open no UDP listener.

### Shutdown

- `Stop` MUST close the UDP listener before it returns, after the drain or the timeout ends it.
- `Stop` MUST send GOAWAY on HTTP/3 connections, then wait for open requests until `ShutdownGrace` ends (RFC 9114).
- `Stop` MUST return at the caller deadline when that deadline is sooner.
- `Stop` MUST close HTTP/3 connections when shutdown times out.
- `Stop` of a server that is not started MUST return a nil error.

### Early data

- The server MUST refuse 0-RTT early data, because early data replays and a replayed request could run twice.
- Extended CONNECT over HTTP/3 MUST stay unbuilt, as [web](web.md) states for HTTP/2.
- The server MUST answer an extended CONNECT request with 501 and MUST NOT pass it to the router.
- `quic-go` v0.65.0 sends `SETTINGS_ENABLE_CONNECT_PROTOCOL = 1` on every connection.
- `http3.Server.settings` hardcodes `ExtendedConnect: true` with no knob.
- `AdditionalSettings` MUST refuse RFC 9114 ids.
- Peers may therefore attempt extended CONNECT; the 501 boundary above is the enforcement.

### Faults

- A nil `TLS` with `H3` MUST map to `http3.h3_needs_tls`.
- A UDP listen failure MUST map to `http3.listen_udp` with the address in the cause.
- An HTTP/3 serve failure MUST map to `http3.h3_serve` with the cause.
- An HTTP/3 shutdown failure MUST map to `http3.h3_shutdown` with the cause.

### Code table

| Code | Kind | Message |
| --- | --- | --- |
| `http3.h3_needs_tls` | internal | "HTTP/3 needs a TLS configuration." |
| `http3.listen_udp` | internal | "The UDP listener failed to open." |
| `http3.h3_serve` | internal | "The HTTP/3 server failed." |
| `http3.h3_shutdown` | internal | "The HTTP/3 shutdown failed." |

## Errors

- A nil `TLS` with `H3` MUST map to `http3.h3_needs_tls`.
- A UDP listen failure MUST map to `http3.listen_udp` with the address in the cause.
- An HTTP/3 serve failure MUST map to `http3.h3_serve` with the cause.
- An HTTP/3 shutdown failure MUST map to `http3.h3_shutdown` with the cause. `Stop` then closes the HTTP/3 server and joins that error.
- Public views MUST NOT carry addresses, ports or transport details.

## Proof

- `TestH3NeedsTLSFailsStart` proves that H3 without TLS fails to start and opens no listener.
- `TestH3ServesHTTP3OverUDP` proves that a request over UDP gets the router answer with ALPN `h3`.
- `TestH3SharesRouterWithTCP` proves that the same route answers over both listeners.
- `TestH3AltSvcOnHTTPSOnly` proves the header value on HTTPS and its absence on cleartext and when `H3` is false.
- `TestH3AltSvcIgnoresRegistrationOrder` proves that discovery works whether the stage is added before or after route registration.
- `TestH3RequiresTLS13` proves that a pre-1.3 handshake on the UDP listener fails.
- `TestH3StopDrainsWithinGrace` proves that `Stop` waits for a live HTTP/3 request.
- `TestH3StopClosesUDPListener` proves that the UDP port rebinds right after `Stop`.
- `TestH3StopShutsTCPWhileH3Drains` proves that TCP stops accepting while an HTTP/3 request drains.
- `TestH3RefusesExtendedConnect` proves that an extended CONNECT request answers 501 without reaching the router while plain H3 traffic still passes.
- `TestH3StopMeetsCallerDeadline` proves that `Stop` returns at the caller deadline with a stuck handler.
- `TestH3RefusesEarlyData` proves that the QUIC config refuses 0-RTT.
- `TestH3StopClosesOnTimeout` proves that a timed-out shutdown ends the HTTP/3 request.
- `TestH3AltSvcAbsentWhenH3False` proves no header without `H3`.
- `TestFaultsMatchSpecCodeTable` proves `Faults` matches the code table without duplicates.
- `TestFaultPublicHidesSecrets` proves public views hide secrets and hostile text.

## Not in scope

- WebTransport. No requirement names it.
- Datagrams (RFC 9297). `EnableDatagrams` stays false.
- An HTTP/3 client. `client` stays on TCP.
- A 0-RTT opt-in. The server refuses early data with no per-route exception.
