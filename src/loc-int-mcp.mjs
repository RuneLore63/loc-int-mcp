import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dns from "node:dns/promises";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(process.env.MCP_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const DOWNLOAD_DIR = path.join(ROOT_DIR, "downloads");
const LOG_DIR = path.join(ROOT_DIR, "logs");
const ACCESS_LOG = path.join(LOG_DIR, "access.log");
const DEFAULT_MAX_CHARS = 20000;
const DEFAULT_SEARCH_RESULTS = 8;
const MAX_DOWNLOAD_BYTES = Number(process.env.MCP_MAX_DOWNLOAD_BYTES || 50 * 1024 * 1024);
const ALLOW_PRIVATE_NETWORK = process.env.MCP_ALLOW_PRIVATE_NETWORK === "1";
const BROWSER_DEBUG_PORT = Number(process.env.MCP_BROWSER_DEBUG_PORT || 9222);

const server = new McpServer({
  name: "loc-int-mcp",
  version: "0.1.0"
});

function text(content) {
  return { content: [{ type: "text", text: content }] };
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

async function logAccess(action, detail) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  const entry = JSON.stringify({ at: new Date().toISOString(), action, ...detail });
  await fs.appendFile(ACCESS_LOG, `${entry}\n`, "utf8");
}

function parseHttpUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }
  url.username = "";
  url.password = "";
  return url;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }
  return false;
}

async function assertAllowedUrl(rawUrl) {
  const url = parseHttpUrl(rawUrl);
  if (ALLOW_PRIVATE_NETWORK) return url;

  const hostIsIp = net.isIP(url.hostname);
  const addresses = hostIsIp
    ? [{ address: url.hostname }]
    : await dns.lookup(url.hostname, { all: true, verbatim: true });

  const privateAddresses = addresses.map((item) => item.address).filter(isPrivateIp);
  if (privateAddresses.length > 0) {
    throw new Error(
      `Blocked private/local network target ${url.hostname} (${privateAddresses.join(", ")}). ` +
        "Set MCP_ALLOW_PRIVATE_NETWORK=1 only if you deliberately want this."
    );
  }
  return url;
}

