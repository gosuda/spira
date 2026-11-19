# auth

Package `auth` holds password hashes, sessions and the stages that guard a route. The application author writes the login page and the session store.

Password hashing follows Spring Security (revision c12aef9c6c427ee55e95021705678e777bfa11d5) and Django (revision 102c3c327d4974a58883b47a68f8d85da0be3648). Spira keeps Argon2id, the PHC shape, unpadded base64, the 16-byte salt, the 32-byte key, re-derivation with stored parameters, and constant-time comparison. Spira copies the PHC field order from the Spring encoder utils and the re-derive-then-compare shape from both clones. Spira drops the Bouncy Castle and argon2-cffi dependencies, algorithm agility, upgrade checks, and silent false on malformed input. A malformed hash returns false with an error that names the cause.

## Interface

```lgo
var NonceKey = web.NewKey[string]("auth.nonce")

func CrossOrigin() web.Stage
func SecureHeaders() web.Stage
func DevHeaders() web.Stage

func HashPassword(password string) (string, error)
func VerifyPassword(encoded string, password string) (bool, error)

type Principal struct {
	ID    string
	Roles []string
}

var PrincipalKey = web.NewKey[Principal]("auth.principal")

type Authenticator func(ctx *web.Context) (Principal?, error)
type Rule func(p Principal?) bool

func Authenticate(methods ...Authenticator) web.Stage
func Require(rule Rule) web.Stage
func Authenticated() Rule
func HasRole(role string) Rule
func Bearer(verify func(ctx context.Context, token string) (Principal?, error)) Authenticator

type SessionStore interface {
	Load(ctx context.Context, id string) (Principal?, error)
	Save(ctx context.Context, id string, p Principal, ttl time.Duration) error
	Delete(ctx context.Context, id string) error
}

type Sessions struct {
	Store  SessionStore
	Cookie string        = "__Host-spira"
	TTL    time.Duration = 12 * time.Hour
}

func (s *Sessions) Authenticator() Authenticator
func (s *Sessions) Login(ctx *web.Context, p Principal) (*http.Cookie?, error)
func (s *Sessions) Logout(ctx *web.Context) (*http.Cookie?, error)

func NewMemoryStore() SessionStore
func (s *memoryStore) Load(ctx context.Context, id string) (Principal?, error)
func (s *memoryStore) Save(ctx context.Context, id string, p Principal, ttl time.Duration) error
func (s *memoryStore) Delete(ctx context.Context, id string) error
```

## Requirements

### Stages

- `Authenticate` MUST record that it ran before it calls a method.
- `Authenticate` MUST try each method in order.
- `Authenticate` MUST stop at the first non-nil principal.
- `Authenticate` MUST store that principal under `PrincipalKey`.
- `Authenticate` MUST NOT call a later method after one method returns a principal.
- If a method returns an error, `Authenticate` MUST answer 401 `Unauthorized` as a problem.
- The 401 problem MUST NOT contain the error text.
- `Require` MUST answer 500 `Internal Server Error` when `Authenticate` did not run.
- `Require` MUST log `auth.Require used without auth.Authenticate` for that case.
- `Require` MUST call the next handler when the rule returns true.
- If the rule returns false and no principal is present, `Require` MUST answer 401 `Unauthorized`.
- If the rule returns false and a principal is present, `Require` MUST answer 403 `Forbidden`.
- `Authenticated` MUST return true only when a principal is present.
- `HasRole` MUST return false when no principal is present.
- `HasRole` MUST compare the role name exactly.
- `Bearer` MUST match the scheme name `Bearer` in any letter case.
- `Bearer` MUST take the token as the text after the first space, with leading spaces removed.
- `Bearer` MUST return no principal when the header has no space or the scheme is not `Bearer`.
- `Bearer` MUST call `verify` with the request context and the token.

### Passwords

