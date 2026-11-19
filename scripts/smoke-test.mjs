import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "src/loc-int-mcp.mjs")],
  env: { ...process.env, MCP_ALLOW_PRIVATE_NETWORK: "0" }
});
const client = new Client({ name: "loc-int-mcp-smoke-test", version: "0.1.0" });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  const expected = ["speak_text", "search_web", "fetch_url", "extract_page_text", "download_url",
    "browser_status", "browser_open_url", "browser_read_page_text"];
  assert.deepEqual(tools.tools.map(t => t.name).sort(), expected.sort());
  console.log("MCP handshake and all eight tools passed.");
  const blocked = await client.callTool({ name: "fetch_url", arguments: { url: "http://127.0.0.1/", max_chars: 1000 } });
  assert.equal(blocked.isError, true);
  assert.match(JSON.stringify(blocked.content), /Blocked private\/local network/);
  console.log("Private/local URL rejection passed.");
  if (process.argv.includes("--web")) {
    const result = await client.callTool({ name: "extract_page_text",
      arguments: { url: "https://example.com", max_chars: 2000 } });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const page = JSON.parse(result.content[0].text);
    assert.equal(page.status, 200);
    assert.match(page.text, /Example Domain/i);
    console.log("Public page fetch passed.");
  }
  if (process.argv.includes("--search")) {
    const result = await client.callTool({ name: "search_web",
      arguments: { query: "example domain", max_results: 3 } });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const search = JSON.parse(result.content[0].text);
    assert.equal(search.status, 200);
    assert.ok(search.results.length > 0);
    assert.ok(search.results.every(r => /^https?:\/\//.test(r.url)));
    console.log("Live web search passed.");
  }
  if (process.argv.includes("--browser")) {
    const result = await client.callTool({ name: "browser_status", arguments: {} });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    console.log(JSON.stringify(result));
  }
} finally {
  await client.close();
}
