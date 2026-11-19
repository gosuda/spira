# openapi

Package `openapi` writes an OpenAPI 3.1 document for the routes of one router. It reads each route input schema and route doc from [web](web.md), where `web` fills each field source from the binding tags. It serves the document as JSON on that router.

## Interface

```lgo
type Info struct {
	Title string
	Version string
}

type Doc struct {
	OpenAPI string `json:"openapi"`
	Info DocInfo `json:"info"`
	Paths map[string]PathItem `json:"paths"`
}

type DocInfo struct {
	Title string `json:"title"`
	Version string `json:"version"`
}

type PathItem struct {
	Get *Operation? `json:"get,omitzero"`
	Put *Operation? `json:"put,omitzero"`
	Post *Operation? `json:"post,omitzero"`
	Delete *Operation? `json:"delete,omitzero"`
	Patch *Operation? `json:"patch,omitzero"`
	Head *Operation? `json:"head,omitzero"`
	Options *Operation? `json:"options,omitzero"`
	Trace *Operation? `json:"trace,omitzero"`
}

type Operation struct {
	Summary string `json:"summary,omitzero"`
	Parameters []Parameter `json:"parameters,omitzero"`
	RequestBody *RequestBody? `json:"requestBody,omitzero"`
	Responses map[string]ResponseItem `json:"responses"`
}

type Parameter struct {
	Name string `json:"name"`
	In string `json:"in"`
	Required bool `json:"required"`
	Schema Schema `json:"schema"`
}

type RequestBody struct {
	Required bool `json:"required"`
	Content map[string]MediaType `json:"content"`
}

type ResponseItem struct {
	Description string `json:"description"`
	Content map[string]MediaType `json:"content,omitzero"`
}

type MediaType struct {
	Schema Schema `json:"schema"`
}

type Schema struct {
	Type string `json:"type,omitzero"`
	Format string `json:"format,omitzero"`
	Items *Schema? `json:"items,omitzero"`
	Properties map[string]Schema `json:"properties,omitzero"`
	Required []string `json:"required,omitzero"`
}

func Document(r *web.Router, info Info) Doc
func Mount(r *web.Router, info Info)
```

## Requirements

- `Document` MUST build one path item per distinct path of `Routes`.
- `Document` MUST skip a route whose method has no item field.
- `Document` MUST strip a host prefix from the pattern before it builds the path.
- `Document` MUST skip the `/openapi.json` route that `Mount` serves.
- `Document` MUST take each path parameter from a `{name}` segment of the path.
- `Document` MUST mark every path parameter as required.
- `Document` MUST refine a path parameter with the input field whose source is path and whose wire name matches.
- `Document` MUST take each query parameter from the input field whose source is query.
- `Document` MUST take each header parameter from the input field whose source is header.
- `Document` MUST take each cookie parameter from the input field whose source is cookie.
- `Document` MUST take the JSON request body from the input field whose source is body.
- `Document` MUST ignore an input field whose source is empty or `form`.
- A parameter MUST be required unless its input field schema is optional.
- `Document` MUST copy each response from the route `Returns`.
- `Document` MUST describe each response with its HTTP status text.
- An unknown status MUST use `response <code>` as its description.
- `Document` MUST add the `default` problem response to every operation.
- `Document` MUST emit `openapi` as `3.1.0`.
- `Document` MUST copy `Title` and `Version` into `info`.
- A `String` schema MUST set `type` to `string` and `format` when the format is set.
- An `Integer` schema MUST set `type` to `integer`.
- A `Number` schema MUST set `type` to `number`.
- A `Boolean` schema MUST set `type` to `boolean`.
- An `Array` schema MUST set `type` to `array` with its items schema.
- An `Optional` schema MUST use its inner schema.
- An `Object` schema MUST set `type` to `object` with each field under its wire name.
- An object MUST list each field with a non-optional schema as required.
- A marshalled document MUST be byte-identical across calls.
- `Mount` MUST serve the document of its router at `GET /openapi.json`.
- `Mount` MUST write the document as JSON.

## Proof

- `TestDocumentVersionAndPaths` proves the version, the info, the paths and the per-path methods.
- `TestParametersComeFromPatternAndInput` proves the path, query, header and cookie parameters with required flags and the summary.
- `TestRequestBodyAndResponses` proves the JSON body, the copied responses and the default problem response.
- `TestDeleteResponseHasNoContentButKeepsDefault` proves a bodyless response with the default problem response.
- `TestRequiredKeysHoldForEveryOperation` proves the required OpenAPI 3.1 keys on every operation.
- `TestDocumentRoundTripsThroughJSON` proves the byte-identical round trip through `encoding/json/v2`.
- `TestMountServesJSON` proves the JSON content type, the self-exclusion and the equality with `Document`.
- `TestDocumentBytesAreIdenticalAcrossCalls` proves the byte-identical encoding across direct and served calls.

## Not in scope

- The package ships no page that shows the document. The caller reads `GET /openapi.json`.
- `form` fields are not documented. They carry urlencoded bodies and this step covers JSON only.
