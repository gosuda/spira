# websocket

Package `websocket` holds the unexported building blocks of RFC 6455: the frame codec, the opening-handshake checks, the close-code rules and the message-assembly engine. There is no public API yet and no transport.

The package follows RFC 6455. The present scope is the frame codec, the opening-handshake checks, the close-code rules and the message-assembly engine, all unexported. The connection type, the upgrade entry point and any public API wait for design decisions.

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

var ErrReservedBits = errors.New("websocket: reserved bits set")
var ErrUnknownOpcode = errors.New("websocket: unknown opcode")
var ErrControlTooLarge = errors.New("websocket: control frame too large")
var ErrFragmentedControl = errors.New("websocket: fragmented control frame")
var ErrLengthTopBit = errors.New("websocket: length top bit set")
var ErrNonMinimalLength = errors.New("websocket: non-minimal length")
var ErrPayloadTooLarge = errors.New("websocket: payload too large")

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

var ErrClosePayload = errors.New("websocket: close payload too short")
var ErrCloseUTF8 = errors.New("websocket: close reason not UTF-8")
var ErrCloseCode = errors.New("websocket: close code not allowed")
var ErrCloseTooLong = errors.New("websocket: close reason too long")

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

var ErrStrayContinuation = errors.New("websocket: unexpected continuation frame")
var ErrFragmentInProgress = errors.New("websocket: new data frame while fragmented message is open")
var ErrMaskMismatch = errors.New("websocket: mask bit does not match endpoint role")
var ErrMessageTooLarge = errors.New("websocket: message exceeds size limit")
var ErrInvalidUTF8 = errors.New("websocket: text message is not valid UTF-8")

