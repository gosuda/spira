# asset

Package `asset` turns a Vite manifest into [view](view.md) nodes and serves the built files. The dev preamble is the React refresh preamble from the Vite backend integration guide.

## Interface

```lgo
type Manifest struct {
	// unexported fields
}

func Load(fsys fs.FS, manifestPath string) (*Manifest?, error)
func Dev(origin string) *Manifest
func (m *Manifest) Tags(entry string) (view.Node, error)
func (m *Manifest) Preload(src string) (view.Node, error)
func (m *Manifest) Files(fsys fs.FS) http.Handler
```

## Requirements

### Manifest

- `Load` MUST read one JSON object from `manifestPath` in `fsys`.
- `Load` MUST keep `file`, `css` and `imports` from each chunk.
- `Tags` MUST emit the CSS of the entry first.
- `Tags` MUST then emit the CSS of each recursive import, with a dependency before its importer.
- `Tags` MUST emit each stylesheet once.
- `Tags` MUST then emit the entry file as `<script type="module">`.
- `Tags` MUST then emit `<link rel="modulepreload">` for each recursive import, in that same order.
- A visited set MUST stop a cycle, so each import is emitted once.
- An import key that is absent from the manifest MUST be skipped.
- A production URL MUST be root-relative.
- A path that already starts with `/` MUST be kept as given.
- An unknown entry MUST be an error from `Tags`.

### Dev and files

- `Dev` MUST accept only an origin that matches `^https?://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:[0-9]+)?$`.
- `Dev` tags MUST emit the client script, then the refresh preamble, then the entry script.
- The client script MUST be `<script type="module" src="<origin>/@vite/client">`.
- The entry script MUST be `<script type="module" src="<origin>/<entry>">`.
- The preamble MUST load `RefreshRuntime` from `<origin>/@react-refresh`.
- An entry name in a dev tag MUST be escaped.
- `Preload` of a known key MUST emit `<link rel="modulepreload">` for that chunk file.
- `Preload` on a dev manifest MUST use `<origin>/<src>`.
- `Files` MUST serve files from the given file system.
- A regular file whose path starts with `/assets/` MUST get `Cache-Control: public, max-age=31536000, immutable`.
- A directory, or a path that does not start with `/assets/`, MUST NOT get that header.
- `Files` MUST NOT serve a path that leaves the file system root.

## Errors

- `asset: read manifest %s: <cause>` when the manifest file cannot be read.
- `asset: parse manifest %s: <cause>` when the file is not a JSON object of chunks.
- `asset: dev origin %q is not an http(s) origin` when `Dev` rejects the origin.
- `asset: entry %q not in manifest` when `Tags` is called with an unknown entry.
- `asset: source %q not in manifest` when `Preload` is called with an unknown key.

## Proof

- `TestTagsEmitDocumentOrder` proves the tag order against a fixture manifest.
- `TestTagsLinksEachStylesheetOnce` proves that a shared stylesheet is emitted once.
- `TestTagsCyclicImportsTerminate` proves that a cycle ends at four `modulepreload` links.
- `TestTagsUnknownEntry` and `TestPreloadUnknownKeyErrors` prove the two missing-key errors.
- `TestProductionURLsAreRootRelative` proves the leading slash.
- `TestDevTagsEmitClientPreambleAndEntry` and `TestDevTagsEscapeEntryName` prove the dev tag order and the escaped entry.
- `TestDevRejectsBadOrigins` and `TestDevAcceptsValidOrigins` prove the origin pattern, including `http://[::1]:5173`.
- `TestPreloadEmitsModulepreloadForKnownKey` and `TestPreloadDevUsesOriginAndSrc` prove the two preload forms.
- `TestLoadMalformedJSONNamesPath` and `TestLoadMissingFile` prove that both errors name the path.
- `TestFilesServesBuildOutputWithCacheHeaders` proves the cache header on a regular file under `/assets/` and its absence elsewhere.
- `TestFilesTraversalNeverServesOutsideRoot` proves that a path outside the root is not served.

## Not in scope

- The package does not run Vite. [frontend](frontend.md) builds the manifest.
- `Load` reads the file once. A refresh is the caller's job.
