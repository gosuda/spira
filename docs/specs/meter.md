# meter

Package `meter` records counters, gauges and histograms and writes them as Prometheus text. The application author creates one registry and serves it with `Handler` or the `HTTP` stage.

## Interface

```lgo
func HTTP(reg *Registry) web.Stage

type Registry struct {
	// unexported fields
}

func NewRegistry() *Registry
func (r *Registry) Counter(name string, help string, labels ...string) *Counter
func (r *Registry) Gauge(name string, help string, labels ...string) *Gauge
func (r *Registry) Histogram(name string, help string, buckets const []float64, labels ...string) *Histogram
func (r *Registry) Handler() http.Handler

type Counter struct {
	// unexported fields
}

type CounterSeries struct {
	// unexported fields
}

func (c *Counter) With(values ...string) CounterSeries
func (s CounterSeries) Add(n uint64)

type Gauge struct {
	// unexported fields
}

type GaugeSeries struct {
	// unexported fields
}

func (g *Gauge) With(values ...string) GaugeSeries
func (s GaugeSeries) Add(delta float64)
func (s GaugeSeries) Set(v float64)

type Histogram struct {
	// unexported fields
}

type HistogramSeries struct {
	// unexported fields
}

func (h *Histogram) With(values ...string) HistogramSeries
func (s HistogramSeries) Observe(v float64)
```

## Requirements

### Names

- `Counter`, `Gauge` and `Histogram` MUST keep the label names given at creation.
- A metric name MUST be non-empty.
- The first character of a metric name MUST be `_`, `:`, or an ASCII letter.
- Each later character of a metric name MUST be `_`, `:`, an ASCII letter, or a digit.
- A label name MUST be non-empty.
- The first character of a label name MUST be `_` or an ASCII letter.
- Each later character of a label name MUST be `_`, an ASCII letter, or a digit.
- One metric MUST NOT repeat a label name.
- A histogram MUST NOT use the label name `le`.
- A label name MUST NOT start with two underscores. Prometheus reserves those names.
- A registry MUST NOT hold two metrics with the same name.
- A histogram writes samples named `<name>_bucket`, `<name>_sum` and `<name>_count`.
- A registry MUST NOT hold two metrics that write a sample with the same name.

### Series

- `With` MUST receive one value for each label name.
- `Add`, `Set` and `Observe` MUST change only the series that `With` returned.
- `CounterSeries.Add` MUST add `n` to the series count.
- `GaugeSeries.Add` MUST add `delta` to the series value.
- `GaugeSeries.Set` MUST replace the series value with `v`.
- A metric MUST hold at most 1000 series.
- The first 999 distinct label sets MUST each have one series.
- Every later label set MUST share one series.
- Every label value of that shared series MUST be `overflow`.
- `Observe` MUST add the value to the first bucket whose bound is greater than or equal to the value.
- `Observe` MUST put a value above every finite bound only in the `+Inf` bucket.
- `Observe` MUST add the value to the series sum.
- `Observe` MUST add one to the series count.
- A histogram MUST have at least one bucket bound.
- Each bucket bound MUST be a finite number.
- Each bucket bound MUST be greater than the bound before it.
- Concurrent `Add` calls on one series MUST all be counted.

### Exposition

- `Handler` MUST set `Content-Type` to `text/plain; version=0.0.4; charset=utf-8`.
- `Handler` MUST write metrics in registration order.
- `Handler` MUST write a `HELP` line and a `TYPE` line for each metric.
- A metric with no series MUST still have those two lines.
- The `TYPE` kind MUST be `counter`, `gauge` or `histogram`.
- `Handler` MUST write the series of one metric in creation order.
- A counter sample MUST end with the count as a decimal integer.
- A gauge sample MUST format the value with `strconv.FormatFloat`, verb `g`, precision -1 and bit size 64.
- A histogram MUST write one cumulative `<name>_bucket` line for each bound, with label `le`.
- Each bucket line MUST count observations less than or equal to that bound.
- A histogram MUST write one cumulative `<name>_bucket` line with `le="+Inf"`.
- The `+Inf` line MUST equal the number of observations.
- A histogram MUST write `<name>_sum` and `<name>_count` for the same label set.
- The sum MUST be the sum of the observed values, in the gauge number format.
- Help text MUST escape `\` as `\\`.
- Help text MUST escape a newline as `\n`.
- A label value MUST escape `\` as `\\`.
- A label value MUST escape a newline as `\n`.
- A label value MUST escape `"` as `\"`.
- Label order on a sample MUST be the order given at creation.
- On a bucket line, `le` MUST be the last label.