async function fetchChecked(rawUrl, options = {}) {
  let currentUrl = await assertAllowedUrl(rawUrl);
  const redirects = clampInt(options.redirects, 5, 0, 10);

  for (let i = 0; i <= redirects; i += 1) {
    await logAccess("fetch", { url: currentUrl.toString(), method: options.method || "GET" });
    const response = await fetch(currentUrl, {
      method: options.method || "GET",
      headers: {
        "user-agent": "LocalInternetMCP/0.1",
        accept: options.accept || "*/*"
      },
      redirect: "manual"
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect ${response.status} missing Location header.`);
      currentUrl = await assertAllowedUrl(new URL(location, currentUrl).toString());
      continue;
    }

    return { response, finalUrl: currentUrl.toString() };
  }

  throw new Error("Too many redirects.");
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "));
}

function normalizeDuckDuckGoUrl(rawUrl) {
  const decoded = decodeHtmlEntities(rawUrl);
  const url = new URL(decoded, "https://duckduckgo.com");
  if (url.hostname.endsWith("duckduckgo.com") && url.pathname === "/l/") {
    const target = url.searchParams.get("uddg");
    if (target) return target;
  }
  return url.toString();
}

function parseDuckDuckGoResults(html, maxResults) {
  const results = [];
  const seen = new Set();
  const resultPattern =
    /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(resultPattern)) {
    let url;
    try {
      url = normalizeDuckDuckGoUrl(match[1]);
      parseHttpUrl(url);
    } catch {
      continue;
    }

    if (seen.has(url)) continue;
    seen.add(url);
    results.push({
      title: stripTags(match[2]),
      url,
      snippet: stripTags(match[3])
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

function safeDownloadPath(filename) {
  const base = path.basename(filename || "");
  if (!base || base === "." || base === "..") {
    throw new Error("Provide a plain filename, not a directory path.");
  }
  const target = path.resolve(DOWNLOAD_DIR, base);
  if (!target.startsWith(`${DOWNLOAD_DIR}${path.sep}`)) {
    throw new Error("Download path escaped the downloads directory.");
  }
  return target;
}

async function browserJson(endpoint, init = {}) {
  const url = `http://127.0.0.1:${BROWSER_DEBUG_PORT}${endpoint}`;
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Browser debug endpoint failed: HTTP ${response.status}`);
  }
  return response.json();
}

async function sendCdp(webSocketDebuggerUrl, method, params = {}) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const id = Math.floor(Math.random() * 1_000_000);

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 5000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timeout);
      if (message.error) reject(new Error(message.error.message || "CDP command failed."));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });

  socket.close();
  return result;
}

function runWindowsTts({ speechText, voice, rate, volume, wait }) {
  if (process.platform !== "win32") {
    throw new Error("Windows text-to-speech is only available on Windows.");
  }

  const script = `
$ErrorActionPreference = 'Stop'
$synth = New-Object -ComObject SAPI.SpVoice
if ($env:MCP_TTS_VOICE) {
  $selectedVoice = $null
  foreach ($installedVoice in $synth.GetVoices()) {
    if ($installedVoice.GetDescription() -eq $env:MCP_TTS_VOICE -or $installedVoice.GetDescription().Contains($env:MCP_TTS_VOICE)) {
      $selectedVoice = $installedVoice
      break
    }
  }
  if ($null -eq $selectedVoice) {
    throw "Windows voice not found: $env:MCP_TTS_VOICE"
  }
  $synth.Voice = $selectedVoice
}
$synth.Rate = [int]$env:MCP_TTS_RATE
$synth.Volume = [int]$env:MCP_TTS_VOLUME
[void]$synth.Speak($env:MCP_TTS_TEXT)
`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        windowsHide: true,
        detached: !wait,
        stdio: wait ? ["ignore", "pipe", "pipe"] : "ignore",
        env: {
          ...process.env,
          MCP_TTS_TEXT: speechText,
          MCP_TTS_VOICE: voice || "",
          MCP_TTS_RATE: String(rate),
          MCP_TTS_VOLUME: String(volume)
        }
      }
    );

    if (!wait) {
      child.unref();
      resolve({ started: true });
      return;
    }

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ started: true, completed: true });
      } else {
        reject(new Error(`Windows TTS failed with exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

server.tool(
  "speak_text",
  {
    text: z.string().min(1).max(5000).describe("Text to read aloud using Windows built-in text-to-speech."),
    voice: z.string().min(1).max(100).optional().describe("Optional installed Windows voice name."),
    rate: z.number().int().min(-10).max(10).optional().describe("Speech rate from -10 to 10. Default is 0."),
    volume: z.number().int().min(0).max(100).optional().describe("Speech volume from 0 to 100. Default is 100."),
    wait: z.boolean().optional().describe("Wait for speech to finish before returning. Default is true.")
  },
  async ({ text: speechText, voice, rate, volume, wait }) => {
    const selectedRate = clampInt(rate, 0, -10, 10);
    const selectedVolume = clampInt(volume, 100, 0, 100);
    const shouldWait = wait !== false;

    const result = await runWindowsTts({
      speechText,
      voice,
      rate: selectedRate,
      volume: selectedVolume,
      wait: shouldWait
    });
    await logAccess("speak_text", {
      chars: speechText.length,
      voice: voice || null,
      rate: selectedRate,
      volume: selectedVolume,
      wait: shouldWait
    });
    return text(JSON.stringify(result, null, 2));
  }
);

server.tool(
  "search_web",
  {
    query: z.string().min(1).max(500).describe("Search query."),
    max_results: z.number().int().min(1).max(20).optional().describe("Maximum results to return. Default is 8."),
    region: z
      .string()
      .min(2)
      .max(20)
      .optional()
      .describe("Optional DuckDuckGo region code, such as us-en or uk-en.")
  },
  async ({ query, max_results, region }) => {
    const limit = clampInt(max_results, DEFAULT_SEARCH_RESULTS, 1, 20);
    const searchUrl = new URL("https://html.duckduckgo.com/html/");
    searchUrl.searchParams.set("q", query);
    if (region) searchUrl.searchParams.set("kl", region);

    const { response, finalUrl } = await fetchChecked(searchUrl.toString(), {
      accept: "text/html,*/*"
    });
    const body = await response.text();
    const results = parseDuckDuckGoResults(body, limit);
    await logAccess("search_web", { query, finalUrl, results: results.length });

    return text(
      JSON.stringify(
        {
          status: response.status,
          query,
          final_url: finalUrl,
          results
        },
        null,
        2
      )
    );
  }
);

server.tool(
  "fetch_url",
  {
    url: z.string().url().describe("HTTP or HTTPS URL to fetch."),
    max_chars: z.number().int().min(1000).max(100000).optional()
  },
  async ({ url, max_chars }) => {
    const limit = clampInt(max_chars, DEFAULT_MAX_CHARS, 1000, 100000);
    const { response, finalUrl } = await fetchChecked(url, { accept: "text/html,text/plain,*/*" });
    const body = await response.text();
    return text(
      JSON.stringify(
        {
          status: response.status,
          final_url: finalUrl,
          content_type: response.headers.get("content-type"),
          body: body.slice(0, limit),
          truncated: body.length > limit
        },
        null,
        2
      )
    );
  }
);

server.tool(
  "extract_page_text",
  {
    url: z.string().url().describe("HTTP or HTTPS page URL to fetch and convert to plain text."),
    max_chars: z.number().int().min(1000).max(100000).optional()
  },
  async ({ url, max_chars }) => {
    const limit = clampInt(max_chars, DEFAULT_MAX_CHARS, 1000, 100000);
    const { response, finalUrl } = await fetchChecked(url, { accept: "text/html,*/*" });
    const body = await response.text();
    const pageText = htmlToText(body);
    return text(
      JSON.stringify(
        {
          status: response.status,
          final_url: finalUrl,
          content_type: response.headers.get("content-type"),
          text: pageText.slice(0, limit),
          truncated: pageText.length > limit
        },
        null,
        2
      )
    );
  }
);

server.tool(
  "download_url",
  {
    url: z.string().url().describe("HTTP or HTTPS URL to download."),
    filename: z.string().min(1).describe("Plain filename to save under the downloads folder.")
  },
  async ({ url, filename }) => {
    const target = safeDownloadPath(filename);
    const { response, finalUrl } = await fetchChecked(url);
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}.`);

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Refusing ${contentLength} byte download; limit is ${MAX_DOWNLOAD_BYTES}.`);
    }

    const chunks = [];
    let received = 0;
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > MAX_DOWNLOAD_BYTES) {
        throw new Error(`Download exceeded limit of ${MAX_DOWNLOAD_BYTES} bytes.`);
      }
      chunks.push(chunk);
    }

    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
    await fs.writeFile(target, Buffer.concat(chunks));
    await logAccess("download", { url: finalUrl, target, bytes: received });
    return text(`Saved ${received} bytes to ${target}`);
  }
);

