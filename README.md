# loc-int-mcp for LM Studio

An MCP server providing web search, public-page retrieval, controlled downloads,
optional dedicated-browser access and Windows text-to-speech.
LM Studio is the primary client. No external model API or search API key is
required by this server. Search depends on DuckDuckGo's public HTML results.

## Requirements and installation

Use Node.js 22 or newer and LM Studio with local MCP support. Speech requires
Windows PowerShell and Windows SAPI. The supplied optional browser launchers
are Windows scripts. A browser is not required for ordinary fetch/search tools.

Extract the source into a writable folder. The examples use
C:/MCP/loc-int-mcp; replace it with your own absolute installation path.

~~~powershell
cd C:\MCP\loc-int-mcp
npm ci --ignore-scripts
npm test
npm run test:web
~~~

npm test checks the MCP handshake, tool list and blocked-local-target behavior.
npm run test:web additionally checks actual public-page retrieval and search;
a network/search provider failure makes this check fail.

## Connect LM Studio

Merge examples/lmstudio-mcp.json into LM Studio's mcp.json and replace the
installation path. Use LM Studio's in-app MCP configuration editor; on Windows
the file is normally %USERPROFILE%/.lmstudio/mcp.json.
Make local-internet available to the chat, then ask it to fetch a public page.
See [setup and troubleshooting](docs/LM-STUDIO.md).

The integration is unofficial. Installing tools does not make a model reliable:
inspect tool results, and use deterministic programs for calculations and tests.

## Tools

| Tool | Purpose |
|---|---|
| search_web | Public web search: titles, URLs and snippets |
| fetch_url | Raw public HTTP/HTTPS response text |
| extract_page_text | Simplified page text; not a full browser renderer |
| download_url | Save a download under the data directory's downloads folder |
| browser_status | Inspect the optional dedicated debug-browser connection |
| browser_open_url | Open a public URL in that dedicated browser |
| browser_read_page_text | Read a matching debug-browser tab |
| speak_text | Read supplied text aloud using Windows SAPI |

No browser, model or chat application is installed by this package.
Speech does not send text to a remote speech service.

## Data and configuration

Data defaults to the server installation folder, independent of the client's
working directory. Set MCP_DATA_DIR to an absolute writable folder to relocate it.
Runtime logs and downloads are private local data, never release assets.

| Variable | Default |
|---|---|
| MCP_DATA_DIR | Server installation folder |
| MCP_MAX_DOWNLOAD_BYTES | 52428800 (50 MiB) |
| MCP_BROWSER_DEBUG_PORT | 9222 |
| MCP_ALLOW_PRIVATE_NETWORK | unset: private/local targets blocked |

For optional browser tools, run launch-brave-mcp-profile.ps1 or
launch-chrome-mcp-profile.ps1. They use a separate profile under this installation.
Do not use your everyday browser profile. Debug-browser access can expose tab
content and authenticated session data; see [security notes](docs/SECURITY.md).

## Build a source release

~~~powershell
npm run release
~~~

See [release procedure](docs/RELEASING.md). Profiles, logs, downloads, installed
dependencies and personal client configuration are excluded.

Licence: [MIT](LICENSE).
