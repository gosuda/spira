# schema

Package `schema` builds a data description of a type. The caller passes a type to `Of` and reads the result.

Status: specified; the package is not in the tree yet.

## Interface

```lgo
type Schema interface { Object | Array | Optional | String | Integer | Number | Boolean }

type Field struct {
	Name   string
	Wire   string
	Schema Schema
}

type Object struct {
	Fields []Field
}

type String struct {
	Format string
}

// Array, Optional, Integer, Number and Boolean are union members.
// The specification names no fields for them.

func Of[T any]() Schema
```

## Requirements

- `Of` MUST be a comptime generic.
- For a struct, `Of` MUST return an `Object`.
- The fields of that `Object` MUST follow the field order of the struct.
- `Field.Wire` MUST be the `json` tag of the field.
- `Of` MUST panic for a type that it does not support.

## Errors

- `Of` panics for an unsupported type.

## Proof

- No test is named for this package.

## Not in scope

- The package does not read HTTP. It only describes a type.
