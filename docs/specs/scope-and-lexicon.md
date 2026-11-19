# Scope and lexicon

spira gives the behavior of the Spring ecosystem to an application written in LoGOs. It covers each area at shallow depth. This file names the spira form of each Spring concept and lists what spira does not build. The [module conventions](../../AGENTS.md) hold the rules that every package obeys.

## Lexicon

Each exported name MUST be a word that the application author already uses for the thing. A package MUST NOT use a Spring name that has no meaning of its own. These names are `Bean`, `Factory`, `Template`, `Manager`, `Configurer`, and `Context` for a container.

| Spring concept | spira form | Specification |
|---|---|---|
| `ApplicationContext`, `BeanFactory`, bean lifecycle, `SpringApplication.run` | Ordinary statements in `main`, then `app.Run` for start order and stop order | [app](app.md) |
| `@ConfigurationProperties`, profiles, Cloud Config | `config.Load[T]` over ordered sources | [config](config.md) |
| AOP advice, `HandlerInterceptor`, servlet `Filter` | `web.Stage` | [web](web.md) |
| `DispatcherServlet`, `@RequestMapping`, `@RequestBody`, `ResponseEntity` | `web.Router`, `web.Route[In]`, `web.Reply` | [web](web.md) |
| Bean Validation | `validate.Checker` | [validate](validate.md) |
| Thymeleaf and other template engines | `view` node functions | [view](view.md) |
| `JdbcTemplate`, `JdbcClient`, `@Transactional`, `DataAccessException` | SQL files that sqlc checks, functions that `sqlc-gen-spira` writes, `db.InTx`, plain errors | [db](db.md), [sqlc-gen-spira](sqlc-gen-spira.md) |
| JPA `EntityManager`, Spring Data repositories | `orm.Session` over generated entity types | [orm](orm.md) |
| Flyway, Liquibase | `migrate.Apply` over SQL pairs, `migrate.CheckReversible` | [migrate](migrate.md) |
| `SecurityFilterChain`, `AuthenticationManager`, `AuthorizationManager` | `auth.Authenticate` and `auth.Require` stages | [auth](auth.md) |
| Micrometer, Actuator | `meter`, `ops` | [meter](meter.md), [ops](ops.md) |
| `RestClient`, OpenFeign | `client` | [client](client.md) |
| Cloud CircuitBreaker, Retry | `resilience` | [resilience](resilience.md) |
| `@Cacheable` | `cache.Load` | [cache](cache.md) |
| Cloud Gateway | `gateway` | [gateway](gateway.md) |
| `ApplicationEventPublisher`, Spring Integration channels | `bus.Topic[T]` | [bus](bus.md) |
| `@Scheduled`, Spring Batch | `job` | [job](job.md) |
| Reactor `Flux` and `Mono` | `iter.Seq` with `yield`, channels and `go group` | no package |
| springdoc | `openapi` | [openapi](openapi.md) |
| Spring Boot Admin | `admin` | [admin](admin.md) |
| Initializr, DevTools | `spira new`, `spira dev` | [spira-command](spira-command.md) |
| Spring AI chat client, advisors, tool calls, sessions, vector stores | `ai.Run`, `ai.Layer`, `ai.Tool`, `ai/session`, `ai/rag` | [ai](ai.md), [ai-session](ai-session.md), [ai-rag](ai-rag.md) |

## Not in scope

- Broker adapters for Kafka, AMQP and Pulsar. Each needs a third-party client. `bus.Topic` is the seam.
- Service discovery backends and OTLP export. Each needs a third-party client.
- JWT, OAuth2, SAML and WebAuthn. Each needs a third-party library. `auth.Bearer` is the seam.
- SOAP, Web Flow, Shell, LDAP, Vault, GraphQL, gRPC, HATEOAS and REST Docs. No requirement names them.
- Modulith. LoGOs package boundaries and the capability check of `logos.toml` do this work.
- A test client package. The raw form is two lines of `net/http/httptest`.
- Oracle. sqlc has no Oracle engine.
- ClickHouse. It has no transactions for the session.
- DuckDB. Its driver needs cgo, and the module forbids cgo.
- Spanner. No requirement names it.
- A package for reactive types. `iter.Seq`, channels and `go group` do this work.
