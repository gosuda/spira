# validate

Package `validate` holds the field errors that an input type reports about itself. The application author writes each rule as code in a `Check` method.

## Interface

```lgo
type FieldError struct {
	Field   string `json:"field"`
	Rule    string `json:"rule"`
	Message string `json:"message"`
}

type Errors []FieldError

type Checker interface {
	Check() Errors
}

func (e *Errors) Require(ok bool, field string, rule string, message string)
```

## Requirements

- `Require` MUST append one `FieldError` with the given field, rule and message when `ok` is false.
- `Require` MUST NOT change the list when `ok` is true.
- A `FieldError` MUST encode to JSON with the member names `field`, `rule` and `message`.
- A type that has rules MUST state them as code in `Check`.
- A struct tag MUST NOT select a rule.

## Proof

- `TestRequireAppendsExactlyWhenOkIsFalse` proves the two `Require` requirements.
- `TestFieldErrorUsesWireNames` proves the JSON member names.

## Not in scope

- The package has no rule library. A rule is one comparison in `Check`, so a library adds no value.
- [web](web.md) decides the HTTP status of a failed check.
