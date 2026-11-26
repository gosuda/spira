# spira specifications

Each file in this directory specifies one package. A specification states what the package MUST do in a form that a test can check. The words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY have the meaning that RFC 2119 gives them.

The code is the authority for a package that is in the tree. When the code and a specification disagree, one of them has a defect: repair it in the same commit as the finding.

A file that starts with the line `Status: specified; the package is not in the tree yet.` specifies a package that the tree does not hold.

## How to read a file

- `Interface` holds every exported name with its signature.
- `Requirements` holds one requirement in each bullet.
- `Errors` holds each error and each panic with its message format.
- `Proof` names the tests that prove the requirements.
- `Not in scope` names what the package does not do, with the reason.

## Rules for all packages

- [Scope and lexicon](scope-and-lexicon.md): what spira covers, the word for each concept, and what spira does not build.
- [Wire contract](wire-contract.md): the rules that the server packages and the frontend share.
- [Module conventions](../../AGENTS.md): the rules that every package obeys.

## Application and configuration

- [app](app.md): start order and stop order of the long-lived parts.
- [config](config.md): typed configuration from ordered sources.

## HTTP

- [schema](schema.md): the shape of a type as a value.
- [validate](validate.md): field errors and the check that a type declares.
- [web](web.md): router, stages, replies and request binding.
- [openapi](openapi.md): the OpenAPI document of a router.
- [client](client.md): outbound JSON calls.
- [gateway](gateway.md): reverse proxy over static upstreams.
- [http3](http3.md): the HTTP/3 server over QUIC with Alt-Svc discovery.

## Pages and the browser

- [view](view.md): typed HTML nodes, islands and late slots.
- [asset](asset.md): the Vite manifest and the tags of an entry.
- [frontend](frontend.md): the browser workspace and its island adapters.
- [live](live.md): server-sent events.
- [bus](bus.md): typed topics inside one process.
- [websocket](websocket.md): RFC 6455 connections over HTTP/1.1 and HTTP/2.

## Data

- [db](db.md): pool, transactions, checked scans and prepared statements.
- [migrate](migrate.md): SQL migration pairs and the reversibility check.
- [sqlc-gen-spira](sqlc-gen-spira.md): the sqlc plugin that writes LoGOs code.
- [orm](orm.md): sessions over generated entity types.

## Security and operations
- [auth](auth.md): password hashes, sessions and the stages that guard a route.
- [meter](meter.md): counters, gauges and histograms with a cardinality cap.
- [ops](ops.md): the health, readiness and metrics endpoints.
- [admin](admin.md): the console that lists instances.
- [fault](fault.md): the shared error vocabulary with client-safe views.

## Resilience and background work

- [resilience](resilience.md): timeout, retry and circuit breaker.
- [cache](cache.md): bounded memory cache with one load for each key.
- [job](job.md): queues, schedules and chunked batch runs.

## Model calls

- [ai](ai.md): messages, the model seam, tools and the run loop.
- [ai-openai](ai-openai.md): the OpenAI-compatible provider.
- [ai-anthropic](ai-anthropic.md): the Anthropic provider.
- [ai-ollama](ai-ollama.md): the Ollama provider.
- [ai-session](ai-session.md): conversation history and memory.
- [ai-rag](ai-rag.md): retrieval, filters and vector stores.
- [ai-mcp](ai-mcp.md): the Model Context Protocol client and server.

## Tools and the sample

- [spira-command](spira-command.md): the `spira` command.
- [example-shop](example-shop.md): the sample application.
