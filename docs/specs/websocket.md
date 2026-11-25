# websocket

Package `websocket` speaks RFC 6455 over HTTP/1.1 and RFC 8441 over HTTP/2 on `net/http` types.
Package `websocket` speaks RFC 6455 over HTTP/1.1 and over HTTP/2 extended CONNECT (RFC 8441) on `net/http` types. It checks the opening handshake, guards the origin, picks a subprotocol, moves frames and closes cleanly.

The package owns the handshake answer, the frame loop and the close handshake. It holds no global session state.
`Conn` is the public transport for a hijacked HTTP/1.1 socket or one HTTP/2 stream.

The package follows RFC 6455 and RFC 8441 section 5. The unexported blocks are the frame codec, the opening-handshake checks, the origin check, the close-code rules and the message-assembly engine. `Conn` is the only public transport; the extended-CONNECT accept path adapts the HTTP/2 stream to that transport and runs the same frame loop.

## Interface

```lgo
type header struct {
	fin    bool
	rsv1   bool
	rsv2   bool
	rsv3   bool
	opcode uint8
	masked bool
	key    [4]byte
	length int64
}

func readHeader(r *bufio.Reader, limit int64) (header, error)
func readLength(r *bufio.Reader, short uint8) (uint64, error)
func appendHeader(dst []byte, h header) []byte
func mask(key [4]byte, offset int, data []byte) int

var errReservedBits = errors.New("websocket: reserved bits set")
var errUnknownOpcode = errors.New("websocket: unknown opcode")
var errControlTooLarge = errors.New("websocket: control frame too large")
var errFragmentedControl = errors.New("websocket: fragmented control frame")
var errLengthTopBit = errors.New("websocket: length top bit set")
var errNonMinimalLength = errors.New("websocket: non-minimal length")
var errPayloadTooLarge = errors.New("websocket: payload too large")

const handshakeGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

var errHandshakeMethod = errors.New("websocket: handshake requires GET method")
var errHandshakeProtocol = errors.New("websocket: handshake requires HTTP/1.1 or later")
var errHandshakeConnection = errors.New("websocket: handshake requires Connection header with upgrade token")
var errHandshakeUpgrade = errors.New("websocket: handshake requires Upgrade header with websocket token")
var errHandshakeVersion = errors.New("websocket: handshake requires Sec-WebSocket-Version 13")
var errHandshakeKey = errors.New("websocket: handshake requires Sec-WebSocket-Key with base64 of 16 bytes")
var errHandshakeSubprotocol = errors.New("websocket: Sec-WebSocket-Protocol must be an RFC 7230 token")

func acceptKey(key string) string
func checkUpgrade(r *http.Request) error
func upgradeStatus(err error) int
func handshakeFailureHeaders(err error) http.Header
func upgradeHeaders(key string, subprotocol string) (http.Header, error)
func pickSubprotocol(offered []string, supported []string) (string, error)
func handshakeOfferedHas(offered []string, name string) bool
func handshakeHasToken(values []string, want string) bool
func handshakeSingleValue(values []string) (string, bool)
func handshakeValidKey(raw string) bool
func handshakeBase64Chars(s string) bool
func handshakeBase64Char(c byte) bool
func handshakeValidToken(s string) bool
func handshakeTokenChar(c byte) bool

type Code uint16

const (
	Normal          Code = 1000
	Unsupported     Code = 1003
	PolicyViolation Code = 1008
	ServerError     Code = 1011
)

var errClosePayload = errors.New("websocket: close payload too short")
var errCloseUTF8 = errors.New("websocket: close reason not UTF-8")
var errCloseCode = errors.New("websocket: close code not allowed")
var errCloseTooLong = errors.New("websocket: close reason too long")

func parseClose(payload []byte) (uint16, string, error)
func validCloseCode(code uint16) bool
func appendClose(dst []byte, code uint16, reason string) ([]byte, error)

const headerNoLimit = 9223372036854775807

type kind uint8

const (
	kindText kind = 1
	kindBinary kind = 2
	kindPing kind = 3
	kindPong kind = 4
	kindClose kind = 5
)

type engine struct {
	r      *bufio.Reader
	limit  int64
	server bool
	buf    []byte
	ctrl   [125]byte
	open   bool
	text   bool
	valid  int
}

var errStrayContinuation = errors.New("websocket: unexpected continuation frame")
var errFragmentInProgress = errors.New("websocket: new data frame while fragmented message is open")
var errMaskMismatch = errors.New("websocket: mask bit does not match endpoint role")
var errMessageTooLarge = errors.New("websocket: message exceeds size limit")
var errInvalidUTF8 = errors.New("websocket: text message is not valid UTF-8")

func newEngine(r *bufio.Reader, limit int64, server bool) *engine
func (e *engine) next() (kind, []byte, error)
func (e *engine) acceptHead() (header, bool, error)
func (e *engine) acceptData(h header) error
func (e *engine) appendData(h header) error
func controlKind(opcode uint8) kind
func (e *engine) readControl(h header) ([]byte, error)
func checkTail(buf []byte, valid int, fin bool) (int, error)

var errHandshakeOrigin = errors.New("websocket: handshake origin not allowed")

func checkOrigin(r *http.Request, allowed []string) error
func sameOrigin(r *http.Request, origin string) bool

type Kind uint8

const (
	Text Kind = 1
	Binary Kind = 2
	Ping Kind = 3
	Pong Kind = 4
	Close Kind = 5
)

type Config struct {
	Limit int64 = 1 << 20
	Subprotocols []string
	AllowedOrigins []string
}

type Conn struct {
	// unexported fields
}

var ErrClosed = fault.New("websocket.closed", fault.Canceled, "The connection is closed.")
var ErrHandshakeFailed = fault.New("websocket.handshake_failed", fault.Invalid, "The websocket handshake failed.")
var ErrForbiddenOrigin = fault.New("websocket.forbidden_origin", fault.Forbidden, "The websocket origin is forbidden.")
var ErrProtocolError = fault.New("websocket.protocol_error", fault.Invalid, "The websocket protocol was violated.")
var ErrTooLarge = fault.New("websocket.too_large", fault.TooLarge, "The websocket message is too large.")
func Faults() []*fault.Error

func Upgrade(w http.ResponseWriter, r *http.Request, cfg Config) (*Conn?, error)
func Serve(w http.ResponseWriter, r *http.Request, cfg Config, session func(*Conn) error) error
func ServeStream(w http.ResponseWriter, r *http.Request, cfg Config) (*Conn?, error)
func ServeHijacked(conn net.Conn, rw *bufio.ReadWriter, subprotocol string, limit int64) *Conn
func (c *Conn) NetConn() net.Conn
func (c *Conn) Subprotocol() string
func ParseClose(payload []byte) (uint16, string, error)
func (c *Conn) Next(ctx context.Context) (Kind, []byte, error)
func (c *Conn) WriteText(ctx context.Context, payload []byte) error
func (c *Conn) WriteBinary(ctx context.Context, payload []byte) error
func (c *Conn) Ping(ctx context.Context, payload []byte) error
func (c *Conn) CloseWithCode(ctx context.Context, code uint16, reason string) error
func (c *Conn) Close() error
```
`header` moves no payload bytes and opens no connection. `readHeader` reads 2 to 14 header bytes and never reads payload bytes. `acceptKey`, `checkUpgrade`, `upgradeStatus`, `handshakeFailureHeaders`, `upgradeHeaders`, `pickSubprotocol`, `checkOrigin` and `sameOrigin` are pure header checks. `checkStreamRequest` and `streamStatus` are pure header checks. `serveStreamConn` wraps the HTTP/2 stream in a `streamConn` that implements `net.Conn` over the request body and the response writer, so `ServeStream` reuses `ServeHijacked` and the one frame loop. `streamConn` deadlines reach the stream through `http.ResponseController`. `parseClose`, `validCloseCode` and `appendClose` move no frame bytes. `engine` reads frames from a `*bufio.Reader` and assembles messages; it opens no connection and starts no goroutine. `Conn` owns one hijacked connection, answers pings, echoes one close and ends.
Each detection site wraps its unexported cause in the declared fault for that class. The frame, engine and close codecs surface `ErrProtocolError` or `ErrTooLarge` through the `Exposed` probes in `export_test.lgo` and `close_export_test.lgo`. The handshake checks keep their unexported causes for the status map and surface them through `handshake_export_test.lgo`.

