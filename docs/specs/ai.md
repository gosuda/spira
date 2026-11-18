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
	Call        func(ctx context.Context, arguments string) (string, error)
	Direct      bool
	Confirm     bool
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
- `Collect` MUST return the stream error wrapped as `ai: collect: %w`.

### Run

- `Limits.PerTool` MUST default to 40.
- `Limits.PerTurn` MUST default to 150.
- `Run` MUST stop when the reply holds no tool call.
- `Run` MUST execute pending tool calls when the last message is an assistant message with tool calls.
- `Run` MUST treat a blank argument string as `{}`.
- `Run` MUST return an unknown tool name as the error `ai: run: no tool named "<name>"`.
- `Run` MUST turn a tool error into that call's result text.
- `Run` MUST turn blank tool error text into `tool <name> failed`.
- `Run` MUST return the context error when the context ends during a tool call.
- `Run` MUST wrap a model error as `ai: run: %w`.
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

## Errors

- `ai: collect: %w` when the chunk stream fails.
- `ai: run: %w` when the model call fails.
- `ai: run: no tool named %q` when the request has no tool with that name.
- `ai: run: tool %s: %w` when the context ends during a tool call.
- `ai: run: no tool call has the key '%s'; the reply's tool call keys: %v` for an unknown decision key.
- `ai: run: two decisions name the tool call '%s'` for a duplicate decision key.
- `ai: run: the request does not carry the tool '%s' of the allowed call '%s'` for an allowed call with no tool.
- `ai: run: every tool call of the reply needs a decision; missing: %v` for missing decisions.
- `ai: search tools: arguments: %w` when the search arguments are not JSON.
- `ai: search tools: result: %w` when the search result cannot be encoded.
- `ai: search tools: pattern: %w` when the search pattern cannot compile.
- `ai: run: tool calls wait for a decision: <keys>` from `ConfirmError.Error`.
- `ai: run: Tool call limit (<n>) exceeded for tool '<name>'. No further calls to this tool are allowed in this turn.` from `LimitError.Error`.
- `ai: run: Total tool call limit (<n>) exceeded for this turn. No further tool calls are allowed.` from `LimitError.Error`.

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
- `TestRunEndsWhenTheContextEndsDuringATool` proves context end.
- `TestRunWrapsTheModelError` proves model error wrap.
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
- `TestSearchToolsRefusesArgumentsThatAreNotJSON` proves argument refusal.
- `TestSearchToolsShowsTheModelOnlyTheSearchToolAndWhatEarlierSearchesFound` proves layer narrowing.
- `TestSearchToolsIgnoresASearchResultItCannotReadAndNamesItDoesNotManage` proves ignored results.
- `TestSearchToolsNamesOnlyToolsTheRequestCarries` proves the search scope.

## Not in scope

- Observation, AOT hints and method callbacks. They need reflection.
- Image, audio and moderation types. The capability set does not include them.
- `MessageWindowChatMemory`. Sessions replace it.
- The fluent builder, ordered integers, the safeguard advisor and the logger advisor. Layers replace them.
- Lucene, vector-store and decision tool indexes. Each needs a library or a second model call.
- Tool schemas from Go types and structured output decoding. They wait for `schema`.
