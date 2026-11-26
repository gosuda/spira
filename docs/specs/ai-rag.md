# ai/rag

Status: the filter parser, both stores, `Split` with the embedded vocabulary, the readers, augmentation and the query transformers are in the tree.

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

const (
	OpAnd       Op = "AND"
	OpOr        Op = "OR"
	OpEq        Op = "EQ"
	OpNe        Op = "NE"
	OpGt        Op = "GT"
	OpGte       Op = "GTE"
	OpLt        Op = "LT"
	OpLte       Op = "LTE"
	OpIn        Op = "IN"
	OpNin       Op = "NIN"
	OpNot       Op = "NOT"
	OpIsNull    Op = "ISNULL"
	OpIsNotNull Op = "ISNOTNULL"
)

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

type Memory struct {
	Embed ai.Embedder
	// unexported fields
}

func (m *Memory) Add(ctx context.Context, docs []Document) error
func (m *Memory) Delete(ctx context.Context, ids const []string) error
func (m *Memory) Search(ctx context.Context, q Search) ([]Document, error)

type Store interface {
	Add(ctx context.Context, docs []Document) error
	Delete(ctx context.Context, ids const []string) error
	Search(ctx context.Context, q Search) ([]Document, error)
}

var ErrInvalidFilter = fault.New("rag.invalid_filter", fault.Invalid, "The filter is invalid.")
var ErrInvalidRequest = fault.New("rag.invalid_request", fault.Invalid, "The retrieval request is invalid.")
var ErrTooLarge = fault.New("rag.too_large", fault.TooLarge, "The input is too large.")
var ErrStoreFailed = fault.New("rag.store_failed", fault.Unavailable, "The document store is unavailable.")

func Faults() []*fault.Error

type Pgvector struct {
	// unexported fields
}

func NewPgvector(pool *db.Pool, embed ai.Embedder, table string, dims int) (*Pgvector?, error)
func (p *Pgvector) Setup(ctx context.Context) error
func (p *Pgvector) Add(ctx context.Context, docs []Document) error
func (p *Pgvector) Delete(ctx context.Context, ids const []string) error
func (p *Pgvector) Search(ctx context.Context, q Search) ([]Document, error)

type Encoder struct {
	// unexported fields
}

func NewEncoder() (*Encoder?, error)

type SplitOptions struct {
	ChunkSize             int        = 800
	ChunkOverlap          int        = 0
	MinChunkSizeChars     int        = 350
	MinChunkLengthToEmbed int        = 5
	MaxNumChunks          int        = 10000
	KeepSeparator         bool       = true
	Punctuation           string     = ".?!\n"
	Encoder               *Encoder?
}

const readLimit = 1 << 20

