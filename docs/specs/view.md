# view

Package `view` builds HTML as values and writes them to a writer. The application author returns a `Node` from a function. There is no template language.

## Interface

```lgo
type Node interface { Element | Text | Trusted | Group | *Island | *Later }
type Part interface { Node | Attribute }

type Element struct {
	// unexported fields
}

type Text struct{ S string }
type Trusted struct{ HTML string }
type Group struct{ Nodes []Node }

type Attribute struct {
	// unexported fields
}

type Island struct {
	Entry    string
	Props    any
	When     string = "visible"
	Fallback Node?
}

type Later struct {
	Fallback Node
	Resolve  func(ctx context.Context) (Node, error)
}

func El(tag string, parts ...Part) Element
func T(s string) Text
func Trust(html string) Trusted
func Attr(name string, value string) Attribute
func Flag(name string) Attribute
func Class(names ...string) Attribute
func Hx(name string, value string) Attribute
func When(cond bool, n Node) Group
func Each[T any](items const []T, row func(item const T) Node) Group
func Render(ctx context.Context, w io.Writer, n Node) error

func Html(parts ...Part) Element
func Head(parts ...Part) Element
func Body(parts ...Part) Element
func Title(parts ...Part) Element
func Meta(parts ...Part) Element
func Link(parts ...Part) Element
func Script(parts ...Part) Element
func Main(parts ...Part) Element
func Nav(parts ...Part) Element
func Header(parts ...Part) Element
func Footer(parts ...Part) Element
func Section(parts ...Part) Element
func Div(parts ...Part) Element
func Span(parts ...Part) Element
func P(parts ...Part) Element
func A(parts ...Part) Element
func H1(parts ...Part) Element
func H2(parts ...Part) Element
func H3(parts ...Part) Element
func Ul(parts ...Part) Element
func Li(parts ...Part) Element
func Form(parts ...Part) Element
func Label(parts ...Part) Element
func Input(parts ...Part) Element
func Button(parts ...Part) Element
func Select(parts ...Part) Element
func Option(parts ...Part) Element
func Textarea(parts ...Part) Element
func Table(parts ...Part) Element
func Thead(parts ...Part) Element
func Tbody(parts ...Part) Element
func Tr(parts ...Part) Element
func Th(parts ...Part) Element
func Td(parts ...Part) Element
func Img(parts ...Part) Element
```

## Requirements

### Nodes

- `El` MUST panic when the tag does not match `^[a-zA-Z][a-zA-Z0-9:_.-]*$`.
- `Attr` and `Flag` MUST panic when the name fails that same pattern.
- Each tag function in the Interface MUST call `El` with its tag name.
- The package MUST export no other tag function.
- `Text` MUST replace `&` with `&amp;`.
- `Text` MUST replace `<` with `&lt;` and `>` with `&gt;`.
- `Text` MUST replace `"` with `&#34;` and `'` with `&#39;`.
- An attribute value MUST use those same replacements.
- `Trusted` MUST write `HTML` with no escape.
- `Flag` MUST write the name and no value.
- `Class` MUST join the names with one space.
- `Hx` MUST prefix the name with `hx-`.
- `When` MUST write the node when `cond` is true.
- `When` MUST write nothing when `cond` is false.
- `Each` MUST write one row per item, in slice order.
- The row callback MUST receive `item` as a const view.

### Render

- `Render` MUST write `<!doctype html>` only before a root `html` element.
- A void element MUST have no end tag.
- The void tag names MUST be exactly the names in this block.

```
area base br col embed hr img input link meta param source track wbr
```

- For `href`, `src`, `action`, `formaction`, `xlink:href` and `data`, `Render` MUST apply the scheme filter.
- The name match for that filter MUST ignore letter case.
- The filter MUST ignore ASCII controls, space and `0x7f` when it reads the scheme.
- A scheme other than `http`, `https`, `mailto` or `tel` MUST be written as `about:invalid`.
- An allowed value MUST be written as given, not as the stripped text.
- A value with no scheme MUST be written unchanged.

### Islands and slots

- An island MUST use a `when` value from [wire-contract](wire-contract.md).
- `Render` MUST write `<spira-island entry="..." when="..." props="...">` and the fallback, then `</spira-island>`.
- `Entry`, `When` and the props text MUST be escaped.
- Nil `Props` MUST be written as `{}`.
- `Props` MUST encode to one JSON object.
- Slot ids MUST follow [wire-contract](wire-contract.md).
- `Render` MUST write the fallback inside `<spira-slot id="...">`.
- After the root, `Render` MUST flush when `w` is an `http.Flusher`.
- `Render` MUST run slot resolvers in one group with limit 8.
- A `Later` found inside a resolved node MUST join that same queue.
- The set of written template ids MUST equal the set of slot ids.
- A resolver error MUST still write `<template data-spira-slot="ID"><spira-error></spira-error></template>`.
- `Render` MUST return the joined slot errors after every queued slot is written.
- A `Later` inside `table`, `thead`, `tbody`, `tfoot`, `tr`, `colgroup` or `select` MUST be an error.
- That parent name MUST match in any letter case.
- A `Later` inside a `Group` under one of those parents MUST use that parent in the error.
- A `Later` inside `td`, `th`, `div` or at the root MUST render.

## Errors

- `view: invalid tag name %q` when `El` rejects a tag.
- `view: invalid attribute name %q` when `Attr` or `Flag` rejects a name.
- `view: write: <cause>` when a write to `w` fails.
- `view: slot nonce: <cause>` when the slot id source fails.
- `view: island %q: when %q is not load, visible or idle` for a rejected `when` value.
- `view: island %s props: <cause>` when `Props` does not encode.
- `view: island %s props must encode to a JSON object` when the encoding is not an object.
- `view: Later inside <%s>: a browser moves a slot element out of this parent; defer the whole <%s>` for a banned parent.
- `view: slot %s: <cause>` for a resolver error or a slot write error.
- `resolver panicked: %v` is the cause when a resolver panics.

## Proof

- `TestEscapingProperty` proves text and attribute escaping. The oracle is `html.UnescapeString`, and the bytes between two sentinels hold none of `<`, `>`, `"` or `'` raw.
- `TestURLSchemeFilter` proves the scheme filter against a table of hostile values, including `JaVaScRiPt:`, a tab before `javascript:`, `data:` and `vbscript:`.
- `TestConstructorNameRule` proves the tag and attribute panic text.
- `TestDoctypeRoot` proves that only a root `html` element gets the doctype.
- `TestIslandWhenContract` and `TestIslandPropsMustBeObject` prove the island errors, the default `when`, and nil props.
- `TestSlotIDContract` and `TestWireCorpus` prove the slot id rules against `wire/corpus.jsonl`.
- `TestSlotOrderIndependence` proves that the written template ids equal the queued slot ids when resolvers finish in any order.
- `TestResolverError` and `TestResolverPanic` prove the error template, the joined error, and a panic beside a successful slot.
- `TestSlotFlushOrder` proves that each slot result is flushed.
- `TestRootWriteFailure`, `TestSlotWriteFailure` and `TestRenderWriteErrorCarriesViewContext` prove the write errors.
- `TestEachConstView` proves row order for a named callback and a lambda.
- `TestLaterInsideTableStructureIsRejected` and `TestLaterInGroupInsideTableStructureIsRejected` prove the banned parents, in lower and upper case.
- `TestLaterInsideAllowedParentsRenders` proves `td`, `th`, `div` and a root `Later`.

## Not in scope

- The package has no template language. A view is a function that returns a `Node`.
- Tag functions exist only for the list above. Any other tag uses `El`.
