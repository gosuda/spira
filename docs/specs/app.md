# app

Package `app` starts the long-lived parts of an application in order and stops them in reverse order. The application author fills one struct and calls `Run`. The package does not find, build or connect parts.

## Interface

```lgo
type Part interface {
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
}

const StopTimeout = 30 * time.Second

type Step struct {
	Name  string
	Start func(ctx context.Context) error
	Stop  func(ctx context.Context) error
}

func Run[T any](ctx context.Context, root *T) error
func StepOf[F any](steps []Step, name string, field F) []Step
func Supervise(ctx context.Context, steps []Step) error
```

## Requirements

### Steps

- `Run` MUST fail to compile with `app.Run: root must be a struct` when `T` is not a struct.
- `Run` MUST make one step for each field of `T` whose type is `Part`.
- `Run` MUST keep the field order of `T` as the step order.
- `Run` MUST skip a field of any other type at compile time.
- `StepOf` MUST append one step with the given name when `F` is `Part`.
- `StepOf` MUST return `steps` without a change when `F` is another type.

### Start and stop

- `Supervise` MUST start the steps in list order.
- `Supervise` MUST stop a start sequence at the first start error.
- After a start error, `Supervise` MUST stop the steps that started, in reverse order.
- After all steps start, `Supervise` MUST wait until `ctx` ends or the process receives SIGINT or SIGTERM.
- `Supervise` MUST then stop all steps in reverse order.
- `Supervise` MUST give each stop call its own context with the timeout `StopTimeout`.
- `Supervise` MUST call `Stop` for each remaining step after one stop call fails.
- `Supervise` MUST return the stop errors joined with `errors.Join`.

## Errors

- A start error has the format `app: start <Name>: <cause>`. It is joined with the stop errors of the started steps.
- A stop error has the format `app: stop <Name>: <cause>`.

## Proof

- `TestRunStartsInFieldOrderAndStopsInReverse` proves the start order and the stop order with a part that records each call.
- `TestRunStartFailureStopsExactlyTheStartedPrefix` proves that a start error stops only the started steps.
- `TestRunJoinsStopErrors` proves that every stop error is in the result.

## Not in scope

- The package does not connect parts. An application is ordinary statements in `main`, as the [module conventions](../../AGENTS.md) state.