## Requirements

### Frame codec (RFC 6455 sections 5.2, 5.3, 5.5, 5.7)

- `readHeader` MUST read 2 to 14 header bytes.
- `readHeader` MUST move no payload bytes.
- `readHeader` MUST fail on set rsv1, rsv2 or rsv3 with `ErrProtocolError`.
- Each opcode in 0x3 to 0x7 and 0xB to 0xF MUST fail with `ErrProtocolError`.
- `readHeader` MUST fail on a fragmented control frame with `ErrProtocolError`.
- `readHeader` MUST fail on a control payload above 125 bytes with `ErrProtocolError`.
- A 64-bit control length of 65536 MUST fail with `ErrProtocolError`.
- Length 126 MUST pass as a minimal 16-bit length.
- Length 125 MUST fail as a non-minimal 16-bit length.
- `readHeader` MUST fail on a 64-bit length with the top bit set with `ErrProtocolError`.
- `readHeader` MUST fail on a non-minimal 16-bit or 64-bit length with `ErrProtocolError`.
- `readHeader` MUST fail on a payload above the caller limit with `ErrTooLarge`.
- A limit of 0 MUST admit empty payloads only.
- Large vectors MUST carry real payload bytes, masked where the header says masked.
- `appendHeader` MUST encode a read header back to the exact consumed bytes.
- Any `FuzzFrame` input MUST either fail `readHeader` or encode back to the consumed bytes.
- `FuzzFrame` MUST seed the 126-exact minimal 16-bit header `82 7e 00 7e`.
- `mask` MUST XOR data in place with key at offset.
- `mask` MUST return `(offset + length) % 4`.

