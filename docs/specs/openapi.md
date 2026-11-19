# openapi

Package `openapi` writes an OpenAPI 3.1 document for the routes of one router. The application author mounts the document on that router.

Status: specified; the package is not in the tree yet.

## Interface

```lgo
func Document(r *web.Router, info Info) Doc
func Mount(r *web.Router, info Info)
```

## Requirements

- `Document` MUST build the document from `Routes` in [web](web.md).
- The document version MUST be `3.1.0`.
- `Document` MUST take each path parameter from a `{name}` segment of the pattern.
- `Document` MUST take each query parameter from the input schema tag `query`.
- `Document` MUST take each header parameter from the input schema tag `header`.
- `Document` MUST take each cookie parameter from the input schema tag `cookie`.
- `Document` MUST take the JSON request body from the field tag `body`.
- `Document` MUST copy each response from the route field `Returns`.
- `Document` MUST add the problem response.
- `Mount` MUST serve that document at `GET /openapi.json`.
- `Mount` MUST write the document as JSON.

## Proof

- The plan names one test on a router with three routes.
- The oracle is a test-local list of required OpenAPI 3.1 keys.
- The same test round-trips the document through `encoding/json/v2`.

## Not in scope

- The package does not ship a page that shows the document. The caller reads `GET /openapi.json`.
