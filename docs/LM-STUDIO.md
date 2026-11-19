# LM Studio setup

1. Install dependencies using README.md.
2. Open LM Studio's MCP configuration editor (Program sidebar > Install >
   Edit mcp.json; UI wording may vary by version).
3. Merge the supplied examples/lmstudio-mcp.json entry into mcpServers.
   Replace all C:/MCP placeholders with actual absolute paths. Do not overwrite
   other server entries.
4. Save, confirm the server is available, and enable it for the chat.
5. Load a tool-capable model and start a short new conversation for testing.

For win-mcp, begin with health_check and list_windows; set WIN_MCP_PYTHON to the
Python environment where Pillow is installed. For local-internet, begin with
extract_page_text on https://example.com. Speech can be tested separately using
a short speak_text request on Windows.

A successful text response is not proof of a tool call. Inspect the tool name,
arguments and returned result. Model memory consumption, prompt processing and
tool-call quality are separate from MCP connectivity.

## Desktop chat versus API clients

Desktop chat MCP access and API integration permissions are separate. A working
desktop chat does not grant an external API client access to configured servers.
The native LM Studio API can return 403 when plugin access is not permitted.

For deliberate API use, review Server Settings, Require Authentication, and
Allow calling servers from mcp.json. Grant only the needed token/server access.
This package does not change those settings, create tokens, or configure remote
access. Plain OpenAI-compatible requests do not automatically receive desktop
MCP tools; the caller must supply/orchestrate tools or use the native integration
API with the required permissions.

## Troubleshooting

- Startup failure: verify absolute Node/server paths and run npm test.
- Tools absent: confirm the entry is enabled for this chat and restart the
  connection after configuration changes.
- Model prints text but makes no call: check its tool support and the conversation
  context; use a short explicit request.
- RAM pressure: run one model and short contexts while assessing tool use.
  Unload inference models before unrelated GPU benchmarks.
- Windows Access denied: privilege boundaries remain in effect.
- Speech unavailable: Windows SAPI/PowerShell is required, and the tool must
  actually be called.

References: [LM Studio MCP setup](https://lmstudio.ai/docs/app/mcp) and
[API server settings](https://lmstudio.ai/docs/developer/core/server/settings).
