// Builds the Chrome Web Store ZIP from extension/ only:
//   npm run package  ->  dist/owntape-<version>.zip
// No dependencies. Skips dotfiles. Fails if a file that the manifest names is
// missing, or if a file in the ZIP is not one that the extension can use.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(root, 'extension');
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));

const ALLOWED_EXT = new Set(['.json', '.js', '.html', '.css', '.png', '.svg']);

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(relative(extDir, full).split(sep).join('/'));
  }
  return out;
}

function fail(message) {
  console.error(`package: ${message}`);
  process.exit(1);
}

// ---- checks ----
const files = listFiles(extDir);
for (const f of files) {
  const ext = f.slice(f.lastIndexOf('.'));
  if (!ALLOWED_EXT.has(ext)) fail(`unexpected file type in extension/: ${f}`);
}
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);
for (const f of referenced) if (!files.includes(f)) fail(`manifest names a missing file: ${f}`);
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if ((manifest.description || '').length > 132) fail('description is longer than 132 characters');

// ---- minimal ZIP writer (deflate) ----
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // fixed date: reproducible ZIPs
const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = readFileSync(join(extDir, name));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  locals.push(local, nameBuf, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + packed.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...locals, ...centrals, end]);
const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `owntape-${manifest.version}.zip`);
writeFileSync(outFile, zip);

const sha = createHash('sha256').update(zip).digest('hex');
console.log(`${relative(root, outFile)}  ${files.length} files  ${(zip.length / 1024).toFixed(1)} KB`);
console.log(`sha256 ${sha}`);
for (const f of files) console.log(`  ${f}`);
