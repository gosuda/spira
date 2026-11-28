# ai

Package `ai` defines messages, the model seam, the tool loop and tool search. The application author calls `Run` to use tools and wraps models with layers.

The package holds behavior translated from Spring AI.

## Interface

```lgo
type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

type Part interface { Text | Reasoning | ToolCall | ToolResult }

type Text struct {
	Text string
}

type Reasoning struct {
	Text string
}

type ToolCall struct {
	ID        string
	Name      string
	Arguments string
}

type ToolResult struct {
	ID      string
	Name    string
	Content string
	Skipped bool
}

type Message struct {
	Role  Role
	Parts []Part
}

type Tool struct {
	Name        string
	Description string
	Schema      string
	Direct      bool
	Confirm     bool
	Typed       bool
}

type Decision struct {
	Call string
	Deny string?
}

type Request struct {
	Messages    []Message
	Tools       []Tool
	Model       string?
	Temperature float64?
	TopP        float64?
	TopK        int?
	MaxTokens   int?
	Stop        []string
	Format      string?
	Decisions   []Decision
	Resume      *Reply?
}

type Finish string

const (
	FinishCompleted Finish = "completed"
	FinishTruncated Finish = "truncated"
	FinishToolCall  Finish = "tool_call"
	FinishFiltered  Finish = "filtered"
	FinishOther     Finish = "other"
)

func FinishOf(raw string) Finish

type Usage struct {
	Input  int
	Output int
	Total  int
}

type Reply struct {
	Message Message
	Finish  Finish
	Usage   Usage
	ID      string
	Model   string
}

type Chunk struct {
	Part    Part?
	Index   int?
	Partial bool
	Finish  Finish?
	Usage   Usage
	ID      string
	Model   string
}

type Model interface {
	Chat(ctx context.Context, req Request) (Reply, error)
	Stream(ctx context.Context, req Request) iter.Seq2[Chunk, error]
}

type Layer func(next Model) Model

type Embedder interface {
	Embed(ctx context.Context, texts const []string) ([][]float32, error)
}

const DenyMessage = "The user did not allow this tool call."
const SearchToolName = "search_tools"

type Limits struct {
	PerTool int = 40
	PerTurn int = 150
}

type ConfirmError struct {
	Waiting  []string
	Messages []Message
	Reply    Reply
}

func (e *ConfirmError) Error() string

type LimitError struct {
	Tool     string?
	Limit    int
	Messages []Message
}

func (e *LimitError) Error() string

func Collect(chunks iter.Seq2[Chunk, error]) (Reply, error)
func Run(ctx context.Context, m Model, req Request, limits Limits) (Reply, error)
func Wrap(m Model, layers ...Layer) Model
func SearchTools(all const []Tool) (Tool, Layer)
func (n narrowing) Chat(ctx context.Context, req Request) (Reply, error)
func (n narrowing) Stream(ctx context.Context, req Request) iter.Seq2[Chunk, error]
func ToolOf[In any](name string, description string, call func(ctx context.Context, in In) (string, error)) Tool
func ToolFromSchema[In any](name string, description string, call func(ctx context.Context, in In) (string, error), s schema.Schema) Tool
func ToolSchemaText(s schema.Schema) string
type ToolFieldContext struct {
	Raw  map[string]jsontext.Value
	Path string
}
func DecodeToolFields[T any](dst *(T), ctx ToolFieldContext) error
func DecodeToolField[F any](dst *(F), tag string, name string, ctx ToolFieldContext) error
func DecodeToolFieldValue[F any](dst *(F), v jsontext.Value, at string) error
func FillToolValue(dst any, v jsontext.Value) (bool, error)
func FillToolOption(dst any, v jsontext.Value) (bool, error)
func RecodeToolValue(dst any, v jsontext.Value) error
var ErrConfirmationRequired = fault.New("ai.confirmation_required", fault.Unprocessable, "Tool calls wait for a decision.")
var ErrToolLimitExceeded = fault.New("ai.tool_limit_exceeded", fault.Unprocessable, "The tool call limit was exceeded.")
var ErrInvalidDecision = fault.New("ai.invalid_decision", fault.Unprocessable, "The tool call decision is invalid.")
var ErrUnknownTool = fault.New("ai.unknown_tool", fault.Invalid, "The tool is unknown.")
var ErrModelFailed = fault.New("ai.model_failed", fault.Unavailable, "The model request failed.")
var ErrToolCanceled = fault.New("ai.tool_canceled", fault.Canceled, "The tool call was canceled.")
var ErrToolTimeout = fault.New("ai.tool_timeout", fault.Timeout, "The tool call timed out.")
var ErrInvalidToolArguments = fault.New("ai.invalid_tool_arguments", fault.Invalid, "The tool arguments are invalid.")
var ErrEmptyAnswer = fault.New("ai.empty_answer", fault.Unprocessable, "The answer is empty.")
var ErrAnswerTooLarge = fault.New("ai.answer_too_large", fault.TooLarge, "The answer is too large.")
var ErrUnterminatedFence = fault.New("ai.unterminated_fence", fault.Unprocessable, "The answer format is invalid.")
var ErrInvalidAnswer = fault.New("ai.invalid_answer", fault.Unprocessable, "The answer is not valid JSON.")

func Faults() []*fault.Error

func FormatInstruction() string
func Structured[T any](text string) (T, error)
```