func ParseFilter(text string) (Filter, error)
func Augment(search func(ctx context.Context, q Search) ([]Document, error), base Search) ai.Layer
func Rewrite(ctx context.Context, m ai.Model, query string) (string, error)
func Translate(ctx context.Context, m ai.Model, query string, language string) (string, error)
func Compress(ctx context.Context, m ai.Model, history []ai.Message, query string) (string, error)
func Expand(ctx context.Context, m ai.Model, query string, n int) ([]string, error)
func Split(text string, o SplitOptions) ([]string, error)
func ReadText(r io.Reader, source string) ([]Document, error)
func ReadJSON(r io.Reader, keys ...string) ([]Document, error)
```

## Requirements

- `Document` MUST hold an id, text, metadata and an optional score.
- `Value` MUST be a closed union of string, number and boolean.
- `ParseFilter` MUST parse comparison, `IN`, `NOT IN`, `IS NULL`, `AND`, `OR`, `NOT`, groups and quoted keys.
- `ParseFilter` MUST give `AND` a higher rank than `OR`.
- `NOT` MUST negate the whole expression that follows it, as the reference grammar does.
- `ParseFilter` MUST accept an optional `WHERE` word before the expression.
- A keyword MUST match in lower case or in upper case only.
- `ParseFilter` MUST read a lone `l` or `L` as the long suffix of the integer before it.
- `ParseFilter` MUST refuse a lone `l` or `L` in each other position, as the reference grammar does.
- `ParseFilter` MUST return a closed tree.
- `ParseFilter` MUST report the error position without the filter text.
- No store MUST receive filter text.
- `Search` MUST default `TopK` to 4.
- `Search` MUST default threshold to 0.
- `Search` with `TopK` 0 MUST return no document.
- `Search` on an empty store MUST return no document.
- `Search` MUST refuse a negative `TopK`.
- `Search` MUST refuse a threshold outside 0 to 1.
- `Search` MUST refuse a zero query vector.
- `Search` MUST refuse a query vector of other dimensions.
- `Memory` MUST rank by cosine similarity.
- `Memory` MUST keep the vectors in one `float32` slice and the squared length of each vector beside it.
- `Memory` MUST give the score 1 to a stored vector that equals the query vector.
- The scoring loop of `Memory` MUST NOT allocate.
- `Memory` MUST find a stored id without a scan of the documents.
- `Memory` MUST order equal scores by document id ascending.
- `Memory` MUST refuse `Add` and `Search` without an embedder.
- `Add` MUST fail when the embedder returns fewer vectors than documents.
- `Memory.Add` MUST refuse an empty list, a blank id, and an empty, zero or non-finite vector.
- `Memory.Add` MUST refuse a blank id before it calls the embedder.
- `Memory.Add` MUST refuse a vector whose dimensions differ from the dimensions of the store.
- `Memory.Add` MUST store no document of a refused batch.
- `Memory.Add` of a stored id MUST replace the text, the metadata and the vector of that document.
- `Memory` MUST copy document metadata, so a change by the caller does not change stored rows.
- `Memory` MUST keep string, number and boolean metadata values.
- `Memory.Delete` MUST release the text and the metadata of each deleted document.
- `Memory` MUST apply the filter to the metadata of each document before it scores the document.
- A missing metadata key MUST compare as less than every constant, as in the reference.
- A NaN metadata number MUST satisfy only `!=` and `NOT IN`.
- A comparison of a metadata value with a constant of another type MUST be an error.
- A `Const` with no field set MUST be an error when compared with a metadata value.
- A filter comparison MUST hold a key on the left.
- `Memory` MUST compare a metadata number with an integer constant without rounding of the constant.
- `IS NULL` MUST be true for a missing metadata key only.
- `Pgvector` MUST run over `db.Pool`.
- `Pgvector` MUST ship the table and HNSW index as a migration pair.
- `Pgvector` MUST bind every filter value as a parameter.
- A JSON null metadata value MUST read back as NaN.
- An empty `IN` or `NOT IN` list MUST bind no argument.
- The pgvector store MUST run under `just engines` with a digest-pinned pgvector image.
- A filter value such as `'; DROP TABLE x; --` MUST return no row and leave the table in place.
- Each rendered prompt MUST end with a line feed, as the reference text blocks do.
- `Augment` MUST take the text of the last user message as the query.
- `Augment` MUST call `search` with `base` and that query.
- `Augment` MUST keep the first document per id.
- `Augment` MUST sort the kept documents by score descending.
- A missing score MUST count as 0 in the sort.
- Documents with equal scores MUST order by id ascending.
- `Augment` MUST replace the last user message with the reference answer
  prompt filled with the joined document texts and the query.
- `Augment` with no document MUST use the reference text for an empty context.
- Document text MUST enter the prompt unchanged, as in the reference.
- `Augment` with no user message MUST pass the request through unchanged.
- `Rewrite`, `Translate`, `Compress` and `Expand` MUST be plain functions over an `ai.Model`.
- `Rewrite`, `Translate` and `Compress` MUST send the exact reference prompt template to the model.
- `Rewrite`, `Translate` and `Compress` MUST return the input query unchanged when the model answer is blank.
- `Compress` MUST render history as `USER: ...` and `ASSISTANT: ...` lines joined by newline.
- `Compress` MUST skip history messages of other roles.
- `Expand` MUST send the exact reference multi-query prompt with the requested count.
- `Expand` MUST return the original query first.
- `Expand` MUST drop trailing empty lines before it counts answer lines, as the reference split does.
- `Expand` MUST return one query per remaining line only when that count equals the requested count.
- `Expand` MUST return the original query alone in each other case.
- `Expand` MUST drop blank lines after the count check.
- `NewEncoder` MUST parse the embedded cl100k vocabulary once per call and return tables the caller holds and reuses.
- `Split` MUST refuse a nil `Encoder`.
- `Split` MUST check the options before it checks the `Encoder`.
- A bad option MUST report its own error with or without an `Encoder`.
- `Split` MUST cut text into token chunks through the given `Encoder`.
- `Split` MUST default to 800 tokens per chunk, overlap 0, a 350 character
  minimum before a punctuation cut, a 5 character minimum per kept chunk,
  at most 10000 chunks, a kept separator, and the marks `.`, `?`, `!` and newline.
