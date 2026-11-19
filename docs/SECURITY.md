# Security and data handling

This is a local stdio MCP process with outbound web access. It is not a sandbox
for an untrusted model and does not authenticate the local client.

HTTP/HTTPS URLs are checked before requests and redirects. Common private/local
address ranges are blocked by default. This is a convenience guard, not a complete
SSRF defence: DNS can change after validation, IPv6/private special ranges are
not exhaustive, and debug-browser connections use a separate localhost channel.
Do not give this server untrusted network authority or use the private-network
override as a way to bypass network policy.

MCP_ALLOW_PRIVATE_NETWORK=1 deliberately relaxes the URL restriction. Keep it
unset for ordinary use. Public web content is untrusted data, not instructions.

Search/fetch requests disclose the query or URL to the destination service.
Access logs include requested URLs, and browser tools can reveal authenticated
page content. Use a dedicated browser profile and keep its debugging endpoint
local. No browser profile or cookies belong in a source release.

Downloads are limited to the configured size and data-directory downloads
folder. Text-return character limits do not bound the entire upstream response
buffer. Network calls have no general fetch timeout in this release. Avoid
large or untrusted responses; abort/restart the server if a request stalls.

Speech uses Windows SAPI locally. A model may choose the wrong voice, omit a
tool call or invent conclusions despite receiving correct tool results. Verify
important results with deterministic checks.

The release excludes logs, downloaded files, browser profiles and installed
dependencies. Report security problems privately through the repository's
Security tab ("Report a vulnerability"), not as a public issue, and sanitize any
diagnostic report.