## Requirements

### Messages and requests

- `Role` MUST be `system`, `user`, `assistant` or `tool`.
- `Part` MUST be text, reasoning, tool call or tool result.
- `Finish` MUST be completed, truncated, tool call, filtered or other.
- `FinishOf` MUST match the raw finish reason without case and without surrounding whitespace.
- `FinishOf` MUST map `stop`, `end_turn` and `stop_sequence` to completed.
- `FinishOf` MUST map `length`, `max_tokens`, `context_window_exceeded` and `model_context_window_exceeded` to truncated.
- `FinishOf` MUST map `tool_calls`, `tool_call` and `tool_use` to tool call.
- `FinishOf` MUST map `content_filter`, `safety`, `recitation`, `prohibited_content`, `spii`, `blocklist`, `refusal` and `guardrailrefusal` to filtered.
- `FinishOf` MUST return other for every other string, including an empty string.
- `Request` MUST give no numeric default to `Model`, `Temperature`, `TopP`, `TopK`, `MaxTokens` or `Format`.
- A caller MAY set `Format` to a JSON Schema text for structured output.

### Collect

- `Collect` MUST join unindexed text parts in arrival order.
- `Collect` MUST merge indexed parts by index.
- `Collect` MUST NOT build a tool call from partial chunks alone.
- `Collect` MUST keep a complete unindexed tool call.
- `Collect` MUST join unindexed reasoning deltas into one reasoning part.
- `Collect` MUST keep a complete unindexed reasoning part before the text.
- `Collect` MUST keep unindexed tool results as carried parts.
- `Collect` MUST start a new group when an index restarts with no id.
- `Collect` MUST start a new group when a complete slot repeats with no id.
- `Collect` MUST finish an open slot in place when a complete part has no id.
- `Collect` MUST keep groups apart by id in first-seen order.
- `Collect` MUST sort the slots of one group by index.
- `Collect` MUST return the parts in group order, then reasoning, then carried parts, then text, then complete calls.
- `Collect` MUST keep an empty text part when no group exists.
- `Collect` MUST keep the last usage value above zero for each field.
- `Collect` MUST keep the last id and model whose trimmed text is not empty.
- `Collect` MUST use other when no chunk carries a finish.
- `Collect` MUST set the reply role to assistant.
- `Collect` MUST keep a declared stream fault and wrap only an undeclared stream failure in `ai.model_failed`.

### Run