### Opening handshake (RFC 6455 sections 1.3, 4.2.1, 4.2.2)

- `acceptKey` MUST return base64 SHA-1 of the trimmed key plus the GUID.
- `checkUpgrade` MUST reject a non-GET method with the method error.
- `checkUpgrade` MUST reject HTTP/1.0 and older with the protocol error.
- `checkUpgrade` MUST reject a `Connection` without the upgrade token with the connection error.
- Token match MUST span all header lines and comma values without case.
- `checkUpgrade` MUST reject an `Upgrade` other than `websocket` with the upgrade error.
- `checkUpgrade` MUST require exactly one non-blank `Sec-WebSocket-Version` value of `13`.
- `checkUpgrade` MUST require exactly one non-blank `Sec-WebSocket-Key` value.
- `checkUpgrade` MUST reject a key outside the base64 alphabet with the key error.
- `checkUpgrade` MUST reject a decoded key of length other than 16 bytes with the key error.
- `upgradeHeaders` MUST set `Upgrade`, `Connection` and `Sec-WebSocket-Accept` from `acceptKey`.
- `upgradeHeaders` MUST set `Sec-WebSocket-Protocol` only for a non-empty subprotocol.
- `pickSubprotocol` MUST trim supported names before matching.
- `pickSubprotocol` MUST skip blank supported names.
- `pickSubprotocol` MUST return the first supported name the client offered, in server order.
- `pickSubprotocol` MUST read every `Sec-WebSocket-Protocol` line and every comma value.
- `pickSubprotocol` MUST refuse a supported name outside the RFC 7230 token set with the subprotocol error.
- `pickSubprotocol` MUST return empty text when no offered name matches.
- `pickSubprotocol` MUST NOT return a name the client did not offer.
- `upgradeStatus` MUST map a nil error to 101 and the version error to 426.
- `upgradeStatus` MUST map the method error to 405, the origin error to 403, and each other error to 400.
- `handshakeFailureHeaders` MUST set `Sec-WebSocket-Version: 13` for the version error only.
- The 426 caller MUST send `Sec-WebSocket-Version: 13` with the response.

### HTTP/2 opening handshake (RFC 8441 section 5)

