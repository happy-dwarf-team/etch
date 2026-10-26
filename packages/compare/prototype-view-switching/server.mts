// PROTOTYPE (etch#159), throwaway, never merged: how should views and sample data be switched in
// the preview? A local page that mimics the preview and the Widget Outline on `provinceview` of
// the Anbennar playset, drawn by the real offline renderer from the playset's files (read only),
// in three variants (?variant=A|B|C|D).
//
//   pnpm proto:views          # then open http://localhost:5159/?variant=A
//
// The game folder is found through Steam (or ETCH_GAME_PATH). The save is the corpus's Anbennar
// save: ETCH_PROTO_SAVE, else `saves/Verne1444_11_11_test.eu4` under ETCH_CORPUS_PATH, else
// `Verne1444_11_11.eu4` in the player's save games folder. Nothing is written anywhere.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { openPlayset } from './playset.mts';
import { readSave, type SaveIndex } from './save.mts';

const PORT = Number(process.env.PORT ?? 5159);
const here = import.meta.dirname;

function savePath(): string | undefined {
  const candidates = [
    process.env.ETCH_PROTO_SAVE,
    process.env.ETCH_CORPUS_PATH && join(process.env.ETCH_CORPUS_PATH, 'saves', 'Verne1444_11_11_test.eu4'),
    join(homedir(), 'Documents', 'Paradox Interactive', 'Europa Universalis IV', 'save games', 'Verne1444_11_11.eu4'),
  ];
  return candidates.find((c): c is string => typeof c === 'string' && existsSync(c));
}

const started = Date.now();
const playset = await openPlayset();
console.log(`playset loaded in ${String(Date.now() - started)} ms`);
let save: SaveIndex | undefined;
let saveError: string | undefined;
const file = savePath();
if (file === undefined) saveError = 'no save found (set ETCH_PROTO_SAVE)';
else {
  try {
    const t = Date.now();
    save = await readSave(file);
    console.log(`save indexed in ${String(Date.now() - t)} ms`);
  } catch (error) {
    saveError = String(error);
  }
}

const rendererJs = (
  await esbuild.build({
    entryPoints: [fileURLToPath(import.meta.resolve('@etch/renderer'))],
    bundle: true,
    format: 'iife',
    globalName: 'EtchRenderer',
    platform: 'browser',
    target: 'chrome120',
    write: false,
    logLevel: 'warning',
  })
).outputFiles[0]!.text;

/** Texture files the page may fetch, by index; only files the layout named. */
const files: string[] = [];
const fileIndex = new Map<string, number>();

const STATIC: Record<string, string> = {
  '/': 'index.html',
  '/page.js': 'page.js',
  '/views.js': 'views.js',
};

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${String(PORT)}`);
    const send = (status: number, type: string, body: string | Uint8Array) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    try {
      const name = STATIC[url.pathname];
      if (name !== undefined) {
        const type = name.endsWith('.html') ? 'text/html' : 'text/javascript';
        return send(200, `${type}; charset=utf-8`, await readFile(join(here, name)));
      }
      if (url.pathname === '/renderer.js') return send(200, 'text/javascript', rendererJs);
      if (url.pathname.startsWith('/file/')) {
        const path = files[Number(url.pathname.split('/')[2])];
        if (path === undefined) return send(404, 'text/plain', 'no such file');
        return send(200, 'application/octet-stream', await readFile(path));
      }
      if (url.pathname === '/api/layout' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as {
          width: number;
          height: number;
          samples: Record<string, string>;
        };
        const t = Date.now();
        const laid = await playset.layout(
          { width: body.width, height: body.height },
          new Map(Object.entries(body.samples)),
        );
        const textures = laid.files.map((f) => {
          if (f === undefined) return '/file/missing';
          let i = fileIndex.get(f);
          if (i === undefined) {
            i = files.push(f) - 1;
            fileIndex.set(f, i);
          }
          // The renderer picks the decoder by the URL's extension.
          return `/file/${String(i)}/${f.split(/[\\/]/).pop() ?? ''}`;
        });
        return send(
          200,
          'application/json',
          JSON.stringify({
            drawList: { ...laid.drawList, textures },
            widgets: laid.widgets,
            file: laid.file,
            ms: Date.now() - t,
          }),
        );
      }
      if (url.pathname === '/api/save') {
        if (save === undefined) return send(200, 'application/json', JSON.stringify({ error: saveError }));
        // Never `players_countries`: it holds the player's profile name.
        const owners = new Map<string, number>();
        for (const p of save.provinces) if (p.owner) owners.set(p.owner, (owners.get(p.owner) ?? 0) + 1);
        return send(
          200,
          'application/json',
          JSON.stringify({
            file: save.file.split(/[\\/]/).pop(),
            date: save.date,
            player: save.player,
            mods: save.mods,
            countries: save.countries.map((tag) => ({
              tag,
              name: playset.localise(tag),
              provinces: owners.get(tag) ?? 0,
            })),
            provinces: save.provinces.map((p) => ({ id: p.id, name: p.name, owner: p.owner })),
          }),
        );
      }
      if (url.pathname === '/api/province') {
        const p = save?.provinces.find((x) => x.id === Number(url.searchParams.get('id')));
        if (p === undefined) return send(404, 'application/json', '{}');
        const L = (k: string | undefined) => (k === undefined ? undefined : playset.localise(k));
        return send(
          200,
          'application/json',
          JSON.stringify({
            ...p,
            localised: {
              owner: L(p.owner),
              culture: L(p.fields.culture),
              religion: L(p.fields.religion),
              trade_goods: L(p.fields.trade_goods),
            },
          }),
        );
      }
      send(404, 'text/plain', 'not found');
    } catch (error) {
      send(500, 'text/plain', String(error instanceof Error ? error.stack : error));
    }
  })();
});

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`prototype on http://localhost:${String(PORT)}/?variant=A  (B, C)`);
});