- `Limits.PerTool` MUST default to 40.
- `Limits.PerTurn` MUST default to 150.
- `Run` MUST stop when the reply holds no tool call.
- `Run` MUST execute pending tool calls when the last message is an assistant message with tool calls.
- `Run` MUST treat a blank argument string as `{}` for an untyped tool.
- `Run` MUST pass a blank argument string unchanged to a typed tool.
- `Run` MUST return `ai.unknown_tool` for a missing tool.
- `Run` MUST turn a tool error into that call's result text.
- `Run` MUST use the public message for a tool error that holds a fault.
- `Run` MUST turn blank tool error text into `tool <name> failed`.
- `Run` MUST return the context error when the context ends during a tool call.
- `Run` MUST report `ai.tool_canceled` when the context is canceled during a tool call.
- `Run` MUST report `ai.tool_timeout` when the deadline ends during a tool call.
- `Run` MUST keep a declared model fault and wrap only an undeclared model error in `ai.model_failed`.
- `Run` MUST count only the tool results after the last user message.
- `Run` MUST set `Skipped` on the result of a call that a denial or a limit kept from running.
- `Run` MUST NOT count a `Skipped` result toward a limit.
- `Run` MUST check the per-tool limit before the per-turn limit.
- A limit breach MUST include the results already gathered in `Messages`.
- `Run` MUST return a `LimitError` when a limit breaches.
- `Run` MUST return a `ConfirmError` before any call runs when a tool needs confirmation and `Decisions` is empty.
- `Run` MUST name only the calls whose tools need confirmation in `ConfirmError.Waiting`.
- `Run` MUST use each decision for one resumed batch only.
- `Run` MUST NOT send `Decisions` or `Resume` to the model.
- `Run` MUST carry the usage and the last reply id and model of a paused turn into `ConfirmError.Reply`.
- `Run` MUST seed its usage and last reply from `Request.Resume` when it is set.
- `Run` MUST resolve every tool of a batch before any call runs.
- `Run` MUST answer every call of a batch that a limit stops, not only the calls that ran.
- `Run` MUST require one decision for every call of a resumed reply.
- `Run` MUST name a call by its id when that id is unique, non-blank and not a position.
- `Run` MUST name other calls by `#` and the call index.
- `Run` MUST treat a nil `Deny` as allow.
- `Run` MUST use `DenyMessage` when `Deny` is blank.
- `Run` MUST use the `Deny` text when it is not blank.
- `Run` MUST NOT run a denied call.
- `Run` MUST return tool results directly only when every call ran and every tool has `Direct`.
- A direct reply MUST have role tool and finish completed.
- A direct reply MUST copy the id and model from the last model reply of the call.
- `Run` MUST return a direct reply without another model call.
- `Run` MUST sum the usage of every model round.

### Layers

- `Wrap` MUST return the model unchanged when it has no layers.
- The first layer MUST be the outermost.
- `Wrap` MUST apply each layer once per `Run` round.

### Tool search

- `SearchTools` MUST return the search tool and the layer.
- The caller MUST put the search tool and the tools in `Request.Tools`.
- `SearchTools` MUST name the tool `search_tools`.
- The narrowing layer MUST read only the results whose tool name equals `search_tools` exactly.
- The search tool MUST search the tool names and descriptions.
- The search tool MUST match without case.
- The search tool MUST treat query punctuation as separators.
- The search tool MUST drop tokens shorter than two characters and stop words.
- The search tool MUST use every query word when every word is a stop word.
- The search tool MUST drop trailing query words when the pattern exceeds 200 characters.
- The search tool MUST return at most `maxResults` names, default 5, maximum 10.
- The search tool MUST return every tool up to the limit for a blank query.
- The search tool MUST return an empty JSON list when nothing matches.
- The search tool MUST refuse arguments that are not JSON.
- A name match MUST rank above a description match.
- The layer MUST keep the search tool.
- The layer MUST keep tools that `SearchTools` does not manage.
- The layer MUST keep managed tools that an earlier search result names.
- The layer MUST drop managed tools that no search result names.
- The layer MUST NOT add a tool that the request does not carry.
- The layer MUST remove from each search result the names of tools that the request does not carry.
- `ToolOf` MUST set `Schema` to the JSON Schema text of `schema.Of[In]`().
- `ToolOf` MUST panic at derivation when `schema.Of[In]()` names an unsupported field type.
- `ToolFromSchema` MUST keep the given name, description and call in the returned `Tool`.
- `ToolFromSchema` MUST mark the returned `Tool` as typed.
- The tool call MUST decode its arguments into `In`.
- A null struct argument MUST fail decoding.
- The tool call MUST call with the zero value of `In` for blank arguments.
- The tool call MUST reject unknown JSON members.
- Argument keys MUST match wire names byte for byte.
- A duplicate key MUST keep the last value.
- A missing required field MUST fail decoding; a missing option field MUST stay none.
- JSON null in a non-option field MUST fail decoding; null in an option field MUST stay none.
- A number MUST keep its literal digits through decoding and MUST fit the field type; a fraction in an integer field MUST fail decoding.
- A date-time field MUST decode from a date-time string; a duration field from a duration string; a bytes field from a plain string.
- A decode failure MUST come back as the tool error text.
- The tool call MUST NOT run `call` when decoding fails.
- The schema text MUST hold `type`, `properties` in field order and `required`.
- `required` MUST hold exactly the fields whose schema is not an option.
- The schema text MUST set `additionalProperties` to false.
- Nested objects and arrays MUST use the same schema shape.
- An option field MUST keep its inner schema outside `required`.
- An array of options MUST list the inner type and null as alternatives.