func newEngine(r *bufio.Reader, limit int64, server bool) *engine
func (e *engine) next() (kind, []byte, error)
func (e *engine) acceptHead() (header, bool, error)
func (e *engine) acceptData(h header) error
func (e *engine) appendData(h header) error
func controlKind(opcode uint8) kind
func (e *engine) readControl(h header) ([]byte, error)
func (e *engine) reserve(length int64) error
func checkTail(buf []byte, valid int, fin bool) (int, error)
```

`header` moves no payload bytes and opens no connection. `readHeader` reads 2 to 14 header bytes and never reads payload bytes. `acceptKey`, `checkUpgrade`, `upgradeStatus`, `handshakeFailureHeaders`, `upgradeHeaders` and `pickSubprotocol` are pure header checks. `parseClose`, `validCloseCode` and `appendClose` move no frame bytes. `engine` reads frames from a `*bufio.Reader` and assembles messages; it opens no connection and starts no goroutine. External tests reach every name above only through the `Exposed` probes in `export_test.lgo`, `handshake_export_test.lgo` and `close_export_test.lgo`.

## Requirements

### Frame codec (RFC 6455 sections 5.2, 5.3, 5.5, 5.7)

- `readHeader` MUST read 2 to 14 header bytes.
- `readHeader` MUST move no payload bytes.
- `readHeader` MUST fail on set rsv1, rsv2 or rsv3 with `ErrReservedBits`.
- Each opcode in 0x3 to 0x7 and 0xB to 0xF MUST fail with `ErrUnknownOpcode`.
- `readHeader` MUST fail on a fragmented control frame with `ErrFragmentedControl`.
- `readHeader` MUST fail on a control payload above 125 bytes with `ErrControlTooLarge`.
- A 64-bit control length of 65536 MUST fail with `ErrControlTooLarge`.
- Length 126 MUST pass as a minimal 16-bit length.
- Length 125 MUST fail as a non-minimal 16-bit length.
- `readHeader` MUST fail on a 64-bit length with the top bit set with `ErrLengthTopBit`.
- `readHeader` MUST fail on a non-minimal 16-bit or 64-bit length with `ErrNonMinimalLength`.
- `readHeader` MUST fail on a payload above the caller limit with `ErrPayloadTooLarge`.
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
- `upgradeStatus` MUST map the method error to 405 and each other error to 400.
- `handshakeFailureHeaders` MUST set `Sec-WebSocket-Version: 13` for the version error only.
- The 426 caller MUST send `Sec-WebSocket-Version: 13` with the response.

### Close payload and codes (RFC 6455 sections 5.5.1, 7.1.5, 7.1.6, 7.4)

- The package MUST export `Normal` as 1000, `Unsupported` as 1003, `PolicyViolation` as 1008 and `ServerError` as 1011.
- `parseClose` MUST return code 1005 with empty reason and no error for empty payload.
- `parseClose` MUST decode the first two payload bytes as code in network order.
- `parseClose` MUST decode remaining payload bytes as reason.
- `parseClose` MUST fail with `ErrCloseUTF8` when reason holds invalid UTF-8.
- `validCloseCode` MUST accept 1000 through 1003, 1007 through 1014 and 3000 through 4999.
- `validCloseCode` MUST reject codes below 1000 and above 4999, 1004 to 1006, 1015, and 1016 to 2999.
- `appendClose` MUST fail with `ErrCloseCode` for a code `validCloseCode` rejects.
- `appendClose` MUST fail with `ErrCloseTooLong` when code plus reason exceeds 125 bytes.
- `appendClose` MUST encode code in network order followed by reason bytes.
- `appendClose` MUST never truncate reason.

### Message engine (RFC 6455 sections 5.4, 5.5, 5.6, 8.1)

- A returned slice MUST remain valid only until the next call.
- `next` MUST read frames until one whole data message is assembled.
- `next` MUST return each ping, pong and close frame as its own event.
- `next` MUST preserve a partial data message across a control event.
- Kind values MUST be 1 for text, 2 for binary, 3 for ping, 4 for pong and 5 for close.
- A continuation frame with no open message MUST fail with `ErrStrayContinuation`.
- A data frame while a message stays open MUST fail with `ErrFragmentInProgress`.
- A frame with the wrong mask bit MUST fail with `ErrMaskMismatch`.
- Server role MUST want masked frames.
- Client role MUST want unmasked frames.
- A message past the size limit MUST fail with `ErrMessageTooLarge` before payload bytes enter memory.
- A text message outside valid UTF-8 MUST fail with `ErrInvalidUTF8`, checked on each fragment.
- An invalid prefix MUST fail before the last fragment arrives.
- A code point split by a boundary MUST pass once completed.
- The engine MUST reuse one payload buffer across messages.
- The engine MUST unmask payload bytes in place.
- `next` MUST allocate nothing per message after warm-up.
- Control payloads MUST bypass the message size limit.

## Errors

- `ErrReservedBits`: `websocket: reserved bits set` for a set rsv bit; a protocol error, close code 1002.
- `ErrUnknownOpcode`: `websocket: unknown opcode` for an opcode outside 0x0, 0x1, 0x2, 0x8, 0x9, 0xA; a protocol error, close code 1002.
- `ErrControlTooLarge`: `websocket: control frame too large` for a control payload above 125 bytes; a protocol error, close code 1002.
- `ErrFragmentedControl`: `websocket: fragmented control frame` for a control frame without fin; a protocol error, close code 1002.
- `ErrLengthTopBit`: `websocket: length top bit set` for a 64-bit length with the top bit set; a protocol error, close code 1002.
- `ErrNonMinimalLength`: `websocket: non-minimal length` for a 16-bit length under 126 or a 64-bit length under 65536; a protocol error, close code 1002.
- `ErrPayloadTooLarge`: `websocket: payload too large` for a payload above the caller limit; close code 1009 when it bounds a message.
- `errHandshakeMethod`: `websocket: handshake requires GET method`, answered with HTTP 405 and no close code.
- `errHandshakeProtocol`: `websocket: handshake requires HTTP/1.1 or later`, answered with HTTP 400 and no close code.
- `errHandshakeConnection`: `websocket: handshake requires Connection header with upgrade token`, answered with HTTP 400 and no close code.
- `errHandshakeUpgrade`: `websocket: handshake requires Upgrade header with websocket token`, answered with HTTP 400 and no close code.
- `errHandshakeVersion`: `websocket: handshake requires Sec-WebSocket-Version 13`, answered with HTTP 426, header `Sec-WebSocket-Version: 13`, and no close code.
- `errHandshakeKey`: `websocket: handshake requires Sec-WebSocket-Key with base64 of 16 bytes`, answered with HTTP 400 and no close code.
- `errHandshakeSubprotocol`: `websocket: Sec-WebSocket-Protocol must be an RFC 7230 token`, answered with HTTP 400 and no close code.
- `ErrClosePayload`: `websocket: close payload too short` for a one-byte close payload; a protocol error, close code 1002.
- `ErrCloseUTF8`: `websocket: close reason not UTF-8` for a close reason outside valid UTF-8; close code 1007.
- `ErrCloseCode`: `websocket: close code not allowed` for a code `validCloseCode` rejects; local only, no close code sent.
- `ErrCloseTooLong`: `websocket: close reason too long` when code plus reason exceeds 125 bytes; local only, no close code sent.
- `ErrStrayContinuation`: `websocket: unexpected continuation frame` for a continuation with no open message; a protocol error, close code 1002.
- `ErrFragmentInProgress`: `websocket: new data frame while fragmented message is open` for a data frame while a message stays open; a protocol error, close code 1002.
- `ErrMaskMismatch`: `websocket: mask bit does not match endpoint role` for a frame with the wrong mask bit; a protocol error, close code 1002.
- `ErrMessageTooLarge`: `websocket: message exceeds size limit` for a message past the size limit; close code 1009.
- `ErrInvalidUTF8`: `websocket: text message is not valid UTF-8` for a text message outside valid UTF-8; close code 1007.

## Proof

- `TestRFCDataFrames` proves that unmasked text, masked text and fragment heads read and encode back.
- `TestRFCControlFrames` proves that the ping and pong vectors read and encode back.
- `TestRFCLargeFrames` proves that the 126-byte, 256-byte, 65536-byte and masked 64-bit vectors carry real payload bytes.
- `TestRefuseReservedBits` proves that a set rsv bit fails with `ErrReservedBits`.
- `TestRefuseUnknownOpcode` proves that each opcode in 0x3 to 0x7 and 0xB to 0xF fails with `ErrUnknownOpcode`.
- `TestRefuseControlTooLarge` proves that a 16-bit control length of 126 fails with `ErrControlTooLarge`.
- `TestRefuseControlTooLarge64` proves that a minimal 64-bit control length of 65536 fails with `ErrControlTooLarge`.
- `TestRefuseFragmentedControl` proves that a control frame without fin fails with `ErrFragmentedControl`.
- `TestRefuseLengthTopBit` proves that a 64-bit length with the top bit set fails with `ErrLengthTopBit`.
- `TestRefuseShortLength16` proves that 16-bit lengths 5 and 125 fail with `ErrNonMinimalLength`.
- `TestRefuseShortLength64` proves that a short 64-bit length fails with `ErrNonMinimalLength`.
- `TestRefusePayloadOverLimit` proves that a payload above the caller limit fails with `ErrPayloadTooLarge`.
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
- `TestParseCloseOneByte` proves that a one-byte payload fails with `ErrClosePayload`.
- `TestParseCloseCodeOnly` proves that a two-byte payload decodes the code in network order with empty reason.
- `TestParseCloseCodeReason` proves that a longer payload decodes code 1000 and reason `bye`.
- `TestParseCloseInvalidUTF8` proves that an invalid UTF-8 reason fails with `ErrCloseUTF8`.
- `TestAppendCloseReasonLimits` proves that a 123-byte reason fits in 125 bytes and a 124-byte reason fails with `ErrCloseTooLong`.
- `TestAppendCloseRefusesBadCode` proves that each refused code fails with `ErrCloseCode`.
- `TestCloseRoundTrip` proves that an appended close payload parses back to its code and reason.
- `TestEngineFragmentedHelloWithPing` proves that a ping arrives first and fragments assemble to `Hello`.
- `TestEngineRefusesStrayContinuation` proves that a continuation with no open message fails with `ErrStrayContinuation`.
- `TestEngineRefusesNewDataWhileOpen` proves that a data frame while a message stays open fails with `ErrFragmentInProgress`.
- `TestEngineRefusesUnmaskedInServerRole` proves that an unmasked frame in server role fails with `ErrMaskMismatch`.
- `TestEngineRefusesMaskedInClientRole` proves that a masked frame in client role fails with `ErrMaskMismatch`.
- `TestEngineRefusesMessageOverLimit` proves that a message past the limit fails with `ErrMessageTooLarge` and leaves payload bytes buffered.
- `TestEngineRefusesFragmentedTotalOverLimit` proves that a fragmented total past the limit fails with `ErrMessageTooLarge`.
- `TestEngineAcceptsControlOverMessageLimit` proves that a 5-byte ping passes a 4-byte message limit.
- `TestEngineRefusesInvalidPrefixBeforeLastFragment` proves that an invalid prefix fails before the last fragment arrives.
- `TestEngineRefusesOverlongEncoding` proves that an overlong encoding fails with `ErrInvalidUTF8`.
- `TestEngineRefusesLoneSurrogate` proves that a lone surrogate fails with `ErrInvalidUTF8`.
- `TestEngineAcceptsSplitFourByteRune` proves that a rune split across fragments passes once completed.
- `TestEngineNextZeroAllocs` proves that a warmed `next` allocates nothing per message.

## Not in scope

- Extensions such as permessage-deflate. No requirement names them.
- The transport: the connection type and the upgrade entry point. They wait for design decisions.
- A client handshake builder. The code checks requests only.
- Keep-alive pings and the close echo. No loop owns them yet.