- `Serve` MUST accept HTTP/2 `CONNECT` only when `:protocol` is `websocket`.
- The HTTP/2 server MUST validate the required pseudo-headers before `Serve` receives the request.
- `Serve` MUST reject `Connection`, `Upgrade`, `Sec-WebSocket-Key` and `Sec-WebSocket-Accept` on the request.
- `Serve` MUST require exactly one `Sec-WebSocket-Version` field with value `13`.
- `Serve` MUST reject an invalid or repeated subprotocol token in the client's offer.
- `Serve` MUST apply the same origin check and subprotocol selection as `Upgrade`.
- On success, `Serve` MUST send HTTP 200 and flush the headers before calling `session`.
- The HTTP/2 response MUST NOT include `Connection`, `Upgrade`, `Sec-WebSocket-Accept` or `Content-Length`.

### Origin check (RFC 6455 section 4.1, RFC 6454 section 7)

- `checkOrigin` MUST allow a request with no `Origin` header.
- `checkOrigin` MUST allow an origin that matches `AllowedOrigins` exactly.
- `checkOrigin` MUST allow an `http` or `https` origin whose host equals the request host.
- `checkOrigin` MUST reject any other origin with `errHandshakeOrigin`.
- `Upgrade` MUST answer that rejection with HTTP 403 and no close code.
- `Serve` MUST also answer a rejected HTTP/2 origin with HTTP 403 and no close code.

### Connection (RFC 6455 sections 5.4, 5.5, 5.6, 6, 7)

- `Upgrade` MUST write each handshake failure status itself and return the fault.
- `Upgrade` MUST answer 101 with `Upgrade`, `Connection`, `Accept` and the subprotocol.
- `Upgrade` MUST hijack the connection and return a `Conn` over it.
- On HTTP/1.1, `Serve` MUST use `Upgrade`, run `session` and close the socket.
- On HTTP/2, `Serve` MUST read from the request body and write frames to the response stream.
- The handler MUST call `Serve` before it returns. The callback MUST finish using the `Conn` before it returns.
- On HTTP/2, `NetConn` MUST refer to the stream only. Its deadlines MUST apply to that stream.
- On HTTP/2, `Conn.Close` MUST unblock stream I/O and prevent later use of the response writer. Return from the handler to finish the response stream.
- HTTP/2 operations MUST observe cancellation and deadlines. Termination of a WebSocket MUST NOT close the shared HTTP/2 connection.
- `ServeHijacked` MUST panic on a nil connection or buffer.
- A limit of 0 MUST select 1048576 bytes.
- A negative limit MUST panic.
- `Next` MUST return each text and binary message assembled from fragments.
- `Next` MUST answer a ping with a pong of the same payload.
- `Next` MUST return ping, pong and close events to the caller.
- `Next` MUST echo a valid peer close once and end the connection.
- `Next` after the close MUST return `ErrClosed`.
- `Next` and each write method MUST observe the closed state before touching the connection.
- `CloseWithCode` MUST send one close frame and end the connection.
- `Close` MUST close the connection so later calls return `ErrClosed`.
- `ParseClose` MUST decode a close payload exactly like `parseClose`.
- `Upgrade` MUST return `ErrHandshakeFailed` for a check failure and `ErrForbiddenOrigin` for a foreign origin.
- `Upgrade` MUST send no body text with a failure status.
- Each close frame the server sends on a protocol fault MUST carry the code only and no reason text.

### Extended CONNECT (RFC 8441 sections 3, 4, 5)

- The `:scheme`, `:path` and `:authority` checks stay with the HTTP/2 server: it resets a malformed stream with `PROTOCOL_ERROR` before the handler runs. The server sends `SETTINGS_ENABLE_CONNECT_PROTOCOL = 1` only when the process runs with `GODEBUG=http2xconnect=1`, the one opt-in the toolchain offers.
- `ServeStream` MUST require the CONNECT method and HTTP/2, else answer 405 and 400.
- `ServeStream` MUST require `:protocol` `websocket`, else answer 501. A CONNECT without `:protocol` is a tunnel the package does not proxy, and answers 501 too.
- `ServeStream` MUST require exactly one non-blank `Sec-WebSocket-Version` value of `13`, else answer 400.
- `ServeStream` MUST NOT process `Sec-WebSocket-Key` and MUST send no `Sec-WebSocket-Accept`, as RFC 8441 section 5 replaces them with `:protocol`.
- `ServeStream` MUST apply the same origin check and size limit as `Upgrade`: a foreign origin answers 403 with `ErrForbiddenOrigin`.
- `ServeStream` MUST pick the subprotocol with `pickSubprotocol` and answer it in `Sec-WebSocket-Protocol`.
- `ServeStream` MUST answer 200 and flush the headers before the first read, so the client starts sending frames.
- `ServeStream` MUST return `ErrHandshakeFailed` for a check failure and `ErrForbiddenOrigin` for a foreign origin.
- `ServeStream` MUST run the same frame loop as the HTTP/1.1 path: text echoes, a peer close is echoed once, and the second `Next` returns `ErrClosed`.
- A stream reset or END_STREAM ends the read side; the connection then follows the same failed-or-closed path as a dropped TCP connection, with no goroutine left behind.
- `ServeStream` MUST send no body text with a failure status.

