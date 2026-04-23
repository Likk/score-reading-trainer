import { mkdir, stat, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const manifestPath = join(__dirname, "samples.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

let total = 0;
let downloaded = 0;
let skipped = 0;

for (const inst of manifest.instruments) {
  const destAbs = join(rootDir, inst.destDir);
  await mkdir(destAbs, { recursive: true });

  for (const file of inst.files) {
    total++;
    const destPath = join(destAbs, file);
    if (await exists(destPath)) {
      skipped++;
      continue;
    }
    const url = inst.baseUrl + file;
    process.stdout.write(`  ${inst.name}: ${file} ... `);
    const bytes = await fetchFile(url, destPath);
    process.stdout.write(`${(bytes / 1024).toFixed(1)} KB\n`);
    downloaded++;
  }
}

console.log(`samples: ${downloaded} downloaded, ${skipped} cached, ${total} total`);
