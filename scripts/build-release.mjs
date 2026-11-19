import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(root, "releases", pkg.name + "-" + pkg.version + "-" + stamp);
const stage = path.join(out, "source");
const entries = JSON.parse(await fs.readFile(path.join(root, "release-files.json"), "utf8"));
const forbidden = /(^|\/)(node_modules|\.git|\.venv|__pycache__|captures|logs|downloads|browser-profile[^/]*|releases|config\.json|STOP|\.env(?:\.[^/]*)?)(\/|$)/i;
const personal = /[A-Z]:[\\/]Users[\\/](?!Public[\\/]|Default[\\/]|YOUR_USER[\\/])[^\\/\s"']+[\\/]|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/i;
const files = [];

async function copy(relative) {
  const normal = relative.replaceAll("\\", "/");
  if (normal.startsWith("/") || normal.split("/").some(p => p === ".." || p === ".") || forbidden.test(normal))
    throw new Error("Release path refused: " + normal);
  const source = path.join(root, normal);
  const info = await fs.lstat(source);
  if (info.isSymbolicLink()) throw new Error("Release symlink refused: " + normal);
  if (info.isDirectory()) {
    for (const name of (await fs.readdir(source)).sort()) {
      if (name === "__pycache__" || name.endsWith(".pyc")) continue;
      await copy(normal + "/" + name);
    }
    return;
  }
  const bytes = await fs.readFile(source);
  if (personal.test(bytes.toString("utf8"))) throw new Error("User-profile path/private key found in: " + normal);
  const destination = path.join(stage, normal);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes, { flag: "wx" });
  files.push({ path: normal, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}

await fs.mkdir(stage, { recursive: true });
for (const entry of entries) await copy(entry);
const manifest = { name: pkg.name, version: pkg.version, license: pkg.license, files };
await fs.writeFile(path.join(stage, "RELEASE-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
const archive = path.join(out, pkg.name + "-" + pkg.version + ".tgz");
const packed = spawnSync("tar", ["-czf", archive, "-C", out, "source"], { encoding: "utf8" });
if (packed.status !== 0) throw new Error(packed.error?.message || packed.stderr || "tar failed; install tar first");
const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
if (listing.status !== 0) throw new Error(listing.stderr || "Cannot inspect archive");
const expected = new Set([...files.map(f => "source/" + f.path), "source/RELEASE-MANIFEST.json"]);
const packedPaths = new Set(listing.stdout.split(/\r?\n/).filter(p => p && !p.endsWith("/")));
if (expected.size !== packedPaths.size || [...expected].some(p => !packedPaths.has(p)))
  throw new Error("Archive file list differs from the curated release manifest");
const archiveHash = createHash("sha256").update(await fs.readFile(archive)).digest("hex");
await fs.writeFile(path.join(out, "SHA256SUMS.txt"), archiveHash + "  " + path.basename(archive) + "\n", { flag: "wx" });
await fs.writeFile(path.join(out, "release-summary.json"), JSON.stringify({
  name: pkg.name, version: pkg.version, license: pkg.license, archive, archive_sha256: archiveHash,
  source: stage, files: files.length + 1, published: false
}, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ source: stage, archive, sha256: archiveHash, published: false }, null, 2));