- `HashPassword` MUST use Argon2id with memory 19456 KiB, time 2 and parallelism 1.
- `HashPassword` MUST use a 16-byte salt from `crypto/rand`.
- `HashPassword` MUST produce a 32-byte key.
- `HashPassword` MUST encode the salt and the key as raw standard base64 without padding.
- `HashPassword` MUST produce the PHC form `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<key>`.
- Two calls of `HashPassword` for one password MUST produce different strings.
- `VerifyPassword` MUST accept the Argon2id vector from the `golang.org/x/crypto/argon2` tests.
- `VerifyPassword` MUST compare the derived key with the stored key in constant time.
- `VerifyPassword` MUST return false for a one-bit change of the salt or the key.
- `VerifyPassword` MUST use the parameters in the PHC string.
- `VerifyPassword` MUST accept memory 1 to 1048576 KiB, time 1 to 16 and parallelism 1 to 16.
- `VerifyPassword` MUST accept a salt of 1 to 64 bytes and a key of 16 to 64 bytes.
- `VerifyPassword` MUST return false with an error that names the cause for a malformed hash.

### Sessions

- A session id MUST be 32 random bytes encoded as raw base64url without padding.
- The store key MUST be the hex text of the SHA-256 of the session id.
- The store MUST NOT hold the raw session id as a key.
- `Sessions.Cookie` MUST default to `__Host-spira`.
- `Sessions.TTL` MUST default to 12 hours.
- `Login` MUST issue a different session id on each call.
- `Login` MUST delete the session of the request cookie before it saves the issued session.
- `Login` MUST save the principal under the hash of the issued id with `TTL`.
- The login cookie MUST set `Secure`, `HttpOnly`, `SameSite=Lax` and `Path=/`.
- The login cookie MUST NOT set `MaxAge` or `Expires`.
- If the request has no session cookie, `Login` MUST NOT call `Delete`.
- `Logout` MUST delete the session of the request cookie.
- The logout cookie MUST have an empty value, `MaxAge` -1 and an expiry in the past.
- The logout cookie MUST set the same `Secure`, `HttpOnly`, `SameSite` and `Path` flags.
- If the request has no session cookie, `Logout` MUST NOT call `Delete`.
- `Authenticator` MUST return no principal when the request has no session cookie.
- `Authenticator` MUST load the principal under the hash of the cookie value.
- `Authenticator` MUST return the store error wrapped as `auth: session load: <cause>`.
- `NewMemoryStore` MUST return a store that `Load`, `Save` and `Delete` can call at the same time.
- The memory store MUST return no principal for an unknown id.
- The memory store MUST return no principal for an expired entry.
- `Load` of the memory store MUST delete an expired entry.
- `Save` of the memory store MUST delete expired entries when one minute has passed since the last sweep.

### Headers

- `SecureHeaders` MUST set `Content-Security-Policy` with a per-request nonce.
- The nonce MUST be the hex text of 16 bytes from `crypto/rand`.
- Two requests MUST receive different nonces.
- `SecureHeaders` MUST store the nonce under `NonceKey`.
- `SecureHeaders` MUST set `Strict-Transport-Security` to `max-age=63072000; includeSubDomains`.
- `SecureHeaders` MUST set `X-Content-Type-Options` to `nosniff`.
- `SecureHeaders` MUST set `Referrer-Policy` to `strict-origin-when-cross-origin`.
- `DevHeaders` MUST set the same three headers and MUST NOT set `Content-Security-Policy`.
- `DevHeaders` MUST NOT store a nonce.
- `CrossOrigin` MUST answer 403 `Forbidden` for an unsafe method when `Sec-Fetch-Site` is `cross-site`.
- `CrossOrigin` MUST answer 403 `Forbidden` for an unsafe method when `Origin` does not match the request host.
- `CrossOrigin` MUST pass an unsafe method when `Sec-Fetch-Site` is `same-origin` or `none`.
- `CrossOrigin` MUST pass a safe method when `Sec-Fetch-Site` is `cross-site`.
- `CrossOrigin` MUST pass a request that has neither `Origin` nor `Sec-Fetch-Site`.
- The 403 problem MUST have the check error as its detail.

