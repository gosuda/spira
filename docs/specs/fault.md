# fault

Package `fault` is the one error vocabulary of spira. A fault carries a stable machine code, a kind, a constant client-safe message, and an unexported cause for operators. Clients see only `View`. Operators see the full chain in the log.

## Interface

```lgo
type Kind uint8

const (
	Invalid Kind = iota + 1
	Unprocessable
	Unauthenticated
	Forbidden
	NotFound
	Conflict
	TooLarge
	RateLimited
	Canceled
	Timeout
	Unavailable
	Internal
)

func (k Kind) String() string

type Code string

type Field struct {
	Name    string `json:"field"`
	Rule    string `json:"rule"`
	Message string `json:"message"`
}

type Error struct {
	Code    Code
	Kind    Kind
	Message string
	Fields  []Field
}

func New(code Code, kind Kind, message string) *Error
func (e *Error) Wrap(cause error) error
func (e *Error) Err() error
func (e *Error) WithFields(fields ...Field) *Error
func (e *Error) Error() string
func (e *Error) Unwrap() error
func (e *Error) Is(target error) bool
func Of(err error) *Error?
func Public(err error) View
func Faults() []*Error

type View struct {
	Code    Code    `json:"code"`
	Kind    Kind    `json:"-"`
	Message string  `json:"message"`
	Fields  []Field `json:"errors,omitzero"`
}
```

### Test kit

Package `fault/faulttest` holds the shared disclosure checks.

```lgo
func CheckTable(t *testing.T, specPath string, faults []*fault.Error)
func PublicJSON(t *testing.T, err error) []byte
func RefuseLeak(t *testing.T, public []byte, planted ...string)
```

## Requirements

- `Kind` MUST use the values in declaration order: `Invalid` is 1 through `Internal` is 12.
- `Kind.String` MUST return the lower-snake text of each kind.
- `Kind.String` MUST return `unknown` for any other value.
- A code MUST match `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$`, except that the single code `internal` is reserved for the fixed internal view.
- `New` MUST panic on a code that breaks that grammar.
- `New` MUST panic on a kind outside `Invalid` to `Internal`.
- `New` MUST panic when the code is `internal` and the kind is not `Internal`.
- `New` MUST be pure: it MUST NOT write a registry, and the package MUST hold no table of declared faults.
- A package that declares faults MUST export `Faults() []*Error`.
- Its test MUST call `faulttest.CheckTable` on that set.
- Its test MUST reject duplicate codes in that set.
- `CheckTable` MUST read the `### Code table` rows from the spec file.
- `CheckTable` MUST fail on a duplicate, missing, or mismatched code, kind, or message.
- `PublicJSON` MUST return the JSON of `Public` for the error.
- `RefuseLeak` MUST fail when a planted value occurs in output.
- `Wrap` MUST carry the cause, return an `error`, and keep the receiver unchanged.
- `Err` MUST return the declared fault itself as an `error`.
- `WithFields` MUST return a copy that carries the given fields and MUST NOT change the receiver.
- `Error` MUST return `<code>: <message>`, plus `: <cause>` for each wrapped cause in order.
- `Unwrap` MUST return the wrapped cause, or nil when there is none.
- `Is` MUST compare codes, so `errors.Is` matches across wraps and across pointers.
- `Of` MUST return the outermost fault in the chain, or absent when the chain holds no fault.
- `Public` of an error with no fault MUST return code `internal`.
- `Public` of an error with no fault MUST return message `internal error`.
- `Public` of an `Internal` fault MUST return code `internal`.
- `Public` of an `Internal` fault MUST return message `internal error`.
- `Public` of an `Internal` fault MUST NOT return its declared code or message.
- `Public` MUST NOT return any text of a cause, whatever the kind.
- `Public` of a `Timeout` fault MUST return its declared code and message.
- `Public` of an `Unavailable` fault MUST return its declared code and message.
- A standard-library failure with no declared fault MUST map to `internal`.
- Faults an attacker MUST NOT tell apart MUST share one code.
- The operator MUST tell them apart by the wrapped cause in logs.
- A `Field` MUST carry its name, a rule code, and a constant message.
- A `Field` MUST NOT carry the submitted value.
- `Public` MUST keep `Fields` only for kinds `Invalid` and `Unprocessable`, and MUST drop them for every other kind.
- `Public` of an error with no fault MUST carry no `errors` member.
- `View` MUST encode as `code`, `message` and `errors`, with no other member.
- `Kind` MUST NOT map to an HTTP status in this package; that mapping lives in [web](web.md) only.

### Code table

| Code | Kind | Message |
|---|---|---|
| `internal` | internal | internal error |

## Errors

- `fault: malformed code <code>` panics from `New` when the code breaks the grammar.
- `fault: unknown kind <n>` panics from `New` when the kind is outside `Invalid` to `Internal`.
- `fault: code internal needs kind internal` panics from `New` when the reserved code meets another kind.

## Proof
- `TestAsFindsFaultThroughWraps` proves recovery of the fault through three wraps. Planted fault: losing the fault past one wrap.
- `TestErrAndWrapReturnErrors` proves `Err` matching and `Wrap` as `error`. Planted fault: returning a typed nil from `Err`.
- `TestPublicWithoutFaultReturnsFixedInternal` proves rule 1 for a chain with no fault. Planted fault: returning the cause text as the message.
- `TestPublicInternalKindReturnsFixedInternal` proves rule 1 for kind `Internal`. Planted fault: exposing the declared message of an internal fault.
- `TestPublicNeverReturnsCauseText` proves rule 2 for two kinds. Planted fault: appending the cause text to the message.
- `TestPublicTimeoutAndUnavailableNeedDeclaration` proves rule 3 both ways. Planted fault: mapping a standard-library timeout to `Timeout` with no declared fault.
- `TestCredentialFaultsShareOneCode` proves rule 4 with three credential failures. Planted fault: one code per credential failure.
- `TestFieldsCarryNoSubmittedValue` proves rule 5 and the field-keeping of `Invalid`. Planted fault: echoing the submitted value into a field message.
- `TestCodesAreStableAndUnique` proves rule 6 for the table of this package. Planted fault: renaming the fixed code without updating the table.
- `TestViewCarriesNoStatus` proves rule 7 on the encoded bytes. Planted fault: adding a status member to `View`.
- `TestOperatorTextCarriesCodeMessageAndCause` proves rule 8 for the operator text. Planted fault: dropping the cause chain from `Error`.
- `TestIsMatchesCodeAcrossWraps` proves code comparison through three wraps. Planted fault: pointer equality in `Is`.
- `TestOfReturnsOutermostFault` proves the outermost choice. Planted fault: returning the innermost fault.
- `TestKindStringIsLowerSnake` proves the kind texts.
- `TestViewUsesWireNames` proves the wire names of `View` and `Field`.
- `TestNewRejectsMalformedCodes` proves the grammar panics and the kind panics.
- `TestCheckTableAcceptsMatchingSet` and six failure tests prove each defect fails. Planted fault: a table row with a wrong kind.

## Not in scope

- The package has no localized messages. Each message is one constant English text.
- The package has no error pages. [web](web.md) decides how a problem is written.
- The package has no class hierarchy. One `Error` type carries every fault, and `Kind` selects the response.
