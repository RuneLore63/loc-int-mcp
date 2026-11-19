# Build and verify a release

The primary client is LM Studio. This is a source release: install dependencies
after extracting it. Node.js, Python and browsers are not bundled.

## Build

Build requirement: tar on PATH (included in current Windows, macOS and common Linux installations). Run from the project folder:

~~~powershell
npm run release
~~~

A new timestamped folder under releases contains:

- source: the curated, standalone source tree.
- A .tgz source archive with a source/ top-level folder.
- SHA256SUMS.txt and release-summary.json.
- RELEASE-MANIFEST.json inside the source and archive, recording file hashes.

Nothing is uploaded, published, committed or tagged. The package remains marked
private to prevent accidental npm publication; the source is licensed MIT.

## File boundary

release-files.json is the positive allowlist. Local config.json, node_modules,
virtual environments, browser profiles, captures, downloads, logs, STOP files,
credentials and development outputs are excluded. The builder rejects symlinks,
absolute user-profile paths and private-key headers and unexpected packed files. Do not archive the
working project directory wholesale.

## Clean installation check

Extract the archive into a new empty folder, change to its source folder, and
run npm ci --ignore-scripts followed by npm test. Install the Python requirements
and configure its interpreter as described in README.md for win-mcp. For the
internet server, npm run test:web separately checks live network access.

The archive does not contain dependency packages. npm ci obtains the exact
versions in package-lock.json. Review upstream dependency licence notices when
redistributing their code. Do not edit package-lock.json to conceal failed tests.

GUI tests, speech playback, browser launches, authenticated HTTP/tunnel operation,
other operating systems and other client versions require separate acceptance.
The automated checks do not establish every desktop workflow.

Keep validation logs outside the source tree and rebuild after source changes.
Record tested Node/Python/client versions with each published release.