- `Split` MUST refuse a chunk size below 1, an overlap below 0, an overlap
  at or above the chunk size, a chunk count below 1, a character minimum
  below 0, a length minimum below 0, and empty punctuation.
- `Split` MUST return no chunk for blank text and report no error.
- `Split` MUST return text at or below the chunk size as one trimmed chunk,
  or no chunk when the trimmed text is at most the length minimum.
- `Split` MUST cut each window after its last mark when the window is longer
  than the character minimum and more tokens remain, and keep the mark.
- `Split` MUST start the next chunk overlap tokens before the end of the cut
  chunk, and always move forward by at least one token.
- `Split` MUST stop stepping back once the rest fits in one chunk and holds
  only whitespace, or once no tokens remain.
- `Split` MUST drop a chunk at or below the length minimum and still count
  the dropped chunk toward the chunk count.
- `Split` MUST append leftover tokens as one last chunk with newlines replaced
  by spaces when the chunk count stops the loop early.
- `Split` MUST trim kept chunks, and MUST replace newlines with spaces in dropped-separator mode.
- `Split` MUST measure the character minimum and the length minimum in runes.
- `Split` MUST use the embedded cl100k encoder for every count and every decode.
- `Encoder` MUST round-trip arbitrary bytes through encode and decode with no error and no panic.
- `Split` MUST NOT download a vocabulary at run time.
- `Split` MUST encode text as ordinary text with no special token handling.
- `Split` MUST trim Unicode whitespace.
- `Split` MUST treat vertical tab as punctuation text.
- The package MUST hold no package-level mutable state.
- The vocabulary text and the split pattern MUST stay immutable package values.
- The parsed tables MUST live in the `Encoder` the caller builds and passes in.
- `ReadText` MUST read the whole input into one `Document`.
- `ReadText` MUST set the metadata `source` to the `source` argument.
- `ReadText` MUST set the metadata `charset` to `UTF-8`.
- `ReadText` MUST keep empty and whitespace-only input byte for byte.
- `ReadJSON` MUST yield one `Document` per element of a JSON array.
- `ReadJSON` MUST yield one `Document` for a JSON object root.
- `ReadJSON` with keys MUST set the text to the `key: value` lines of those
  keys in key order, each line ending in `\n`.
- `ReadJSON` MUST skip a key that an element lacks.
- `ReadJSON` with no found key, and `ReadJSON` with no keys, MUST set the text to the element JSON.
- `ReadJSON` MUST render a JSON string value raw, a JSON null as `null`, and
  any other value as its JSON text. The reference appends the Java `toString`
  (`tags: [a]`, maps as `{name=x}`); spira keeps JSON text so the output parses back as JSON.
- `ReadJSON` MUST leave `Metadata` empty, as the reference `EmptyJsonMetadataGenerator` does.
- The id of each reader document MUST be the SHA-256 of its text in hex. The reference uses `RandomIdGenerator`, so its ids are random; spira uses stable ids so a second read of the same content returns the same id.
- Each line ending the readers emit MUST be `\n`. The reference uses the platform line separator.
- Both readers MUST refuse input above `readLimit` bytes with an error.
- The `readLimit` bound MUST be 1 MiB.
- The bound MUST match the provider reply bounds (`replyLimit` in `ai/openai`, `ai/anthropic` and `ai/ollama`).
- `ReadJSON` MUST refuse nesting deeper than the standard library decoder limit of 10000 with the decoder depth error.
- The readers MUST NOT take a custom-metadata argument.
- The caller MUST own the reader. The readers never close it.

### Code table

| Code | Kind | Message |
|---|---|---|
| `rag.invalid_filter` | invalid | The filter is invalid. |
| `rag.invalid_request` | invalid | The retrieval request is invalid. |
| `rag.store_failed` | unavailable | The document store is unavailable. |
| `rag.too_large` | too_large | The input is too large. |

## Errors