### Structured output

- `Structured` MUST decode a bare JSON document into the typed value.
- `Structured` MUST decode a bare JSON document that holds a fence delimiter inside a string value.
- `Structured` MUST strip one wrapping markdown fence before decoding.
- `Structured` MUST accept a fence with a language tag or a bare fence.
- `Structured` MUST extract the first fence when prose surrounds fences.
- `Structured` MUST ignore a second fence after the first fence.
- `Structured` MUST end a fence at the first delimiter outside a string value.
- `Structured` MUST keep an inline fence and ignore the lines after it.
- `Structured` MUST trim surrounding whitespace before decoding.
- `Structured` MUST ignore unknown JSON fields during decoding.
- `Structured` MUST refuse text beyond 1048576 bytes with `ai.answer_too_large`.
- `Structured` MUST refuse blank text with `ai.empty_answer`.
- `Structured` MUST refuse an unterminated fence with `ai.unterminated_fence`.
- `Structured` MUST refuse trailing text after JSON with `ai.invalid_answer`.
- `FormatInstruction` MUST ask for JSON without explanations or markdown fences.
- `FormatInstruction` MUST NOT embed a JSON Schema instance.

### Code table

| Code | Kind | Message |
|---|---|---|
| `ai.answer_too_large` | too_large | The answer is too large. |
| `ai.confirmation_required` | unprocessable | Tool calls wait for a decision. |
| `ai.empty_answer` | unprocessable | The answer is empty. |
| `ai.invalid_answer` | unprocessable | The answer is not valid JSON. |
| `ai.invalid_decision` | unprocessable | The tool call decision is invalid. |
| `ai.invalid_tool_arguments` | invalid | The tool arguments are invalid. |
| `ai.model_failed` | unavailable | The model request failed. |
| `ai.tool_canceled` | canceled | The tool call was canceled. |
| `ai.tool_limit_exceeded` | unprocessable | The tool call limit was exceeded. |
| `ai.tool_timeout` | timeout | The tool call timed out. |
| `ai.unknown_tool` | invalid | The tool is unknown. |
| `ai.unterminated_fence` | unprocessable | The answer format is invalid. |

## Errors

- `ai: collect: %w` when the chunk stream fails.
- `ai: run: %w` when the model call fails.
- `ai: run: no tool call has the key '%s'; the reply's tool call keys: %v` for an unknown decision key.
- `ai: run: two decisions name the tool call '%s'` for a duplicate decision key.
- `ai: run: every tool call of the reply needs a decision; missing: %v` for missing decisions.
- `ai: search tools: arguments: %w` when the search arguments are not JSON.
- `ai: search tools: result: %w` when the search result cannot be encoded.
- `ai: search tools: pattern: %w` when the search pattern cannot compile.
- `ai: run: tool calls wait for a decision: <keys>` from `ConfirmError.Error`.
- `ai: run: Tool call limit (<n>) exceeded for tool '<name>'. No further calls to this tool are allowed in this turn.` from `LimitError.Error`.
- `ai: run: Total tool call limit (<n>) exceeded for this turn. No further tool calls are allowed.` from `LimitError.Error`.
- `ai: tool <name>: arguments: %w` when the tool arguments do not decode into the input type.
- `ai: structured: empty answer` when the answer holds no JSON text.
- `ai: structured: answer exceeds the size limit of 1048576 bytes` when the answer is too large.
- `ai: structured: unterminated code fence` when a fence never closes.
- `ai: structured: decode: <cause>` when JSON parsing fails.

## Proof

