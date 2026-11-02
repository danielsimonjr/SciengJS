// Prints byte sizes of files: raw, gzip (level from config) and brotli (quality from config).
// Usage: node sizes.mjs <file> [<file> ...]   Output: one JSON object per file.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, '..', 'config.json'), 'utf8'));
for (const file of process.argv.slice(2)) {
  const raw = fs.readFileSync(file);
  const gz = zlib.gzipSync(raw, { level: config.compression.gzipLevel });
  const br = zlib.brotliCompressSync(raw, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: config.compression.brotliQuality }
  });
  console.log(JSON.stringify({ file: path.basename(file), rawBytes: raw.length, gzipBytes: gz.length, brotliBytes: br.length }));
}