## Errors

- `auth: authenticator failed` is the log line when a method returns an error. The problem detail stays empty.
- `auth.Require used without auth.Authenticate` is the log line when `Require` runs first.
- `auth: password hash: <cause>` wraps each password parse or random failure. `VerifyPassword` adds this prefix to each cause below.

`parsePasswordHash` returns these causes in this order:

```
malformed PHC string
unsupported argon2 version
malformed parameters
malformed parameter "<p>"
parameters must be positive
parameters out of bounds
salt length out of bounds
malformed salt: <cause>
key length out of bounds
malformed key: <cause>
```

`decodeBounded` returns `salt length out of bounds` or `key length out of bounds` when the encoded field is empty or too long. It returns `malformed salt: <cause>` or `malformed key: <cause>` when base64 decoding fails.

- `auth: nonce entropy: <cause>` when the nonce cannot be read.
- `auth: session id entropy: <cause>` when the session id cannot be read.
- `auth: session load: <cause>` when the store load fails.
- `auth: session save: <cause>` when the store save fails.
- `auth: session delete: <cause>` when the store delete fails.

## Proof

- `TestRequireWithoutAuthenticateAnswers500` proves the 500 and the log line.
- `TestRequireAnswers401WithoutPrincipal403WithOne` proves 401 and 403 for a false rule.
- `TestRequirePassesAuthenticatedPrincipal` and `TestHasRole` prove the pass cases.
- `TestAuthenticateTriesMethodsInOrderAndStoresFirst` proves method order and the first principal.
- `TestAuthenticateErrorIs401Problem` proves the 401 problem and its content type.
- `TestBearerVerifiesTokenAndFallsThrough` proves the token, the fallback and the case of the scheme name.
- `TestVerifyPasswordAcceptsVector` proves the reference Argon2id vector.
- `TestVerifyPasswordRejectsWrongPassword` and `TestVerifyPasswordRejectsOneBitChanges` prove rejection.
- `TestHashPasswordIsRandomized` and `TestHashPasswordUsesRequiredParameters` prove the hash shape.
- `TestVerifyPasswordRejectsMalformed` proves each parse cause against a table.
- `TestVerifyPasswordRejectsHugeEncodedFieldsByLength` and `TestVerifyPasswordAcceptsSaltAtMaximumLength` prove the length bounds.
- `TestLoginCookieShapeAndStoreSeesSHA256` proves the cookie flags, the 32-byte id and the hash key.
- `TestLoginRotatesIDAndRemovesOldSession` proves a different id and removal of the old session.
- `TestTamperedOrUnknownSessionIDIsAnonymous` proves that an unknown id is anonymous.
- `TestExpiredSessionIsAnonymous` proves that an expired entry is anonymous.
- `TestLogoutRemovesSessionAndExpiresCookie` proves deletion and an expired cookie.
- `TestMemoryStoreServesSixteenConcurrentChildren`, `TestMemoryStoreSweepKeepsUnexpiredEntries` and the fail-closed delete tests prove the store rules.
- `TestSecureHeadersWriteExactValuesWithFreshNonce` proves the CSP, the nonce and the three headers.
- `TestDevHeadersWriteCommonHeadersWithoutCSP` proves the dev headers.
- `TestCrossOriginRejectsUnsafeCrossSiteRequests` proves the cross-origin table, including a headerless post.

## Not in scope

- The package holds primitives only. The login page, the logout page and the account page are application code.
- The database session store is application code. [sqlc-gen-spira](sqlc-gen-spira.md) emits the query functions it uses.
- The package does not verify JWT, OAuth2, SAML or WebAuthn. `Bearer` is the seam for an application verifier.
- `auth` contains no SQL, so it needs no per-engine variant.
- The package offers no password-upgrade check.