- The package MUST return an error when `ParseFilter` cannot parse the text.
- The package MUST return the store error when a store call fails.
- The package MUST return `ai/rag: memory needs an embedder` when `Memory` holds no embedder.
- The package MUST wrap an `Add` embedder failure as `ai/rag: embed documents: %w`.
- The package MUST wrap a `Search` embedder failure as `ai/rag: embed query: %w`.
- The package MUST return an error that names both counts when the embedder returns fewer vectors than documents.
- The package MUST return an error that names the option when an option is out of range.
- The package MUST wrap an encode failure as `ai/rag: split: encode: %w`.
- The package MUST wrap a decode failure as `ai/rag: split: decode: %w`.
- The package MUST return `ai/rag: split: encoder is nil` when `Encoder` holds no value.
- The package MUST refuse a bad vocabulary line with an error.
- The package MUST return an error when the input exceeds `readLimit` bytes.
- The size error MUST say the input exceeds the size limit and name the bound in bytes.
- The readers MUST report the size limit when over-limit input ends in a read error.
- The package MUST return an error when the JSON input is empty, malformed, or starts with neither `{` nor `[`. A scalar root fails here; the reference throws on it too.
- The package MUST return an error naming the index of an array element that is no JSON object.
- The package MUST return the decoder depth error for JSON nested past the standard library limit.
- The package MUST return `ai/rag: pgvector needs an embedder` when `Pgvector` holds no embedder.
- The package MUST return an error that names the table when the name breaks the pattern.
- The package MUST return an error that names the dimensions when they are below 1.
- The package MUST wrap a `Setup` failure as `ai/rag: pgvector setup: %w`.
- The package MUST wrap an `Add` failure as `ai/rag: pgvector add: %w`.
- The package MUST wrap a `Delete` failure as `ai/rag: pgvector delete: %w`.
- The package MUST wrap a search execution failure as `ai/rag: pgvector search: %w`.
- The package MUST wrap a scan failure as `ai/rag: pgvector scan: %w`.

## Proof