### Close payload and codes (RFC 6455 sections 5.5.1, 7.1.5, 7.1.6, 7.4)

- The package MUST export `Normal` as 1000, `Unsupported` as 1003, `PolicyViolation` as 1008 and `ServerError` as 1011.
- `parseClose` MUST return code 1005 with empty reason and no error for empty payload.
- `parseClose` MUST decode the first two payload bytes as code in network order.
- `parseClose` MUST decode remaining payload bytes as reason.
- `parseClose` MUST fail with `ErrProtocolError` when reason holds invalid UTF-8.
- `validCloseCode` MUST accept 1000 through 1003, 1007 through 1014 and 3000 through 4999.
- `validCloseCode` MUST reject codes below 1000 and above 4999, 1004 to 1006, 1015, and 1016 to 2999.
- `appendClose` MUST fail with `ErrProtocolError` for a code `validCloseCode` rejects.
- `appendClose` MUST fail with `ErrProtocolError` when code plus reason exceeds 125 bytes.
- `appendClose` MUST encode code in network order followed by reason bytes.
- `appendClose` MUST never truncate reason.

### Message engine (RFC 6455 sections 5.4, 5.5, 5.6, 8.1)

- A returned slice MUST remain valid only until the next call.
- `next` MUST read frames until one whole data message is assembled.
- `next` MUST return each ping, pong and close frame as its own event.
- `next` MUST preserve a partial data message across a control event.
- Kind values MUST be 1 for text, 2 for binary, 3 for ping, 4 for pong and 5 for close.
- A continuation frame with no open message MUST fail with `ErrProtocolError`.
- A data frame while a message stays open MUST fail with `ErrProtocolError`.
- A frame with the wrong mask bit MUST fail with `ErrProtocolError`.
- Server role MUST want masked frames.
- Client role MUST want unmasked frames.
- A message past the size limit MUST fail with `ErrTooLarge` before payload bytes enter memory.
- A text message outside valid UTF-8 MUST fail with `ErrProtocolError`, checked on each fragment.
- An invalid prefix MUST fail before the last fragment arrives.
- A code point split by a boundary MUST pass once completed.
- The engine MUST reuse one payload buffer across messages.
- The engine MUST unmask payload bytes in place.
- `next` MUST allocate nothing per message after warm-up.
- Control payloads MUST bypass the message size limit.

### Code table

| Code | Kind | Message |
| `websocket.closed` | canceled | The connection is closed. |
| `websocket.handshake_failed` | invalid | The websocket handshake failed. |
| `websocket.forbidden_origin` | forbidden | The websocket origin is forbidden. |
| `websocket.protocol_error` | invalid | The websocket protocol was violated. |
| `websocket.too_large` | too_large | The websocket message is too large. |

## Errors

