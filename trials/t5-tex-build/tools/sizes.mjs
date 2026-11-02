// Sizes of files: raw, gzip level 9 and brotli quality 11 (node:zlib), as JSON lines.
import fs from 'node:fs';
import zlib from 'node:zlib';

for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  console.log(JSON.stringify({
    file: f, raw: b.length,
    gzip9: zlib.gzipSync(b, { level: 9 }).length,
    brotli11: zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  }));
}
