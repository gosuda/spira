# Wire contract

The server packages [view](view.md), [web](web.md) and [live](live.md) write HTML and events. The workspace [frontend](frontend.md) reads them in the browser. This file holds the rules that the two sides share.

A change to one side MUST change the other side and the corpus in the same commit.

## Requirements

### Slots

- A slot id MUST have the form `s<16 hex digits>-<n>`, with lower-case hex digits.
- `view.Render` MUST make the 16 digits at random for each call.
- `view.Render` MUST count `n` from 0 for the slots of one call.
- The client MUST compare the `id` attribute with the slot id byte for byte.
- The client MUST NOT build a selector from a slot id.

### Islands

- The `when` attribute of an island MUST be `load`, `visible` or `idle`.
- For any other `when` value, the client MUST keep the fallback and MUST log one error.
- The `props` attribute of an island MUST hold one JSON object.
- For malformed JSON, the client MUST keep the fallback and MUST log one error.
- For JSON that is not a plain object, the client MUST keep the fallback and MUST log one error.
- When the client keeps the fallback, it MUST NOT mount the island and MUST NOT remove a child.

### Events

- `live.Events` MUST write a named `event:` line before each `data:` body.
- `live.Events` MUST refuse an event name that holds a line feed or a carriage return.
- `live.Events` MUST send the comment `: live` as a heartbeat.
- The stream MUST end when the client disconnects.

### Fragments

- A request with `HX-Request`, and without `HX-Boosted` and `HX-History-Restore-Request`, MUST get the fragment without the document shell.
- A page response MUST carry `Vary: HX-Request, HX-Boosted, HX-History-Restore-Request`.

## Corpus

- The file `wire/corpus.jsonl` MUST hold one JSON object in each line.
- Each object MUST have the members `name`, `request`, `response` and `reject`.
- The `request` member MUST name its kind: `slot-id`, `island-when`, `island-props`, `sse-event-name` or `sse-field`.
- The `reject` member MUST be true when the receiving side refuses the request.
- The LoGOs tests and the frontend tests MUST read this file.
- A test MUST NOT keep a copy of a corpus line.

## Proof

- `TestWireCorpus` in `view/view_test.lgo` checks the slot and island lines against `view`.
- `TestWireCorpus` in `live/corpus_test.lgo` checks the event lines against `live`. It fails when the package writes a field that the corpus does not hold.
- `frontend/test/corpus.test.ts` checks the slot and island lines against the client code.