- `websocket.closed`: `ErrClosed`, kind `canceled`, message `The connection is closed.` Returned after the close handshake; local only, no close code sent.
- `websocket.handshake_failed`: `ErrHandshakeFailed`, kind `invalid`, message `The websocket handshake failed.` The cause is the unexported check error and selects the status.
- `websocket.forbidden_origin`: `ErrForbiddenOrigin`, kind `forbidden`, message `The websocket origin is forbidden.` The cause is `errHandshakeOrigin`; answered with HTTP 403 and no body text.
- `websocket.protocol_error`: `ErrProtocolError`, kind `invalid`, message `The websocket protocol was violated.` The cause is the unexported detection error and selects the close code.
- The close code MUST be 1002 for a frame or session fault, and 1007 for bad UTF-8.
- A sent close frame MUST carry the code only and no reason text.
- `websocket.too_large`: `ErrTooLarge`, kind `too_large`, message `The websocket message is too large.` The cause is the unexported limit error; answered with 1009 and no reason text.
- `websocket: hijack: <cause>` when the upgrade cannot take over the connection.
- `websocket: write upgrade status`, `write upgrade header`, `write upgrade end` and `flush upgrade` when the 101 reply fails.
- `websocket: write frame header`, `write frame payload` and `flush frame` when a data, ping or close frame fails.
- `websocket: set read deadline` and `set write deadline` when the connection rejects the context deadline.
- `websocket: close after failed upgrade` and `websocket: close: <cause>` when the connection fails to close.

## Proof