- `TestParseFilterGivesTheTreeOfTheReference` proves the accepted inputs of `FilterExpressionTextParserTests` and of the grammar, tree by tree.
- `TestParseFilterRefusesWhatTheGrammarRefuses` proves the rejected inputs. The two tests prove the long suffix.
- `TestMemorySearchOrderEqualsABruteForceComputation` proves the cosine order against a computation in the test.
- `TestMemoryDefaultIsFourDocumentsAndNoThreshold` and `TestMemoryThresholdIsInclusive` prove the defaults and the threshold.
- `TestMemoryThresholdOneKeepsAnEqualVector` proves the score 1 of an equal vector.
- `TestMemoryAddRefusesBadDocuments` and `TestMemoryAddRefusesAChangeOfDimensions` prove the refusals of `Add`.
- `TestMemoryAddRefusesAVectorThatIsNotFinite` proves the refusal of a non-finite vector.
- `TestMemoryNeedsAnEmbedder` proves that `Add` and `Search` need an embedder.
- `TestMemoryGivesTheErrorOfTheEmbedder` proves that embedder failures reach the caller wrapped.
- `TestMemoryRefusesAnEmbedderThatGivesTooFewVectors` proves the refusal of a short vector list.
- `TestMemoryAddSendsNoTextOfABatchWithABlankId` proves that a blank id costs no embedding request.
- `TestDropReleasesTheTextAndMetadataOfTheRemovedDocument` proves the release after `Delete`.
- `TestMemoryFilterComparesAnIntegerConstantExactly` proves the comparison with integers above 2^53.
- `TestMemoryFilterWithNaNMetadataMatchesOnlyInequality` proves the NaN rule for every operator.
- `TestMemoryFilterWithAQuotedLKeyMatchesTheDocument` proves a quoted lone `L` key matches.
- The `Memory` tests embed through `openai.Client` and a `net/http/httptest` server, except `TestMemoryAddRefusesAVectorThatIsNotFinite`, which embeds through an in-file embedder because JSON numbers cannot represent non-finite values.
- `TestMemoryAddStoresNoDocumentOfARefusedBatch` proves that a refused batch stores nothing.
- `TestMemoryAddOfAStoredIdReplacesTheDocument` and `TestMemoryDeleteKeepsTheOtherDocumentsWhole` prove replacement and deletion.
- `TestMemoryCopiesMetadataInAndOut` proves the metadata copies.
- `TestMemoryFilterKeepsWhatTheReferenceEvaluatorKeeps` proves filter evaluation, missing keys and `IS NULL`.
- `TestMemoryFilterOfDifferentTypesIsAnError` proves the type error.
- `TestMemoryAddAndSearchAtTheSameTime` runs `Add` beside `Search` under the race detector.
- `TestMemoryTopKZeroGivesNoDocument` proves that `TopK` 0 gives no document.
- `TestMemorySearchOfAnEmptyStoreGivesNoDocument` proves that an empty store gives no document.
- `TestMemorySearchRefusesBadRequests` proves the refusals of a negative `TopK`, a threshold outside 0 to 1, a zero query vector and other dimensions.
- `TestMemoryKeepsEachKindOfMetadataValue` proves that each metadata value kind round-trips.
- `TestMemoryFilterOfAHandBuiltTreeWithoutAKeyIsAnError` proves that a comparison without a key is an error.
- `TestSplitRefusesNilEncoder` proves the nil `Encoder` error.
- `TestSplitDefaultsToSingleChunkPerText` proves the default options on two short texts.
- `TestSplitCutsAtTenTokens` proves the ten-token cuts of the reference all-fields case.
- `TestSplitOverlapNoneAndTwo` proves the overlap 0 and overlap 2 cuts word by word.
- `TestSplitOverlapKeepsTheFactWhole` proves that overlap keeps a fact whole.
- `TestSplitKeepsTheRemainderWhenMaxChunksHit` proves the remainder after the chunk count stops the loop.
- `TestSplitDroppedChunksStillCount` proves that dropped chunks count toward the chunk count.
- `TestSplitRefusesBadOptions` proves each refused option and the largest valid overlap.
- `TestSplitTrimsToTheSentenceWithOverlap` proves the sentence cut with overlap 3.
- `TestSplitKeepsOrReplacesNewlines` proves both separator modes on newlines.
- `TestSplitHasNoRepeatingTail` proves that no chunk repeats the next one and that the last chunk ends with the last sentence.
- `TestSplitChunksFitTheTokenBudget` proves every chunk resplits to itself at 80 tokens.
- `TestSplitLosesNoText` proves full coverage at overlaps 0, 50 and 200.
- `TestSplitShortTextStaysWhole` proves a short text stays one chunk.
- `TestSplitLastChunkStaysWhole` proves the last chunk keeps its period cut.
- `TestSplitCutsAtCustomMarks` proves the seven CJK cuts.
- `TestSplitOverlapWithSemicolons` proves the four semicolon cuts with overlap.
- `TestSplitChunkSizeOneTerminates` proves chunk size one ends with chunks.
- `TestSplitCountsTokensByTheWindow` proves token counts 5, 2 and 10 through pure windowing.
- `TestSplitDefaultsToEightHundredTokens` proves the default chunk size and the default overlap on 2000 known single-token words.
- `TestSplitDefaultMinimumLength` proves the default length minimum at 5 and 6 characters.
- `TestSplitDefaultKeepsTheSeparator` proves the default separator mode on a newline.
- `TestSplitBlankTextIsEmpty` proves blank text gives no chunk.
- `TestEncodeTable` proves exact token ids for empty text, whole pieces, merges and multi-byte runes.
- `TestEncodeFailingText` proves the 180-byte failing text encodes to the reference vector.
- `TestEncodeDecodeRoundTrip` proves 500 fixed-seed byte strings round-trip with no error and no panic.
- `TestReadTextKeepsTheWholeText` proves the text, `source` and `charset` metadata of `TextReaderTests.loadText` without the splitter half.
- `TestReadTextPinsTheIDVector` pins the SHA-256 rule for `"Test content"`.
- `TestReadTextKeepsEmptyAndWhitespace` proves `loadEmptyText` and `loadTextWithOnlyWhitespace`.
- `TestReadTextPassesTheSourceThrough` proves `resourceDescriptionHandling` and `resourceWithoutExtension`: the source argument passes into metadata unchanged.
- `TestReadTextReadsTwiceWithTheSameID` proves `multipleCallsToGetReturnSameResult`, with equal ids where the reference returns random ids.
- `TestReadersRefuseInputAboveTheLimit` proves the size bound for both readers on syntax-valid input at and above the limit, and names the size error.
- `TestReadTextOverLimitWithCutConnectionIsFinal` proves over-limit text with a cut connection reports the size limit.
- `TestReadJSONOverLimitWithCutConnectionIsFinal` proves over-limit JSON with a cut connection reports the size limit.
- `TestReadJSONRefusesDeepNesting` proves nesting past 10000 fails with the depth error and shallow nesting succeeds.
- `TestReadJSONReadsAnArrayWithKeys` proves `loadJsonArray` on the `bikes.json` shape with the `description` key.
- `TestReadJSONReadsAnObjectWithKeys` proves `loadJsonObject` on the `person.json` shape with the `description` key.
- `TestReadJSONRendersKeyLinesInKeyOrder` proves key order beats document order, with a number rendered raw.
- `TestReadJSONRendersScalarsAndNull` proves boolean, null and nested-array rendering.
- `TestReadJSONSkipsKeysThatAnElementLacks` proves the reference `containsKey` filter and the element-JSON fallback.
- `TestReadJSONWithoutKeysKeepsTheElementJSON` proves the no-keys path round-trips through JSON and gives distinct ids.
- `TestReadJSONRefusesWhatIsNoObject` proves malformed input, scalar roots and scalar elements fail.
- `TestReadJSONRefusesEmptyInput` proves empty and blank input fail with the empty input error and no document.
- `TestAugmentSortsByScoreAndKeepsTheFirstOfEachID` proves the joiner order, the first-kept rule and the null-score rule.
- `TestAugmentWithNoDocumentUsesTheEmptyContextText` proves the empty context.
- `TestRewriteSendsTheReferencePrompt`, `TestTranslateSendsTheReferencePrompt` and `TestCompressSendsHistoryAndTheFollowUpQuery` prove the exact prompt text of each transformer.
- `TestRewriteWithABlankAnswerKeepsTheQuery` proves the blank-answer rule.
- `TestExpandReturnsOneQueryPerLine`, `TestExpandWithFewerLinesKeepsTheQuery` and `TestExpandWithATrailingNewlineKeepsTheVariants` prove the line-count rule.
- `TestMemorySearchOrderEqualsABruteForceComputation`, `TestMemoryDefaultIsFourDocumentsAndNoThreshold` and `TestMemoryDeleteKeepsTheOtherDocumentsWhole` plus the `var _ rag.Store` assertions prove `Memory` satisfies `Store`.
- `TestPgvectorRefusesBadTables` proves the table pattern and the constructor refusals.
- `TestPgvectorBlankIdSendsNoEmbedding` proves that a blank id costs no embedding request.
- `TestPgvectorVectorTextFormatsBrackets` proves the `[1,2.5,-3]` vector text form.
- `TestPgvectorMetadataTextRoundTrip` proves the JSON shape, the NaN null rule, the null read-back and the non-finite refusal.
- `TestPgvectorFilterSQLBindsEveryValue` proves that values and the hostile string stay bound parameters.
- `TestPgvectorFilterSQLEmptyLists` proves the empty `IN` and `NOT IN` rules and the no-argument binding.
- `TestPgvectorFilterSQLKinds` proves the integer, decimal and boolean bindings and the `IS NULL` shape.
- `TestPgvectorAddRefusesBadVectors` proves the refused vectors before any SQL.
- `TestPgvectorSearchRefusesBadRequests` proves the refused TopK, threshold and zero-vector requests.
- `TestPgvectorSearchReportsEmbedFailures` proves the embed failures reach the caller wrapped.
- `TestEnginePgvectorSetupIsIdempotentAndRoundTrips` proves `Setup` idempotence, order, ties, score 1, TopK and threshold.
- `TestEnginePgvectorFilterAgreement` proves that one filter table selects the same ids on both stores.
- `TestEnginePgvectorHostileValueLeavesTheTable` proves the hostile value and key keep the table.
- `TestEnginePgvectorRefusesDimensionMismatch` proves the dimension refusal before any SQL.
- `TestEnginePgvectorReplaceAndDelete` proves replacement, metadata round trip and deletion.

## Not in scope

- The decision filter, reranker and fan-out. They need the decision model.
- Document readers that need a parsing library.
- The reference builder has no port: `SplitOptions` is a struct literal with LoGOs defaults.
- The reference per-document parent id, chunk index and total chunk metadata have no port: `Split` takes text only.
- The reference subclass override case has no port: spira has no inheritance.
- The reference null-encoding case has no port: spira ships one encoder.
- The reference P50K and O200K cases port only their CL100K assertions: spira ships one encoder.
- The reference text-reader cases that need a splitter, custom metadata, Spring resource descriptions or closeable input have no port.
- The JSON pointer cases have no port: the pointer argument is out of scope.
- `allowEmptyContext` is dropped. `Augment` always renders the empty-context answer.
- The `{target}` template parameter is dropped. `Rewrite` always names a vector store.
- Custom prompt templates, a custom document formatter and builder options are dropped. The reference defaults are the only behavior.
- The reference splitter object has no port: the spira `Encoder` holds the tables and `Split` takes it through the options.
- The reference JSON-path filter has no port: every key and value is a bound parameter.
- The reference float id types have no port: spira ids are text.
- The reference observation, batching strategy and schema validator have no port.
