# ai/rag

Status: partially implemented. `ParseFilter`, the filter tree, `Search`, `Store` and `Memory` are in the tree. `Augment`, `Split`, `ReadText`, `ReadJSON` and `Pgvector` are not.

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
	Text | Number | Flag
}

type Text struct {
	Text string
}

type Number struct {
	Number float64
}

type Flag struct {
	Flag bool
}

type Op string

type Filter interface {
	// closed tree: Expression, Group, Key, Const, Array
}

type Expression struct {
	Type  Op
	Left  Filter
	Right Filter?
}

type Group struct {
	Inner Filter
}

type Key struct {
	Name string
}

type Const struct {
	Text    string?
	Integer int64?
	Decimal float64?
	Flag    bool?
}

type Array struct {
	Items []Const
}

type Search struct {
	Query     string
	TopK      int = 4
	Threshold float64
	Filter    Filter?
}

type Store interface {
	Add(ctx context.Context, docs []Document) error
	Delete(ctx context.Context, ids const []string) error
	Search(ctx context.Context, q Search) ([]Document, error)
}

type Memory struct {
	Embed ai.Embedder
	// unexported fields
}

func (m *Memory) Add(ctx context.Context, docs []Document) error
func (m *Memory) Delete(ctx context.Context, ids const []string) error
func (m *Memory) Search(ctx context.Context, q Search) ([]Document, error)

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
- `ParseFilter` MUST parse comparison, `IN`, `NOT IN`, `IS NULL`, `AND`, `OR`, `NOT`, groups and quoted keys.
- `ParseFilter` MUST give `AND` a higher rank than `OR`.
- `NOT` MUST negate the whole expression that follows it, as the reference grammar does.
- `ParseFilter` MUST accept an optional `WHERE` word before the expression.
- A keyword MUST match in lower case or in upper case only.
- `ParseFilter` MUST return a closed tree.
- No store MUST receive filter text.
- `Search` MUST default `TopK` to 4.
- `Search` MUST default threshold to 0.
- `Memory` MUST rank by cosine similarity.
- `Memory` MUST keep the vectors in one `float32` slice and the length of each vector beside it.
- The scoring loop of `Memory` MUST NOT allocate.
- `Memory` MUST find a stored id without a scan of the documents.
- `Memory` MUST order equal scores by document id ascending.
- `Memory.Add` MUST refuse an empty list, a blank id, and an empty, zero or non-finite vector.
- `Memory.Add` MUST refuse a vector whose dimensions differ from the dimensions of the store.
- `Memory.Add` MUST store no document of a refused batch.
- `Memory.Add` of a stored id MUST replace the text, the metadata and the vector of that document.
- `Memory` MUST copy document metadata, so a change by the caller does not change stored rows.
- `Memory` MUST apply the filter to the metadata of each document before it scores the document.
- A missing metadata key MUST compare as less than every constant, as in the reference.
- A comparison of a metadata value with a constant of another type MUST be an error.
- `IS NULL` MUST be true for a missing metadata key only.
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

- `TestParseFilterGivesTheTreeOfTheReference` proves the accepted inputs of `FilterExpressionTextParserTests` and of the grammar, tree by tree.
- `TestParseFilterRefusesWhatTheGrammarRefuses` proves the rejected inputs.
- `TestMemorySearchOrderEqualsABruteForceComputation` proves the cosine order against a computation in the test.
- `TestMemoryDefaultIsFourDocumentsAndNoThreshold` and `TestMemoryThresholdIsInclusive` prove the defaults and the threshold.
- `TestMemoryAddRefusesBadDocuments` and `TestMemoryAddRefusesAChangeOfDimensions` prove the refusals of `Add`.
- `TestMemoryAddStoresNoDocumentOfARefusedBatch` proves that a refused batch stores nothing.
- `TestMemoryAddOfAStoredIdReplacesTheDocument` and `TestMemoryDeleteKeepsTheOtherDocumentsWhole` prove replacement and deletion.
- `TestMemoryCopiesMetadataInAndOut` proves the metadata copies.
- `TestMemoryFilterKeepsWhatTheReferenceEvaluatorKeeps` proves filter evaluation, missing keys and `IS NULL`.
- `TestMemoryFilterOfDifferentTypesIsAnError` proves the type error.
- `TestMemoryAddAndSearchAtTheSameTime` runs `Add` beside `Search` under the race detector.
- The pgvector store MUST run under `just engines` with a digest-pinned pgvector image.
- A filter value such as `'; DROP TABLE x; --` MUST return no row and leave the table in place.

## Not in scope

- The decision filter, reranker and fan-out. They need the decision model.
- Other vector stores. Each needs a vendor SDK or driver.
- Document readers that need a parsing library.