- `TestRFCDataFrames` proves that unmasked text, masked text and fragment heads read and encode back.
- `TestRFCControlFrames` proves that the ping and pong vectors read and encode back.
- `TestRFCLargeFrames` proves that the 126-byte, 256-byte, 65536-byte and masked 64-bit vectors carry real payload bytes.
- `TestRefuseReservedBits` proves that a set rsv bit fails with `ErrProtocolError`.
- `TestRefuseUnknownOpcode` proves that each opcode in 0x3 to 0x7 and 0xB to 0xF fails with `ErrProtocolError`.
- `TestRefuseControlTooLarge` proves that a 16-bit control length of 126 fails with `ErrProtocolError`.
- `TestRefuseControlTooLarge64` proves that a minimal 64-bit control length of 65536 fails with `ErrProtocolError`.
- `TestRefuseFragmentedControl` proves that a control frame without fin fails with `ErrProtocolError`.
- `TestRefuseLengthTopBit` proves that a 64-bit length with the top bit set fails with `ErrProtocolError`.
- `TestRefuseShortLength16` proves that 16-bit lengths 5 and 125 fail with `ErrProtocolError`.
- `TestRefuseShortLength64` proves that a short 64-bit length fails with `ErrProtocolError`.
- `TestRefusePayloadOverLimit` proves that a payload above the caller limit fails with `ErrTooLarge`.
- `TestMaskMatchesByteLoop` proves that `mask` matches the byte loop for lengths 0 to 40 and offsets 0 to 3.
- `TestReadHeaderZeroAllocs` proves that a warmed `readHeader` allocates nothing.
- `FuzzFrame` proves that any input either fails `readHeader` or encodes back to the consumed bytes.
- `TestAcceptKeyMatchesRFC6455Vector` proves that the RFC 6455 section 1.3 vector gives `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`.
- `TestAcceptKeyTrimsOuterWhitespace` proves that `acceptKey` trims outer whitespace before hashing.
- `TestCheckUpgradeAcceptsValidRequest` proves that a valid request passes.
- `TestCheckUpgradeRefusesNonGet` proves that a non-GET method fails with the method error.
- `TestCheckUpgradeRefusesOldProtocol` proves that HTTP/1.0 fails with the protocol error.
- `TestCheckUpgradeRefusesMissingConnection` proves that a `Connection` without the upgrade token fails with the connection error.
- `TestCheckUpgradeRefusesWrongUpgrade` proves that a wrong `Upgrade` token fails with the upgrade error.
- `TestCheckUpgradeRefusesWrongVersion` proves that a wrong version fails with the version error.
- `TestCheckUpgradeRefusesMissingVersion` proves that a missing version fails with the version error.
- `TestCheckUpgradeRefusesDuplicateVersion` proves that two version lines fail with the version error.
- `TestCheckUpgradeRefusesBadKey` proves that a bad key fails with the key error.
- `TestCheckUpgradeRefusesMissingKey` proves that a missing key fails with the key error.
- `TestCheckUpgradeRefusesDuplicateKey` proves that two key lines fail with the key error.
- `TestCheckUpgradeRefusesShortKey` proves that a 15-byte decoded key fails with the key error.
- `TestCheckUpgradeRefusesLongKey` proves that a 17-byte decoded key fails with the key error.
- `TestCheckUpgradeRefusesUnpaddedKey` proves that an unpadded key fails with the key error.
- `TestCheckUpgradeAcceptsPaddedOuterWhitespaceKey` proves that a key with outer whitespace passes.
- `TestCheckUpgradeRefusesInnerWhitespaceKey` proves that a key with inner whitespace fails with the key error.
- `TestCheckUpgradeAcceptsMixedCaseTokens` proves that token match ignores case across lines.
- `TestCheckUpgradeAcceptsSplitUpgradeLines` proves that `Upgrade` match spans two header lines.
- `TestCheckUpgradeAcceptsCommaTokens` proves that `Connection` match spans comma values.
- `TestCheckUpgradeAcceptsSpacedCommaTokens` proves that token match tolerates spaces around commas.
- `TestUpgradeStatusCodes` proves that nil maps to 101, version to 426, method to 405 and each other error to 400.
- `TestFailureHeadersSetsVersionOn426` proves that the version error yields `Sec-WebSocket-Version: 13`.
- `TestFailureHeadersEmptyOtherwise` proves that a non-version error yields no version header.
- `TestUpgradeHeadersRoundTrip` proves that response headers carry `Upgrade`, `Connection`, the RFC accept value and the subprotocol.
- `TestUpgradeHeadersOmitsEmptySubprotocol` proves that an empty subprotocol sets no protocol header.
- `TestUpgradeHeadersRefusesCRLFInjection` proves that a CR LF subprotocol fails with the subprotocol error.
- `TestPickSubprotocolPrefersServerOrder` proves that the first supported offered name wins.
- `TestPickSubprotocolFallsBackToSecond` proves that an unoffered first choice falls back to the second.
- `TestPickSubprotocolReturnsEmptyOnNoMatch` proves that no match returns empty text.
- `TestPickSubprotocolNeverPicksUnoffered` proves that an unoffered value is never picked.
- `TestPickSubprotocolTrimsSupportedName` proves that a supported name with spaces matches after trimming.
- `TestPickSubprotocolIgnoresBlankNames` proves that blank names are skipped.
- `TestPickSubprotocolRefusesCRLFInjection` proves that a CR LF supported name fails with the subprotocol error.
- `TestCloseValidBoundary` proves the accepted and refused code ranges of `validCloseCode`.
- `TestCloseCodesMatchSketch` proves that `Normal`, `Unsupported`, `PolicyViolation` and `ServerError` equal 1000, 1003, 1008 and 1011.
- `TestParseCloseEmpty` proves that an empty payload returns code 1005 with empty reason and no error.
- `TestParseCloseOneByte` proves that a one-byte payload fails with `ErrProtocolError`.
- `TestParseCloseCodeOnly` proves that a two-byte payload decodes the code in network order with empty reason.
- `TestParseCloseCodeReason` proves that a longer payload decodes code 1000 and reason `bye`.
- `TestParseCloseInvalidUTF8` proves that an invalid UTF-8 reason fails with `ErrProtocolError`.
- `TestAppendCloseReasonLimits` proves that a 123-byte reason fits in 125 bytes and a 124-byte reason fails with `ErrProtocolError`.
- `TestAppendCloseRefusesBadCode` proves that each refused code fails with `ErrProtocolError`.
- `TestCloseRoundTrip` proves that an appended close payload parses back to its code and reason.
- `TestEngineFragmentedHelloWithPing` proves that a ping arrives first and fragments assemble to `Hello`.
- `TestEngineRefusesStrayContinuation` proves that a continuation with no open message fails with `ErrProtocolError`.
- `TestEngineRefusesNewDataWhileOpen` proves that a data frame while a message stays open fails with `ErrProtocolError`.
- `TestEngineRefusesUnmaskedInServerRole` proves that an unmasked frame in server role fails with `ErrProtocolError`.
- `TestEngineRefusesMaskedInClientRole` proves that a masked frame in client role fails with `ErrProtocolError`.
- `TestEngineRefusesMessageOverLimit` proves that a message past the limit fails with `ErrTooLarge` and leaves payload bytes buffered.
- `TestEngineRefusesFragmentedTotalOverLimit` proves that a fragmented total past the limit fails with `ErrTooLarge`.
- `TestEngineAcceptsControlOverMessageLimit` proves that a 5-byte ping passes a 4-byte message limit.
- `TestEngineRefusesInvalidPrefixBeforeLastFragment` proves that an invalid prefix fails before the last fragment arrives.
- `TestEngineRefusesOverlongEncoding` proves that an overlong encoding fails with `ErrProtocolError`.
- `TestEngineRefusesLoneSurrogate` proves that a lone surrogate fails with `ErrProtocolError`.
- `TestEngineAcceptsSplitFourByteRune` proves that a rune split across fragments passes once completed.
- `TestEngineNextZeroAllocs` proves that a warmed `next` allocates nothing per message.
- `TestFaultsMatchSpecCodeTable` proves that `Faults` holds each spec table code once with its kind and message.
- `TestFaultHandshakeFailedInvalidMethod` proves that a non-GET handshake answers 405 with `ErrHandshakeFailed`.
- `TestFaultForbiddenOriginRejected` proves that a foreign origin answers 403 with `ErrForbiddenOrigin` and hides the origin and secrets from the public view.
- `TestFaultPublicHidesFrameBytes` proves that a protocol fault hides hostile frame bytes from the public view and sends 1002 with no reason text.
- `TestFaultClosedAfterClose` proves that calls after the close fail with `ErrClosed`.
- `TestPeerCloseEchoedOnceThenEnds` proves that a peer close with code 1000 is echoed once and the connection ends.
- `TestFaultFrameOverLimitSends1009` proves that a message past the limit fails with `ErrTooLarge` and sends 1009.
- `TestFaultInvalidUTF8Sends1007` proves that invalid UTF-8 text fails with `ErrProtocolError` and sends 1007.
- `TestFaultReservedBitSends1002` proves that a set reserved bit fails with `ErrProtocolError` and sends 1002.
- `TestPingAnsweredWithPong` proves that a ping arrives as an event and the peer gets its pong.
- `TestBinaryEchoRoundTrip1KiB` proves that a 1024-byte binary message echoes back byte for byte.
- `TestExpiredContextFailsFast` proves that an expired context fails a read and a write.
- `TestCloseWithCodeEndsConnection` proves that `CloseWithCode` sends 1000 and ends the connection.
- `TestUpgradeAnswers101WithRFCVector` proves that the RFC 6455 section 1.3 sample key answers 101 with its accept value.
- `TestUpgradeOriginPolicy` proves that foreign origins get 403 while same, absent and listed origins get 101.
- `TestUpgradeSelectsSubprotocolInServerOrder` proves that the first supported offered subprotocol wins.
- `TestHTTP2WebSocketEchoAndClose` exercises a masked text echo, subprotocol selection and a close handshake over HTTP/2. It then uses the same connection for another request.
- `TestHTTP2WebSocketRejectsInvalidHandshake` checks the protocol, legacy key, version, subprotocol offer and origin rejections.
- `TestHTTP2WebSocketReadDeadlineAndCancellation` checks read deadlines and cancellation on a live HTTP/2 stream.
- `TestHTTP2WebSocketWriteDeadline` checks a write blocked by HTTP/2 flow control. The HTTP/2 connection stays open.
- `BenchmarkFrameEcho1KiB` reports allocations per 1 KiB echo over the frame codec.
- `TestStreamEchoOverTLS` proves that an HTTP/2 client with `:protocol` `websocket` gets 200, the picked subprotocol and its text message back.
- `TestStreamCloseRoundTrip` proves that a peer close over the stream is echoed once and the handler then ends.
- `TestStreamRejectsBadHandshakes` proves that a foreign or missing `:protocol` answers 501, a missing or wrong version answers 400, a foreign origin answers 403 and a wrong method answers 405, each with its fault.
- `TestStreamRefusesHTTP1Connect` proves that a CONNECT over HTTP/1.1 answers 400.
- `BenchmarkLoopbackEcho1KiB` reports allocations and latency percentiles per 1 KiB text echo over loopback TCP.

## Not in scope

- Extensions such as permessage-deflate. No requirement names them.
- A client handshake builder. The code checks requests only.
- A background keep-alive loop. The application sends `Ping` itself.
- HTTP/3 (RFC 9220). No requirement names it; `web.Server` offers the `h2` and `http/1.1` ALPN protocols only, and never advertises HTTP/3.
