# schema

Package `schema` describes a LoGOs type as a value. The caller passes a type to `Of` and reads the result. The consumers are `web.Bind`, `openapi` and `ai.ToolOf`.

## Interface

```lgo
type Schema interface { Object | Array | Optional | String | Integer | Number | Boolean }

type Node struct {
	Value Schema
}

type Object struct {
	Fields []Field
}

type Field struct {
	Name string
	Wire string
	Source string
	Schema *Node
}
type Array struct {
	Items *Node
}

type Optional struct {
	Items *Node
}

type String struct {
	Format string
}

type Integer struct{}

type Number struct{}

type Boolean struct{}

const (
	FormatDateTime = "date-time"
	FormatDuration = "duration"
)

func Of[T any]() Schema
func ObjectOf[T any]() Schema
func FieldOf[F any](ptr any) (Schema, bool)
func LeafOf(ptr any) (Schema, bool)
func NamedOf[F any]() (Schema, bool)
func NamedIntOf[F any]() (Schema, bool)
func NamedUintOf[F any]() (Schema, bool)
func NamedFloatOf[F any]() (Schema, bool)
func WireName(tag string, name string) string
```
## Requirements

- `Of` MUST be a comptime generic that returns the `Schema` of its type argument.
- A struct type MUST produce an `Object` whose fields follow declaration order.
- `Array`, `Optional` and `Field` MUST hold their child schema through `Node`.
- `Wire` MUST be the `json` name before a comma, the field name when absent, and skip the field for `"-"`.
- `String` MUST describe `string`, named strings and `[]byte` with an empty `Format`.
- `time.Time` MUST describe as `String` with `Format` `"date-time"`.
- `time.Duration` MUST describe as `String` with `Format` `"duration"`.
- `Integer` MUST describe every `int` and `uint` kind, named or not.
- `Number` MUST describe `float32` and `float64`, named or not.
- `Boolean` MUST describe `bool` and named bools.
- An option of a supported leaf MUST produce `Optional` of that leaf.
- A slice of a supported leaf MUST produce `Array` of that leaf.
- A slice of a supported option MUST produce `Array` of `Optional` of that leaf.
- An option of a supported slice MUST produce `Optional` of `Array` of that leaf.
- A nested struct field MUST produce the nested `Object` as the field schema.
- Any other field or top-level type MUST panic with the documented message.
- `Field.Source` MUST stay empty from `Of`; `web.Route` fills it from the binding tags.

## Errors

- `schema: <T>: unsupported type` panics with a string when `Of` sees an unsupported top-level type.
- `schema: <T>.<Field>: unsupported type` panics with a string for an unsupported field type.

## Proof

- `TestScalars` proves the scalar, named type and `time` requirements.
- `TestTags` proves the wire requirement.
- `TestNested` proves field order with a nested struct.
- `TestSlices` proves the slice requirements.
- `TestOptionFields` proves the option requirement across packages.
- `TestOptionArrays` proves the option slice and slice of option requirements.
- `TestTopLevelSchemas` proves top-level leaf support.
- `TestWireName` proves the tag splitting of `WireName`.
- `TestUnsupportedPanics` proves both panics.

## Not in scope

- The package does not describe maps, channels or fixed-size arrays; each panics. A pointer field never reaches `Of`: a literal missing a non-nil pointer value is refused at compile time.
- Only the `json` tag names the wire; every other tag is ignored.
