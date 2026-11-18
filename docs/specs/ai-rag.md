# ai/rag

Status: specified; the package is not in the tree yet.

Package `ai/rag` provides retrieval over documents. The application author parses filters, searches a store, and augments a model with retrieved context.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Document struct {
	ID       string
	Text     string
	Metadata map[string]Value
	Score    float64?
}

type Value interface {
	// closed union of string, number and boolean
}

type Filter interface {
	// closed tree
}

type Search struct {
	// unexported fields
}

type Store interface {
	Add(ctx context.Context, docs const []Document) error
	Delete(ctx context.Context, ids const []string) error
	Search(ctx context.Context, q Search) ([]Document, error)
}

type Memory struct {
	// unexported fields
}

type Pgvector struct {
	// unexported fields
}

type SplitOptions struct {
	// unexported fields
}

func ParseFilter(text string) (Filter, error)
func Augment(...) Layer
func Split(text string, o SplitOptions) []string
func ReadText(...)
func ReadJSON(...)
```

## Requirements

- `Document` MUST hold an id, text, metadata and an optional score.
- `Value` MUST be a closed union of string, number and boolean.
- `ParseFilter` MUST parse comparison, `IN`, `NOT IN`, `AND`, `OR`, `NOT`, groups and quoted keys.
- `ParseFilter` MUST return a closed tree.
- No store MUST receive filter text.
- `Search` MUST default `TopK` to 4.
- `Search` MUST default threshold to 0.
- `Memory` MUST rank by cosine similarity.
- `Pgvector` MUST run over `db.Pool`.
- `Pgvector` MUST ship the table and HNSW index as a migration pair.
- `Pgvector` MUST bind every filter value as a parameter.
- `Augment` MUST run transform, expand, retrieve, join and augment.
- `Augment` MUST keep the first document per id.
- `Augment` MUST sort joined documents by score descending.
- `Augment` MUST use the reference answer for an empty context.
- The query rewrite, translation, compression and multi-query functions MUST be plain functions over a `Model`.
- `Split` MUST default to 800 tokens.
- `Split` MUST default to a minimum of 350 characters.
- `Split` MUST cut after the last punctuation mark.
- `Split` MUST use an embedded `cl100k` encoder.
- `Split` MUST NOT download a vocabulary at run time.
- `ReadText` and `ReadJSON` MUST read documents.

## Errors

- The package MUST return an error when `ParseFilter` cannot parse the text.
- The package MUST return the store error when a store call fails.

## Proof

- The `FilterExpressionTextParserTests` cases prove the accepted and rejected inputs.
- Cosine order MUST be checked against a test-local brute-force computation.
- The pgvector store MUST run under `just engines` with a digest-pinned pgvector image.
- A filter value such as `'; DROP TABLE x; --` MUST return no row and leave the table in place.

## Not in scope

- The decision filter, reranker and fan-out. They need the decision model.
- Other vector stores. Each needs a vendor SDK or driver.
- Document readers that need a parsing library.
