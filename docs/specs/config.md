# config

Package `config` fills a typed struct from an ordered list of sources. The application author declares the struct and names the sources. No source is read unless the application names it.

## Interface

```lgo
type Source interface {
	Lookup(key string) string?
}

func Env() Source
func Map(values const map[string]string) Source
func File(path string) (Source, error)
func Remote(ctx context.Context, url string) (Source, error)
func Profile() string

type Loader struct {
	// unexported fields
}

func NewLoader(sources []Source) *Loader
func (l *Loader) Key(prefix string, name string, tag string) string
func (l *Loader) Set(dst any, key string, required bool)
func (l *Loader) Err() error
func Load[T any](sources ...Source) (T, error)
func Fill[S any](ld *Loader, dst *S, prefix string)
```

## Requirements

### Keys

- The key of a field MUST be its `env` tag when the tag is not empty.
- A key from an `env` tag MUST NOT get the prefix of the outer struct.
- Without a tag, the key MUST be the field name in upper snake case.
- A nested struct MUST add its own key and `_` in front of the keys of its fields.
- The field `DB.MaxConns` MUST have the key `DB_MAX_CONNS`.

### Sources

- `Env` MUST read each key from the process environment.
- `Map` MUST copy the given map, so a later change of that map has no effect.
- `File` MUST read one JSON object from the file.
- `Remote` MUST send one GET request and MUST read one JSON object from the answer.
- `Remote` MUST end the request after 10 seconds.
- `Remote` MUST refuse a status other than 200.
- `Remote` MUST refuse a body above 1048576 bytes.
- `Remote` MUST report the size limit when an over-limit body ends in a read error.
- `File` and `Remote` MUST change each member name to upper case.
- `File` and `Remote` MUST join the name of a nested object and the name of its member with `_`.
- `File` and `Remote` MUST skip a member whose value is `null`.
- `File` and `Remote` MUST refuse an array value.
- `File` and `Remote` MUST refuse two members that give the same key.
- `File` and `Remote` MUST keep each JSON number as the text that the document holds.
- `Profile` MUST return the value of `SPIRA_PROFILE`, or `dev` when that value is empty.
- The package MUST NOT read a file that the application did not name.

### Load

- `Load` MUST return the error `config: Load needs a struct` when `T` is not a struct.
- `Load` MUST take the value of a key from the first source that has the key.
- A source that holds an empty string for a key MUST count as a source that has the key.
- `Load` MUST leave a field at its zero value when no source has its key.
- `Fill` MUST keep the value that `dst` holds for a field when no source has its key.
- A field with the tag `required:"true"` and no value MUST be reported as a missing key.
- `Loader.Err` MUST report all missing keys in one error.
- `Loader.Err` MUST report every parse failure, joined with `errors.Join`.
- `Loader.Err` MUST report the parse failures and not the missing keys when both exist.
- `Load` MUST return the zero value of `T` together with an error.

### Field types

- `Loader.Set` MUST accept `string`, `bool`, `time.Duration`, `float64` and `[]string`.
- `Loader.Set` MUST accept `int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32` and `uint64`.
- `Load` and `Fill` MUST accept defined integer types and defined types whose underlying type is `float64`.
- `Load` and `Fill` MUST reject unsupported field types at compile time.
- `Loader.Set` MUST parse an integer in base 10 and MUST refuse a value outside the range of the type.
- `Loader.Set` MUST split a `[]string` value at each comma, trim each part and drop each empty part.
- `Loader.Set` MUST report any other field type as an error at run time.

## Errors

- `config: file "<path>": <cause>` when the file cannot be read or does not hold one JSON object.
- `config: remote "<url>": <cause>` when the request fails or the body does not hold one JSON object.
- `config: remote "<url>": status <code>` for a status other than 200.
- `config: remote "<url>": body exceeds 1048576 bytes` for a body above the limit.
- The cause `<KEY>: array value` for an array, and `<KEY>: duplicate key` for two members with one key.
- The cause `document is not a JSON object` for a document that is not an object.
- `config: missing keys: A, B` with every missing key, in field order.
- `config: <KEY>: <cause>` for a value that does not parse.
- `config: <KEY>: unsupported type` for a field type that `Loader.Set` does not accept.

## Proof

- `TestLoadFirstSourceWins`, `TestLoadEnvBeatsLaterMap` and `TestLoadMapBeatsLaterMap` prove the source order.
- `TestLoadMissingKeysReport` proves the report of all missing keys against a table that the test computes without `Load`.
- `TestLoadEmptySourcedStringIsAValue` proves that an empty string is a value.
- `TestLoadNestedStructKeys`, `TestLoadEnvTagReplacesPath` and `TestSnakeKeysFromCamelFieldNames` prove the key rules.
- `TestLoadEveryTypeParses` proves each accepted field type.
- `TestLoadMalformedValueNamesTheKey` and `TestLoadReportsEveryParseFailure` prove the parse failure report.
- `TestLoaderErrPrefersParseOverMissing` proves that parse failures replace the report of missing keys.
- `TestLoaderSetRejectsUnsupportedTypes`, `TestLoadRejectsUnsupportedFieldTypesAtCompileTime` and `TestLoadRequiresAStruct` prove the type errors.
- `TestLoadNamedNumericTypes` and `TestLoadNamedNumericTypesReportParseErrors` prove the defined numeric types.
- `TestFillKeepsFieldDefaultsThatNoSourceSets` proves that `Fill` keeps a value that no source sets.
- `TestFileSourceReadsOneJSONObject`, `TestFileSourceRejectsBadDocuments`, `TestFileSourceRejectsArrayValue` and `TestFileSourceScalarsAndSkipsNulls` prove the file rules.
- `TestFileSourceKeepsJSONNumbersExact` and `TestFileSourceExponentFormForIntMatchesEnv` prove that a number keeps its text.
- `TestFileSourceRefusesKeysThatCollide` proves the duplicate key error for three forms of collision.
- `TestRemoteSourceReadsOneJSONObject`, `TestRemoteSourceNestedObjectsFlatten`, `TestRemoteSourceRejectsNonObject` and `TestRemoteSourceRejectsArrayValue` prove the remote document rules.
- `TestFileSourceRejectsNullDocument` and `TestRemoteSourceRejectsNullDocument` prove that a `null` document is refused.
- `TestRemoteSourceRejectsNon200` and `TestRemoteSourceRejectsOversizeBody` prove the status rule and the size limit.
- `TestRemoteSourceOverLimitWithCutConnectionIsFinal` proves an over-limit body with a cut connection reports the size limit.
- `TestRemoteSourceHonorsContextTimeout` and `TestRemoteSourceHonorsContextCancel` prove that the context bounds the request.
- `TestProfileDefaultsToDev` and `TestProfileReadsEnvironment` prove `Profile`.

## Not in scope

- `Remote` reads its document one time. A refresh needs a policy that the application owns.
- The package does not choose a file by profile. The application reads `Profile` and names its files.
