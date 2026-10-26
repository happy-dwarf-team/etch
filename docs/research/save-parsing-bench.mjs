// Measures how fast Etch's own Clausewitz parser reads an EU4 save (etch#154).
//
//   node --expose-gc docs/research/save-parsing-bench.mjs <copy-of-save.eu4> [TAG] [PROVINCE_ID]
//
// Run it on a copy of a save, never on the player's own file. It reads the save
// (zip or plain text), inflates `gamestate`, then times three ways of reading it:
//   full   decode the whole gamestate to a string and build Etch's full syntax tree;
//   index  one byte pass that records where every top-level key, every country
//          and every province starts and ends (no tree, no string);
//   slice  decode and parse only one country's and one province's block.
// Binary (ironman) gamestates are only reported: Etch has no token table.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { parseScript } from '../../packages/core/src/script/parse.ts';
import { decodeWindows1252 } from '../../packages/core/src/windows-1252.ts';

const [path, tag = 'H76', province = '1'] = process.argv.slice(2);
if (!path) throw new Error('usage: save-parsing-bench.mjs <save.eu4> [TAG] [PROVINCE_ID]');

const ms = (t0) => `${(performance.now() - t0).toFixed(0)} ms`;
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const heap = () => {
  globalThis.gc?.();
  return process.memoryUsage().heapUsed;
};

/** The entries of a zip archive, read from its central directory. */
function zipEntries(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('latin1', p + 46, p + 46 + nameLen);
    entries.set(name, { method, csize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    read(name) {
      const e = entries.get(name);
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const data = buf.subarray(start, start + e.csize);
      return e.method === 8 ? inflateRawSync(data) : data;
    },
  };
}

const QUOTE = 34;
const LBRACE = 123;
const RBRACE = 125;
const EQ = 61;

/**
 * One pass over the bytes: for the blocks at the given depth path, records
 * `key -> [start, end)` of each child `key = { ... }`. Tracks quotes so that
 * braces inside strings do not count. Saves have no comments.
 */
function indexBlocks(bytes, wanted) {
  const top = new Map(); // top-level key -> [start, end)
  const children = new Map(wanted.map((k) => [k, new Map()]));
  let depth = 0;
  let keyStart = -1;
  let keyEnd = -1;
  let lastWordStart = -1;
  let lastWordEnd = -1;
  const open = []; // stack of { key, start }
  const n = bytes.length;
  for (let i = 0; i < n; i++) {
    const c = bytes[i];
    if (c === QUOTE) {
      i++;
      while (i < n && bytes[i] !== QUOTE) i++;
      lastWordStart = -1;
    } else if (c === EQ) {
      keyStart = lastWordStart;
      keyEnd = lastWordEnd;
    } else if (c === LBRACE) {
      const key = keyStart >= 0 ? String.fromCharCode(...bytes.subarray(keyStart, keyEnd)) : '';
      open.push({ key, start: keyStart >= 0 ? keyStart : i });
      depth++;
      keyStart = -1;
      lastWordStart = -1;
    } else if (c === RBRACE) {
      const frame = open.pop();
      depth--;
      if (frame) {
        if (depth === 0) top.set(frame.key, [frame.start, i + 1]);
        else if (depth === 1) {
          const parent = open[0].key;
          children.get(parent)?.set(frame.key, [frame.start, i + 1]);
        }
      }
      lastWordStart = -1;
    } else if (c > 32) {
      if (lastWordStart < 0 || bytes[i - 1] <= 32) lastWordStart = i;
      lastWordEnd = i + 1;
    } else {
      if (lastWordStart >= 0 && lastWordEnd !== i) lastWordStart = -1;
    }
  }
  return { top, children };
}

function countNodes(entries) {
  let n = 0;
  const stack = [entries];
  while (stack.length) {
    for (const e of stack.pop()) {
      n++;
      const v = e.kind === 'property' ? e.value : e;
      if (v?.kind === 'block') stack.push(v.entries);
    }
  }
  return n;
}

let t0 = performance.now();
const file = readFileSync(path);
const readTime = ms(t0);
let gamestate;
let inflateTime = '0 ms';
if (file.readUInt16LE(0) === 0x4b50) {
  t0 = performance.now();
  gamestate = zipEntries(file).read('gamestate');
  inflateTime = ms(t0);
} else {
  gamestate = file;
}
const header = gamestate.toString('latin1', 0, 6);
console.log(`${path}: file ${mb(file.length)}, gamestate ${mb(gamestate.length)} ${header}`);
console.log(`  read ${readTime}, inflate ${inflateTime}`);
if (header !== 'EU4txt') {
  console.log('  binary gamestate: not readable without a token table');
  process.exit(0);
}

// index: one byte pass, no strings.
t0 = performance.now();
const { top, children } = indexBlocks(gamestate, ['provinces', 'countries']);
console.log(
  `  index ${ms(t0)}: ${top.size} top-level blocks, ${children.get('countries').size} countries, ${children.get('provinces').size} provinces`,
);

// slice: one country and one province.
t0 = performance.now();
let sliced = 0;
for (const [parent, key] of [
  ['countries', tag],
  ['provinces', `-${province}`],
]) {
  const range = children.get(parent).get(key);
  if (!range) {
    console.log(`  slice: ${parent} has no ${key}`);
    continue;
  }
  const text = decodeWindows1252(gamestate.subarray(range[0], range[1]));
  const parsed = parseScript(text);
  sliced += range[1] - range[0];
  console.log(
    `  slice ${parent}.${key}: ${mb(range[1] - range[0])}, ${countNodes(parsed.entries)} nodes, ${parsed.diagnostics.length} diagnostics`,
  );
}
console.log(`  slice total ${ms(t0)} for ${mb(sliced)}`);

// full: decode everything and build the whole tree.
const before = heap();
t0 = performance.now();
const text = decodeWindows1252(gamestate.subarray(6));
const decodeTime = ms(t0);
t0 = performance.now();
const parsed = parseScript(text);
const parseTime = ms(t0);
const after = heap();
console.log(
  `  full: decode ${decodeTime}, parse ${parseTime}, ${countNodes(parsed.entries)} nodes, ${parsed.diagnostics.length} diagnostics, heap +${mb(after - before)}`,
);