- `TestFinishOfMapsEveryRawProviderString` and `TestFinishOfNeverCallsAnUnknownStringCompleted` prove the finish mapping.
- `TestFinishOfNormalizesCaseAndWhitespace` proves the case and whitespace normalization.
- The `MessageAggregatorTests` cases prove the stream merge rules.
- `TestCollectJoinsUnindexedTextAndPutsCompleteCallsAfterIt` proves text order and complete calls.
- `TestCollectCarriesAnUnindexedCompleteReasoningBeforeTheText` proves reasoning order.
- `TestCollectJoinsUnindexedReasoningDeltasIntoOnePart` proves reasoning delta merge.
- `TestCollectMergesIndexedDeltasInIndexOrder` proves indexed merge order.
- `TestCollectSkipsToolCallDeltasAndKeepsTheCompleteCall` proves partial calls are skipped.
- `TestCollectNeverBuildsAToolCallFromDeltasAlone` proves partial calls cannot become calls.
- `TestCollectSkipsAnUnindexedToolCallDeltaAndKeepsTheEmptyText` proves the empty text part.
- `TestCollectLetsACompletePartReplaceItsDeltas` proves complete parts replace deltas.
- `TestCollectKeepsResponsesWithDifferentIDsApartInFirstSeenOrder` proves group order.
- `TestCollectStartsANewResponseWhenAnIndexRestartsWithoutAnID` proves a new group on index restart.
- `TestCollectStartsANewResponseWhenACompleteSlotIsHitAgainWithoutAnID` proves a new group on repeated complete slot.
- `TestCollectStartsANewGroupWhenALaterSlotOpensBeforeAnEarlierSlotFinishes` proves a new group on a late earlier slot.
- `TestCollectFinishesAnOpenSlotInPlaceWithoutAnID` proves in-place finish.
- `TestCollectJoinsManyDeltasToTheFullText` proves long delta join.
- `TestCollectKeepsTheLastPositiveUsageAndTheLastNamedIDAndModel` proves usage, id and model retention.
- `TestCollectReportsOtherWhenNoChunkCarriesAFinish` proves the default finish.
- `TestCollectEndsWithTheStreamError` proves the stream error wrap.
- `TestCollectKeepsADeclaredStreamFault` proves a declared stream fault survives `Collect`.
- `TestCollectReturnsTheSameTextForEverySplit` is the property test that any split returns the same text.
- The `DefaultToolCallingManagerTest` and `DefaultToolCallingManagerDecisionsTests` cases prove the tool loop.
- `TestRunExecutesACallThatNeedsNoConfirmationAndReturnsTheFinalReply` proves the plain run.
- `TestRunPausesTheWholeBatchBeforeAnyCallRunsWhenOneNeedsConfirmation` proves the confirm pause.
- `TestRunResumesAnAllowedCallAndHoldsTheReplyOnce` proves resume once.
- `TestRunAnswersADeniedCallWithItsMessageWithoutRunningIt` proves denial.
- `TestRunNeedsADecisionForEveryCallOfTheReply` proves missing decisions.
- `TestRunRefusesADecisionAboutACallTheReplyDoesNotHold` proves unknown keys.
- `TestRunRefusesTwoDecisionsAboutOneCall` proves duplicate keys.
- `TestRunUsesTheDecisionsForTheResumedBatchOnly` proves decisions are single-use.
- `TestRunReturnsToolResultsDirectlyOnlyWhenEveryCallRanAndAskedForIt` proves direct return.
- `TestRunRefusesAnAllowedCallWhoseToolTheRequestDoesNotCarry` proves missing tools.
- `TestRunNamesACallByItsPositionWhenItsIDIsMissingSharedOrLooksLikeAPosition` proves call keys.
- `TestRunStopsAtTheLimitForOneToolAndKeepsTheResultsItGathered` proves the per-tool limit.
- `TestRunStopsAtTheLimitForTheTurnWithTheResultsOfTheSameBatch` proves the per-turn limit.
- `TestRunCountsCallsFromTheLastUserMessageOnly` proves turn counting.
- `TestRunFailsOnAToolTheRequestDoesNotCarry` proves unknown tools.
- `TestRunGivesBlankArgumentsToTheToolAsAnEmptyObject` proves blank arguments.
- `TestRunTurnsAToolErrorIntoTheResultOfThatCall` proves tool error text.
- `TestRunEndsWhenTheContextEndsDuringATool` proves context end and its canceled report.
- `TestRunReportsTimeoutWhenTheDeadlineEndsDuringATool` proves the timeout report.
- `TestRunKeepsADeclaredModelFault` proves a declared model fault survives `Run`.
- `TestFaultModelFailed` proves model error wrap.
- `TestRunNeverCallsAToolWhenTheContextEndedBeforeTheBatch` proves the pre-batch context check.
- `TestRunCarriesUsageAndReplyStateAcrossAConfirmation` proves the paused reply state.
- `TestRunCarriesTheAccumulatedUsageIntoTheResumedReply` proves usage across a confirmation.
- `TestRunResolvesEveryToolBeforeAnyCallRuns` proves pre-resolution.
- `TestRunAnswersEveryCallWhenALimitStopsTheBatch` and `TestRunAnswersEveryCallWhenATurnLimitStopsTheBatch` prove answered calls on a limit.
- `TestRunChargesNoLimitForACallThatDidNotRun` proves that a skipped call uses no limit when the turn continues.
- `TestSearchToolsReadsOnlyTheResultsOfItsExactName` proves that a tool named `Search_Tools` keeps its output.
- `TestWrapRunsLayersInListOrderOncePerRoundOfTheLoop` proves layer order and rounds.
- The `RegexToolIndexTests` cases prove the search index.
- `TestSearchToolsMatchesByToolName` proves name match.
- `TestSearchToolsMatchesByDescription` proves description match.
- `TestSearchToolsRanksANameMatchAboveADescriptionMatch` proves ranking.
- `TestSearchToolsLimitsItsResults` proves result limits.
- `TestSearchToolsReadsAQueryWithoutCaseStopWordsOrPunctuation` proves query reading.
- `TestSearchToolsDropsTheLastWordsOfAQueryThatIsTooLong` proves pattern cap.
- `TestSearchToolsReturnsEveryToolUpToTheLimitForABlankQuery` proves blank query.
- `TestSearchToolsReturnsAnEmptyListWhenNothingMatches` proves empty result.
- `TestFaultInvalidToolArguments` proves argument refusal.
- `TestSearchToolsShowsTheModelOnlyTheSearchToolAndWhatEarlierSearchesFound` proves layer narrowing.
- `TestSearchToolsIgnoresASearchResultItCannotReadAndNamesItDoesNotManage` proves ignored results.
- `TestSearchToolsNamesOnlyToolsTheRequestCarries` proves the search scope.
- `TestToolOfSchemaMatchesHandWrittenSchema` proves the schema text.
- `TestToolOfLeavesOptionFieldsOutOfRequired` proves the `required` rule.
- `TestToolOfRejectsAWrongTypeWithoutRunningTheFunction` proves the type refusal.
- `TestToolOfRejectsAnUnknownMemberWithoutRunningTheFunction` proves the unknown-member refusal.
- `TestToolOfDecodesBlankArgumentsAsAnEmptyObject` proves the blank rule.
- `TestToolOfRunsThroughRun` proves the loop round trip.
- The `BeanOutputConverterTest` and `MarkdownCodeBlockCleanerTest` cases prove the structured output rules.
- `TestStructuredDecodesBareDocument` proves the bare JSON document.
- `TestStructuredDecodesJsonFence` proves the fence with a language tag.
- `TestStructuredDecodesBareFence` proves the bare fence in both shapes.
- `TestStructuredExtractsFenceFromProse` proves the fence inside prose.
- `TestStructuredTrimsSurroundingWhitespace` proves the whitespace trim.
- `TestStructuredUsesFirstFence` proves that the first fence wins.
- `TestStructuredDecodesBareDocumentWithFenceInsideAString` proves the bare document with a delimiter inside a string.
- `TestStructuredDecodesFenceHoldingFenceInsideAString` proves the fence with a delimiter inside a string.
- `TestStructuredExtractsInlineFenceBeforeTrailingProse` proves the inline fence with prose after it.
- `TestStructuredUsesFirstInlineFenceBeforeASecondFence` proves the first inline fence with a second fence after it.
- `TestFaultUnterminatedFence` proves the unterminated fence error.
- `TestFaultInvalidAnswer` proves the trailing text error.
- `TestFaultEmptyAnswer` proves the empty answer error.
- `TestStructuredIgnoresUnknownFields` proves that unknown fields are ignored.
- `TestFaultAnswerTooLarge` proves the size bound.
- `TestFormatInstructionOmitsSchema` proves the instruction without a schema.

## Not in scope

- Observation, AOT hints and method callbacks. They need reflection.
- Image, audio and moderation types. The capability set does not include them.
- `MessageWindowChatMemory`. Sessions replace it.
- The fluent builder, ordered integers, the safeguard advisor and the logger advisor. Layers replace them.
- Lucene, vector-store and decision tool indexes. Each needs a library or a second model call.
- JSON Schema generation for the format instruction. It waits for the `schema` package.
- Thinking-tag removal. The listed rules cover fences and whitespace only.
