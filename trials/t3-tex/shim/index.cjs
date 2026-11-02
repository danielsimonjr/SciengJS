'use strict';
// Stand-in for the node-kpathsea addon that web2js library.js requires.
// The trial uses no native code. Two modes, chosen by SCIENG_TEX_LOOKUP:
//   bundles   resolve a TeX name only through the manifests in SCIENG_TEX_BUNDLES (run time)
//   kpsewhich ask kpsewhich on the host (build time only)
// Any other value fails loudly. No mode falls back to a built-in name.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const FILE_FORMAT = { TEX: 'tex', TFM: 'tfm', TEXPOOL: 'texpool' };
const registered = new Map();
let bundleCache = { key: null, list: [] };

function lookupMode() {
  const mode = process.env.SCIENG_TEX_LOOKUP;
  if (mode !== 'bundles' && mode !== 'kpsewhich') {
    throw new Error('SCIENG_TEX_LOOKUP must be "bundles" or "kpsewhich", got: ' + mode);
  }
  return mode;
}

function loadBundles() {
  const key = process.env.SCIENG_TEX_BUNDLES || '';
  if (bundleCache.key === key) return bundleCache.list;
  const list = key
    .split(',')
    .filter((dir) => dir !== '')
    .map((dir) => {
      const manifestPath = path.join(dir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return { dir, manifest };
    });
  bundleCache = { key, list };
  return list;
}

function findInBundles(name) {
  for (const bundle of loadBundles()) {
    if (Object.prototype.hasOwnProperty.call(bundle.manifest, name)) {
      return path.join(bundle.dir, bundle.manifest[name]);
    }
  }
  return undefined;
}

function findWithKpsewhich(name, format) {
  const args = format === FILE_FORMAT.TEX ? [name] : ['-format', format, name];
  try {
    const out = cp.execFileSync('kpsewhich', args, { encoding: 'utf8' }).trim();
    // kpsewhich prints a path relative to the working directory for files in "."; keep it absolute.
    return out === '' ? undefined : path.resolve(out);
  } catch {
    return undefined;
  }
}

// TeX passes names such as TeXinputs:"circuit.aux". The lookup key is the bare file name.
function bareName(name) {
  return name.replace(/^"|"$/g, '').replace(/^TeX[A-Za-z]+:/, '');
}

function findFile(name, format) {
  const bare = bareName(name);
  if (registered.has(bare)) return registered.get(bare);
  if (lookupMode() === 'kpsewhich') return findWithKpsewhich(bare, format);
  return findInBundles(bare) ?? findInBundles(name);
}

class Kpathsea {
  constructor(progname) {
    this.progname = progname;
  }

  findFile(name, format) {
    return findFile(name, format);
  }
}

module.exports = {
  Kpathsea,
  FILE_FORMAT,
  // Adds the TeX source of one run to the lookup. The harness calls this for the input file only.
  register(name, absolutePath) {
    registered.set(bareName(name), absolutePath);
  }
};