### HTTP stage

- `HTTP` MUST record the counter `http_requests_total`.
- The counter help text MUST be exactly `HTTP requests by method, route and status class.`
- `HTTP` MUST record the histogram `http_request_duration_seconds`.
- The histogram help text MUST be exactly `HTTP request duration in seconds by method, route and status class.`
- Those bounds MUST be 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5 and 10.
- Both metrics MUST use the label names `method`, `route` and `status`.
- The `method` label MUST be the request method.
- The `route` label MUST be `Request.Pattern` when that pattern is not empty.
- The `route` label MUST be `unmatched` when `Request.Pattern` is empty.
- The `status` label MUST be `5xx` when the status is 500 or higher.
- The `status` label MUST be `4xx` when the status is from 400 to 499.
- The `status` label MUST be `3xx` when the status is from 300 to 399.
- The `status` label MUST be `2xx` for every other status.
- After the inner handler returns, the status MUST be the value from `ctx.Status()`.
- `HTTP` MUST add one to the counter for each request that enters the stage.
- `HTTP` MUST observe that request duration in seconds.
- A panic in the inner handler MUST be counted with status class `5xx`.

## Errors

- `meter: invalid metric name <quoted>` when the name is empty or has a bad character. The quote is `strconv.Quote`.
- `meter: invalid label name <quoted>` when a label name is empty or has a bad character.
- `meter: duplicate label name <quoted>` when a label name repeats.
- `meter: duplicate metric name <name>` when the registry already has that name. This text does not quote the name.
- `meter: metric <name> collides with <other> on the sample name <sample>` when two metrics write one sample name.
- `meter: label name le is reserved on histograms` when a histogram label is `le`.
- `meter: label name <quoted> is reserved` when a label name starts with two underscores.
- `meter: histogram needs at least one bucket` when the bound list is empty.
- `meter: invalid bucket bound <text>` when a bound is NaN or infinite. The text uses `strconv.FormatFloat` with verb `g`, precision -1 and bit size 64.
- `meter: buckets must be strictly increasing` when a bound is less than or equal to the bound before it.
- `meter: metric <name> has <n> labels, got <m>` when `With` receives the wrong count.

## Proof

- `TestExpositionRoundTrip` proves the sample values against a test-local parser of the exposition text.
- `TestSeriesCapFoldsOverflow` proves the 1000 series cap and the `overflow` fold from the 1000th label set.
- `TestHistogramNoLabelsManyBuckets` and `TestHistogramThreeLabelsTwelveBuckets` prove cumulative bounds and the `+Inf` bucket.
- `TestRejectsHistogramLeLabel` proves the reserved label `le`.
- `TestRejectsColonInLabelName` proves that a label name cannot contain `:`.
- `TestRejectsLabelNameStartingWithTwoUnderscores` proves that `__name__` is refused.
- `TestEscapesHelpText` and `TestEscapesLabelValues` prove the two escape rules.
- `TestDistinctLastLabelSeries` and `TestDistinctLabelSetsDoNotCollide` prove that distinct label sets stay apart.
- `TestLabelCountMismatchPanics` proves the value-count panic.
- `TestConcurrentAdds` proves that concurrent `Add` calls all count.
- `TestRejectsDuplicateMetricName` proves the duplicate name panic.
- `TestRejectsCounterNameCollidingWithHistogramSamples` and `TestRejectsHistogramNameCollidingWithCounterSamples` prove the sample name rule in both orders.
- `TestRejectsUnsortedBuckets` and `TestRejectsEmptyBuckets` prove the bound rules.
- `TestContentType` proves the exposition content type.
- `TestHTTPRouteLabelIsRegisteredPattern` proves that the route label is the registered pattern.
- `TestHTTPRecordsStatusClass` proves the `2xx` and `3xx` classes and the duration count.
- `TestHTTPRecordsErrorStatuses` and `TestHTTPRecordsServerErrorClass` prove the `4xx` and `5xx` classes.
- `TestRouteMissesAreCountedUnderOneRouteLabel` proves the `unmatched` label for a miss and for status 405.
- `TestRecoveredPanicIsCountedAsServerError` proves that a recovered panic counts as `5xx`.

## Not in scope

- The package does not export OTLP. Prometheus text needs no SDK.