server.tool("browser_status", {}, async () => {
  const info = await browserJson("/json/version");
  return text(JSON.stringify(info, null, 2));
});

server.tool(
  "browser_open_url",
  {
    url: z.string().url().describe("HTTP or HTTPS URL to open in the dedicated debug browser.")
  },
  async ({ url }) => {
    const checked = await assertAllowedUrl(url);
    const page = await browserJson(`/json/new?${encodeURIComponent(checked.toString())}`, {
      method: "PUT"
    });
    await logAccess("browser_open_url", { url: checked.toString() });
    return text(JSON.stringify(page, null, 2));
  }
);

server.tool(
  "browser_read_page_text",
  {
    url_contains: z.string().optional().describe("Optional substring used to select a browser tab."),
    max_chars: z.number().int().min(1000).max(100000).optional()
  },
  async ({ url_contains, max_chars }) => {
    const limit = clampInt(max_chars, DEFAULT_MAX_CHARS, 1000, 100000);
    const pages = await browserJson("/json");
    const page =
      pages.find((item) => item.type === "page" && url_contains && item.url.includes(url_contains)) ||
      pages.find((item) => item.type === "page");

    if (!page?.webSocketDebuggerUrl) {
      throw new Error("No debuggable browser page found.");
    }

    const result = await sendCdp(page.webSocketDebuggerUrl, "Runtime.evaluate", {
      expression: "document.body ? document.body.innerText : document.documentElement.innerText",
      returnByValue: true
    });
    const pageText = String(result?.result?.value || "");
    await logAccess("browser_read_page_text", { url: page.url });
    return text(
      JSON.stringify(
        {
          url: page.url,
          title: page.title,
          text: pageText.slice(0, limit),
          truncated: pageText.length > limit
        },
        null,
        2
      )
    );
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
